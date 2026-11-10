// Access codes with credits. Stored in data/codes.json. Owner code (env OWNER_CODE) is unlimited.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const FILE = path.join(DATA_DIR, "codes.json");

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

export function normalize(code) {
  return String(code || "").trim().toUpperCase();
}

export function isOwner(code) {
  const owner = normalize(process.env.OWNER_CODE);
  return Boolean(owner) && normalize(code) === owner;
}

export function status(code) {
  const c = normalize(code);
  if (!c) return null;
  if (isOwner(c)) return { owner: true, left: Infinity };
  const rec = load()[c];
  if (!rec) return null;
  return { owner: false, left: Math.max(0, rec.credits - rec.used) };
}

export function spend(code, n = 1) {
  const c = normalize(code);
  if (isOwner(c)) return true;
  const db = load();
  const rec = db[c];
  if (!rec || rec.credits - rec.used < n) return false;
  rec.used += n;
  save(db);
  return true;
}

export function refund(code, n = 1) {
  const c = normalize(code);
  if (isOwner(c)) return;
  const db = load();
  if (db[c]) { db[c].used = Math.max(0, db[c].used - n); save(db); }
}

export function create(credits, note = "") {
  const db = load();
  let code;
  do { code = "KS-" + crypto.randomBytes(5).toString("hex").toUpperCase(); } while (db[code]);
  db[code] = { credits, used: 0, note, created: new Date().toISOString() };
  save(db);
  return code;
}

export function list() {
  return load();
}

export function info(code) {
  return load()[normalize(code)] || null;
}

// Add a code with a fixed value (used for Gumroad license keys). Returns false if it already exists.
export function add(code, credits, note = "", extra = {}) {
  const c = normalize(code);
  const db = load();
  if (db[c]) return false;
  db[c] = { credits, used: 0, note, created: new Date().toISOString(), ...extra };
  save(db);
  return true;
}

// Use up all remaining credits (refunded or charged back purchases).
export function revoke(code) {
  const c = normalize(code);
  const db = load();
  const rec = db[c];
  if (!rec || rec.revoked) return;
  rec.credits = rec.used;
  rec.revoked = new Date().toISOString();
  save(db);
}
