/**
 * ScheduleData (+ options + academic-calendar dataset) -> Google Calendar
 * event resources, one per weekly meeting pattern.
 *
 * Pure. Finals events are Phase 2.
 */
import { buildRecurrence } from "./recurrence.mjs";

const COMPONENT_LABEL = {
  LEC: "Lecture",
  LAB: "Lab",
  DISC: "Discussion",
  SEC: "Section",
  SEM: "Seminar",
};

export function termSlug(term) {
  return `${term.quarter}${term.year}`.toLowerCase();
}

function describe(c, m) {
  return [
    c.title,
    `Section ${c.section}`,
    c.instructor ? `Instructor: ${c.instructor}` : null,
    "",
    "Added by the UCSC Schedule → Google Calendar extension.",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

/**
 * @param {object} schedule  parseScheduleDoc output
 * @param {object} opts
 * @param {number} opts.reminderMinutes   0 = no reminder
 * @param {object} opts.academicCalendar  academic-calendar.json
 * @returns {{ termSlug:string, termLabel:string, events:object[], skipped:string[] }}
 */
export function buildEvents(schedule, { reminderMinutes = 15, academicCalendar }) {
  const label = schedule.term?.label;
  if (!label) throw new Error("Could not determine the term from the page.");

  const term = academicCalendar[label];
  if (!term) {
    throw new Error(
      `No academic-calendar data for "${label}". Update src/lib/datasets/academic-calendar.json.`,
    );
  }
  const termInfo = { ...term, quarter: schedule.term.quarter, year: schedule.term.year };
  const slug = termSlug(schedule.term);

  const reminders =
    reminderMinutes > 0
      ? { useDefault: false, overrides: [{ method: "popup", minutes: reminderMinutes }] }
      : { useDefault: false, overrides: [] };

  const events = [];
  const skipped = [];

  for (const c of schedule.classes) {
    if (!c.meetings.length) {
      skipped.push(`${c.subject} ${c.course}-${c.section}`);
      continue;
    }
    c.meetings.forEach((m, i) => {
      const { start, end, recurrence } = buildRecurrence(m, termInfo);
      const label2 = COMPONENT_LABEL[c.component] || "";
      events.push({
        summary: `${c.subject} ${c.course}${label2 ? " " + label2 : ""}`,
        location: m.location || undefined,
        description: describe(c, m),
        start,
        end,
        recurrence,
        reminders,
        extendedProperties: { private: { ucscExport: `${slug}:${c.classNumber}:m${i}` } },
        source: { title: "MyScheduler", url: "https://ucsc.collegescheduler.com/" },
      });
    });
  }

  return { termSlug: slug, termLabel: label, events, skipped };
}
