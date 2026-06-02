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

// Opened from the in-page button on a PDLZ datasheet (content.js).
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "eas-open-results") return;
  const params = new URLSearchParams();
  params.set("q", msg.coord || "");
  if (msg.pdlz) params.set("pdlz", msg.pdlz);
  if (msg.site) params.set("site", msg.site);
  const url = chrome.runtime.getURL("results.html") + "?" + params.toString();
  chrome.tabs.create({ url });
});

// Wind lookup for the content script. Content-script fetches can hit CORS/CSP
// issues, so the datasheet page asks the worker (which holds host permission)
// to fetch wind at ~1000ft (975 hPa) on its behalf. Replies { ok, wind } or { ok:false }.
function fetchWind(lat, lng) {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lng}` +
    "&hourly=windspeed_975hPa,winddirection_975hPa" +
    "&wind_speed_unit=kn&timeformat=iso8601&forecast_days=1";
  // Bound the wait so the datasheet falls back to still-air on a hung request.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  return fetch(url, { signal: ctrl.signal }).then((res) => {
    if (!res.ok) throw new Error("Wind API HTTP " + res.status);
    return res.json();
  }).then((data) => {
    const times = data && data.hourly && data.hourly.time;
    const speeds = data && data.hourly && data.hourly.windspeed_975hPa;
    const dirs = data && data.hourly && data.hourly.winddirection_975hPa;
    if (!times || !speeds || !dirs) throw new Error("Wind data missing");
    const nowUTC = new Date().toISOString().slice(0, 13);
    let idx = times.findIndex((t) => t.startsWith(nowUTC));
    if (idx < 0) idx = 0;
    if (speeds[idx] == null || dirs[idx] == null) throw new Error("Wind data missing");
    return { speedKt: speeds[idx], dirDegTrue: dirs[idx], hourISO: times[idx] };
  }).finally(() => clearTimeout(timer));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "eas-fetch-wind") return;
  fetchWind(msg.lat, msg.lng)
    .then((wind) => sendResponse({ ok: true, wind }))
    .catch((err) => {
      console.warn("EAS wind fetch failed:", err);
      sendResponse({ ok: false });
    });
  return true; // keep the message channel open for the async response
});
