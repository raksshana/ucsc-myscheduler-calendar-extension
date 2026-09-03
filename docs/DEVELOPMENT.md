# Development

## Setup

```bash
npm install
```

## Scripts

```bash
npm run build:data    # data/raw/*  ->  src/lib/datasets/*.json
npm run icons         # regenerate icons from icons/iconslugai.png
npm test              # parser + recurrence + ics tests (node --test + jsdom)
npm run package       # dist/ucsc-schedule-exporter-<version>.zip for the Web Store
```

## Load unpacked

`chrome://extensions` → Developer mode → **Load unpacked** → the repo root. Then
open a schedule page (MyUCSC "Class Schedule" in List View, or a MyScheduler
"Potential Schedule") and click the extension.

## OAuth

The one-click Google flow uses `chrome.identity.getAuthToken` with a
"Chrome extension" OAuth client. The client ID is in `manifest.json` under
`oauth2`, and the client's registered **Item ID** in Google Cloud must match the
loaded extension's ID (which changes between the unpacked dev load and the
published Web Store build).

## How it works

- `src/lib/schedule-parse.mjs` / `src/lib/myucsc-parse.mjs` — read the schedule
  from the two sites' DOM (keyed off table headers / labels, not CSS hashes).
  MyUCSC also yields instructor names and real per-section dates.
- `src/lib/datasets/` — instruction windows + holidays, and the final-exam
  matrix, built from Registrar sources in `data/raw/` via `npm run build:data`.
- `src/lib/build-events.mjs` + `recurrence.mjs` + `resolve-final.mjs` — turn the
  parsed schedule into calendar events (`RRULE`, `EXDATE`, `America/Los_Angeles`,
  `VALARM`).
- `src/lib/ics.mjs` — serialize those events to RFC 5545 for the `.ics` download.
- `src/background/service-worker.js` — OAuth and all Google Calendar API calls.

## Web Store

Submission copy and steps: [`STORE.md`](STORE.md).
