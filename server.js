import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import * as codes from "./lib/codes.js";
import * as products from "./lib/products.js";
import * as gumroad from "./lib/gumroad.js";
import { sweetSpotPrompt, blueprintPrompt, sectionPrompt, refinePrompt } from "./lib/prompts.js";
import { demoSweetSpot, demoBlueprint, demoSection } from "./lib/demo.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dependency).
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const PORT = Number(process.env.PORT || 8460);
const HOST = process.env.HOST || "127.0.0.1";
const BRAND = process.env.BRAND_NAME || "Kitsmith";
const BUY_URL = process.env.BUY_URL || "";
const MODEL = process.env.MODEL || "claude-opus-5-5";
const DEMO = !process.env.ANTHROPIC_API_KEY;
const client = DEMO ? null : new Anthropic();

const MAX_BODY = 60_000;
const MIME = { ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png" };

// ---- helpers ----
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 40;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Request too large."), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(Object.assign(new Error("Invalid JSON."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function send(res, status, obj, extra = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra });
  res.end(JSON.stringify(obj));
}

const str = (v, max) => String(v ?? "").slice(0, max).trim();

function cleanProfile(p = {}) {
  const profile = {
    expertise: str(p.expertise, 3000),
    proof: str(p.proof, 2000),
    audience: str(p.audience, 500),
    format: str(p.format, 40),
  };
  if (profile.expertise.length < 20) throw Object.assign(new Error("Tell us a bit more about what you know (at least a couple of sentences)."), { status: 400 });
  return profile;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in model output.");
  return JSON.parse(text.slice(start, end + 1));
}

function textOf(message) {
  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

function logUsage(kind, usage) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(path.join(DATA_DIR, "usage.jsonl"), JSON.stringify({ t: new Date().toISOString(), kind, model: MODEL, in: usage?.input_tokens, out: usage?.output_tokens }) + "\n");
  } catch {}
}

