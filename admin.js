// Usage:
//   node admin.js create 30 "buyer name or order id"   -> makes a code with 30 credits
//   node admin.js list                                  -> shows all codes and usage
import { create, list } from "./lib/codes.js";

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "create") {
  const credits = parseInt(a, 10);
  if (!credits || credits < 1) { console.error("Give a number of credits, e.g. node admin.js create 30 \"note\""); process.exit(1); }
  console.log(create(credits, b || ""));
} else if (cmd === "list") {
  const db = list();
  for (const [code, r] of Object.entries(db)) console.log(`${code}  ${r.used}/${r.credits} used  ${r.note}`);
  if (!Object.keys(db).length) console.log("No codes yet.");
} else {
  console.log("Commands: create <credits> [note] | list");
}
