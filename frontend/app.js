(function () {
  const STYLES = [
    { key: "zero", name: "Zero-shot", desc: "Task, no scaffolding. The baseline everything else is measured against.", dynamic: false },
    { key: "cot", name: "Chain-of-thought", desc: "Reasoning instruction generated to fit this task's domain, not a generic 'think step by step.'", dynamic: true },
    { key: "role", name: "Role / persona", desc: "A specific expert persona is generated for your task's subject - not a generic 'world-class expert.'", dynamic: true },
    { key: "few", name: "Few-shot", desc: "Two example Q&As are generated in the SAME domain as your task, then your task is appended in matching format.", dynamic: true },
    { key: "json", name: "Structured (JSON)", desc: "Forces a JSON schema in the reply. Costs a bit more in output tokens but is easy for other code to consume.", dynamic: false }
  ];

  const STATIC_BUILD = {
    zero: (task) => task,
    json: (task) => `Respond with ONLY a JSON object (no markdown fences) with keys: "answer" (string), "confidence" (0-1 number).\n\nTask: ${task}`
  };

  const DEFAULT_ON = ["zero", "cot", "role"];
  const grid = document.getElementById("pb-grid");
  const state = {};

  STYLES.forEach((style) => {
    state[style.key] = DEFAULT_ON.includes(style.key);
    const card = document.createElement("div");
    card.className = "pb-card" + (state[style.key] ? " on" : "");
    card.innerHTML = `
      <div class="pb-card-head">
        <span class="pb-card-name">${style.name}</span>
        <span class="pb-dot"></span>
      </div>
      <div class="pb-card-desc">${style.desc}</div>
    `;
    card.addEventListener("click", () => {
      state[style.key] = !state[style.key];
      card.classList.toggle("on", state[style.key]);
    });
    grid.appendChild(card);
  });

  const runBtn = document.getElementById("pb-run");
  const statusEl = document.getElementById("pb-status");
  const resultsPanel = document.getElementById("pb-results-panel");
  const tbody = document.getElementById("pb-tbody");
  const errorEl = document.getElementById("pb-error");

  document.getElementById("pb-gen-toggle").addEventListener("click", (e) => {
    const preview = document.getElementById("pb-gen-preview");
    preview.classList.toggle("open");
    e.target.textContent = preview.classList.contains("open") ? "hide" : "view";
  });

  async function generateTailoredPrompts(task, dynamicKeys) {
    const resp = await fetch("/api/generate-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, styles: dynamicKeys })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || data.error || `Generation failed (${resp.status})`);
    return data;
  }

  async function complete(prompt) {
    const resp = await fetch("/api/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || data.error || `Call failed (${resp.status})`);
    return data;
  }

  async function scoreResults(results, priceIn, priceOut) {
    const resp = await fetch("/api/score-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        price_in: priceIn,
        price_out: priceOut,
        results: results.map((row) => ({
          key: row.key,
          prompt: row.prompt,
          elapsed_ms: row.elapsedMs,
          input_tokens: row.inTok,
          output_tokens: row.outTok,
          text: row.text
        }))
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || data.error || `Scoring failed (${resp.status})`);
    return data.results || [];
  }

  async function judgeResults(task, results) {
    const resp = await fetch("/api/judge-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task,
        results: results.map((row) => ({
          key: row.key,
          prompt: row.prompt,
          text: row.text
        }))
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || data.error || `Judge failed (${resp.status})`);
    return data.results || {};
  }

  function fmtMoney(n) {
    if (n < 0.01) return "$" + n.toFixed(5);
    return "$" + n.toFixed(4);
  }

  function render(results) {
    tbody.innerHTML = "";

    const validResults = results.filter((r) => !r.error);
    if (validResults.length) {
      const note = document.getElementById("pb-efficiency-note") || (() => {
        const el = document.createElement("div");
        el.id = "pb-efficiency-note";
        el.className = "pb-hint";
        el.style.margin = "0 0 10px";
        const resultsHead = document.querySelector("#pb-results-panel .pb-results-head");
        resultsHead.insertAdjacentElement("afterend", el);
        return el;
      })();
      note.textContent = "Efficiency comes from backend time/cost scoring. Quality comes from an LLM judge on the task and response.";
    }

    results.forEach((rowData, idx) => {
      const style = STYLES.find((s) => s.key === rowData.key);
      const row = document.createElement("tr");

      if (rowData.error) {
        row.innerHTML = `<td class="pb-name">${style.name}</td><td colspan="7" style="color:#ef6461;">${rowData.error}</td>`;
        tbody.appendChild(row);
        return;
      }

      const tokPerSec = Number(rowData.tok_per_sec || (rowData.outTok / (rowData.elapsedMs / 1000))).toFixed(1);
      const qualityScore = rowData.quality_score == null ? null : Number(rowData.quality_score);
      const qualityPct = qualityScore == null ? 0 : Math.min(100, qualityScore * 10);

      row.innerHTML = `
        <td class="pb-name">${style.name}</td>
        <td class="pb-cell-num">
          ${(rowData.elapsedMs / 1000).toFixed(2)}s ${rowData.is_fastest ? '<span class="pb-badge-best">fastest</span>' : ''}
          <div class="pb-bar-wrap" style="margin-top:4px;"><div class="pb-bar time" style="width:${rowData.time_pct}%"></div></div>
        </td>
        <td class="pb-cell-num">${rowData.inTok} / ${rowData.outTok}</td>
        <td class="pb-cell-num">${tokPerSec}</td>
        <td class="pb-cell-num">
          ${fmtMoney(rowData.cost)} ${rowData.is_cheapest ? '<span class="pb-badge-best">cheapest</span>' : ''}
          <div class="pb-bar-wrap" style="margin-top:4px;"><div class="pb-bar cost" style="width:${rowData.cost_pct}%"></div></div>
        </td>
        <td class="pb-cell-num">
          ${Number(rowData.efficiency_score).toFixed(2)} ${rowData.is_best_efficiency ? '<span class="pb-badge-best">best</span>' : ''}
          <div class="pb-bar-wrap" style="margin-top:4px;"><div class="pb-bar time" style="width:${rowData.efficiency_pct}%"></div></div>
        </td>
        <td class="pb-cell-num">
          ${qualityScore == null ? "n/a" : qualityScore.toFixed(1)} ${rowData.is_best_quality ? '<span class="pb-badge-best">best</span>' : ''}
          <div class="pb-bar-wrap" style="margin-top:4px;"><div class="pb-bar cost" style="width:${qualityPct}%"></div></div>
        </td>
        <td><button class="pb-preview-btn" data-idx="${idx}">view</button></td>
      `;
      tbody.appendChild(row);

      const previewRow = document.createElement("tr");
      const previewCell = document.createElement("td");
      previewCell.colSpan = 8;
      previewCell.style.border = "none";
      previewCell.style.padding = "0";
      const preview = document.createElement("div");
      preview.className = "pb-preview";
      preview.textContent = `PROMPT SENT:\n${rowData.prompt}\n\nRESPONSE:\n${rowData.text}`;
      previewCell.appendChild(preview);
      previewRow.appendChild(previewCell);
      tbody.appendChild(previewRow);

      row.querySelector(".pb-preview-btn").addEventListener("click", (e) => {
        preview.classList.toggle("open");
        e.target.textContent = preview.classList.contains("open") ? "hide" : "view";
      });
    });
  }

  runBtn.addEventListener("click", async () => {
    const task = document.getElementById("pb-task").value.trim();
    if (!task) {
      statusEl.textContent = "enter a task first";
      return;
    }

    const active = STYLES.filter((style) => state[style.key]);
    if (active.length === 0) {
      statusEl.textContent = "select at least one style";
      return;
    }

    const priceIn = parseFloat(document.getElementById("pb-price-in").value) || 0;
    const priceOut = parseFloat(document.getElementById("pb-price-out").value) || 0;

    runBtn.disabled = true;
    errorEl.textContent = "";
    resultsPanel.style.display = "block";
    tbody.innerHTML = "";

    const dynamicStyles = active.filter((style) => style.dynamic);
    let generated = { templates: {} };

    if (dynamicStyles.length > 0) {
      statusEl.textContent = `generating task-specific prompts for ${dynamicStyles.map((s) => s.name).join(", ")}...`;
      try {
        const g = await generateTailoredPrompts(task, dynamicStyles.map((s) => s.key));
        generated.templates = g.templates;
        const cost = (g.input_tokens / 1e6) * priceIn + (g.output_tokens / 1e6) * priceOut;

        const genPanel = document.getElementById("pb-gen-panel");
        const genMeta = document.getElementById("pb-gen-meta");
        const genPreview = document.getElementById("pb-gen-preview");
        genPanel.style.display = "block";
        genMeta.textContent = `setup call · ${(g.elapsed_ms / 1000).toFixed(2)}s · ${g.input_tokens}/${g.output_tokens} tok · ${fmtMoney(cost)} (counted separately from the style rows below)`;
        genPreview.textContent = Object.entries(g.templates).map(([k, v]) => {
          const styleName = STYLES.find((s) => s.key === k)?.name || k;
          return `-- ${styleName} --\n${v}`;
        }).join("\n\n");
      } catch (err) {
        errorEl.textContent = "Prompt generation failed: " + (err.message || err) + " - falling back to generic templates for those styles.";
      }
    } else {
      document.getElementById("pb-gen-panel").style.display = "none";
    }

    statusEl.textContent = `running ${active.length} call${active.length > 1 ? "s" : ""} in parallel...`;

    const jobs = active.map(async (style) => {
      const prompt = (STATIC_BUILD[style.key] && !style.dynamic)
        ? STATIC_BUILD[style.key](task)
        : (generated.templates[style.key] || `[generation unavailable - generic fallback]\n\n${task}`);

      try {
        const r = await complete(prompt);
        return {
          key: style.key,
          prompt,
          elapsedMs: r.elapsed_ms,
          inTok: r.input_tokens,
          outTok: r.output_tokens,
          text: r.text
        };
      } catch (err) {
        return { key: style.key, prompt, error: err.message || String(err) };
      }
    });

    try {
      const results = await Promise.all(jobs);
      const validResults = results.filter((r) => !r.error);
      let merged = results;

      if (validResults.length > 0) {
        const scored = await scoreResults(validResults, priceIn, priceOut);
        const scoredMap = new Map(scored.map((r) => [r.key, r]));
        merged = results.map((r) => (r.error ? r : { ...r, ...scoredMap.get(r.key) }));

        try {
          const judged = await judgeResults(task, validResults);
          merged = merged.map((r) => (r.error ? r : { ...r, ...(judged[r.key] || {}) }));
        } catch (judgeErr) {
          errorEl.textContent = "Quality judging failed: " + (judgeErr.message || judgeErr) + " - showing efficiency only.";
        }
      }

      render(merged);
      statusEl.textContent = `done · ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      errorEl.textContent = "Unexpected error: " + (err.message || err);
      statusEl.textContent = "";
    } finally {
      runBtn.disabled = false;
    }
  });
})();
