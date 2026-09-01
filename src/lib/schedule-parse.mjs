/**
 * MyScheduler schedule parser — pure, DOM-in / data-out.
 *
 * Used from two places:
 *   - the content script (dynamic import), passing the live `document`
 *   - the test suite, passing a jsdom `document` built from a saved fixture
 *
 * No `chrome.*`, no globals, no side effects at import time.
 */

export const DAY_NAME_TO_CODE = {
  sunday: "Su",
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
};

export const DAY_ORDER = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** "Monday, Wednesday, Friday" -> ["Mo","We","Fr"] (order preserved, deduped) */
export function parseDayList(text) {
  if (!text) return [];
  const out = [];
  for (const part of String(text).split(/\s*(?:,|\/|&|\band\b)\s*/i)) {
    const code = DAY_NAME_TO_CODE[part.trim().toLowerCase()];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** "4:00pm" | "4:00 p.m." | "16:00" -> "16:00"; returns null if unparseable */
export function to24h(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[.\s ]/g, "").toLowerCase();
  const m = s.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ap = m[3];
  if (h > 23 || Number(min) > 59) return null;
  if (ap === "am" && h === 12) h = 0;
  else if (ap === "pm" && h !== 12) h += 12;
  return String(h).padStart(2, "0") + ":" + min;
}

const TIME = String.raw`\d{1,2}:\d{2}\s*[ap]\.?m\.?`;
const MEETING_RE = new RegExp(
  String.raw`^(.*?)\s*(${TIME})\s*(?:to|-|–|—)\s*(${TIME})\s*(?:at\s+(.+))?$`,
  "i",
);

/**
 * Parse one human-readable meeting string, e.g. the MyScheduler `sr-only` text:
 *   "Monday, Wednesday, Friday 4:00pm to 5:05pm at Kresge Acad 3105"
 *   "Monday 9:20am to 10:25am at Soc Sci 2 179"
 *   "at Online"            (async / no meeting time)
 * Returns { days, start, end, location, timed }.
 */
export function parseMeetingText(text) {
  if (!text) return null;
  const t = String(text).replace(/\s+/g, " ").trim();
  if (!t) return null;
  const m = t.match(MEETING_RE);
  if (!m) {
    const loc = t.match(/\bat\s+(.+)$/i);
    return {
      days: [],
      start: null,
      end: null,
      location: loc ? loc[1].trim() : t,
      timed: false,
    };
  }
  return {
    days: parseDayList(m[1]),
    start: to24h(m[2]),
    end: to24h(m[3]),
    location: (m[4] || "").trim() || null,
    timed: true,
  };
}

function inferComponent({ title, section, credits }) {
  const tt = title || "";
  if (/\blab\b/i.test(tt)) return "LAB";
  if (/\b(section|discussion|quiz|seminar)\b/i.test(tt)) return "DISC";
  if (/[A-Za-z]$/.test(section || "")) return "SEC"; // e.g. "01F"
  if (credits === 0) return "SEC";
  return "LEC";
}

function normText(el) {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

function findScheduleTable(doc) {
  const tables = [...doc.querySelectorAll("table")];
  return (
    tables.find((t) => {
      const heads = [...t.querySelectorAll("thead th")].map((th) =>
        th.textContent.toLowerCase(),
      );
      return (
        heads.some((h) => h.includes("class #")) &&
        heads.some((h) => h.includes("day"))
      );
    }) ||
    tables.find((t) =>
      (t.querySelector("caption")?.textContent || "")
        .toLowerCase()
        .includes("course sections"),
    ) ||
    null
  );
}

function headerIndex(table) {
  const map = {};
  [...table.querySelectorAll("thead th")].forEach((th, i) => {
    const key = th.textContent.replace(/\s+/g, " ").trim().toLowerCase();
    if (key) map[key] = i;
  });
  return map;
}

function parseTerm(doc) {
  const hay =
    normText(doc.querySelector("h1")) +
    " " +
    (doc.title || "") +
    " " +
    (doc.defaultView?.location?.pathname
      ? decodeURIComponent(doc.defaultView.location.pathname)
      : "");
  const m = hay.match(/(\d{4})\s+(Fall|Winter|Spring|Summer)\s+Quarter/i);
  if (!m) return { label: null, raw: null, year: null, quarter: null };
  const year = Number(m[1]);
  const quarter = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  return { label: `${quarter} ${year}`, raw: `${year} ${quarter} Quarter`, year, quarter };
}

/**
 * @param {Document} doc
 * @returns {{ok:boolean, source?:string, reason?:string, term:object, classes:object[]}}
 */
export function parseScheduleDoc(doc) {
  const term = parseTerm(doc);
  const table = findScheduleTable(doc);
  if (!table) {
    return { ok: false, reason: "schedule-table-not-found", term, classes: [] };
  }

  const cols = headerIndex(table);
  const dayColKey = Object.keys(cols).find((k) => k.startsWith("day(s)"));
  const at = (cells, key) => {
    const i = cols[key];
    return i == null ? "" : normText(cells[i]);
  };

  const classes = [];
  for (const tbody of table.querySelectorAll("tbody")) {
    const row = tbody.querySelector("tr");
    if (!row) continue;
    const cells = [...row.querySelectorAll("td")];
    if (!cells.length) continue;

    const classNumber = at(cells, "class #") || at(cells, "class#");
    if (!/^\d+$/.test(classNumber)) continue; // skip spacer / detail tbodies

    let title = null;
    const btn = row.querySelector("button[aria-label*='Section Details' i]");
    if (btn) {
      const am = btn.getAttribute("aria-label").match(/Section Details for\s+(.+?)\s*#\d+/i);
      if (am) title = am[1].replace(/^[A-Za-z]+\s+\S+\s*-\s*/, "").trim();
    }

    const meetings = [];
    let sawOnline = false;
    const dayCell = dayColKey != null ? cells[cols[dayColKey]] : null;
    if (dayCell) {
      let texts = [...dayCell.querySelectorAll(".sr-only, [class*='srOnly' i]")].map(
        (e) => e.textContent,
      );
      if (!texts.length) texts = [dayCell.textContent];
      const seen = new Set();
      for (const raw of texts) {
        const mt = parseMeetingText(raw);
        if (!mt) continue;
        if (/\b(online|remote|async)\b/i.test(mt.location || "")) sawOnline = true;
        if (mt.timed && mt.days.length) {
          const key = [mt.days.join(""), mt.start, mt.end, mt.location].join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          meetings.push({
            days: mt.days,
            start: mt.start,
            end: mt.end,
            location: mt.location,
          });
        }
      }
    }

    const section = at(cells, "section");
    const credits = Number.parseFloat(at(cells, "credits")) || 0;
    classes.push({
      classNumber,
      subject: at(cells, "subject"),
      course: at(cells, "course"),
      section,
      title,
      status: at(cells, "status") || null,
      credits,
      component: inferComponent({ title, section, credits }),
      meetings,
      online: sawOnline && meetings.length === 0,
    });
  }

  return { ok: true, source: "myscheduler", term, classes };
}
