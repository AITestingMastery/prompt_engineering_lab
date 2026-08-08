"""
Prompt-shaping helpers for task-specific prompt variants.
"""

DYNAMIC_STYLE_RULES = {
    "cot": (
        '"cot": the task text, preceded by a step-by-step reasoning '
        "instruction phrased naturally for THIS task's specific domain "
        '(e.g. a math task gets "work through the calculation step by '
        'step", a writing task gets "outline your structure before '
        'drafting" - don\'t reuse one generic phrase).'
    ),
    "role": (
        '"role": the task text, preceded by an instruction naming ONE '
        "specific, genuinely relevant expert persona for this exact "
        'subject (e.g. "a pediatric science communicator" not "a '
        'world-class expert") and asking them to answer as that persona.'
    ),
    "few": (
        '"few": two short example Q&A pairs from the SAME subject area / '
        "domain as the task (invent realistic, correct, ~1-2 sentence "
        'answers), followed by the task itself appended in matching "Q: '
        '... A:" format.'
    ),
}


def build_meta_prompt(task: str, styles: list[str]) -> str:
    """
    Ask Claude to generate tailored prompt text for the selected styles.
    """
    rules_text = "\n".join(DYNAMIC_STYLE_RULES[s] for s in styles)
    keys_shape = ", ".join(f'"{s}": "..."' for s in styles)

    return f"""You generate tailored prompt-engineering variants for a comparison tool. Given the TASK below, write the actual prompt text for each style listed, tailored specifically to this task's subject matter - not generic filler.

TASK: "{task}"

Styles to generate:
{rules_text}

Respond with ONLY a raw JSON object, no markdown code fences, no commentary, shaped like:
{{{keys_shape}}}"""


def build_judge_prompt(task: str, items: list[dict]) -> str:
    """
    Ask Claude to score the quality of each response against the task.

    The judge should focus on correctness, completeness, instruction following,
    and clarity, then return a JSON object keyed by the item keys.
    """
    payload_lines = []
    for item in items:
        payload_lines.append(
            f'KEY: "{item["key"]}"\n'
            f'TASK: "{task}"\n'
            f'PROMPT SENT:\n{item["prompt"]}\n\n'
            f'RESPONSE:\n{item["text"]}'
        )

    keys_shape = ", ".join(
        f'"{item["key"]}": {{"quality_score": 1, "reason": "..."}}' for item in items
    )

    return f"""You are a strict but fair evaluator of AI answers.

Score each response against the TASK using these criteria:
- correctness
- completeness
- follows the user's instructions
- clarity and usefulness

Use a 1-10 quality_score where 10 is best.
Return ONLY raw JSON, no markdown, no commentary.

TASK:
"{task}"

RESPONSES TO JUDGE:
{chr(10).join(payload_lines)}

Respond with ONLY a raw JSON object shaped like:
{{{keys_shape}}}"""
