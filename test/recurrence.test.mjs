import test from "node:test";
import assert from "node:assert/strict";
import {
  firstOccurrence,
  buildRecurrence,
  dayOfWeek,
  localToUtcStamp,
} from "../src/lib/recurrence.mjs";

const FALL = {
  instructionStart: "2026-09-24",
  instructionEnd: "2026-12-04",
  holidays: ["2026-11-11", "2026-11-26", "2026-11-27"],
  timezone: "America/Los_Angeles",
};

test("dayOfWeek", () => {
  assert.equal(dayOfWeek("2026-09-24"), 4); // Thursday
  assert.equal(dayOfWeek("2026-11-11"), 3); // Wednesday (Veterans Day)
  assert.equal(dayOfWeek("2026-11-26"), 4); // Thursday (Thanksgiving)
});

test("firstOccurrence skips to the first matching weekday", () => {
  assert.equal(firstOccurrence("2026-09-24", ["Mo", "We", "Fr"]), "2026-09-25");
  assert.equal(firstOccurrence("2026-09-24", ["Tu"]), "2026-09-29");
  assert.equal(firstOccurrence("2026-09-24", ["Th"]), "2026-09-24");
});

test("localToUtcStamp converts PST wall time to UTC", () => {
  assert.equal(
    localToUtcStamp("2026-12-04", "23:59:59", "America/Los_Angeles"),
    "20261205T075959Z",
  );
});

test("buildRecurrence — MWF 4:00pm, holiday EXDATEs on matching weekdays only", () => {
  const r = buildRecurrence(
    { days: ["Mo", "We", "Fr"], start: "16:00", end: "17:05" },
    FALL,
  );
  assert.equal(r.firstDate, "2026-09-25");
  assert.deepEqual(r.start, {
    dateTime: "2026-09-25T16:00:00",
    timeZone: "America/Los_Angeles",
  });
  assert.deepEqual(r.end, {
    dateTime: "2026-09-25T17:05:00",
    timeZone: "America/Los_Angeles",
  });
  assert.equal(
    r.recurrence[0],
    "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261205T075959Z",
  );
  // Nov 11 (Wed) and Nov 27 (Fri) are in MWF; Nov 26 (Thu) is not.
  assert.equal(
    r.recurrence[1],
    "EXDATE;TZID=America/Los_Angeles:20261111T160000,20261127T160000",
  );
});

test("buildRecurrence — Tuesday-only meeting has no EXDATEs", () => {
  const r = buildRecurrence({ days: ["Tu"], start: "08:30", end: "11:30" }, FALL);
  assert.equal(r.firstDate, "2026-09-29");
  assert.equal(r.recurrence.length, 1);
});
