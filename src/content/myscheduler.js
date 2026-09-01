/**
 * Content script for ucsc.collegescheduler.com (MyScheduler).
 *
 * Classic script (MV3 content scripts can't be ES modules), so it just
 * dynamic-imports the real parser module and answers popup requests.
 */
(() => {
  let modPromise = null;
  const parser = () =>
    (modPromise ??= import(chrome.runtime.getURL("src/lib/schedule-parse.mjs")));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "UCSC_PARSE") return;
    parser()
      .then((mod) => sendResponse(mod.parseScheduleDoc(document)))
      .catch((err) =>
        sendResponse({
          ok: false,
          reason: String(err?.message || err),
          term: { label: null },
          classes: [],
        }),
      );
    return true; // keep the message channel open for the async response
  });
})();
