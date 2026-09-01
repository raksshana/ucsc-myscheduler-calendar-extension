const $ = (sel) => document.querySelector(sel);

const MYSCHEDULER_RE = /^https:\/\/ucsc\.collegescheduler\.com\//;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function meetingLabel(m) {
  const loc = m.location || "—";
  return `${m.days.join("")} ${m.start}–${m.end} · ${loc}`;
}

function render(data) {
  $("#status").textContent = "";

  const term = data.term?.label;
  $("#term").textContent = term
    ? `${term} · ${data.classes.length} sections`
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

async function main() {
  const status = $("#status");
  const tab = await getActiveTab();

  if (!tab?.url || !MYSCHEDULER_RE.test(tab.url)) {
    status.textContent =
      "Open your MyScheduler “Potential Schedule” page, then reopen this popup.";
    return;
  }

  let data;
  try {
    data = await chrome.tabs.sendMessage(tab.id, { type: "UCSC_PARSE" });
  } catch {
    status.textContent =
      "Couldn’t reach the page. Reload the MyScheduler tab and try again.";
    return;
  }

  if (!data?.ok) {
    status.textContent = `Couldn’t parse the schedule (${data?.reason ?? "unknown error"}).`;
    return;
  }

  render(data);
}

main();
