/**
 * Background service worker.
 *
 * Phase 0: no-op placeholder.
 * Phase 1 adds: chrome.identity OAuth + batched Google Calendar events.insert
 * (recurring series per meeting pattern, plus one computed final-exam event).
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log("[UCSC->GCal] installed:", details.reason);
});
