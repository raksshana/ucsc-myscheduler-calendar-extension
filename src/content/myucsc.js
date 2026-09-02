/**
 * Content script for my.ucsc.edu (PeopleSoft "My Class Schedule").
 *
 * Runs in all frames — the schedule lives inside a PeopleSoft target iframe.
 * The frame that contains the schedule answers UCSC_PARSE; other frames stay
 * silent so the popup's sendMessage resolves with that frame's data.
 */
(() => {
  let modPromise = null;
  const parser = () =>
    (modPromise ??= import(chrome.runtime.getURL("src/lib/myucsc-parse.mjs")));

  // The "Select Display Option" toggle is on both the List and Weekly views of
  // My Class Schedule — use it to recognise the right frame.
  const isSchedulePage = () =>
    !!document.querySelector("td.PAGROUPDIVIDER") ||
    /Select Display Option/i.test(document.body?.textContent || "");

  const inListView = () => !!document.querySelector("td.PAGROUPDIVIDER");

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "UCSC_PARSE") return;
    if (!isSchedulePage()) return; // not the schedule frame

    if (!inListView()) {
      sendResponse({
        ok: false,
        reason: "myucsc-not-list-view",
        term: { label: null },
        classes: [],
      });
      return true;
    }

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
    return true;
  });
})();
