# UCSC Schedule Exporter

Chrome extension that turns a UC Santa Cruz class schedule into calendar events —
one click to Google Calendar, or a downloadable `.ics` file for Apple Calendar and Google Calendar.

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

## Privacy

Everything happens in your browser. Nothing is sent to the developer — no server,
no analytics, no tracking. The Google option talks only to Google's Calendar API
using your own account. See [`PRIVACY.md`](PRIVACY.md).

---

Building from source: see [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).
