/**
 * Convert the raw registrar sources into the trimmed JSON the extension bundles.
 *
 *   data/raw/Final Exam Schedule ... .csv          -> src/lib/datasets/final-exam-matrix.json
 *   data/raw/Academic-Calendar-2026-27.pdf (manual) -> src/lib/datasets/academic-calendar.json
 *
 * Run: npm run build:data
 *
 * The academic-calendar values are transcribed by hand from the PDF (a handful
 * of dates per quarter) — more reliable than parsing PDF layout. Update the
 * ACADEMIC table below each academic year.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { to24h } from "../src/lib/schedule-parse.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(
  here,
  "raw",
  "Final Exam Schedule for Web - 2026-2027 Academic Year.csv",
);
const OUT_DIR = path.join(here, "..", "src", "lib", "datasets");
const TZ = "America/Los_Angeles";

// --- Academic calendar (from Academic-Calendar-2026-27.pdf) ------------------
// holidays = campus holidays that fall on a weekday within the instruction
// window (these become RRULE EXDATEs). Dates outside instruction are omitted.
const ACADEMIC = {
  "Fall 2026": {
    instructionStart: "2026-09-24",
    instructionEnd: "2026-12-04",
    finalsStart: "2026-12-07",
    finalsEnd: "2026-12-11",
    holidays: ["2026-11-11", "2026-11-26", "2026-11-27"], // Veterans Day, Thanksgiving
  },
  "Winter 2027": {
    instructionStart: "2027-01-04",
    instructionEnd: "2027-03-12",
    finalsStart: "2027-03-15",
    finalsEnd: "2027-03-19",
    holidays: ["2027-01-18", "2027-02-15"], // MLK Jr. Day, Presidents' Day
  },
  "Spring 2027": {
    instructionStart: "2027-03-29",
    instructionEnd: "2027-06-04",
    finalsStart: "2027-06-07",
    finalsEnd: "2027-06-10",
    holidays: ["2027-05-31"], // Memorial Day
  },
};

// --- tiny CSV + date/time parsing helpers -----------------------------------
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseLongDate(text, year) {
  const m = String(text)
    .toLowerCase()
    .match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
  if (!m) return null;
  const mo = MONTHS[m[1]];
  const day = Number(m[2]);
  return `${year}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseExamRange(text) {
  const norm = String(text)
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .toLowerCase();
  const m = norm.match(
    /^(\d{1,2}:\d{2})(a\.?m\.?|p\.?m\.?)?-(\d{1,2}:\d{2})(a\.?m\.?|p\.?m\.?)?$/,
  );
  if (!m) return [null, null];
  let [, t1, ap1, t2, ap2] = m;
  ap1 = ap1 && ap1.replace(/\./g, "");
  ap2 = ap2 && ap2.replace(/\./g, "");
  if (!ap1 && ap2) ap1 = ap2;
  if (!ap2 && ap1) ap2 = ap1;
  return [to24h(t1 + (ap1 || "")), to24h(t2 + (ap2 || ""))];
}

const cap = (s) => s[0].toUpperCase() + s.slice(1).toLowerCase();
const DAYGROUP_RE = /^(?:M|Tu|Th|T|W|F)+$/;

// --- parse the final-exam matrix ------------------------------------------------
function buildExamMatrix() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\d+\t/, ""));

  const matrix = {};
  let term = null;
  let year = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line).map((c) => c.trim());

    const qh = cells
      .join(" ")
      .match(/(Fall|Winter|Spring)\s+(\d{4})\s+Final Examination Schedule/i);
    if (qh) {
      term = `${cap(qh[1])} ${qh[2]}`;
      year = Number(qh[2]);
      matrix[term] = {
        examWindow: [
          ACADEMIC[term]?.finalsStart ?? null,
          ACADEMIC[term]?.finalsEnd ?? null,
        ],
        rows: [],
        nonStandard: {},
      };
      continue;
    }
    if (!term) continue;

    const c0 = (cells[0] || "").replace(/\s+/g, "");

    const ns = c0.match(/^Non-Standard([12])/i);
    if (ns) {
      const [s, e] = parseExamRange(cells[3]);
      matrix[term].nonStandard[ns[1]] = {
        examDate: parseLongDate(cells[2], year),
        examStart: s,
        examEnd: e,
      };
      continue;
    }

    if (DAYGROUP_RE.test(c0) && /\d/.test(cells[1] || "")) {
      const startTime = to24h(cells[1]);
      const examDate = parseLongDate(cells[2], year);
      const [examStart, examEnd] = parseExamRange(cells[3]);
      if (startTime && examDate) {
        matrix[term].rows.push({ dayGroup: c0, startTime, examDate, examStart, examEnd });
      }
    }
  }
  return matrix;
}

// --- write -------------------------------------------------------------------
function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const academic = {};
  for (const [term, v] of Object.entries(ACADEMIC)) {
    academic[term] = { ...v, timezone: TZ };
  }

  const matrix = buildExamMatrix();

  writeFileSync(
    path.join(OUT_DIR, "academic-calendar.json"),
    JSON.stringify(academic, null, 2) + "\n",
  );
  writeFileSync(
    path.join(OUT_DIR, "final-exam-matrix.json"),
    JSON.stringify(matrix, null, 2) + "\n",
  );

  for (const [term, m] of Object.entries(matrix)) {
    console.log(
      `${term}: ${m.rows.length} rows, nonStandard ${Object.keys(m.nonStandard).join("+") || "none"}`,
    );
  }
  console.log(`\nwrote ${path.relative(process.cwd(), OUT_DIR)}/{academic-calendar,final-exam-matrix}.json`);
}

main();
