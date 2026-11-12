// Credit rules. A new product costs NEW_PRODUCT credits and includes the ideas run, the blueprint and the
// first generation of every section. Any regeneration afterwards costs REGEN credits.
// Products are tracked on the server (data/products.json) so the page cannot skip a charge.
// The owner code is never charged and needs no product record.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { normalize } from "./codes.js";

export const NEW_PRODUCT = 40;
export const REGEN = 2;

const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const FILE = path.join(DATA_DIR, "products.json");

// Section kinds a product may generate, and how many numbered sections (stages) it may have.
const SECTION_KINDS = new Set(["intro", "stage", "outro", "welcome", "module", "listing"]);
const NUMBERED = new Set(["stage", "module"]);
const MAX_INDEX = 7;

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

const fail = (status, message) => Object.assign(new Error(message), { status });

function owned(code, id) {
  const rec = load()[String(id || "")];
  if (!rec || rec.code !== normalize(code)) throw fail(400, "We could not find this product on your code. Start a new product.");
  return rec;
}

export function create(code) {
  const db = load();
  let id;
  do { id = "p_" + crypto.randomBytes(6).toString("hex"); } while (db[id]);
  db[id] = { code: normalize(code), created: new Date().toISOString(), used: {} };
  save(db);
  return id;
}

// Decide what a request costs. Throws a 400 error for a bad request. Does not change anything.
// Returns { cost, productId, key, isNew }.
export function plan({ code, owner, kind, body }) {
  if (owner) return { cost: 0, productId: null, key: null, isNew: false };

  if (kind === "sweetspot") {
    if (!body.product) return { cost: NEW_PRODUCT, productId: null, key: null, isNew: true };
    owned(code, body.product);
    return { cost: REGEN, productId: body.product, key: null, isNew: false };
  }

  const rec = owned(code, body.product);
  if (kind === "refine") return { cost: REGEN, productId: body.product, key: null, isNew: false };

  let key;
  if (kind === "blueprint") {
    key = "blueprint";
  } else if (kind === "section") {
    const sk = String(body.kind || "");
    if (!SECTION_KINDS.has(sk)) throw fail(400, "Unknown section.");
    const index = NUMBERED.has(sk) ? body.index : 0;
    if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) throw fail(400, "Unknown section.");
    key = `${sk}:${index}`;
  } else {
    throw fail(404, "Not found.");
  }
  const first = !(rec.used[key] > 0);
  return { cost: first ? 0 : REGEN, productId: body.product, key, isNew: false };
}

// Mark a section or blueprint as generated once (call after the charge succeeds).
export function begin(p) {
  if (!p.productId || !p.key) return;
  const db = load();
  const rec = db[p.productId];
  if (!rec) return;
  rec.used[p.key] = (rec.used[p.key] || 0) + 1;
  save(db);
}

// Undo begin() when the AI call failed, so the first generation stays free.
export function rollback(p) {
  if (!p.productId || !p.key) return;
  const db = load();
  const rec = db[p.productId];
  if (!rec) return;
  rec.used[p.key] = Math.max(0, (rec.used[p.key] || 0) - 1);
  save(db);
}
