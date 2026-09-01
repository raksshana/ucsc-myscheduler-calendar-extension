/**
 * MyUCSC (PeopleSoft) "Class Schedule" parser.
 * Same output shape as schedule-parse.mjs; `source: "myucsc"`.
 *
 * PeopleSoft ids (win0div..., $N) are unstable, so this keys off the visible
 * structure: each course is a `table.PSGROUPBOXWBO` with a `td.PAGROUPDIVIDER`
 * ("CSE 101 - Data Structs & Algs") and a meeting grid whose columns are read
 * from the `<th>` labels.
 */
import { to24h } from "./schedule-parse.mjs";

const DAY_CODES = new Set(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);

const COMPONENT = {
  lecture: "LEC",
  discussion: "DISC",
  laboratory: "LAB",
  lab: "LAB",
  seminar: "SEM",
  section: "SEC",
  studio: "STU",
  tutorial: "DISC",
};

function norm(el) {
  return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
}

function parseDayCodes(s) {
  const out = [];
  for (let i = 0; i + 2 <= s.length; i += 2) {
    const code = s.slice(i, i + 2);
    if (DAY_CODES.has(code)) out.push(code);
  }
  return out;
}

/** "MoWeFr 4:00PM - 5:05PM" -> {days,start,end}; "TBA" / blank -> null */
function parseSchedule(s) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  const m = t.match(
    /^([A-Za-z]{2,14})\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i,
  );
  if (!m) return null;
  const days = parseDayCodes(m[1]);
  if (!days.length) return null;
  return { days, start: to24h(m[2]), end: to24h(m[3]) };
}

/** "09/24/2026" -> "2026-09-24" */
function isoDate(s) {
  const m = (s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m
    ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
    : null;
}

function parseTerm(doc) {
  const text = (doc.body?.textContent || doc.textContent || "") + " " + (doc.title || "");
  const m = text.match(/(\d{4})\s+(Fall|Winter|Spring|Summer)\s+Quarter/i);
  if (!m) return { label: null, raw: null, year: null, quarter: null };
  const year = Number(m[1]);
  const quarter = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  return { label: `${quarter} ${year}`, raw: `${year} ${quarter} Quarter`, year, quarter };
}

function headerIndex(grid) {
  const map = {};
  [...grid.querySelectorAll("th")].forEach((th, i) => {
    const key = norm(th).toLowerCase();
    if (key) map[key] = i;
  });
  return map;
}

export function parseScheduleDoc(doc) {
  const term = parseTerm(doc);

  const blocks = [...doc.querySelectorAll("table.PSGROUPBOXWBO")].filter(
    (t) =>
      t.querySelector("td.PAGROUPDIVIDER") &&
      t.querySelector("[id^='win0divCLASS_MTG_VW'] table"),
  );
  if (!blocks.length) {
    return { ok: false, reason: "schedule-not-found", term, classes: [] };
  }

  const classes = [];

  for (const block of blocks) {
    const divider = norm(block.querySelector("td.PAGROUPDIVIDER"));
    const dash = divider.indexOf(" - ");
    const code = (dash >= 0 ? divider.slice(0, dash) : divider).trim();
    const title = dash >= 0 ? divider.slice(dash + 3).trim() : null;
    const cm = code.match(/^([A-Za-z]+)\s+(\S+)$/);
    const subject = cm ? cm[1] : code;
    const course = cm ? cm[2] : "";

    const status =
      norm(block.querySelector("[id^='win0divSSR_DUMMY_RECVW'] [id^='STATUS']")) || null;

    const grid = block.querySelector("[id^='win0divCLASS_MTG_VW'] table.PSLEVEL3GRID");
    const cols = headerIndex(grid);
    const byNbr = new Map();

    for (const tr of grid.querySelectorAll("tr[id^='trCLASS_MTG_VW']")) {
      const cells = [...tr.children].filter((c) => c.tagName === "TD");
      const at = (name) => {
        const i = cols[name];
        return i == null ? "" : norm(cells[i]);
      };

      const classNumber = at("class nbr");
      if (!/^\d+$/.test(classNumber)) continue;

      let entry = byNbr.get(classNumber);
      if (!entry) {
        const comp = at("component").toLowerCase();
        entry = {
          classNumber,
          subject,
          course,
          section: at("section"),
          title,
          status,
          component: COMPONENT[comp] || (comp ? comp.slice(0, 3).toUpperCase() : "LEC"),
          instructor: null,
          meetings: [],
          online: false,
        };
        const instr = at("instructor");
        if (instr && !/to be announced|staff|tba/i.test(instr)) entry.instructor = instr;
        byNbr.set(classNumber, entry);
      }

      const sched = parseSchedule(at("days & times"));
      const room = at("room");
      if (sched) {
        const [d1, d2] = at("start/end date").split(/\s*-\s*/);
        entry.meetings.push({
          days: sched.days,
          start: sched.start,
          end: sched.end,
          location: room || null,
          startDate: isoDate(d1),
          endDate: isoDate(d2),
        });
      } else if (/\b(online|remote|async)\b/i.test(room)) {
        entry.online = true;
      }
    }

    for (const entry of byNbr.values()) {
      entry.online = entry.online && entry.meetings.length === 0;
      classes.push(entry);
    }
  }

  return { ok: true, source: "myucsc", term, classes };
}
