const $ = (sel) => document.querySelector(sel);
const MYSCHEDULER_RE = /^https:\/\/ucsc\.collegescheduler\.com\//;
const DEFAULT_REMINDER = 15;

const state = {
  schedule: null,
  connected: false,
  calendars: [],
  exports: {},
  reminderMinutes: DEFAULT_REMINDER,
};

const send = (message) => chrome.runtime.sendMessage(message);
const slugFor = (t) => `${t.quarter}${t.year}`.toLowerCase();

// ---------- schedule list ----------

function meetingLabel(m) {
  return `${m.days.join("")} ${m.start}–${m.end} · ${m.location || "—"}`;
}

function renderSchedule(data) {
  state.schedule = data;
  $("#status").textContent = "";
  $("#term").textContent = data.term?.label
    ? `${data.term.label} · ${data.classes.length} sections`
    : `${data.classes.length} sections`;

  const list = $("#classes");
  list.replaceChildren();
  for (const c of data.classes) {
    const included = c.meetings.length > 0;
    const li = document.createElement("li");
    li.className = included ? "cls" : "cls excluded";

    const head = document.createElement("div");
    head.className = "cls-head";
    head.textContent = [`${c.subject} ${c.course}-${c.section}`, c.title]
      .filter(Boolean)
      .join(" · ");

    const sub = document.createElement("div");
    sub.className = "cls-sub";
    sub.textContent = included
      ? c.meetings.map(meetingLabel).join("   |   ")
      : c.online
        ? "online / async — skipped"
        : "no meeting time — skipped";

    li.append(head, sub);
    list.append(li);
  }
}

function exportableCount() {
  return (state.schedule?.classes || []).reduce((n, c) => n + c.meetings.length, 0);
}

// ---------- google calendar section ----------

function renderGoogle() {
  const section = $("#gcal");
  section.hidden = !state.schedule;

  const connectBtn = $("#connect");
  const controls = $("#controls");
  connectBtn.hidden = state.connected;
  controls.hidden = !state.connected;
  if (!state.connected) return;

  const select = $("#calendar");
  select.replaceChildren();
  for (const cal of state.calendars) {
    const opt = document.createElement("option");
    opt.value = cal.id;
    opt.textContent = cal.primary ? `${cal.summary} (primary)` : cal.summary;
    select.append(opt);
  }

  syncReminderChips();

  const n = exportableCount();
  const btn = $("#export");
  btn.textContent = n ? `Export ${n} event${n === 1 ? "" : "s"} to Google Calendar` : "Nothing to export";
  btn.disabled = !n;

  renderUndo();
}

function renderUndo() {
  const undo = $("#undo");
  const slug = state.schedule?.term ? slugFor(state.schedule.term) : null;
  const rec = slug && state.exports[slug];
  if (rec) {
    undo.hidden = false;
    undo.textContent = `Undo last export (${rec.count})`;
    undo.dataset.slug = slug;
  } else {
    undo.hidden = true;
  }
}

function syncReminderChips() {
  const chips = $("#reminders");
  for (const b of chips.querySelectorAll("button")) {
    b.classList.toggle("on", Number(b.dataset.min) === state.reminderMinutes);
  }
  const custom = $("#reminderCustom");
  const isPreset = [...chips.querySelectorAll("button")].some(
    (b) => Number(b.dataset.min) === state.reminderMinutes,
  );
  custom.value = isPreset ? "" : String(state.reminderMinutes);
}

function setReminder(minutes) {
  state.reminderMinutes = Math.max(0, Math.min(40320, minutes | 0));
  chrome.storage.sync.set({ defaultReminder: state.reminderMinutes });
  syncReminderChips();
}

// ---------- actions ----------

