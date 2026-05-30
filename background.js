// EAS Distances - background service worker
// Uses the `chrome.*` namespace, which is supported by both Chrome and Firefox.

const MENU_ID = "eas-distances-to-hospitals";

function createMenu() {
  // Remove any stale menu first to avoid duplicate-id errors on reload.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Distances to Hospitals",
      contexts: ["selection"]
    });
  });
}

chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = (info.selectionText || "").trim();
  const url = chrome.runtime.getURL("results.html") + "?q=" + encodeURIComponent(text);
  chrome.tabs.create({ url });
});
