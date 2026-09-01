/**
 * Background service worker — owns OAuth + all Google Calendar API calls.
 *
 * The popup talks to it over messages (GCAL_*). Running here means an in-flight
 * export survives the popup closing (which it does whenever Google shows its
 * consent screen).
 */
import { getToken, withFreshTokenRetry, disconnect } from "../lib/auth.mjs";
import { listCalendars, insertEvent, deleteEvent } from "../lib/gcal.mjs";
import { buildEvents } from "../lib/build-events.mjs";

chrome.runtime.onInstalled.addListener((d) => console.log("[UCSC->GCal] installed:", d.reason));

let academicCalendarCache = null;
async function academicCalendar() {
  if (!academicCalendarCache) {
    const url = chrome.runtime.getURL("src/lib/datasets/academic-calendar.json");
    academicCalendarCache = await (await fetch(url)).json();
  }
  return academicCalendarCache;
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
      const { schedule, calendarId, reminderMinutes } = msg.payload;
      const built = buildEvents(schedule, {
        reminderMinutes,
        academicCalendar: await academicCalendar(),
      });
      if (!built.events.length) throw new Error("Nothing to export — no timed classes found.");

      return withFreshTokenRetry(async (token) => {
        // clear a prior export of this term so re-running doesn't duplicate
        const exportsMap = (await get("exports")).exports || {};
        const prior = exportsMap[built.termSlug];
        if (prior?.eventIds?.length) {
          for (const id of prior.eventIds) {
            await deleteEvent(token, prior.calendarId, id).catch(() => {});
          }
        }

        const created = [];
        for (const ev of built.events) {
          const res = await insertEvent(token, calendarId, ev);
          created.push(res.id);
          await set({ progress: { done: created.length, total: built.events.length } });
        }

        exportsMap[built.termSlug] = {
          calendarId,
          eventIds: created,
          count: created.length,
          termLabel: built.termLabel,
          when: Date.now(),
        };
        await set({ exports: exportsMap, progress: null });

        return {
          count: created.length,
          skipped: built.skipped,
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
        let removed = 0;
        for (const id of rec.eventIds) {
          try {
            await deleteEvent(token, rec.calendarId, id);
            removed++;
          } catch {
            /* already gone */
          }
        }
        delete exportsMap[termSlug];
        await set({ exports: exportsMap });
        return { removed };
      });
    }

    default:
      throw new Error(`Unknown message ${msg.type}`);
  }
}
