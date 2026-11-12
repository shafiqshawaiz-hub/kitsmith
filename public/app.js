(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = "kitsmith:v1";
  let cfg = { brand: "Kitsmith", buyUrl: "", demo: false };
  let S = { code: "", product: "", profile: {}, summary: "", ideas: [], idea: null, charter: null, format: "guide", out: {}, step: 1 };
  let unlimited = false;

  const load = () => { try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {} };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Safe markdown: escape first, then format.
  function md(src) {
    const lines = esc(src).split(/\r?\n/);
    const out = [];
    let list = null;
    const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>").replace(/`([^`]+)`/g, "<code>$1</code>");
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    let para = [];
    const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flush(); close(); continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
      if (/^-{3,}$/.test(line.trim())) { flush(); close(); out.push("<hr>"); continue; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flush(); if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flush(); if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); continue; }
      if ((m = line.match(/^&gt;\s?(.*)$/))) { flush(); close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      close(); para.push(line.trim());
    }
    flush(); close();
    return out.join("\n");
  }

  async function post(path, body, stream) {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-access-code": S.code }, body: JSON.stringify(body || {}) });
    const left = res.headers.get("x-credits-left");
    if (left) showCredits(left);
    if (!res.ok) {
      let msg = "Something went wrong.";
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return stream ? res : res.json();
  }

  function showCredits(left) {
    const p = $("creditPill");
    p.hidden = false;
    unlimited = left === "unlimited";
    p.textContent = unlimited ? "Owner access" : `${left} credits left`;
    $("topupLink").hidden = unlimited;
  }

  const steps = ["About you", "Idea", "Blueprint", "Build", "Export"];
  function show(step) {
    S.step = step; save();
    for (let i = 1; i <= 5; i++) $("p" + i).hidden = !(i === step || (step === 5 && i === 4));
    $("progress").innerHTML = steps.map((s, i) => `<span class="${i + 1 === step ? "on" : ""}">${i + 1}. ${s}</span>`).join("");
    if (step === 5) renderExport();
    $("p" + step).scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function busy(btn, on, label) {
    if (on) { btn.dataset.l = btn.textContent; btn.disabled = true; if (label) btn.textContent = label; }
    else { btn.disabled = false; if (btn.dataset.l) btn.textContent = btn.dataset.l; }
  }

  // ---- gate ----
  async function unlock(code, quiet) {
    try {
      S.code = code.trim();
      const r = await post("/api/unlock");
      showCredits(r.left === null ? "unlimited" : String(r.left));
      save();
      $("gate").hidden = true; $("work").hidden = false;
      resume();
    } catch (e) {
      S.code = ""; save();
      if (!quiet) $("gateErr").textContent = e.message;
    }
  }

  function resume() {
    $("expertise").value = S.profile.expertise || "";
    $("proof").value = S.profile.proof || "";
    $("audience").value = S.profile.audience || "";
    $("format").value = S.profile.format || "";
    if (S.ideas.length) renderIdeas();
    if (S.charter) renderBlueprint();
    $("fmt3").value = S.format;
    if (S.charter && S.step >= 4) renderSections();
    show(S.charter ? Math.max(1, S.step) : S.ideas.length ? Math.min(2, S.step || 2) : 1);
  }

  // ---- step 1 ----
  function readProfile() {
    return { expertise: $("expertise").value, proof: $("proof").value, audience: $("audience").value, format: $("format").value };
  }
  async function findIdeas() {
    $("e1").textContent = "";
    S.profile = readProfile(); save();
    if (S.profile.expertise.trim().length < 20) { $("e1").textContent = "Write a bit more about what you know (a couple of sentences)."; return; }
    if (!unlimited) {
      const ask = S.product
        ? "Finding new ideas for this product costs 2 credits. Continue?"
        : "Starting a new product costs 40 credits. That covers your ideas, blueprint and every section. Changes after that cost 2 credits each. Continue?";
      if (!confirm(ask)) return;
    }
    busy($("go1"), true, "Thinking...");
    try {
      const r = await post("/api/sweetspot", { profile: S.profile, product: S.product });
      if (r.product) S.product = r.product;
      S.summary = r.summary || ""; S.ideas = r.ideas || []; S.idea = null; S.charter = null; S.out = {};
      if (S.profile.format === "guide" || S.profile.format === "course") S.format = S.profile.format;
      save(); renderIdeas(); show(2);
    } catch (e) { $("e1").textContent = e.message; }
    busy($("go1"), false);
  }

  // ---- step 2 ----
  function renderIdeas() {
    $("summary").textContent = S.summary;
    $("ideas").innerHTML = S.ideas.map((x, i) => `
      <div class="idea" data-i="${i}" tabindex="0" role="button">
        <h3>${esc(x.title)} <span class="fit">fit ${esc(x.fit)}/10</span></h3>
        <dl>
          <dt>Audience</dt><dd>${esc(x.audience)}</dd>
          <dt>Problem</dt><dd>${esc(x.pain)}</dd>
          <dt>Why you</dt><dd>${esc(x.whyYou)}</dd>
          <dt>Format</dt><dd>${esc(x.format)}</dd>
          <dt>Test demand</dt><dd>${esc(x.demandCheck)}</dd>
          <dt>Risk</dt><dd>${esc(x.risk)}</dd>
        </dl>
      </div>`).join("");
    document.querySelectorAll(".idea").forEach((el) => {
      const pick = () => makeBlueprint(S.ideas[Number(el.dataset.i)]);
      el.addEventListener("click", pick);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
  }
  async function makeBlueprint(idea) {
    S.idea = idea; S.out = {}; save();
    $("e3").textContent = "";
    show(3);
    $("blueprint").innerHTML = "<p>Building your blueprint...</p>";
    $("go3").disabled = true; $("regen3").disabled = true;
    try {
      const r = await post("/api/blueprint", { profile: S.profile, idea, format: $("fmt3").value || S.format, product: S.product });
      S.charter = r; save(); renderBlueprint();
    } catch (e) {
      $("blueprint").innerHTML = "";
      $("e3").textContent = e.message;
    }
    $("go3").disabled = !S.charter; $("regen3").disabled = false;
  }

  // ---- step 3 ----
  function renderBlueprint() {
    const c = S.charter;
    $("blueprint").innerHTML = `
      <dl class="bp">
        <dt>Product</dt><dd>${esc(c.title)}</dd>
        <dt>Promise</dt><dd>${esc(c.promise)}</dd>
        <dt>For</dt><dd>${esc(c.audience)}</dd>
        <dt>Not for</dt><dd>${esc(c.notFor)}</dd>
        <dt>Starting point</dt><dd>${esc(c.startingPoint)}</dd>
        <dt>Finish line</dt><dd>${esc(c.finishLine)}</dd>
        <dt>Stages</dt><dd><ol>${(c.stages || []).map((s) => `<li><strong>${esc(s.name)}</strong>: ${esc(s.goal)}<br><span class="note">You get: ${esc(s.outcome)}</span></li>`).join("")}</ol></dd>
        <dt>Pricing</dt><dd>${esc(c.pricingNote)}</dd>
        <dt>Proof to add</dt><dd>${esc(c.proofNeeded)}</dd>
        <dt>Launch steps</dt><dd><ol>${(c.launchSteps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol></dd>
      </dl>`;
    $("fmt3").value = S.format;
    $("go3").disabled = false;
  }

  // ---- step 4 ----
  function sectionList() {
    const st = S.charter.stages || [];
    if (S.format === "course") {
      return [{ key: "welcome", kind: "welcome", index: 0, title: "Welcome and course map" }]
        .concat(st.map((s, i) => ({ key: "module-" + i, kind: "module", index: i, title: `Module ${i + 1}: ${s.name}` })))
        .concat([{ key: "listing", kind: "listing", index: 0, title: "Sales page text" }]);
    }
    return [{ key: "intro", kind: "intro", index: 0, title: "Introduction" }]
      .concat(st.map((s, i) => ({ key: "stage-" + i, kind: "stage", index: i, title: `Chapter ${i + 1}: ${s.name}` })))
      .concat([{ key: "outro", kind: "outro", index: 0, title: "Closing chapter" }, { key: "listing", kind: "listing", index: 0, title: "Sales page text" }]);
  }

  let stopFlag = false;
  function renderSections() {
    const list = sectionList();
    $("sections").innerHTML = list.map((s) => `
      <li data-k="${s.key}">
        <div class="sec-head"><strong>${esc(s.title)}</strong>
          <span><span class="state" id="st-${s.key}">${S.out[s.key] ? "Done" : "Not generated"}</span>
          <button class="btn ghost gen" data-k="${s.key}">${S.out[s.key] ? "Redo (2 credits)" : "Generate (included)"}</button>
          <button class="btn ghost view" data-k="${s.key}" ${S.out[s.key] ? "" : "hidden"}>View</button>
          <button class="btn ghost edit" data-k="${s.key}" ${S.out[s.key] ? "" : "hidden"}>Edit with AI</button></span></div>
        <form class="refine" id="rf-${s.key}" data-k="${s.key}" hidden>
          <input type="text" maxlength="800" placeholder="What should change? e.g. make it shorter, add a checklist, simpler words" aria-label="Requested change">
          <button class="btn" type="submit">Apply (2 credits)</button>
        </form>
        <div class="sec-body md" id="body-${s.key}" hidden>${S.out[s.key] ? md(S.out[s.key]) : ""}</div>
      </li>`).join("");
    document.querySelectorAll(".edit").forEach((b) => b.addEventListener("click", () => { const f = $("rf-" + b.dataset.k); f.hidden = !f.hidden; if (!f.hidden) f.querySelector("input").focus(); }));
    document.querySelectorAll(".refine").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); refine(list.find((x) => x.key === f.dataset.k), f); }));
    document.querySelectorAll(".gen").forEach((b) => b.addEventListener("click", () => gen(list.find((x) => x.key === b.dataset.k))));
    document.querySelectorAll(".view").forEach((b) => b.addEventListener("click", () => { const el = $("body-" + b.dataset.k); el.hidden = !el.hidden; }));
  }

  async function gen(sec) {
    $("e4").textContent = "";
    const btn = document.querySelector(`.gen[data-k="${sec.key}"]`);
    const body = $("body-" + sec.key);
    const stEl = $("st-" + sec.key);
    btn.disabled = true; stEl.textContent = "Writing...";
    body.hidden = false; body.innerHTML = "";
    let text = "";
    try {
      const res = await post("/api/section", { kind: sec.kind, index: sec.index, charter: S.charter, product: S.product }, true);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        body.innerHTML = md(text.replace(/\[\[ERROR\]\].*/s, ""));
        body.scrollTop = body.scrollHeight;
      }
      const errAt = text.indexOf("[[ERROR]]");
      if (errAt >= 0) throw new Error(text.slice(errAt + 9).trim() || "Generation failed.");
      S.out[sec.key] = text.trim(); save();
      stEl.textContent = "Done"; btn.textContent = "Redo (2 credits)";
      document.querySelector(`.view[data-k="${sec.key}"]`).hidden = false;
      document.querySelector(`.edit[data-k="${sec.key}"]`).hidden = false;
      return true;
    } catch (e) {
      stEl.textContent = "Failed";
      $("e4").textContent = e.message;
      if (!S.out[sec.key]) body.hidden = true;
      return false;
    } finally { btn.disabled = false; }
  }

  async function refine(sec, form) {
    const input = form.querySelector("input");
    const instruction = input.value.trim();
    if (instruction.length < 3) return;
    $("e4").textContent = "";
    const btn = form.querySelector("button");
    const body = $("body-" + sec.key);
    const stEl = $("st-" + sec.key);
    btn.disabled = true; stEl.textContent = "Editing...";
    body.hidden = false;
    let text = "";
    try {
      const res = await post("/api/refine", { text: S.out[sec.key], instruction, product: S.product }, true);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        body.innerHTML = md(text.replace(/\[\[ERROR\]\].*/s, ""));
        body.scrollTop = 0;
      }
      const errAt = text.indexOf("[[ERROR]]");
      if (errAt >= 0) throw new Error(text.slice(errAt + 9).trim() || "Edit failed.");
      S.out[sec.key] = text.trim(); save();
      stEl.textContent = "Edited"; input.value = ""; form.hidden = true;
    } catch (e) {
      stEl.textContent = "Done";
      body.innerHTML = md(S.out[sec.key] || "");
      $("e4").textContent = e.message;
    } finally { btn.disabled = false; }
  }

  async function genAll() {
    stopFlag = false;
    $("genAll").disabled = true; $("stopAll").hidden = false;
    for (const sec of sectionList()) {
      if (stopFlag) break;
      if (S.out[sec.key]) continue;
      const ok = await gen(sec);
      if (!ok) break;
    }
    $("genAll").disabled = false; $("stopAll").hidden = true;
  }

  // ---- step 5 ----
  function fullMarkdown() {
    const c = S.charter;
    const parts = [`# ${c.title}`, `*${c.promise}*`];
    for (const sec of sectionList()) if (S.out[sec.key] && sec.kind !== "listing") parts.push(S.out[sec.key]);
    return parts.join("\n\n");
  }
  function renderExport() { $("preview").className = "preview md"; $("preview").innerHTML = md(fullMarkdown()); }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  const slug = () => (S.charter?.title || "product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "product";
  function htmlDoc() {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(S.charter.title)}</title><style>body{font:17px/1.65 Georgia,serif;max-width:680px;margin:40px auto;padding:0 20px;color:#1c1b19}h1,h2,h3{font-family:Georgia,serif;line-height:1.2}h2{margin-top:2em;page-break-after:avoid}li{margin:.3em 0}blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:14px;color:#555}@media print{h1{page-break-before:avoid}h2{page-break-before:always}}</style></head><body>${md(fullMarkdown())}</body></html>`;
  }

  // ---- wiring ----
  function wire() {
    $("gateForm").addEventListener("submit", (e) => { e.preventDefault(); $("gateErr").textContent = ""; unlock($("codeInput").value); });
    $("topupLink").addEventListener("click", (e) => { e.preventDefault(); const t = $("topup"); t.hidden = !t.hidden; if (!t.hidden) $("topupInput").focus(); });
    $("topupForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("topupMsg"); msg.textContent = "Checking...";
      try {
        const r = await post("/api/topup", { code: $("topupInput").value });
        showCredits(String(r.left));
        msg.textContent = `Added ${r.moved} credits. You now have ${r.left}.`;
        $("topupInput").value = "";
      } catch (err) { msg.textContent = err.message; }
    });
    $("go1").addEventListener("click", findIdeas);
    $("back2").addEventListener("click", () => show(1));
    $("regen3").addEventListener("click", () => { S.format = $("fmt3").value; makeBlueprint(S.idea); });
    $("fmt3").addEventListener("change", () => { S.format = $("fmt3").value; S.out = {}; save(); });
    $("go3").addEventListener("click", () => { S.format = $("fmt3").value; save(); renderSections(); show(4); });
    $("genAll").addEventListener("click", genAll);
    $("stopAll").addEventListener("click", () => { stopFlag = true; });
    $("dlMd").addEventListener("click", () => download(slug() + ".md", fullMarkdown(), "text/markdown"));
    $("dlHtml").addEventListener("click", () => download(slug() + ".html", htmlDoc(), "text/html"));
    $("printPdf").addEventListener("click", () => { const w = window.open("", "_blank"); if (!w) return; w.document.write(htmlDoc()); w.document.close(); w.focus(); setTimeout(() => w.print(), 400); });
    $("reset").addEventListener("click", () => { if (confirm("Start over? This clears your current product from this browser.")) { const c = S.code; S = { code: c, product: "", profile: {}, summary: "", ideas: [], idea: null, charter: null, format: "guide", out: {}, step: 1 }; save(); resume(); } });
    $("toExport").addEventListener("click", () => {
      if (!Object.keys(S.out).length) { $("e4").textContent = "Generate at least one section first."; return; }
      show(5);
    });
  }

  async function init() {
    load();
    try { cfg = await (await fetch("/api/config")).json(); } catch {}
    document.title = cfg.brand;
    $("brand").textContent = cfg.brand; $("footBrand").textContent = cfg.brand;
    $("demoBanner").hidden = !cfg.demo;
    if (cfg.buyUrl) for (const id of ["buyLink", "buyLink2"]) { const b = $(id); if (!b) continue; b.href = cfg.buyUrl; b.hidden = false; b.target = "_blank"; b.rel = "noopener"; }
    wire();
    if (S.code) { $("codeInput").value = S.code; await unlock(S.code, true); }
  }
  init();
})();
