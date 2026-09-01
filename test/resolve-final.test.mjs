import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveFinal, dayFamily } from "../src/lib/resolve-final.mjs";

const matrix = JSON.parse(
  readFileSync(new URL("../src/lib/datasets/final-exam-matrix.json", import.meta.url)),
);
const FALL = matrix["Fall 2026"];

const cls = (days, start) => ({ meetings: [{ days, start, location: "Room 1" }] });

test("dayFamily", () => {
  assert.equal(dayFamily(["Mo", "We", "Fr"]), "MWF");
  assert.equal(dayFamily(["We"]), "MWF");
  assert.equal(dayFamily(["Tu", "Th"]), "TuTh");
  assert.equal(dayFamily(["Mo", "Tu"]), null); // mixed
  assert.equal(dayFamily([]), null);
});

test("resolveFinal — MWF 4:00pm -> Thu Dec 10 morning", () => {
  const { matched } = resolveFinal(cls(["Mo", "We", "Fr"], "16:00"), FALL);
  assert.deepEqual(matched, {
    examDate: "2026-12-10",
    examStart: "08:00",
    examEnd: "11:00",
    location: "Room 1",
  });
});

test("resolveFinal — TuTh 9:50am -> Thu Dec 10 afternoon", () => {
  const { matched } = resolveFinal(cls(["Tu", "Th"], "09:50"), FALL);
  assert.equal(matched.examDate, "2026-12-10");
  assert.equal(matched.examStart, "12:00");
});

test("resolveFinal — evening MW 5:20pm uses the MW row", () => {
  const { matched } = resolveFinal(cls(["Mo", "We"], "17:20"), FALL);
  assert.equal(matched.examDate, "2026-12-11");
});

test("resolveFinal — non-standard start time does not match", () => {
  assert.equal(resolveFinal(cls(["Mo", "We", "Fr"], "13:00"), FALL).matched, null);
});

test("resolveFinal — no matrix returns null", () => {
  assert.equal(resolveFinal(cls(["Mo"], "09:20"), undefined).matched, null);
});
