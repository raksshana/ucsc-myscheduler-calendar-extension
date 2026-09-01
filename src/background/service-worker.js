/**
 * Background service worker — owns OAuth + all Google Calendar API calls.
 *
 * The popup talks to it over messages (GCAL_*). Running here means an in-flight
 * export survives the popup closing (which it does whenever Google shows its
 * consent screen).
 */
import { getToken, withFreshTokenRetry, disconnect } from "../lib/auth.mjs";
import {
  listCalendars,
  createCalendar,
  deleteCalendar,
  insertEvent,
  deleteEvent,
} from "../lib/gcal.mjs";
import { buildEvents } from "../lib/build-events.mjs";

const NEW_CALENDAR = "__new__";

chrome.runtime.onInstalled.addListener((d) => console.log("[UCSC->GCal] installed:", d.reason));

const datasetCache = {};
async function dataset(name) {
  if (!datasetCache[name]) {
    const url = chrome.runtime.getURL(`src/lib/datasets/${name}.json`);
    datasetCache[name] = await (await fetch(url)).json();
  }
  return datasetCache[name];
}

const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg?.type?.startsWith("GCAL_")) return;
  handle(msg)
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true; // async response
});

/** Remove whatever a prior export of this term created. */
async function clearPrior(token, rec) {
  if (!rec) return;
  if (rec.createdCalendar && rec.calendarId) {
    await deleteCalendar(token, rec.calendarId).catch(() => {});
    return;
  }
  for (const id of rec.eventIds || []) {
    await deleteEvent(token, rec.calendarId, id).catch(() => {});
  }
}

async function handle(msg) {
  switch (msg.type) {
    case "GCAL_STATE": {
      const s = await get(["connected", "calendars", "exports"]);
      return {
        connected: !!s.connected,
        calendars: s.calendars || [],
        exports: s.exports || {},
      };
    }

    case "GCAL_CONNECT": {
      const token = await getToken({ interactive: true });
      const calendars = await listCalendars(token);
      await set({ connected: true, calendars });
      return { calendars };
    }

    case "GCAL_DISCONNECT": {
      await disconnect();
      await set({ connected: false, calendars: [] });
      return {};
    }

    case "GCAL_EXPORT": {
      const { schedule, calendarId, reminderMinutes, includeFinals } = msg.payload;
      const built = buildEvents(schedule, {
        reminderMinutes,
        includeFinals,
        academicCalendar: await dataset("academic-calendar"),
        finalExamMatrix: await dataset("final-exam-matrix"),
      });
      if (!built.events.length) throw new Error("Nothing to export — no timed classes found.");

      return withFreshTokenRetry(async (token) => {
        const exportsMap = (await get("exports")).exports || {};
        await clearPrior(token, exportsMap[built.termSlug]);

        let targetId = calendarId;
        let createdCalendar = false;
        if (calendarId === NEW_CALENDAR) {
          const cal = await createCalendar(token, `UCSC ${built.termLabel}`, built.timezone);
          targetId = cal.id;
          createdCalendar = true;
        }

        const created = [];
        for (const ev of built.events) {
          const res = await insertEvent(token, targetId, ev);
          created.push(res.id);
          await set({ progress: { done: created.length, total: built.events.length } });
        }

        exportsMap[built.termSlug] = {
          calendarId: targetId,
          createdCalendar,
          eventIds: created,
          count: created.length,
          termLabel: built.termLabel,
          when: Date.now(),
        };
        await set({ exports: exportsMap, progress: null });

        // refresh the cached calendar list if we just made one
        if (createdCalendar) {
          await set({ calendars: await listCalendars(token) }).catch(() => {});
        }

        return {
          count: created.length,
          skipped: built.skipped,
          unresolvedFinals: built.unresolvedFinals,
          createdCalendar,
          termSlug: built.termSlug,
          termLabel: built.termLabel,
        };
      });
    }

    case "GCAL_UNDO": {
      const { termSlug } = msg.payload;
      const exportsMap = (await get("exports")).exports || {};
      const rec = exportsMap[termSlug];
      if (!rec) return { removed: 0 };

      return withFreshTokenRetry(async (token) => {
        await clearPrior(token, rec);
        const removed = rec.createdCalendar ? rec.count : (rec.eventIds || []).length;
        delete exportsMap[termSlug];
        await set({ exports: exportsMap });
        return { removed };
      });
    }

    default:
      throw new Error(`Unknown message ${msg.type}`);
  }
}
