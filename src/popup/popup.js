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

const COURSE_COLORS = [
  "#22a06b",
  "#e5574e",
  "#c9a227",
  "#3b82f6",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
  "#f97316",
];

const COMPONENT_LABEL = {
  LEC: "Lecture",
  DISC: "Discussion",
  LAB: "Lab",
  SEC: "Section",
  SEM: "Seminar",
  STU: "Studio",
};

function colorFor(key, map) {
  if (!(key in map)) map[key] = COURSE_COLORS[Object.keys(map).length % COURSE_COLORS.length];
  return map[key];
}

function fmt12(hhmm) {
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return { t: `${h}:${String(m).padStart(2, "0")}`, ap };
}

function timeRange(m) {
  const a = fmt12(m.start);
  const b = fmt12(m.end);
  return a.ap === b.ap ? `${a.t}–${b.t} ${b.ap}` : `${a.t} ${a.ap} – ${b.t} ${b.ap}`;
}

function meetingLine(m) {
  return `${timeRange(m)}${m.location ? "  ·  " + m.location : ""}`;
}

function renderSchedule(data) {
  state.schedule = data;
  state.selected = new Set(
    data.classes.filter((c) => c.meetings.length).map((c) => c.classNumber),
  );

  $("#status").textContent = "";
  $("#term").textContent = data.term?.label || "";

  const colorMap = {};
  const list = $("#classes");
  list.replaceChildren();

  for (const c of data.classes) {
    const selectable = c.meetings.length > 0;

    const li = document.createElement("li");
    li.className = "cls";
    li.dataset.cls = c.classNumber;
    if (!selectable) li.classList.add("excluded");

    const bar = document.createElement("span");
    bar.className = "cls-bar";
    bar.style.background = colorFor(`${c.subject} ${c.course}`, colorMap);

    const body = document.createElement("div");
    body.className = "cls-body";

    const line1 = document.createElement("div");
    line1.className = "cls-line1";
    const code = document.createElement("span");
    code.className = "cls-code";
    code.textContent = `${c.subject} ${c.course}-${c.section}`;
    line1.append(code);

    const badgeText =
      !selectable && c.online
        ? "Online Asynchronous"
        : COMPONENT_LABEL[c.component] || c.component || "";
    if (badgeText) {
      const badge = document.createElement("span");
      badge.className = "cls-badge";
      badge.textContent = badgeText;
      line1.append(badge);
    }

    const title = document.createElement("div");
    title.className = "cls-title";
    title.textContent = c.title || "";

    const meta = document.createElement("div");
    meta.className = "cls-meta";
    meta.textContent = selectable
      ? c.meetings.map(meetingLine).join("     ·     ")
      : c.online
        ? "no meeting pattern"
        : "no meeting time";

    body.append(line1);
    if (c.title) body.append(title);
    body.append(meta);

    li.append(bar, body);

    if (selectable) {
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "cls-check";
      check.checked = state.selected.has(c.classNumber);
      check.addEventListener("change", () => {
        if (check.checked) state.selected.add(c.classNumber);
        else state.selected.delete(c.classNumber);
        li.classList.toggle("unchecked", !check.checked);
        renderSelCount();
        refreshButtons();
      });
      li.append(check);
    }

    list.append(li);
  }

  renderSelCount();
  $("#exporter").hidden = false;
  renderOptions();
  renderTabs();
}

function selectableClasses() {
  return (state.schedule?.classes || []).filter((c) => c.meetings.length);
}

function renderSelCount() {
  const total = selectableClasses().length;
  const n = state.selected.size;
  $("#sel-count").textContent = `Classes · ${n} of ${total} selected`;
  $("#classes-head").hidden = total === 0;

  const btn = $("#sel-toggle");
  const allOn = n >= total && total > 0;
  btn.textContent = allOn ? "Clear all" : "Select all";
  btn.dataset.act = allOn ? "clear" : "all";
}

function applySelectAll(select) {
  state.selected = select
    ? new Set(selectableClasses().map((c) => c.classNumber))
    : new Set();
  for (const li of document.querySelectorAll("#classes .cls")) {
    const cb = li.querySelector(".cls-check");
    if (!cb) continue;
    cb.checked = state.selected.has(li.dataset.cls);
    li.classList.toggle("unchecked", !cb.checked);
  }
  renderSelCount();
  refreshButtons();
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

    for (const el of document.querySelectorAll(".ics-name")) el.textContent = a.download;

    let msg = `Downloaded ${a.download} — ${built.events.length} event${
      built.events.length === 1 ? "" : "s"
    }. Follow the steps above to import it.`;
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

$("#sel-toggle").addEventListener("click", (e) => applySelectAll(e.target.dataset.act === "all"));
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
  if (data?.reason === "myucsc-not-list-view") {
    status.textContent =
      "You’re on the Weekly Calendar View. Set “Display Option” to List View near the top of the page, then reopen this popup.";
    return;
  }
  if (!data?.ok) {
    status.textContent = "";
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
