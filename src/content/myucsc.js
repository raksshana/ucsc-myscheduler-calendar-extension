/**
 * Content script for my.ucsc.edu (PeopleSoft "Class Schedule").
 *
 * Runs in all frames — the schedule lives inside a PeopleSoft target iframe.
 * Only the frame that actually contains the schedule answers UCSC_PARSE, so the
 * popup's sendMessage resolves with that frame's data.
 */
(() => {
  let modPromise = null;
  const parser = () =>
    (modPromise ??= import(chrome.runtime.getURL("src/lib/myucsc-parse.mjs")));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "UCSC_PARSE") return;
    if (!document.querySelector("td.PAGROUPDIVIDER")) return; // not the schedule frame
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
