# Chrome Web Store submission notes

Copy-paste material for the developer dashboard and the OAuth consent screen.
Fill in every `<PLACEHOLDER>` before submitting.

---

## Listing

**Name:** UCSC Schedule Exporter

**Summary (≤132 chars):**
Export your UCSC class schedule to Google Calendar in one click, or download an
.ics file for Apple Calendar.

**Category:** Productivity

**Description:**

> Turn your UC Santa Cruz class schedule into calendar events in seconds.
>
> Open your schedule on MyUCSC (Enrollment → Class Schedule) or on MyScheduler,
> click the extension, and:
>
> • **One-click Google Calendar** — sign in and the extension adds each class as
>   a recurring weekly event for the whole quarter, on the calendar you choose
>   (or a brand-new one).
> • **Download .ics** — get a standard calendar file to import into Apple
>   Calendar or Google Calendar yourself. No sign-in needed.
>
> Every event includes:
> • the correct meeting days and times, ending on the last day of instruction
> • the room in the location field
> • campus holidays skipped (Veterans Day, Thanksgiving, MLK, Presidents' Day…)
> • a reminder you set (none / 10 / 15 / 30 / 60 minutes, or a custom value)
> • an optional final-exam event, placed from the Registrar's exam schedule
>
> Pick which classes to include with checkboxes. Made a mistake? "Undo last
> export" removes exactly what it added.
>
> Privacy: everything is parsed in your browser. The developer receives nothing —
> no server, no analytics, no tracking. The Google option talks only to Google's
> Calendar API using your own account. Full policy:
> <PRIVACY_POLICY_URL>

**Screenshots (1280×800, 1–5):**
1. Popup on the MyScheduler page showing the parsed class list + "One-click Google" tab
2. The calendar picker + reminder chips + "Export N events + finals"
3. Google Calendar week view with the exported recurring classes
4. The "Download .ics" tab
5. (optional) An imported event open, showing room + reminder

**Homepage URL:** `https://github.com/raksshana/ucsc-myscheduler-calendar-extension`
(the repo must be **public** for this and for OAuth verification)

**Support / contact email:** raksshana.hb21@gmail.com

**Privacy policy URL:** `<PRIVACY_POLICY_URL>`
(e.g. the raw or rendered `PRIVACY.md` on the public repo, or a GitHub Pages page)

---

## Single purpose

> UCSC Schedule Exporter reads a UC Santa Cruz student's class schedule from the
> two official UCSC scheduling pages and turns it into calendar events — either
> pushed to the user's Google Calendar via the Google Calendar API, or saved as
> an .ics file the user imports themselves.

---

## Permission justifications

**`storage`**
> Stores the user's reminder-time preference, which export tab they last used,
> whether "Add final-exam events" is on, and the IDs of calendar events the
> extension created (so "Undo last export" can delete them). No schedule content
> is stored.

**`identity`**
> Obtains a Google OAuth token so the user can send their schedule to their own
> Google Calendar with one click. The token is used only for calls to the Google
> Calendar API and is never stored by the extension or sent anywhere else. This
> permission is only exercised if the user chooses the Google option.

**Host permission — `https://my.ucsc.edu/*` and `https://ucsc.collegescheduler.com/*`**
> The extension's content script reads the class-schedule table on these two
> official UCSC scheduling pages (course names, sections, meeting days/times,
> rooms, instructors, term dates) to build the calendar events. It does nothing
> else on these sites and runs on no other sites.

**Host permission — `https://www.googleapis.com/*`**
> Calls the Google Calendar API to list the user's writable calendars and to
> create/delete the events the user requested, authorized by the user's own
> OAuth token.

**Host permission — `https://oauth2.googleapis.com/*`**
> Used only to revoke the OAuth token when the user clicks "Sign out of Google".

**Remote code:** No. All JavaScript is included in the package. The extension
dynamic-imports its own bundled `.mjs` modules; it never loads or executes code
from a remote server.

---

## Data-use certifications (Privacy practices tab)

- Data handled: the user's class-schedule details; and, if they connect Google,
  their calendar list and the events this extension creates.
- The extension does **not** transmit any of this to the developer or any third
  party. Schedule parsing and .ics generation are entirely local. The Google
  option sends data only to Google's Calendar API under the user's account.
- Certify: not sold; not used or transferred for purposes unrelated to the
  single purpose; not used to determine creditworthiness or for lending.

---

## OAuth consent screen (Google Auth Platform)

- **App name:** UCSC Schedule Exporter
- **User support email / developer contact:** raksshana.hb21@gmail.com
- **App homepage:** the public repo URL above
- **Privacy policy link:** `<PRIVACY_POLICY_URL>`
- **Authorized domain:** `github.com` (or your Pages domain)
- **Scopes:** `calendar.calendarlist.readonly`, `calendar.events`,
  `calendar.app.created` — all "sensitive"; a demo video is required.
- **Demo video checklist (unlisted YouTube):**
  1. Show the OAuth consent screen and the scopes being granted.
  2. Show the extension reading the schedule and creating events in Google
     Calendar.
  3. Show that only extension-created events are touched (Undo).
  4. State that no data leaves the browser except the Calendar API calls.

---

## Post-publish

1. The Web Store assigns a **permanent extension ID**. In Google Cloud →
   Clients → the "Chrome extension" OAuth client, set **Item ID** to that new ID
   (replacing the current unpacked-dev ID `gcdfeodddepkccpnnamimdeoljipddah`).
2. Bump `version` in `manifest.json` for every store update.
3. Until OAuth verification passes, the one-click Google button shows an
   "unverified app" warning and only works for accounts added as test users. The
   .ics download works for everyone regardless.