async function onConnect() {
  const btn = $("#connect");
  btn.disabled = true;
  btn.textContent = "Opening Google…";
  try {
    const res = await send({ type: "GCAL_CONNECT" });
    if (!res?.ok) throw new Error(res?.error || "Sign-in failed");
    state.connected = true;
    state.calendars = res.calendars || [];
    renderGoogle();
  } catch (e) {
    // popup usually closes during consent; if it's still here, show why
    btn.disabled = false;
    btn.textContent = "Connect Google Calendar";
    setResult(String(e.message || e), "err");
  }
}

async function onExport() {
  const btn = $("#export");
  btn.disabled = true;
  setResult("Exporting…");
  try {
    const res = await send({
      type: "GCAL_EXPORT",
      payload: {
        schedule: state.schedule,
        calendarId: $("#calendar").value,
        reminderMinutes: state.reminderMinutes,
      },
    });
    if (!res?.ok) throw new Error(res?.error || "Export failed");

    state.exports[res.termSlug] = {
      count: res.count,
      calendarId: $("#calendar").value,
      termLabel: res.termLabel,
    };
    const calName = state.calendars.find((c) => c.id === $("#calendar").value)?.summary || "your calendar";
    const extra = res.skipped?.length ? ` ${res.skipped.length} skipped (online/async).` : "";
    setResult(`Added ${res.count} event${res.count === 1 ? "" : "s"} to ${calName}.${extra}`, "ok");
    renderUndo();
  } catch (e) {
    setResult(String(e.message || e), "err");
  } finally {
    btn.disabled = false;
  }
}

async function onUndo(ev) {
  const slug = ev.currentTarget.dataset.slug;
  const btn = $("#undo");
  btn.disabled = true;
  setResult("Removing…");
  try {
    const res = await send({ type: "GCAL_UNDO", payload: { termSlug: slug } });
    if (!res?.ok) throw new Error(res?.error || "Undo failed");
    delete state.exports[slug];
    setResult(`Removed ${res.removed} event${res.removed === 1 ? "" : "s"}.`, "ok");
    renderUndo();
  } catch (e) {
    setResult(String(e.message || e), "err");
  } finally {
    btn.disabled = false;
  }
}

async function onDisconnect() {
  await send({ type: "GCAL_DISCONNECT" });
  state.connected = false;
  state.calendars = [];
  setResult("Disconnected.");
  renderGoogle();
}

function setResult(text, kind) {
  const el = $("#result");
  el.textContent = text;
  el.className = "result" + (kind ? " " + kind : "");
}

// ---------- wiring ----------

$("#connect").addEventListener("click", onConnect);
$("#export").addEventListener("click", onExport);
$("#undo").addEventListener("click", onUndo);
$("#disconnect").addEventListener("click", onDisconnect);

$("#reminders").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-min]");
  if (b) setReminder(Number(b.dataset.min));
});
$("#reminderCustom").addEventListener("change", (e) => {
  const v = e.target.value.trim();
  if (v !== "") setReminder(Number(v));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.progress) return;
  const p = changes.progress.newValue;
  if (p) setResult(`Exporting… ${p.done}/${p.total}`);
});

// ---------- init ----------

async function main() {
  const status = $("#status");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url || !MYSCHEDULER_RE.test(tab.url)) {
    status.textContent =
      "Open your MyScheduler “Potential Schedule” page, then reopen this popup.";
    return;
  }

  const { defaultReminder } = await chrome.storage.sync.get("defaultReminder");
  if (typeof defaultReminder === "number") state.reminderMinutes = defaultReminder;

  let data;
  try {
    data = await chrome.tabs.sendMessage(tab.id, { type: "UCSC_PARSE" });
  } catch {
    status.textContent = "Couldn’t reach the page. Reload the MyScheduler tab and try again.";
    return;
  }
  if (!data?.ok) {
    status.textContent = `Couldn’t parse the schedule (${data?.reason ?? "unknown error"}).`;
    return;
  }
  renderSchedule(data);

  const gs = await send({ type: "GCAL_STATE" });
  if (gs?.ok) {
    state.connected = gs.connected;
    state.calendars = gs.calendars;
    state.exports = gs.exports || {};
  }
  renderGoogle();
}

main();
