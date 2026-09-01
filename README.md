# UCSC Schedule → Google Calendar

Chrome extension that exports a UCSC class schedule (from **MyScheduler**, and later
the **MyUCSC portal**) straight into **Google Calendar** as recurring weekly events —
one click, with location + reminder, and computed final-exam events.

See [`docs/PLAN.md`](docs/PLAN.md) for the full design and decisions.

## Status — Phase 0 (scaffold + parser)

- MyScheduler DOM parser (`src/lib/schedule-parse.mjs`) with a fixture test.
- Registrar datasets built into `src/lib/datasets/` from `data/raw/`.
- Popup lists detected sections; Google Calendar export lands in Phase 1.

## Develop

```bash
npm install
npm run build:data    # data/raw/*  ->  src/lib/datasets/*.json
npm run icons         # placeholder toolbar icons
npm test              # parser tests (node --test + jsdom)
```

Load unpacked: `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
Then open your MyScheduler "Potential Schedule" page and click the extension.
