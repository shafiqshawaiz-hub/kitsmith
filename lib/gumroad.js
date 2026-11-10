// Accept Gumroad license keys as access codes, so a buyer gets credits the moment they pay.
// Needs GUMROAD_PRODUCT_ID (from the product's Content tab, license key block).
// GUMROAD_PACK_CREDITS (default 100) is how many credits one purchase gives.
// The verify call is public (product id + license key), no secret is stored.
import * as codes from "./codes.js";

const KEY_RE = /^[0-9A-F]{8}(-[0-9A-F]{8}){3}$/;
const RECHECK_MS = Number(process.env.GUMROAD_RECHECK_MS ?? 10 * 60 * 1000);
const NOT_FOUND_MS = 60 * 1000;

const checkedAt = new Map();   // key -> last refund check (ms)
const notFoundAt = new Map();  // key -> last time Gumroad said it is not a valid key (ms)

const fail = (status, message) => Object.assign(new Error(message), { status });
const cfg = () => ({
  productId: process.env.GUMROAD_PRODUCT_ID || "",
  credits: Math.max(1, parseInt(process.env.GUMROAD_PACK_CREDITS || "100", 10) || 100),
  url: process.env.GUMROAD_VERIFY_URL || "https://api.gumroad.com/v2/licenses/verify",
});

export const enabled = () => Boolean(cfg().productId);

// Returns the Gumroad response for a valid key, null when Gumroad says the key is not valid,
// and throws a 503 error when Gumroad cannot be reached.
async function verify(key) {
  const { productId, url } = cfg();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: "false" }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw fail(503, "We could not check your code with Gumroad right now. Try again in a minute.");
  }
  if (res.status >= 500) throw fail(503, "We could not check your code with Gumroad right now. Try again in a minute.");
  let data = null;
  try { data = await res.json(); } catch {}
  if (!data || data.success !== true || !data.purchase) return null;
  return data.purchase;
}

const bad = (p) => p.refunded === true || p.chargebacked === true || (p.disputed === true && p.dispute_won !== true);

// Call before looking up a code. Creates credits for a new valid Gumroad key and revokes refunded ones.
export async function redeem(code) {
  if (!enabled()) return;
  const key = codes.normalize(code);
  if (!KEY_RE.test(key) || codes.isOwner(key)) return;

  const rec = codes.info(key);
  if (rec) {
    if (!rec.sale || rec.revoked) return;               // manual code, or already revoked
    if (Date.now() - (checkedAt.get(key) || 0) < RECHECK_MS) return;
    checkedAt.set(key, Date.now());
    try {
      const p = await verify(key);
      if (p && bad(p)) codes.revoke(key);
    } catch {}                                          // if Gumroad is down, keep working
    return;
  }

  if (Date.now() - (notFoundAt.get(key) || 0) < NOT_FOUND_MS) return;
  const p = await verify(key);
  if (!p) { notFoundAt.set(key, Date.now()); return; }
  if (bad(p)) throw fail(401, "That purchase was refunded, so the code no longer works.");
  codes.add(key, cfg().credits, `gumroad ${p.sale_id || ""}`.trim(), { sale: p.sale_id || "gumroad" });
  checkedAt.set(key, Date.now());
}
