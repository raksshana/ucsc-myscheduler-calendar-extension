/**
 * Build the recurrence pieces for one weekly class meeting.
 * Pure — no chrome, no I/O. Tested directly.
 */

const BYDAY = { Su: "SU", Mo: "MO", Tu: "TU", We: "WE", Th: "TH", Fr: "FR", Sa: "SA" };
const JS_DOW = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };

function parts(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

/** Weekday (0=Sun) of a Y-M-D date, evaluated at UTC noon to dodge DST edges. */
export function dayOfWeek(ymd) {
  const { y, m, d } = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function addDays(ymd, n) {
  const { y, m, d } = parts(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** First date on or after `startYmd` whose weekday is in `days` (["Mo","We"…]). */
export function firstOccurrence(startYmd, days) {
  const wanted = new Set(days.map((c) => JS_DOW[c]));
  let cur = startYmd;
  for (let i = 0; i < 14; i++) {
    if (wanted.has(dayOfWeek(cur))) return cur;
    cur = addDays(cur, 1);
  }
  return startYmd;
}

/** Minutes to add to a UTC instant to get wall time in `tz`, at `date`. */
function tzOffsetMinutes(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const wallAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((wallAsUtc - date.getTime()) / 60000);
}

/** "2026-12-04" + "23:59:59" in tz  ->  UTC basic stamp "20261205T075959Z". */
export function localToUtcStamp(ymd, hms, tz) {
  const { y, m, d } = parts(ymd);
  const [hh, mm, ss] = hms.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const off = tzOffsetMinutes(new Date(guess), tz);
  const real = new Date(guess - off * 60000);
  return real.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const noDashes = (ymd) => ymd.replace(/-/g, "");
const hm = (t) => t.replace(":", "") + "00"; // "16:00" -> "160000"

/**
 * @param {{days:string[], start:string, end:string}} meeting
 * @param {{instructionStart:string, instructionEnd:string, holidays:string[], timezone:string}} term
 * @returns {{start:object, end:object, recurrence:string[], firstDate:string}}
 */
export function buildRecurrence(meeting, term) {
  const { days, start, end } = meeting;
  const tz = term.timezone;

  const firstDate = firstOccurrence(term.instructionStart, days);

  // end date rolls to next day if the meeting somehow crosses midnight
  const endDate = end > start ? firstDate : addDays(firstDate, 1);

  const byday = days.map((c) => BYDAY[c]).join(",");
  const until = localToUtcStamp(term.instructionEnd, "23:59:59", tz);
  const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${until}`;

  const wanted = new Set(days.map((c) => JS_DOW[c]));
  const exdates = term.holidays
    .filter((h) => h >= firstDate && h <= term.instructionEnd && wanted.has(dayOfWeek(h)))
    .map((h) => `${noDashes(h)}T${hm(start)}`);

  const recurrence = [rrule];
  if (exdates.length) recurrence.push(`EXDATE;TZID=${tz}:${exdates.join(",")}`);

  return {
    firstDate,
    start: { dateTime: `${firstDate}T${start}:00`, timeZone: tz },
    end: { dateTime: `${endDate}T${end}:00`, timeZone: tz },
    recurrence,
  };
}
