# UCSC Schedule Exporter

Chrome extension that exports a UCSC class schedule (from **MyScheduler**, and later
the **MyUCSC portal**) straight into **Google Calendar** as recurring weekly events —
one click, with location + reminder, and computed final-exam events.

See [`docs/PLAN.md`](docs/PLAN.md) for the full design and decisions.

## Status — Phase 4

- Parsers for **MyScheduler** (`schedule-parse.mjs`) and the **MyUCSC** Class
  Schedule (`myucsc-parse.mjs`); MyUCSC also gives instructor names and real
  per-section dates.
- Registrar datasets built into `src/lib/datasets/` from `data/raw/` (instruction
  window + holidays; final-exam matrix).
- Popup: lists sections with checkboxes, choose a reminder, toggle final-exam
  events, then either **download a .ics** (Apple Calendar / manual Google import)
  or **connect Google** and push events straight in (pick a writable calendar or
  make a new one).
- Recurring weekly events (`RRULE` + holiday `EXDATE`s), `America/Los_Angeles`,
  per-event reminder; one-off final-exam events matched from the registrar
  matrix. Re-export replaces; "Undo last export" removes what it created.
- OAuth: `chrome.identity.getAuthToken` with a Chrome-extension OAuth client —
  client ID lives in `manifest.json` `oauth2`; the loaded extension's ID must
  match the client's registered item ID.

## Develop

```bash
npm install
npm run build:data    # data/raw/*  ->  src/lib/datasets/*.json
npm run icons         # placeholder toolbar icons
npm test              # parser tests (node --test + jsdom)
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
Then open your MyScheduler "Potential Schedule" page and click the extension.
