# Unity Flash Deals

A static page listing every Unity Asset Store flash deal: what's live now, the next
price, countdowns, and each asset's full price schedule.

## Files

- `index.html` – the page. Reads `deals.json` from the same folder.
- `fetch-deals.mjs` – fetches the deals and writes `deals.json` (Node 18+, no dependencies).
- `deals.json` – generated data.
- `.github/workflows/update-deals.yml` – optional auto-refresh and deploy to GitHub Pages.

## Why there's a fetch script

The Asset Store's search API (Coveo) needs a short-lived token that's only in the
Asset Store's own HTML, which browsers on other sites can't read. So `fetch-deals.mjs`
runs on a computer or server instead of in the visitor's browser.
`deals.json` holds each deal's full price schedule, and the page works out the
current and next prices from the visitor's clock. A snapshot stays accurate until Unity adds or
changes deals, so refreshing every few hours is plenty.

## Run locally

    node fetch-deals.mjs
    python3 -m http.server 8000   # then open http://localhost:8000

(Opening `index.html` straight from disk won't work; browsers block `fetch` on `file://`.)

## Hosting

- **Any static host** (Netlify, Cloudflare Pages, S3, your own server): upload
  `index.html` and `deals.json`, then rerun `node fetch-deals.mjs` and re-upload
  `deals.json` to refresh. On a server you control, a cron job is easiest:
  `20 */3 * * * cd /path/to/site && node fetch-deals.mjs`
- **GitHub Pages, fully automatic**: push this folder as its own repository, set
  *Settings → Pages → Source* to **GitHub Actions**, and the included workflow
  refreshes the data and redeploys every 3 hours.
