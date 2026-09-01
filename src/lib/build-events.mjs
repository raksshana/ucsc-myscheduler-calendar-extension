/**
 * ScheduleData (+ datasets + options) -> Google Calendar event resources:
 * one recurring event per weekly meeting pattern, plus one final-exam event
 * per lecture that matches a slot in the registrar's exam matrix.
 *
 * Pure.
 */
import { buildRecurrence } from "./recurrence.mjs";
import { resolveFinal } from "./resolve-final.mjs";

const COMPONENT_LABEL = {
  LEC: "Lecture",
  LAB: "Lab",
  DISC: "Discussion",
  SEC: "Section",
  SEM: "Seminar",
};

const SOURCE = { title: "MyScheduler", url: "https://ucsc.collegescheduler.com/" };

export function termSlug(term) {
  return `${term.quarter}${term.year}`.toLowerCase();
}

function classDescription(c) {
  return [
    c.title,
    `Section ${c.section}`,
    "",
    "Added by the UCSC Schedule Exporter extension.",
  ].join("\n");
}

function finalDescription(c) {
  return [
    c.title,
    `Section ${c.section}`,
    "",
    "Auto-computed from the UCSC final examination schedule — confirm the date, " +
      "time, and room with your instructor. Some courses have take-home or " +
      "rescheduled finals.",
  ].join("\n");
}

/**
 * @param {object} schedule  parseScheduleDoc output
 * @param {object} opts
 * @param {number} opts.reminderMinutes    0 = no reminder
 * @param {object} opts.academicCalendar   academic-calendar.json
 * @param {boolean} opts.includeFinals
 * @param {object} [opts.finalExamMatrix]  final-exam-matrix.json (required if includeFinals)
 * @returns {{ termSlug, termLabel, timezone, events, skipped, unresolvedFinals }}
 */
export function buildEvents(
  schedule,
  { reminderMinutes = 15, academicCalendar, includeFinals = false, finalExamMatrix },
) {
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
  const tz = term.timezone;

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
      // MyUCSC gives real per-section dates; MyScheduler doesn't, so fall back
      // to the term's instruction window from the dataset.
      const mTerm = {
        ...termInfo,
        instructionStart: m.startDate || termInfo.instructionStart,
        instructionEnd: m.endDate || termInfo.instructionEnd,
      };
      const { start, end, recurrence } = buildRecurrence(m, mTerm);
      const comp = COMPONENT_LABEL[c.component] || "";
      events.push({
        summary: `${c.subject} ${c.course}${comp ? " " + comp : ""}`,
        location: m.location || undefined,
        description: classDescription(c),
        start,
        end,
        recurrence,
        reminders,
        extendedProperties: { private: { ucscExport: `${slug}:${c.classNumber}:m${i}` } },
        source: SOURCE,
      });
    });
  }

  const unresolvedFinals = [];
  if (includeFinals) {
    const termMatrix = finalExamMatrix?.[label];
    for (const c of schedule.classes) {
      if (c.component !== "LEC" || !c.meetings.length) continue;
      const { matched } = resolveFinal(c, termMatrix);
      if (!matched) {
        unresolvedFinals.push(`${c.subject} ${c.course}`);
        continue;
      }
      events.push({
        summary: `${c.subject} ${c.course} Final Exam`,
        location: matched.location || undefined,
        description: finalDescription(c),
        start: { dateTime: `${matched.examDate}T${matched.examStart}:00`, timeZone: tz },
        end: { dateTime: `${matched.examDate}T${matched.examEnd}:00`, timeZone: tz },
        reminders,
        extendedProperties: { private: { ucscExport: `${slug}:${c.classNumber}:final` } },
        source: SOURCE,
      });
    }
  }

  const firstDate = events.length
    ? events.map((e) => e.start.dateTime.slice(0, 10)).sort()[0]
    : null;

  return {
    termSlug: slug,
    termLabel: label,
    timezone: tz,
    firstDate,
    events,
    skipped,
    unresolvedFinals,
  };
}