async function askJson(kind, { system, user }) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: user }],
    });
    logUsage(kind, msg.usage);
    if (msg.stop_reason === "refusal") throw Object.assign(new Error("The model declined this request. Try rewording what you wrote."), { status: 422 });
    try { return extractJson(textOf(msg)); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// ---- API ----
async function api(req, res, pathname) {
  const ip = req.socket.remoteAddress || "?";
  if (limited(ip)) return send(res, 429, { error: "Too many requests. Wait a minute." });

  if (req.method === "GET" && pathname === "/api/config") {
    return send(res, 200, { brand: BRAND, buyUrl: BUY_URL, demo: DEMO });
  }
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });

  const code = req.headers["x-access-code"];
  // A Gumroad license key becomes an access code with credits the first time it is used.
  try { await gumroad.redeem(code); }
  catch (err) { return send(res, err.status || 503, { error: err.message }); }
  const st = codes.status(code);

  if (pathname === "/api/unlock") {
    if (!st) return send(res, 401, { error: "That code was not found. If you bought on Gumroad, copy the whole license key from your receipt page or email (View content). It has four groups of letters and numbers separated by dashes." });
    return send(res, 200, { ok: true, left: st.owner ? null : st.left });
  }

  if (pathname === "/api/topup") {
    if (!st || st.owner) return send(res, 401, { error: "Unlock your account first." });
    let b;
    try { b = await readBody(req); } catch (err) { return send(res, err.status || 400, { error: err.message }); }
    const add = String(b.code || "").trim();
    if (!add) return send(res, 400, { error: "Paste the access code you want to add." });
    try { await gumroad.redeem(add); } catch (err) { return send(res, err.status || 503, { error: err.message }); }
    const r = codes.transfer(add, code);
    if (r.error) return send(res, 400, { error: r.error });
    return send(res, 200, { ok: true, moved: r.moved, left: r.left });
  }

  const COST = { "/api/sweetspot": "sweetspot", "/api/blueprint": "blueprint", "/api/section": "section", "/api/refine": "refine" };
  const kind = COST[pathname];
  if (!kind) return send(res, 404, { error: "Not found." });
  if (!st) return send(res, 401, { error: "Enter a valid access code first." });

  let body;
  try { body = await readBody(req); }
  catch (err) { return send(res, err.status || 400, { error: err.message }); }

  // Work out the cost first. A new product is 40 credits (ideas, blueprint and every section once);
  // any regeneration after that is 2 credits. See lib/products.js.
  let p;
  try { p = products.plan({ code, owner: st.owner, kind, body }); }
  catch (err) { return send(res, err.status || 400, { error: err.message }); }
  if (p.cost > 0 && !codes.spend(code, p.cost)) {
    const what = p.isNew ? "A new product needs" : "This needs";
    return send(res, 402, { error: `${what} ${p.cost} credits and your code has ${st.left} left.` });
  }
  products.begin(p);
  const left = () => { const s = codes.status(code); return s.owner ? "unlimited" : String(s.left); };

  try {
    if (kind === "sweetspot") {
      const profile = cleanProfile(body.profile);
      const data = DEMO ? demoSweetSpot : await askJson("sweetspot", sweetSpotPrompt(profile));
      if (!Array.isArray(data.ideas)) throw new Error("Unexpected model output.");
      const product = p.isNew ? products.create(code) : p.productId;
      return send(res, 200, product ? { ...data, product } : data, { "x-credits-left": left() });
    }

    if (kind === "blueprint") {
      const profile = cleanProfile(body.profile);
      const format = body.format === "course" ? "course" : "guide";
      const idea = body.idea && typeof body.idea === "object" ? JSON.parse(JSON.stringify(body.idea).slice(0, 4000)) : null;
      if (!idea) throw Object.assign(new Error("Pick an idea first."), { status: 400 });
      const data = DEMO ? demoBlueprint : await askJson("blueprint", blueprintPrompt(profile, idea, format));
      if (!Array.isArray(data.stages)) throw new Error("Unexpected model output.");
      return send(res, 200, data, { "x-credits-left": left() });
    }

    // section / refine: streamed plain text
    let prompt, sectionKind, demoText;
    if (kind === "refine") {
      const text = str(body.text, 40000);
      const instruction = str(body.instruction, 800);
      if (text.length < 20 || instruction.length < 3) throw Object.assign(new Error("Write what you want changed."), { status: 400 });
      prompt = refinePrompt(text, instruction);
      sectionKind = "refine";
      demoText = text + "\n\n[DEMO: edit requested: " + instruction + "]";
    } else {
      const charter = body.charter && typeof body.charter === "object" ? body.charter : null;
      if (!charter || !Array.isArray(charter.stages)) throw Object.assign(new Error("Missing blueprint."), { status: 400 });
      const index = Number.isInteger(body.index) ? body.index : 0;
      sectionKind = str(body.kind, 20);
      prompt = sectionPrompt(sectionKind, charter, index);
      demoText = DEMO ? demoSection(sectionKind, charter, index) : "";
    }

    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-credits-left": left() });
    if (DEMO) {
      const text = demoText;
      for (let i = 0; i < text.length; i += 24) { res.write(text.slice(i, i + 24)); await new Promise((r) => setTimeout(r, 15)); }
      return res.end();
    }
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    stream.on("text", (delta) => res.write(delta));
    const final = await stream.finalMessage();
    logUsage("section:" + sectionKind, final.usage);
    if (final.stop_reason === "refusal") res.write("\n\n[[ERROR]] The model declined this section. Try regenerating.");
    return res.end();
  } catch (err) {
    codes.refund(code, p.cost);
    products.rollback(p);
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    const safe = status < 500 && err.message ? err.message : "Something went wrong generating this. Your credits were returned. Try again.";
    console.error("[api error]", pathname, err?.status, err?.message);
    if (res.headersSent) { res.write("\n\n[[ERROR]] " + safe); return res.end(); }
    return send(res, status, { error: safe });
  }
}

