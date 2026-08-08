"""
API routes for the Prompt Bench backend.
"""

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from anthropic_client import call_anthropic
from config import ANTHROPIC_MODEL
from prompts import DYNAMIC_STYLE_RULES, build_judge_prompt, build_meta_prompt


class CompleteRequest(BaseModel):
    prompt: str = Field(default="")
    max_tokens: int = Field(default=700, ge=1, le=8192)


class GenerateTemplatesRequest(BaseModel):
    task: str = Field(default="")
    styles: list[str] = Field(default_factory=list)


class CompleteResponse(BaseModel):
    text: str
    input_tokens: int
    output_tokens: int
    elapsed_ms: float


class GenerateTemplatesResponse(BaseModel):
    templates: dict[str, Any]
    input_tokens: int
    output_tokens: int
    elapsed_ms: float


class ScoreItem(BaseModel):
    key: str
    prompt: str
    elapsed_ms: float
    input_tokens: int
    output_tokens: int
    text: str


class ScoreResultsRequest(BaseModel):
    price_in: float = Field(default=0)
    price_out: float = Field(default=0)
    results: list[ScoreItem] = Field(default_factory=list)


class ScoreResult(BaseModel):
    key: str
    prompt: str
    elapsed_ms: float
    input_tokens: int
    output_tokens: int
    text: str
    cost: float
    time_pct: float
    cost_pct: float
    efficiency_score: float
    efficiency_pct: float
    tok_per_sec: float
    is_fastest: bool
    is_cheapest: bool
    is_best_efficiency: bool


class ScoreResultsResponse(BaseModel):
    results: list[ScoreResult]


class JudgeItem(BaseModel):
    key: str
    prompt: str
    text: str


class JudgeResultsRequest(BaseModel):
    task: str = Field(default="")
    results: list[JudgeItem] = Field(default_factory=list)


class JudgeResult(BaseModel):
    quality_score: float
    reason: str
    is_best_quality: bool = False


class JudgeResultsResponse(BaseModel):
    results: dict[str, JudgeResult]


router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": ANTHROPIC_MODEL}


@router.post("/complete", response_model=CompleteResponse)
def complete(body: CompleteRequest) -> dict:
    """Run one prompt through Claude, used for each style's comparison call."""
    prompt = body.prompt.strip()

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    try:
        return call_anthropic(prompt, max_tokens=body.max_tokens)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/generate-templates", response_model=GenerateTemplatesResponse)
def generate_templates(body: GenerateTemplatesRequest) -> dict:
    """
    Given a task and a list of dynamic style keys (cot / role / few),
    ask Claude to write tailored prompt text for each, in one call.
    """
    task = body.task.strip()
    styles = [s for s in body.styles if s in DYNAMIC_STYLE_RULES]

    if not task:
        raise HTTPException(status_code=400, detail="task is required")
    if not styles:
        raise HTTPException(status_code=400, detail="no valid dynamic styles requested")

    meta_prompt = build_meta_prompt(task, styles)

    try:
        result = call_anthropic(meta_prompt, max_tokens=900)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    cleaned = result["text"].strip()
    for fence in ("```json", "```"):
        if cleaned.startswith(fence):
            cleaned = cleaned[len(fence) :].strip()
    if cleaned.endswith("```"):
        cleaned = cleaned[: -len("```")].strip()

    try:
        templates = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="Model did not return valid JSON. Try again.",
        ) from exc

    return {
        "templates": templates,
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
        "elapsed_ms": result["elapsed_ms"],
    }


@router.post("/score-results", response_model=ScoreResultsResponse)
def score_results(body: ScoreResultsRequest) -> dict:
    """
    Compute cost, normalized time/cost bars, and efficiency ranking for a
    finished batch of comparison results.
    """
    results = body.results
    if not results:
        return {"results": []}

    max_time = max((item.elapsed_ms for item in results), default=1) or 1
    max_cost = 0.0
    raw_rows = []

    for item in results:
        cost = (item.input_tokens / 1e6) * body.price_in + (item.output_tokens / 1e6) * body.price_out
        max_cost = max(max_cost, cost)
        raw_rows.append(
            {
                "key": item.key,
                "prompt": item.prompt,
                "elapsed_ms": item.elapsed_ms,
                "input_tokens": item.input_tokens,
                "output_tokens": item.output_tokens,
                "text": item.text,
                "cost": cost,
            }
        )

    max_cost = max(max_cost, 0.0001)
    scored_rows = []
    for row in raw_rows:
        time_pct = min(100.0, (row["elapsed_ms"] / max_time) * 100.0)
        cost_pct = min(100.0, (row["cost"] / max_cost) * 100.0)
        time_score = row["elapsed_ms"] / max_time
        cost_score = row["cost"] / max_cost
        efficiency_score = 1 - ((time_score + cost_score) / 2)
        tok_per_sec = row["output_tokens"] / (row["elapsed_ms"] / 1000.0) if row["elapsed_ms"] > 0 else 0.0

        scored_rows.append(
            {
                **row,
                "time_pct": time_pct,
                "cost_pct": cost_pct,
                "efficiency_score": efficiency_score,
                "efficiency_pct": min(100.0, efficiency_score * 100.0),
                "tok_per_sec": tok_per_sec,
            }
        )

    best_time = min((row["elapsed_ms"] for row in scored_rows), default=0)
    best_cost = min((row["cost"] for row in scored_rows), default=0)
    best_efficiency = max((row["efficiency_score"] for row in scored_rows), default=0)

    for row in scored_rows:
        row["is_fastest"] = row["elapsed_ms"] == best_time
        row["is_cheapest"] = row["cost"] == best_cost
        row["is_best_efficiency"] = row["efficiency_score"] == best_efficiency

    return {"results": scored_rows}


@router.post("/judge-results", response_model=JudgeResultsResponse)
def judge_results(body: JudgeResultsRequest) -> dict:
    """
    Use Claude as a judge to score answer quality for each response in a batch.
    """
    task = body.task.strip()
    results = body.results

    if not task:
        raise HTTPException(status_code=400, detail="task is required")
    if not results:
        return {"results": {}}

    judge_prompt = build_judge_prompt(
        task,
        [{"key": item.key, "prompt": item.prompt, "text": item.text} for item in results],
    )

    try:
        judge_call = call_anthropic(judge_prompt, max_tokens=1200)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    cleaned = judge_call["text"].strip()
    for fence in ("```json", "```"):
        if cleaned.startswith(fence):
            cleaned = cleaned[len(fence) :].strip()
    if cleaned.endswith("```"):
        cleaned = cleaned[: -len("```")].strip()

    try:
        judged = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="Judge model did not return valid JSON. Try again.",
        ) from exc

    normalized = {}
    for item in results:
        raw_item = judged.get(item.key, {})
        score = float(raw_item.get("quality_score", 0))
        normalized[item.key] = {
            "quality_score": score,
            "reason": str(raw_item.get("reason", "")).strip(),
        }

    best_quality = max((entry["quality_score"] for entry in normalized.values()), default=0)
    for key, entry in normalized.items():
        entry["is_best_quality"] = entry["quality_score"] == best_quality

    return {"results": normalized}
