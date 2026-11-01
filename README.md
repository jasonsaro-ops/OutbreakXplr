# OutbreakXplr

Mission-critical, searchable disease outbreak intelligence dashboard.

Displays **current and historical** outbreak / surveillance records from public sources, with full-text search, filters (state, county, level, source, date range, status), interactive map (Leaflet + OpenStreetMap — **no mapping API key**), alerts panel, and sortable table.

## Features

- **All records searchable** — disease, location, county, state, source, notes/text, level, status
- **Measles** — CDC NNDSS weekly measles signals + curated 2025–2026 US outbreak/exposure context
- **COVID-19** — disease.sh US national + state aggregates + historical markers
- **CDC NORS** — foodborne / waterborne / enteric outbreaks
- **WHO Disease Outbreak News**
- Local JSON data refreshed by **GitHub Action** (hourly + manual) so the site works without browser CORS issues
- Dark, operations-floor aesthetic suitable for EOC-style use

## Repo layout

```
OutbreakXplr/
├── index.html                 # Single-page dashboard (GitHub Pages)
├── data/
│   ├── outbreaks.json         # Master searchable dataset
│   ├── measles.json           # Measles subset
│   ├── covid.json             # COVID subset
│   └── meta.json              # Fetch metadata / counts
├── scripts/
│   └── fetch-outbreak-data.mjs
└── .github/workflows/
    └── update-outbreak-data.yml
```

## Deploy on GitHub Pages

1. Create a public repo named **OutbreakXplr** (or any name).
2. Push this folder to the `main` branch.
3. **Settings → Pages → Build and deployment**: Source = **Deploy from a branch**, Branch = `main` / root (or `/docs` if you prefer).
4. Open the site URL. The dashboard loads `data/outbreaks.json` from the same origin.

## Refresh data (GitHub Action)

Workflow: `.github/workflows/update-outbreak-data.yml`

- Runs **every hour** (UTC) and on **workflow_dispatch** (Actions tab → Run workflow).
- Executes `node scripts/fetch-outbreak-data.mjs`.
- Commits updated files under `data/` if anything changed.

**First-time setup**

1. Ensure Actions are enabled for the repo.
2. Run the workflow once manually so `data/` is populated (this repo already includes a seed run).
3. Optional: lower frequency to daily if you prefer fewer commits (`cron: "0 6 * * *"`).

## Run the fetcher locally

```bash
node scripts/fetch-outbreak-data.mjs
```

Requires Node 18+ (uses native `fetch`). Writes into `data/`.

## Data model (each record)

| Field    | Description                                      |
|----------|--------------------------------------------------|
| id       | Stable unique id                                 |
| date     | ISO date or year-based approximation             |
| disease  | Condition / outbreak name                        |
| location | Free-text place                                  |
| state    | US state code when known                         |
| county   | County when known                                |
| cases    | Case count if reported                           |
| level    | `federal` \| `state` \| `county`                 |
| source   | CDC NORS, CDC NNDSS, WHO DON, disease.sh, Curated |
| status   | `current` \| `historical`                        |
| lat, lng | Map coordinates (centroid ± jitter when needed)  |
| text     | Full detail / exposure / source notes (searchable)|

## Limitations (by design)

- Client-side scraping of every local health department website is not performed (CORS, ToS, volume). The Action uses **machine-readable public APIs**.
- NNDSS / NORS counts are **provisional** and revised over time.
- COVID post–public-health-emergency reporting is incomplete relative to 2020–2023; disease.sh provides the best remaining open aggregate.
- Curated measles national totals reflect late-October 2026 public CDC/CIDRAP figures and are labeled as curated.
- Map markers are capped for performance; the table and search still cover the full filtered set (with a 800-row DOM window — refine filters for large result sets).

## Extending

- Add more NNDSS labels (e.g. pertussis, meningococcal) in `scripts/fetch-outbreak-data.mjs`.
- Commit additional static historical extracts under `data/` and merge in the script.
- Point a private proxy or extra Action job at state open-data portals that allow bulk download.

## License

Dashboard code: use freely. Upstream data retains its original public-domain / agency terms (CDC, WHO, disease.sh sources).
