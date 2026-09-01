/**
 * Thin Google Calendar API v3 wrapper. Pure fetch — caller supplies the token.
 */
const BASE = "https://www.googleapis.com/calendar/v3";

async function api(token, path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message || "";
    } catch {
      /* ignore */
    }
    const err = new Error(`Calendar API ${res.status}${detail ? `: ${detail}` : ""}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Writable calendars only. */
export async function listCalendars(token) {
  const data = await api(
    token,
    "/users/me/calendarList?minAccessRole=writer&fields=items(id,summary,primary)",
  );
  const items = data.items || [];
  items.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  return items.map((c) => ({ id: c.id, summary: c.summary, primary: !!c.primary }));
}

export function insertEvent(token, calendarId, event) {
  return api(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(event),
  });
}

export function deleteEvent(token, calendarId, eventId) {
  return api(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}
