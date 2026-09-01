/**
 * Match one lecture to a slot in the registrar's final-exam matrix.
 * Pure. Returns { matched: {examDate, examStart, examEnd, location} } or { matched: null }.
 */

const MWF_DAYS = new Set(["Mo", "We", "Fr"]);
const TUTH_DAYS = new Set(["Tu", "Th"]);

/** Which matrix table a class's meeting days belong to. */
export function dayFamily(days) {
  const hasMWF = days.some((d) => MWF_DAYS.has(d));
  const hasTuTh = days.some((d) => TUTH_DAYS.has(d));
  if (hasMWF && !hasTuTh) return "MWF";
  if (hasTuTh && !hasMWF) return "TuTh";
  return null; // mixed (e.g. daily) or none -> can't place it
}

/** Which table a matrix row's dayGroup ("MWF", "MW", "TuTh") belongs to. */
function rowFamily(dayGroup) {
  if (/^[MWF]+$/.test(dayGroup)) return "MWF";
  if (/^(Tu|Th)+$/.test(dayGroup)) return "TuTh";
  return null;
}

export function resolveFinal(cls, termMatrix) {
  if (!termMatrix || !cls.meetings.length) return { matched: null };

  const meeting = cls.meetings[0];
  const fam = dayFamily(meeting.days);
  if (!fam) return { matched: null };

  const row = (termMatrix.rows || []).find(
    (r) => rowFamily(r.dayGroup) === fam && r.startTime === meeting.start,
  );
  if (!row) return { matched: null };

  return {
    matched: {
      examDate: row.examDate,
      examStart: row.examStart,
      examEnd: row.examEnd,
      location: meeting.location || null,
    },
  };
}
