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
  // If this key's credits were added to another account, take them back from that account.
  const dest = rec.movedTo && db[rec.movedTo];
  if (dest && rec.movedCredits) dest.credits = Math.max(dest.used, dest.credits - rec.movedCredits);
  save(db);
}

// Move all remaining credits from one code to another (adding a new purchase to an existing account).
// Returns { moved, left } or { error }.
export function transfer(fromCode, toCode) {
  const from = normalize(fromCode), to = normalize(toCode);
  if (!from || !to || from === to) return { error: "That is the code you are already using." };
  if (isOwner(from)) return { error: "That code cannot be added." };
  if (isOwner(to)) return { error: "Owner access already has unlimited credits." };
  const db = load();
  const a = db[from], b = db[to];
  if (!a) return { error: "That code was not found. Copy the whole license key from your Gumroad receipt." };
  if (!b || b.revoked) return { error: "Your current account cannot receive credits." };
  if (a.revoked) return { error: "That purchase was refunded, so the code no longer works." };
  if (a.movedTo) return { error: "That code has already been added to an account." };
  const n = Math.max(0, a.credits - a.used);
  if (n <= 0) return { error: "That code has no credits left." };
  a.used = a.credits; a.movedTo = to; a.movedCredits = n;
  b.credits += n;
  save(db);
  return { moved: n, left: Math.max(0, b.credits - b.used) };
}
