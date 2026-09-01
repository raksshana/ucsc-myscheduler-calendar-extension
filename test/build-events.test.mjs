import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { parseScheduleDoc } from "../src/lib/schedule-parse.mjs";
import { parseScheduleDoc as parseMyUCSC } from "../src/lib/myucsc-parse.mjs";
import { buildEvents } from "../src/lib/build-events.mjs";

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

test("buildEvents — fixture yields 4 events, MUSC 11C skipped", () => {
  const { events, skipped, termSlug, termLabel } = buildEvents(schedule, {
    reminderMinutes: 15,
    academicCalendar,
  });

  assert.equal(termSlug, "fall2026");
  assert.equal(termLabel, "Fall 2026");
  assert.equal(events.length, 4);
  assert.deepEqual(skipped, ["MUSC 11C-01"]);

  const cse = events.find(
    (e) => e.extendedProperties.private.ucscExport === "fall2026:11881:m0",
  );
  assert.equal(cse.summary, "CSE 101 Lecture");
  assert.equal(cse.location, "Kresge Acad 3105");
  assert.equal(cse.start.dateTime, "2026-09-25T16:00:00");
  assert.equal(cse.start.timeZone, "America/Los_Angeles");
  assert.equal(cse.reminders.overrides[0].minutes, 15);
  assert.match(cse.recurrence[0], /^RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR/);
  assert.match(cse.description, /^Data Structs & Algs\nSection 01\n/);

  assert.ok(events.find((e) => e.summary === "PHYS 5N Lab"));
  assert.ok(events.find((e) => e.summary === "CSE 101 Section"));
});

test("buildEvents — reminderMinutes 0 disables overrides", () => {
  const { events } = buildEvents(schedule, { reminderMinutes: 0, academicCalendar });
  assert.deepEqual(events[0].reminders, { useDefault: false, overrides: [] });
});

test("buildEvents — unknown term throws", () => {
  const bad = { ...schedule, term: { label: "Fall 2099", quarter: "Fall", year: 2099 } };
  assert.throws(() => buildEvents(bad, { academicCalendar }), /No academic-calendar data/);
});

test("buildEvents — includeFinals adds one exam event per matched lecture", () => {
  const { events, unresolvedFinals } = buildEvents(schedule, {
    reminderMinutes: 15,
    academicCalendar,
    finalExamMatrix,
    includeFinals: true,
  });

  assert.deepEqual(unresolvedFinals, []); // MUSC 11C has no meetings -> not listed
  const finals = events.filter((e) => e.summary.endsWith("Final Exam"));
  assert.equal(finals.length, 2);

  const cse = finals.find((e) => e.summary === "CSE 101 Final Exam");
  assert.equal(cse.start.dateTime, "2026-12-10T08:00:00"); // MWF 4:00pm slot
  assert.equal(cse.end.dateTime, "2026-12-10T11:00:00");
  assert.equal(cse.start.timeZone, "America/Los_Angeles");
  assert.equal(cse.location, "Kresge Acad 3105");
  assert.ok(!cse.recurrence);
  assert.equal(cse.extendedProperties.private.ucscExport, "fall2026:11881:final");

  const phys = finals.find((e) => e.summary === "PHYS 5C Final Exam");
  assert.equal(phys.start.dateTime, "2026-12-08T16:00:00"); // MWF 10:40am slot
});

test("buildEvents — includeFinals off adds no exam events", () => {
  const { events } = buildEvents(schedule, {
    academicCalendar,
    finalExamMatrix,
    includeFinals: false,
  });
  assert.ok(!events.some((e) => e.summary.endsWith("Final Exam")));
});

test("buildEvents — MyUCSC source: instructor in description, per-section dates", () => {
  const uc = parseMyUCSC(
    new JSDOM(
      readFileSync(new URL("../data/fixtures/myucsc.html", import.meta.url), "utf8"),
    ).window.document,
  );
  const { events } = buildEvents(uc, { academicCalendar, reminderMinutes: 15 });

  const phys = events.find((e) => e.summary === "PHYS 5C Lecture");
  assert.doesNotMatch(phys.description, /Instructor/);
  assert.equal(phys.start.dateTime, "2026-09-25T10:40:00"); // first MWF day on/after 09/24 (Fri)
  assert.match(phys.recurrence[0], /UNTIL=20261205T075959Z/); // from the section's 12/04 end date
  assert.ok(events.find((e) => e.summary === "CSE 101 Discussion"));
});
