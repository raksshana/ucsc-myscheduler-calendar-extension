# UCSC Schedule Exporter

Chrome extension that exports a UCSC class schedule (from **MyScheduler**, and later
the **MyUCSC portal**) straight into **Google Calendar** as recurring weekly events —
one click, with location + reminder, and computed final-exam events.

See [`docs/PLAN.md`](docs/PLAN.md) for the full design and decisions.

## Status — Phase 1 (Google Calendar export)

- MyScheduler DOM parser (`src/lib/schedule-parse.mjs`) with a fixture test.
- Registrar datasets built into `src/lib/datasets/` from `data/raw/`.
- Popup: lists sections, connect to Google, pick a writable calendar, choose a
  reminder lead time, export.
- Recurring weekly events (`RRULE` + holiday `EXDATE`s), `America/Los_Angeles`,
  per-event popup reminder. Deterministic `iCalUID`; re-export replaces, and
  "Undo last export" deletes what it created.
- OAuth is `chrome.identity.getAuthToken` with a Chrome-extension OAuth client;
  requires the client ID in `manifest.json` `oauth2` and the loaded extension's
  ID to match the client's registered item ID.

## Develop

```bash
npm install
npm run build:data    # data/raw/*  ->  src/lib/datasets/*.json
npm run icons         # placeholder toolbar icons
npm test              # parser tests (node --test + jsdom)
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
Then open your MyScheduler "Potential Schedule" page and click the extension.
