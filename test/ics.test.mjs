import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { parseScheduleDoc } from "../src/lib/schedule-parse.mjs";
import { buildEvents } from "../src/lib/build-events.mjs";
import { buildICS } from "../src/lib/ics.mjs";

const academicCalendar = JSON.parse(
  readFileSync(new URL("../src/lib/datasets/academic-calendar.json", import.meta.url)),
);
const finalExamMatrix = JSON.parse(
  readFileSync(new URL("../src/lib/datasets/final-exam-matrix.json", import.meta.url)),
);
const schedule = parseScheduleDoc(
  new JSDOM(
    readFileSync(new URL("../data/fixtures/MyScheduler.html", import.meta.url), "utf8"),
  ).window.document,
);

const built = buildEvents(schedule, {
  reminderMinutes: 15,
  includeFinals: true,
  academicCalendar,
  finalExamMatrix,
});
const ics = buildICS(built);

test("buildICS — well-formed VCALENDAR with CRLF lines", () => {
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
  assert.ok(ics.includes("\r\n") && !/\n(?!\r)/.test(ics.replace(/\r\n/g, "")));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, built.events.length); // 4 + 2 finals
  assert.equal((ics.match(/END:VEVENT/g) || []).length, built.events.length);
});

test("buildICS — timezone, recurrence, and alarm carried through", () => {
  assert.ok(ics.includes("BEGIN:VTIMEZONE\r\nTZID:America/Los_Angeles"));
  assert.ok(ics.includes("DTSTART;TZID=America/Los_Angeles:20260925T160000"));
  assert.ok(ics.includes("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261205T075959Z"));
  assert.ok(ics.includes("EXDATE;TZID=America/Los_Angeles:20261111T160000,20261127T160000"));
  assert.ok(ics.includes("TRIGGER:-PT15M"));
});

test("buildICS — stable UID and escaped text", () => {
  assert.ok(ics.includes("UID:fall2026:11881:m0@ucsc-schedule-exporter"));
  assert.ok(ics.includes("SUMMARY:CSE 101 Lecture"));
  assert.ok(ics.includes("SUMMARY:CSE 101 Final Exam"));
  // "Earth&Marine B206" has no special chars; a comma/semicolon would be backslash-escaped
  const withComma = buildICS({
    termLabel: "Fall 2026",
    events: [
      {
        summary: "A, B; C",
        start: { dateTime: "2026-09-25T16:00:00", timeZone: "America/Los_Angeles" },
        end: { dateTime: "2026-09-25T17:00:00", timeZone: "America/Los_Angeles" },
        reminders: { overrides: [] },
      },
    ],
  });
  assert.ok(withComma.includes("SUMMARY:A\\, B\\; C"));
});
