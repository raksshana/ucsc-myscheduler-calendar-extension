# UCSC Schedule Exporter

Chrome extension that turns a UC Santa Cruz class schedule into calendar events —
one click to Google Calendar, or a downloadable `.ics` file for Apple Calendar.

## What it does

Open your schedule on **MyUCSC** (Enrollment → Class Schedule, *List View*) or on
**MyScheduler** (the "Potential Schedule" page), click the extension, and:

- **One-click Google Calendar** — sign in with Google and each class is added as a
  recurring weekly event on the calendar you pick (or a brand-new one it creates).
- **Download .ics** — get a standard calendar file to import into Apple Calendar
  or Google Calendar yourself. No sign-in needed.

Every event includes:

- correct meeting days and times, as a weekly series ending on the last day of
  instruction (per-section dates from MyUCSC, or the quarter's dates otherwise)
- the room in the location field
- campus holidays skipped as `EXDATE`s (Veterans Day, Thanksgiving, MLK Day,
  Presidents' Day, Memorial Day…)
- a reminder you choose — none / 10 / 15 / 30 / 60 min, or a custom value
- an optional **final-exam event**, placed from the Registrar's final examination
  schedule by matching the class's meeting days + start time; classes whose time
  doesn't match a slot are listed so you can add those finals yourself

Other behaviour:

- per-section checkboxes to choose exactly which classes to export
- online / asynchronous classes (no meeting time) are skipped
- **Undo last export** removes exactly what the last run created (or deletes the
  calendar it made)
- re-exporting the same term replaces the previous export instead of duplicating

## How it works

- `src/lib/schedule-parse.mjs` / `src/lib/myucsc-parse.mjs` — read the schedule
  from the two sites' DOM (keyed off table headers / labels, not fragile CSS
  hashes). MyUCSC also yields instructor names and real per-section dates.
- `src/lib/datasets/` — instruction windows + holidays, and the final-exam
  matrix, built from Registrar sources in `data/raw/` (`npm run build:data`).
- `src/lib/build-events.mjs` + `recurrence.mjs` + `resolve-final.mjs` — turn the
  parsed schedule into calendar events (`RRULE`, `EXDATE`, `America/Los_Angeles`,
  `VALARM`).
- `src/lib/ics.mjs` — serialize those events to RFC 5545 for the `.ics` download.
- `src/background/service-worker.js` — OAuth (`chrome.identity.getAuthToken`) and
  all Google Calendar API calls. The one-click OAuth client ID is in
  `manifest.json` under `oauth2`; the loaded extension's ID must match the
  client's registered item ID.
- Nothing is sent to the developer. Parsing and `.ics` generation happen entirely
  in the browser; the Google option talks only to Google's API with your own
  token. See [`PRIVACY.md`](PRIVACY.md).

## Develop

```bash
npm install
npm run build:data    # data/raw/*  ->  src/lib/datasets/*.json
npm run icons         # regenerate icons from icons/iconslugai.png
npm test              # parser + recurrence + ics tests (node --test + jsdom)
npm run package       # dist/ucsc-schedule-exporter-<version>.zip for the Web Store
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → this
folder. Then open a schedule page and click the extension.

Chrome Web Store submission material is in [`docs/STORE.md`](docs/STORE.md).
