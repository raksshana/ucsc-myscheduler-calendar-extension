# Privacy Policy — UCSC Schedule Exporter

_Last updated: September 1, 2026_

UCSC Schedule Exporter ("the extension") is a Chrome extension that turns a UC
Santa Cruz student's class schedule into calendar events. This policy explains
exactly what it does with your information. The short version: **the developer
never receives any of your data.** There is no server, no account, no analytics,
and no tracking.

## What the extension reads

When you open the extension on one of these two pages, it reads the class
schedule shown on that page:

- **MyUCSC** — `my.ucsc.edu` (Enrollment → Class Schedule)
- **MyScheduler** — `ucsc.collegescheduler.com` (the "Potential Schedule" page)

From that page it parses: course names and numbers, section numbers, meeting
days and times, room/location, instructor names, enrollment status, and the
term's start and end dates. It does not read anything else on the page, and it
does not run on any other website.

All parsing happens **locally in your browser**. This data is not sent anywhere
by the extension except as described under "Google Calendar" below.

## Google Calendar (optional — only if you use the one-click export)

If you choose **"One-click Google"** and sign in:

- The extension uses Google's OAuth to obtain an access token. Chrome stores and
  refreshes this token; the extension does not copy it anywhere else.
- Using that token, the extension calls the Google Calendar API
  (`googleapis.com`) to:
  - list the calendars you can write to, so you can pick one; and
  - create the class and final-exam events you selected.
- It only creates and deletes events that it made itself (it records their IDs
  so the "Undo last export" button can remove them). **It does not read, modify,
  or delete your existing calendar events.**
- This data goes only to Google, under your own Google account. It is governed by
  [Google's Privacy Policy](https://policies.google.com/privacy).

Requested scopes:

| Scope | Why |
|---|---|
| `calendar.calendarlist.readonly` | Show the list of calendars you can pick as the destination. |
| `calendar.events` | Create the class/exam events you asked for (and delete them on Undo). |
| `calendar.app.created` | Create a new calendar if you choose "＋ New calendar". |

## .ics download (the other export option)

The **"Download .ics"** option builds the calendar file entirely in your browser
and saves it to your computer. Nothing is transmitted. You then import that file
into Apple Calendar, Google Calendar, or any other calendar app yourself.

## What the extension stores

Using Chrome's extension storage (which Chrome may sync to your Google account if
you have Chrome Sync enabled), the extension keeps:

- your reminder-time preference and which export tab you last used;
- whether "Add final-exam events" is checked;
- the IDs (and destination calendar) of events it created, so "Undo last export"
  can remove them.

It does **not** store the contents of your schedule.

## What is never done

- No data is sent to the developer or any third party.
- No analytics, telemetry, advertising, or fingerprinting.
- Nothing is sold or shared.
- No data is used for creditworthiness or lending.

## Revoking access

- Click **"Sign out of Google"** in the extension, or
- Remove it at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

Uninstalling the extension removes everything it stored locally.

## Children

The extension is intended for UC Santa Cruz students and is not directed to
children under 13.

## Changes

Updates to this policy will be posted here with a new "Last updated" date.

## Contact

Questions: open an issue at
<https://github.com/raksshana/ucsc-myscheduler-calendar-extension/issues>
or email raksshana.hb21@gmail.com.
