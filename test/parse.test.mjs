import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import {
  parseScheduleDoc,
  parseMeetingText,
  parseDayList,
  to24h,
} from "../src/lib/schedule-parse.mjs";

test("to24h", () => {
  assert.equal(to24h("4:00pm"), "16:00");
  assert.equal(to24h("9:20 a.m."), "09:20");
  assert.equal(to24h("12:00 p.m."), "12:00");
  assert.equal(to24h("12:00 a.m."), "00:00");
  assert.equal(to24h("8:30am"), "08:30");
  assert.equal(to24h("garbage"), null);
});

test("parseDayList", () => {
  assert.deepEqual(parseDayList("Monday, Wednesday, Friday"), ["Mo", "We", "Fr"]);
  assert.deepEqual(parseDayList("Tuesday and Thursday"), ["Tu", "Th"]);
  assert.deepEqual(parseDayList(""), []);
});

test("parseMeetingText — timed with location", () => {
  const m = parseMeetingText(
    "Monday, Wednesday, Friday 4:00pm to 5:05pm at Kresge Acad 3105",
  );
  assert.deepEqual(m.days, ["Mo", "We", "Fr"]);
  assert.equal(m.start, "16:00");
  assert.equal(m.end, "17:05");
  assert.equal(m.location, "Kresge Acad 3105");
  assert.equal(m.timed, true);
});

test("parseMeetingText — online / no time", () => {
  const m = parseMeetingText("at Online");
  assert.equal(m.timed, false);
  assert.equal(m.location, "Online");
  assert.deepEqual(m.days, []);
});

test("parseScheduleDoc — MyScheduler fixture", () => {
  const html = readFileSync(
    new URL("../data/fixtures/MyScheduler.html", import.meta.url),
    "utf8",
  );
  const doc = new JSDOM(html).window.document;
  const res = parseScheduleDoc(doc);

  assert.equal(res.ok, true);
  assert.equal(res.source, "myscheduler");
  assert.equal(res.term.label, "Fall 2026");
  assert.equal(res.term.year, 2026);
  assert.equal(res.classes.length, 5);

  const by = Object.fromEntries(res.classes.map((c) => [c.classNumber, c]));

  // CSE 101 lecture — MWF 4:00–5:05pm Kresge
  const cse = by["11881"];
  assert.equal(cse.subject, "CSE");
  assert.equal(cse.course, "101");
  assert.equal(cse.section, "01");
  assert.equal(cse.title, "Data Structs & Algs");
  assert.equal(cse.component, "LEC");
  assert.equal(cse.credits, 5);
  assert.equal(cse.online, false);
  assert.equal(cse.meetings.length, 1);
  assert.deepEqual(cse.meetings[0].days, ["Mo", "We", "Fr"]);
  assert.equal(cse.meetings[0].start, "16:00");
  assert.equal(cse.meetings[0].end, "17:05");
  assert.equal(cse.meetings[0].location, "Kresge Acad 3105");

  // CSE 101 section 01F — Monday only, 0 credits -> SEC
  assert.equal(by["11887"].component, "SEC");
  assert.deepEqual(by["11887"].meetings[0].days, ["Mo"]);
  assert.equal(by["11887"].meetings[0].start, "09:20");

  // MUSC 11C — online, no meeting -> skipped downstream
  assert.equal(by["13056"].online, true);
  assert.equal(by["13056"].meetings.length, 0);

  // PHYS 5N — "Intro Phys III Lab" -> LAB, Tuesday 8:30–11:30
  assert.equal(by["10689"].component, "LAB");
  assert.deepEqual(by["10689"].meetings[0].days, ["Tu"]);
  assert.equal(by["10689"].meetings[0].start, "08:30");
  assert.equal(by["10689"].meetings[0].end, "11:30");

  // PHYS 5C — MWF 10:40–11:45 Earth&Marine
  assert.equal(by["10429"].meetings[0].location, "Earth&Marine B206");
});
