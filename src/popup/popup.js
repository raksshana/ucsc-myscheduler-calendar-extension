import { buildEvents } from "../lib/build-events.mjs";
import { buildICS } from "../lib/ics.mjs";

const $ = (sel) => document.querySelector(sel);
const HOST_RE = /^https:\/\/(ucsc\.collegescheduler\.com|my\.ucsc\.edu)\//;
const DEFAULT_REMINDER = 15;
const NEW_CALENDAR = "__new__";

const datasets = {};
async function dataset(name) {
  if (!datasets[name]) {
    const url = chrome.runtime.getURL(`src/lib/datasets/${name}.json`);
    datasets[name] = await (await fetch(url)).json();
  }
  return datasets[name];
}

const state = {
  schedule: null,
  selected: new Set(), // classNumbers to export
  connected: false,
  calendars: [],
  exports: {},
  reminderMinutes: DEFAULT_REMINDER,
  includeFinals: true,
  tab: "google",
};

const send = (message) => chrome.runtime.sendMessage(message);
const slugFor = (t) => `${t.quarter}${t.year}`.toLowerCase();

// ---------- schedule list ----------

function meetingLabel(m) {
  return `${m.days.join("")} ${m.start}–${m.end} · ${m.location || "—"}`;
}

function renderSchedule(data) {
  state.schedule = data;
  state.selected = new Set(data.classes.filter((c) => c.meetings.length).map((c) => c.classNumber));

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

    if (included) {
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "cls-check";
      check.checked = true;
      check.dataset.cls = c.classNumber;
      check.addEventListener("change", () => {
        if (check.checked) state.selected.add(c.classNumber);
        else state.selected.delete(c.classNumber);
        li.classList.toggle("unchecked", !check.checked);
        refreshButtons();
      });
      li.append(check);
    }

    const body = document.createElement("div");
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
    body.append(head, sub);

    li.append(body);
    list.append(li);
  }

  $("#exporter").hidden = false;
  renderOptions();
  renderTabs();
}

function renderOptions() {
  $("#includeFinals").checked = state.includeFinals;
  syncReminderChips();
  refreshButtons();
}

function renderTabs() {
  for (const btn of document.querySelectorAll(".tab")) {
    btn.classList.toggle("on", btn.dataset.tab === state.tab);
  }
  $("#panel-google").hidden = state.tab !== "google";
  $("#panel-ics").hidden = state.tab !== "ics";
  $("#openrow").hidden = state.tab !== "google";
}

function setTab(name) {
  state.tab = name;
  chrome.storage.sync.set({ exporterTab: name });
  setResult("");
  renderTabs();
}

function selectedMeetingCount() {
  return (state.schedule?.classes || [])
    .filter((c) => state.selected.has(c.classNumber))
    .reduce((n, c) => n + c.meetings.length, 0);
}

function filteredSchedule() {
  return {
    ...state.schedule,
    classes: state.schedule.classes.filter((c) => state.selected.has(c.classNumber)),
  };
}

// ---------- google calendar section ----------

function renderGoogle() {
  $("#connect").hidden = state.connected;
  $("#controls").hidden = !state.connected;
  $("#footer").hidden = !state.connected;
  if (!state.connected) return;

  const select = $("#calendar");
  const prev = select.value;
  select.replaceChildren();
  for (const cal of state.calendars) {
    const opt = document.createElement("option");
    opt.value = cal.id;
    opt.textContent = cal.primary ? `${cal.summary} (primary)` : cal.summary;
    select.append(opt);
  }
  const newOpt = document.createElement("option");
  newOpt.value = NEW_CALENDAR;
  newOpt.textContent = state.schedule?.term?.label
    ? `＋ New calendar “UCSC ${state.schedule.term.label}”`
    : "＋ New calendar";
  select.append(newOpt);
  if (prev) select.value = prev;

  refreshButtons();
  renderUndo();
}

function refreshButtons() {
  const n = selectedMeetingCount();
  const suffix = state.includeFinals ? " + finals" : "";

  const exp = $("#export");
  exp.disabled = !n;
  exp.textContent = !n ? "Nothing selected" : `Export ${n} event${n === 1 ? "" : "s"}${suffix}`;

  const ics = $("#downloadIcs");
  ics.disabled = !n;
  ics.textContent = !n ? "Nothing selected" : `Download .ics (${n} event${n === 1 ? "" : "s"}${suffix})`;
}

function renderUndo() {
  const undo = $("#undo");
  const slug = state.schedule?.term ? slugFor(state.schedule.term) : null;
  const rec = slug && state.exports[slug];
  if (rec) {
    undo.hidden = false;
    undo.textContent = `Undo last export (${rec.count})`;
    undo.dataset.slug = slug;
    showOpenCal(rec.firstDate);
  } else {
    undo.hidden = true;
    showOpenCal(null);
  }
}

