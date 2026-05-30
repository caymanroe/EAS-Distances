// EAS Distances - content script
// Runs on PDLZ datasheet pages, e.g.
//   https://aeromed.healthatlasireland.ie/datasheet/AC/1778
// Adds a button that opens the hospital-distances list for this site's
// coordinate, tagged with the PDLZ number.

(function () {
  // datasheetVueContext lives in an inline <script> in the page. A content
  // script runs in an isolated world, so we can't read the JS variable
  // directly — instead we read it out of the script tag's text.
  function readContext() {
    let blob = "";
    for (const s of document.querySelectorAll("script")) {
      if (s.textContent && s.textContent.indexOf("datasheetVueContext") !== -1) {
        blob = s.textContent;
        break;
      }
    }

    const grab = (key) => {
      // Matches  key: 'value'  or  key: "value", capturing the opening quote
      // type so values containing the *other* quote work — e.g. the
      // coordinates field is single-quoted but contains " marks:
      //   coordinates: '53° 19.687" N 7° 20.825" W'
      const m = blob.match(new RegExp(key + "\\s*:\\s*(['\"])([\\s\\S]*?)\\1"));
      return m ? m[2].trim() : "";
    };

    const coord = grab("coordinates");
    let id = grab("helisiteID");
    let prefix = grab("helisitePrefix");

    // Fall back to the URL path: /datasheet/<PREFIX>/<ID>
    if (!id || !prefix) {
      const parts = location.pathname.split("/").filter(Boolean);
      const i = parts.indexOf("datasheet");
      if (i !== -1 && parts.length >= i + 3) {
        prefix = prefix || parts[i + 1];
        id = id || parts[i + 2];
      }
    }

    const pdlz = id && prefix ? `${id}-${prefix}` : "";
    const site = grab("siteName");
    return { coord, pdlz, site };
  }

  function addButton() {
    if (document.getElementById("eas-distances-btn")) return; // no duplicates
    const ctx = readContext();
    if (!ctx.coord) return; // not a datasheet we can read

    const bar = document.createElement("div");
    bar.id = "eas-distances-btn";
    bar.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:18px",
      "transform:translateX(-50%)",
      "z-index:2147483647"
    ].join(";");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = ctx.pdlz
      ? `Distances to Hospitals  (PDLZ ${ctx.pdlz})`
      : "Distances to Hospitals";
    btn.style.cssText = [
      "font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
      "font-size:14px",
      "font-weight:600",
      "color:#fff",
      "background:#2d3748",
      "border:1px solid #1f2733",
      "border-radius:8px",
      "padding:11px 20px",
      "cursor:pointer",
      "box-shadow:0 4px 14px rgba(16,24,40,0.25)"
    ].join(";");
    btn.addEventListener("mouseenter", () => (btn.style.opacity = "0.9"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = "1"));

    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({
        type: "eas-open-results",
        coord: ctx.coord,
        pdlz: ctx.pdlz,
        site: ctx.site
      });
    });

    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addButton);
  } else {
    addButton();
  }
})();
