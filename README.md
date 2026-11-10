# Kitsmith

Turns what someone knows into a sellable digital product: finds the idea (Sweet Spot), plans it (Blueprint), drafts a guide or video course section by section, exports to Markdown/HTML/PDF. Access codes with credits let you sell it.

## Run locally
    npm install
    node server.js        # http://127.0.0.1:8460
Without ANTHROPIC_API_KEY in .env it runs in DEMO mode (fake sample text).

## Turn on the real AI
1. Get an API key at console.anthropic.com (it is billed per use).
2. Put it in .env as ANTHROPIC_API_KEY=...
3. Restart. Real runs log token usage to data/usage.jsonl so you can work out your cost per credit.
Model defaults to claude-opus-5-5. Set MODEL in .env to change it (a cheaper model lowers your cost per credit).

## Sell it
    node admin.js create 30 "order 1234"   # makes a code with 30 credits
    node admin.js list
Give the code to the buyer (for example as the Gumroad file or license text). Put your Gumroad link in BUY_URL in .env to show a "Get an access code" button.
Credits: a new product costs 25 credits and includes the ideas run, the blueprint and the first generation of every section. Any regeneration after that (redo a section, AI edit, rebuild the blueprint, re-run the ideas) costs 2 credits. The server tracks each product in data/products.json. A 100 credit pack is 4 products.
Your own OWNER_CODE in .env is unlimited.

## Publish
Needs a host that runs Node (not static hosting) and the .env values set as environment variables. Do not publish .env or data/.

## Measured cost (claude-opus-5-5, real runs 2026-11-08, from data/usage.jsonl)
- Ideas run: about $0.04. Blueprint: about $0.06. One chapter or section: about $0.04 to $0.08. One AI edit: about $0.03.
- A full guide (ideas, blueprint, intro, 6 chapters, closing, sales text) is about 11 credits and roughly $0.70 in API cost.
- So 1 credit costs you roughly $0.06 on average. Price your codes well above that, and add margin for failed runs and refunds.
- To cut cost, set MODEL in .env to a cheaper model and re-check output quality first.

## Features
- Edit with AI: each generated section has an "Edit with AI" box (1 credit). It will not invent testimonials or numbers; it leaves [Add your real ... here] notes.
- Safety: input size limits, per-IP rate limit, credits refunded on errors, user text is escaped in the browser.

## Deploy on Render (when you have an account)
1. Put this folder in a private GitHub repo (do NOT commit .env or data/; .gitignore already excludes them).
2. In Render: New > Blueprint, pick the repo (it reads render.yaml). The disk needs a paid plan so access codes survive redeploys.
3. In the dashboard set ANTHROPIC_API_KEY, OWNER_CODE, BUY_URL, SITE_URL (your domain).
4. Add your domain, then submit https://your-domain/sitemap.xml in Google Search Console.
Create buyer codes on the server with the Render shell: node admin.js create 30 "order 1"
