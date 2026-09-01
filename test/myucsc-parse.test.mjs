import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { parseScheduleDoc } from "../src/lib/myucsc-parse.mjs";

const doc = new JSDOM(
  readFileSync(new URL("../data/fixtures/myucsc.html", import.meta.url), "utf8"),
).window.document;

test("parseScheduleDoc — MyUCSC fixture", () => {
  const res = parseScheduleDoc(doc);

  assert.equal(res.ok, true);
  assert.equal(res.source, "myucsc");
  assert.equal(res.term.label, "Fall 2026");
  assert.equal(res.classes.length, 5);

  const by = Object.fromEntries(res.classes.map((c) => [c.classNumber, c]));

  // CSE 101 lecture — real dates, instructor "To be Announced" -> null
  const lec = by["11881"];
  assert.equal(lec.subject, "CSE");
  assert.equal(lec.course, "101");
  assert.equal(lec.section, "01");
  assert.equal(lec.title, "Data Structs & Algs");
  assert.equal(lec.component, "LEC");
  assert.equal(lec.status, "Enrolled");
  assert.equal(lec.instructor, null);
  assert.deepEqual(lec.meetings[0], {
    days: ["Mo", "We", "Fr"],
    start: "16:00",
    end: "17:05",
    location: "Kresge Acad 3105",
    startDate: "2026-09-24",
    endDate: "2026-12-04",
  });

  // discussion section in the same course block
  assert.equal(by["11887"].component, "DISC");
  assert.equal(by["11887"].section, "01F");
  assert.equal(by["11887"].meetings[0].start, "09:20");

  // MUSC 11C — TBA + Online -> async, skipped downstream (instructor still kept)
  assert.equal(by["13056"].online, true);
  assert.equal(by["13056"].meetings.length, 0);
  assert.equal(by["13056"].instructor, "Alexander James Nunes");

  // instructors on the physics sections
  assert.equal(by["10429"].instructor, "Barun Dhar");
  assert.equal(by["10429"].meetings[0].location, "Earth&Marine B206");
  assert.equal(by["10689"].component, "LAB");
  assert.equal(by["10689"].instructor, "George S Brown");
  assert.deepEqual(by["10689"].meetings[0].days, ["Tu"]);
});