const GCAL_BASE = "https://calendar.google.com/calendar/u/0/r";

function showOpenCal(firstDate) {
  const a = $("#openCal");
  if (!firstDate) {
    a.hidden = true;
    return;
  }
  const [y, m, d] = firstDate.split("-").map(Number);
  a.href = `${GCAL_BASE}/week/${y}/${m}/${d}`;
  a.hidden = false;
}

function syncReminderChips() {
  const chips = $("#reminders");
  const buttons = [...chips.querySelectorAll("button")];
  for (const b of buttons) b.classList.toggle("on", Number(b.dataset.min) === state.reminderMinutes);
  const isPreset = buttons.some((b) => Number(b.dataset.min) === state.reminderMinutes);
  $("#reminderCustom").value = isPreset ? "" : String(state.reminderMinutes);
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
        schedule: filteredSchedule(),
        calendarId: $("#calendar").value,
        reminderMinutes: state.reminderMinutes,
        includeFinals: state.includeFinals,
      },
    });
    if (!res?.ok) throw new Error(res?.error || "Export failed");

    state.exports[res.termSlug] = {
      count: res.count,
      termLabel: res.termLabel,
      firstDate: res.firstDate,
    };

    if (res.createdCalendar) {
      const st = await send({ type: "GCAL_STATE" });
      if (st?.ok) state.calendars = st.calendars;
    }
    renderGoogle();

    const target =
      $("#calendar").value === NEW_CALENDAR
        ? `“UCSC ${res.termLabel}”`
        : state.calendars.find((c) => c.id === $("#calendar").value)?.summary || "your calendar";
    let msg = `Added ${res.count} event${res.count === 1 ? "" : "s"} to ${target}.`;
    if (res.skipped?.length) msg += ` ${res.skipped.length} online/async skipped.`;
    if (res.unresolvedFinals?.length)
      msg += ` No exam slot matched for ${res.unresolvedFinals.join(", ")} — add those finals manually.`;
    setResult(msg, "ok");
  } catch (e) {
    setResult(String(e.message || e), "err");
  } finally {
    btn.disabled = false;
  }
}

async function onDownloadIcs() {
  const btn = $("#downloadIcs");
  btn.disabled = true;
  setResult("Building .ics…");
  try {
    const built = buildEvents(filteredSchedule(), {
      reminderMinutes: state.reminderMinutes,
      includeFinals: state.includeFinals,
      academicCalendar: await dataset("academic-calendar"),
      finalExamMatrix: await dataset("final-exam-matrix"),
    });
    if (!built.events.length) throw new Error("Nothing to export — no timed classes selected.");

    const blob = new Blob([buildICS(built)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ucsc-${built.termSlug}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    let msg = `Downloaded ${a.download} — ${built.events.length} event${
      built.events.length === 1 ? "" : "s"
    }. Import it in Apple Calendar (File → Import) or Google Calendar (Settings → Import & export).`;
    if (built.unresolvedFinals?.length)
      msg += ` No exam slot matched for ${built.unresolvedFinals.join(", ")}.`;
    setResult(msg, "ok");
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
  setResult("Signed out of Google.");
  renderGoogle();
}

function setResult(text, kind) {
  const el = $("#result");
  el.textContent = text;
  el.className = "result" + (kind ? " " + kind : "");
}

// ---------- wiring ----------

for (const btn of document.querySelectorAll(".tab")) {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
}

$("#connect").addEventListener("click", onConnect);
$("#export").addEventListener("click", onExport);
$("#downloadIcs").addEventListener("click", onDownloadIcs);
$("#undo").addEventListener("click", onUndo);
$("#disconnect").addEventListener("click", onDisconnect);

$("#includeFinals").addEventListener("change", (e) => {
  state.includeFinals = e.target.checked;
  chrome.storage.sync.set({ includeFinals: state.includeFinals });
  refreshButtons();
});

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

  if (!tab?.url || !HOST_RE.test(tab.url)) {
    status.textContent = "";
    $("#help").hidden = false;
    return;
  }

  const prefs = await chrome.storage.sync.get([
    "defaultReminder",
    "includeFinals",
    "exporterTab",
  ]);
  if (typeof prefs.defaultReminder === "number") state.reminderMinutes = prefs.defaultReminder;
  if (typeof prefs.includeFinals === "boolean") state.includeFinals = prefs.includeFinals;
  if (prefs.exporterTab === "google" || prefs.exporterTab === "ics")
    state.tab = prefs.exporterTab;

  let data;
  try {
    data = await chrome.tabs.sendMessage(tab.id, { type: "UCSC_PARSE" });
  } catch {
    data = null;
  }
  if (!data?.ok) {
    status.textContent = "Couldn’t find a class schedule on this page.";
    $("#help").hidden = false;
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