// ---- static ----
// Pages listed in the sitemap (file is relative to public/). Add new content pages here.
const PAGES = [
  { path: "/", file: "index.html", pri: "1.0", freq: "weekly" },
  { path: "/synthesise-ai-alternative", file: "synthesise-ai-alternative.html", pri: "0.9", freq: "monthly" },
  { path: "/synthesise-ai-price", file: "synthesise-ai-price.html", pri: "0.8", freq: "monthly" },
  { path: "/how-to-create-a-digital-product-with-ai", file: "how-to-create-a-digital-product-with-ai.html", pri: "0.8", freq: "monthly" },
  { path: "/digital-product-ideas-from-your-skills", file: "digital-product-ideas-from-your-skills.html", pri: "0.7", freq: "monthly" },
  { path: "/ai-course-creator", file: "ai-course-creator.html", pri: "0.7", freq: "monthly" },
  { path: "/digital-product-ideas-for-students", file: "digital-product-ideas-for-students.html", pri: "0.7", freq: "monthly" },
  { path: "/how-to-write-an-ebook-with-ai", file: "how-to-write-an-ebook-with-ai.html", pri: "0.7", freq: "monthly" },
  { path: "/what-is-kitsmith", file: "what-is-kitsmith.html", pri: "0.9", freq: "monthly" },
  { path: "/kitsmith-vs-chatgpt", file: "kitsmith-vs-chatgpt.html", pri: "0.7", freq: "monthly" },
];

function serveStatic(req, res, pathname) {
  // The public address: SITE_URL if set (use your domain here), otherwise the host the visitor used.
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const site = (process.env.SITE_URL || (host && !/^(127\.|localhost)/.test(host) ? `${proto}://${host}` : "")).replace(/\/$/, "");
  const base = site || `http://${host || "localhost"}`;
  if (pathname === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end(`User-agent: *\nAllow: /\nDisallow: /api/\n\n# AI search and answer engines are welcome to read the public pages\nUser-agent: GPTBot\nAllow: /\nUser-agent: ChatGPT-User\nAllow: /\nUser-agent: OAI-SearchBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
  }
  if (pathname === "/sitemap.xml") {
    const urls = PAGES.map((p) => {
      const f = path.join(ROOT, "public", p.file);
      let last = ""; try { last = fs.statSync(f).mtime.toISOString().slice(0, 10); } catch {}
      return `<url><loc>${base}${p.path}</loc>${last ? `<lastmod>${last}</lastmod>` : ""}<changefreq>${p.freq}</changefreq><priority>${p.pri}</priority></url>`;
    });
    res.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
    return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
  }
  let rel = pathname === "/" ? "/index.html" : pathname;
  if (!path.extname(rel) && fs.existsSync(path.join(ROOT, "public", rel + ".html"))) rel += ".html";
  const file = path.normalize(path.join(ROOT, "public", rel));
  if (!file.startsWith(path.join(ROOT, "public"))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Not found"); }
    const ext = path.extname(file);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-cache" });
    if (ext === ".html") {
      // fill in the public address and the optional Google Search Console verification tag
      const gsc = process.env.GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${String(process.env.GOOGLE_SITE_VERIFICATION).replace(/[^\w-]/g, "")}">` : "";
      return res.end(buf.toString("utf8").replaceAll("{{SITE}}", base).replace("<!--GSC-->", gsc));
    }
    if (ext === ".txt") return res.end(buf.toString("utf8").replaceAll("{{SITE}}", base));
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://x");
  if (pathname.startsWith("/api/")) return api(req, res, pathname).catch((e) => { console.error(e); if (!res.headersSent) send(res, 500, { error: "Server error." }); else res.end(); });
  serveStatic(req, res, pathname);
}).listen(PORT, HOST, () => {
  console.log(`${BRAND} running at http://${HOST}:${PORT}  (${DEMO ? "DEMO mode: no ANTHROPIC_API_KEY" : "live model " + MODEL})`);
});
