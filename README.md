# Arsenal Dash ⚽

A live Arsenal fixtures dashboard — every fixture across every competition, results, and the
Premier League table. Pure static site (HTML/CSS/JS), no build step, no API key.

Data comes live from ESPN's public JSON API, fetched in the browser each time the page loads,
so it stays current with zero maintenance.

## Features
- **Summary** — next match, last result, current PL position, and W/D/L record across all comps.
- **A tab per competition** — appears automatically once ESPN publishes that competition's
  fixtures (Premier League, Champions League, FA Cup, Carabao Cup, Europa League, Community Shield).
- **Results** — overall W/D/L record, every completed match, and the full PL table with Arsenal
  highlighted.

## Run locally
Any static server works, e.g.:

```bash
python3 -m http.server 4599
```

Then open http://localhost:4599

## Deploy + share on Slack (GitHub Pages — free)
1. Create a new GitHub repo (e.g. `arsenal-dash`) and upload these files (`index.html`,
   `styles.css`, `app.js`, `README.md`) to the root.
2. In the repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
   pick your `main` branch and `/root`, then **Save**.
3. Wait ~1 minute. GitHub gives you a public URL like
   `https://<your-username>.github.io/arsenal-dash/`.
4. Paste that URL into your Slack channel. Anyone who clicks it sees the live dashboard.

No secrets, no server, nothing to keep running — GitHub Pages serves the files and each
visitor's browser pulls fresh data from ESPN.

## Notes
- Team ID `359` is Arsenal on ESPN. To adapt this for another club, change `TEAM_ID` in
  `app.js` (and `hasTable`/competition codes if needed).
- If ESPN is briefly unreachable, the page falls back to the last data that browser loaded.
