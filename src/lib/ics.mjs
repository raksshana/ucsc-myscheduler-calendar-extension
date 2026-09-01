/**
 * Serialize buildEvents() output to an RFC 5545 iCalendar string.
 * Pure. Imports into Apple Calendar, Google Calendar, Outlook, etc.
 *
 * The event objects already carry RFC-shaped pieces:
 *   start/end.dateTime = "2026-09-25T16:00:00" (+ .timeZone)
 *   recurrence = ["RRULE:FREQ=WEEKLY;...", "EXDATE;TZID=...:..."]  (verbatim)
 *   reminders.overrides = [{ minutes }]
 */

const PRODID = "-//UCSC Schedule Exporter//EN";

// Static VTIMEZONE so DST is correct across the November transition, regardless
// of the importing client's own tz database.
const VTIMEZONE_LA = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Los_Angeles",
  "X-LIC-LOCATION:America/Los_Angeles",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const escapeText = (s) =>
  String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const stamp = (isoLocal) => isoLocal.replace(/[-:]/g, "").replace(/\.\d+$/, "");

function nowUtcStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Fold to <=75 chars per line per RFC 5545 (continuation = CRLF + one space).
 * Char-based rather than octet-based — fine here since the content is ASCII.
 */
function fold(line) {
  if (line.length <= 75) return line;
  const out = [];
  let i = 0;
  while (i < line.length) {
    const take = i === 0 ? 75 : 74;
    out.push((i === 0 ? "" : " ") + line.slice(i, i + take));
    i += take;
  }
  return out.join("\r\n");
}

function vevent(ev, uidSuffix) {
  const uidKey = ev.extendedProperties?.private?.ucscExport || uidSuffix;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uidKey}@ucsc-schedule-exporter`,
    `DTSTAMP:${nowUtcStamp()}`,
    `DTSTART;TZID=${ev.start.timeZone}:${stamp(ev.start.dateTime)}`,
    `DTEND;TZID=${ev.end.timeZone}:${stamp(ev.end.dateTime)}`,
  ];
  for (const r of ev.recurrence || []) lines.push(r); // RRULE / EXDATE, already formatted
  lines.push(`SUMMARY:${escapeText(ev.summary)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);

  const minutes = ev.reminders?.overrides?.[0]?.minutes;
  if (minutes > 0) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      `TRIGGER:-PT${minutes}M`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

/**
 * @param {{ termLabel:string, events:object[] }} built  buildEvents() output
 * @returns {string} .ics text with CRLF line endings
 */
export function buildICS(built) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`UCSC ${built.termLabel}`)}`,
    "X-WR-TIMEZONE:America/Los_Angeles",
    ...VTIMEZONE_LA,
  ];
  built.events.forEach((ev, i) => lines.push(...vevent(ev, `evt${i}`)));
  lines.push("END:VCALENDAR");

  return lines.map(fold).join("\r\n") + "\r\n";
}
