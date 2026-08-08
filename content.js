// EAS Distances - content script
// Runs on PDLZ datasheet pages, e.g.
//   https://aeromed.healthatlasireland.ie/datasheet/AC/1778
// Adds (1) a fixed screen-only button to open the hospital-distances tab, and
//     (2) an inline EAS section (base→scene table, hospitals table, ForeFlight
//         QR code) injected after the datasheet footer and printed with Ctrl+P.

(function () {

  // ---- Configuration -------------------------------------------------------

  const CRUISE_KTS     = 140;
  const FUEL_KG_PER_HR = 400;
  const MAGNETIC_VAR_W = 3;   // degrees West, Ireland 2025

  const BASES = [
    { name: "BKATH", lat: 53 + 25/60 + 27.7/3600, lng: -(7 + 56/60 + 52.6/3600) },
    { name: "EIME",  lat: 53 + 18/60 +  8.9/3600, lng: -(6 + 27/60 +  6.8/3600) },
  ];

  const DESTINATIONS = [
    { name: "Phoenix Park",                fms: "PHXPK", lat: "N5321.00", lng: "W00618.34" },
    { name: "Cork University Hospital",    fms: "425AC", lat: "N5153.08", lng: "W00830.55" },
    { name: "Tralee Hospital",             fms: "HOTRL", lat: "N5215.90", lng: "W00941.20" },
    { name: "Tallaght Hospital",           fms: "HOTAT", lat: "N5317.40", lng: "W00622.60" },
    { name: "Sligo Hospital",              fms: "HOSLG", lat: "N5416.50", lng: "W00828.00" },
    { name: "University Hospital Limerick",fms: "HOLIM", lat: "N5238.00", lng: "W00839.10" },
    { name: "Letterkenny Hospital",        fms: "HOLET", lat: "N5457.71", lng: "W00744.10" },
    { name: "University Hospital Galway",  fms: "HOGUH", lat: "N5316.60", lng: "W00904.20" },
    { name: "Castlebar Hospital",          fms: "HOCAS", lat: "N5351.00", lng: "W00918.10" },
    { name: "Beaumont Hospital Pitch",     fms: "1017",  lat: "N5323.30", lng: "W00613.80" },
    { name: "Tullamore Hospital",          fms: "321",   lat: "N5316.87", lng: "W00729.59" },
    { name: "Casement Aerodrome",          fms: "EIME",  lat: "N5318.15", lng: "W00626.63" },
    { name: "Waterford Airport",           fms: "EIWF",  lat: "N5211.22", lng: "W00705.23" },
  ];

  // ---- Context reading ------------------------------------------------------

  function readContext() {
    let blob = "";
    for (const s of document.querySelectorAll("script")) {
      if (s.textContent && s.textContent.indexOf("datasheetVueContext") !== -1) {
        blob = s.textContent;
        break;
      }
    }
    const grab = (key) => {
      const m = blob.match(new RegExp(key + "\\s*:\\s*(['\"])([\\s\\S]*?)\\1"));
      return m ? m[2].trim() : "";
    };
    const coord = grab("coordinates");
    let id = grab("helisiteID"), prefix = grab("helisitePrefix");
    if (!id || !prefix) {
      const parts = location.pathname.split("/").filter(Boolean);
      const i = parts.indexOf("datasheet");
      if (i !== -1 && parts.length >= i + 3) {
        prefix = prefix || parts[i + 1];
        id     = id     || parts[i + 2];
      }
    }
    return { coord, pdlz: id && prefix ? `${id}-${prefix}` : "", site: grab("siteName") };
  }

  // ---- Coordinate utilities -------------------------------------------------

  function coordToForeFlight(coordStr) {
    const re = /([0-9]+)\s*[°º]\s*([0-9.]+)[^A-Za-z]*([NS])[^0-9]+([0-9]+)\s*[°º]\s*([0-9.]+)[^A-Za-z]*([EW])/i;
    const m = coordStr.match(re);
    if (!m) return null;
    function fmt(deg, decMin, hemi, lonPad) {
      const wMin = Math.floor(parseFloat(decMin));
      const sec  = Math.round((parseFloat(decMin) - wMin) * 60);
      return String(parseInt(deg)).padStart(lonPad ? 3 : 2, "0")
           + String(wMin).padStart(2, "0")
           + String(sec).padStart(2, "0")
           + hemi.toUpperCase();
    }
    return fmt(m[1], m[2], m[3], false) + fmt(m[4], m[5], m[6], true);
  }

  function parseAviationCoord(s) {
    s = s.trim();
    const hemi = s[0].toUpperCase(), num = s.slice(1);
    const dot  = num.indexOf(".");
    const int  = dot === -1 ? num : num.slice(0, dot);
    const frac = dot === -1 ? ""  : num.slice(dot);
    let dd = parseInt(int.slice(0, -2), 10) + parseFloat(int.slice(-2) + frac) / 60;
    if (hemi === "S" || hemi === "W") dd = -dd;
    return dd;
  }

  function parseInputCoord(text) {
    if (!text) return null;
    const re = /([0-9.\s°'"′″]+?)\s*([NSEW])/gi;
    let m, lat = null, lng = null;
    while ((m = re.exec(text)) !== null) {
      const nums = (m[1].match(/[0-9.]+/g) || []).map(Number);
      if (!nums.length) continue;
      let dd = (nums[0]||0) + (nums[1]||0)/60 + (nums[2]||0)/3600;
      const h = m[2].toUpperCase();
      if (h === "S" || h === "W") dd = -dd;
      if (h === "N" || h === "S") lat = dd; else lng = dd;
    }
    return lat !== null && lng !== null ? { lat, lng } : null;
  }

  // ---- Great-circle maths ---------------------------------------------------

  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  function distanceNM(lat1, lon1, lat2, lon2) {
    const R = 6371000, dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) / 1852;
  }

  function bearingDeg(lat1, lon1, lat2, lon2) {
    const p1 = toRad(lat1), p2 = toRad(lat2), dl = toRad(lon2-lon1);
    return (toDeg(Math.atan2(Math.sin(dl)*Math.cos(p2),
      Math.cos(p1)*Math.sin(p2) - Math.sin(p1)*Math.cos(p2)*Math.cos(dl))) + 360) % 360;
  }

  function toMagnetic(b) { return (b + MAGNETIC_VAR_W + 360) % 360; }

  // Groundspeed (kt) holding a true track against wind (E6B / crab).
  // wind = { speedKt, dirDegTrue } (FROM direction); null -> still air.
  function groundspeedKt(tasKt, trackTrueDeg, wind) {
    if (!wind) return tasKt;
    const windTo = (wind.dirDegTrue + 180) % 360;
    const rel = toRad(windTo - trackTrueDeg);
    const crossWind = wind.speedKt * Math.sin(rel);
    const alongWind = wind.speedKt * Math.cos(rel);
    const wca = Math.asin(Math.max(-1, Math.min(1, crossWind / tasKt)));
    return tasKt * Math.cos(wca) + alongWind;
  }

  // ---- Formatting -----------------------------------------------------------

  function fmtBrg(b)  { return String(Math.round(b)).padStart(3,"0") + "°"; }
  function fmtTime(m) {
    const t = Math.round(m), h = Math.floor(t/60), mm = t%60;
    return h > 0 ? `${h}:${String(mm).padStart(2,"0")}` : `${mm} min`;
  }
  function fmtWind(wind) {
    if (!wind) return "unavailable";
    const dirM = String(Math.round(toMagnetic(wind.dirDegTrue))).padStart(3,"0");
    return `${dirM}°M / ${Math.round(wind.speedKt)} kt`;
  }

  // ---- Row computation ------------------------------------------------------

  function legRow(name, dist, trueBrg, wind, fms) {
    const gs = groundspeedKt(CRUISE_KTS, trueBrg, wind);
    const timeMin = (dist / gs) * 60;
    return { name, fms, dist, brg: toMagnetic(trueBrg),
             timeMin, fuelKg: (timeMin / 60) * FUEL_KG_PER_HR };
  }

  function computeRows(origin, wind) {
    return DESTINATIONS.map((d) => {
      const dlat = parseAviationCoord(d.lat), dlng = parseAviationCoord(d.lng);
      const dist = distanceNM(origin.lat, origin.lng, dlat, dlng);
      const trueBrg = bearingDeg(origin.lat, origin.lng, dlat, dlng);
      return legRow(d.name, dist, trueBrg, wind, d.fms);
    }).sort((a,b) => a.dist - b.dist);
  }

  function computeBaseRows(scene, wind) {
    return BASES.map((b) => {
      const dist = distanceNM(b.lat, b.lng, scene.lat, scene.lng);
      const trueBrg = bearingDeg(b.lat, b.lng, scene.lat, scene.lng);
      return legRow(b.name, dist, trueBrg, wind);
    });
  }

  // Ask the background worker (which holds host permission) for wind at ~1000ft.
  // Resolves to a wind object or null on any failure — never rejects.
  function fetchWind(lat, lng) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "eas-fetch-wind", lat, lng }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) return resolve(null);
          resolve(resp.wind);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  // ---- HTML table builders --------------------------------------------------

  function basesTableHTML(rows) {
    const body = rows.map(r => `<tr>
      <td class="eb">${r.name}</td>
      <td class="er">${r.dist.toFixed(1)}</td>
      <td class="er">${fmtBrg(r.brg)}</td>
      <td class="er">${fmtTime(r.timeMin)}</td>
      <td class="er">${Math.round(r.fuelKg)}</td>
    </tr>`).join("");
    return `<table class="et"><thead><tr>
      <th>Base</th><th class="er">Dist&nbsp;(NM)</th>
      <th class="er">Hdg&nbsp;(°M)</th><th class="er">Time</th><th class="er">Fuel&nbsp;(kg)</th>
    </tr></thead><tbody>${body}</tbody></table>`;
  }

  function hospitalsTableHTML(rows) {
    const body = rows.map((r,i) => `<tr>
      <td class="en">${i+1}</td>
      <td class="ef">${r.fms || ""}</td>
      <td class="eb">${r.name}</td>
      <td class="er">${r.dist.toFixed(1)}</td>
      <td class="er">${fmtBrg(r.brg)}</td>
      <td class="er">${fmtTime(r.timeMin)}</td>
      <td class="er">${Math.round(r.fuelKg)}</td>
    </tr>`).join("");
    return `<table class="et"><thead><tr>
      <th class="en">#</th><th class="ef">FMS</th><th>Destination</th>
      <th class="er">Dist&nbsp;(NM)</th><th class="er">Hdg&nbsp;(°M)</th>
      <th class="er">Time</th><th class="er">Fuel&nbsp;(kg)</th>
    </tr></thead><tbody>${body}</tbody></table>`;
  }

  // ---- QR renderer ----------------------------------------------------------

  function renderQR(url) {
    try {
      const qr = qrcode(5, "M");
      qr.addData(url);
      qr.make();
      const canvas = document.getElementById("eas-qr-canvas");
      if (!canvas) return;
      const n = qr.getModuleCount(), cell = 5, margin = 2;
      const size = (n + margin * 2) * cell;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#000000";
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (qr.isDark(r, c))
            ctx.fillRect((margin+c)*cell, (margin+r)*cell, cell, cell);
    } catch (_) {}
  }

  // ---- Fixed button (screen only) ------------------------------------------

  function addButton(ctx) {
    if (document.getElementById("eas-distances-btn") || !ctx || !ctx.coord) return;
    const bar = document.createElement("div");
    bar.id = "eas-distances-btn";
    bar.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = ctx.pdlz ? `Distances to Hospitals  (PDLZ ${ctx.pdlz})` : "Distances to Hospitals";
    btn.style.cssText = [
      "font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
      "font-size:14px","font-weight:600","color:#fff","background:#2d3748",
      "border:1px solid #1f2733","border-radius:8px","padding:11px 20px",
      "cursor:pointer","box-shadow:0 4px 14px rgba(16,24,40,0.25)"
    ].join(";");
    btn.addEventListener("mouseenter", () => btn.style.opacity = "0.9");
    btn.addEventListener("mouseleave", () => btn.style.opacity = "1");
    btn.addEventListener("click", () =>
      chrome.runtime.sendMessage({ type:"eas-open-results", coord:ctx.coord, pdlz:ctx.pdlz, site:ctx.site }));
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  // ---- EAS inline section --------------------------------------------------

  function addEasSection(ctx) {
    const origin = parseInputCoord(ctx.coord);
    if (!origin) return;

    const ffCoord = coordToForeFlight(ctx.coord);
    const ffUrl   = ffCoord ? "foreflightmobile://maps/search?q=" + ffCoord : null;
    const stamp    = new Date().toLocaleString("en-IE");
    const heading  = ctx.pdlz ? `EAS Distances · PDLZ ${ctx.pdlz}` : "EAS Distances";

    // Footer note: base perf line + wind status (pending / wind-adjusted / unavailable).
    function footHTML(wind, windDone) {
      let windTxt;
      if (!windDone) windTxt = "Times still-air &middot; fetching wind at 1000&nbsp;ft&hellip;";
      else if (wind) windTxt = `Wind 1000ft ${fmtWind(wind)} (times wind-adjusted)`;
      else windTxt = "Wind unavailable &mdash; still-air times";
      return `140&nbsp;kts TAS &middot; 400&nbsp;kg/hr &middot; Headings &deg;M (var ${MAGNETIC_VAR_W}&deg;W) &middot; ${windTxt} &middot; ${stamp}`;
    }

    // (Re)populate the two tables and footer for a given wind (null = still air).
    function renderInline(wind, windDone) {
      const b = document.getElementById("eas-bases-wrap");
      const h = document.getElementById("eas-hosp-wrap");
      const f = document.getElementById("eas-foot");
      if (b) b.innerHTML = basesTableHTML(computeBaseRows(origin, wind));
      if (h) h.innerHTML = hospitalsTableHTML(computeRows(origin, wind));
      if (f) f.innerHTML = footHTML(wind, windDone);
    }

    // ---- Styles -------------------------------------------------------------
    const style = document.createElement("style");
    style.textContent = `
      /* ---- Screen ---- */
      body { overflow-y: auto !important; }

      #eas-section {
        margin: 24px 0 64px;
        padding: 14px 18px 16px;
        background: #f9fafb;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        color: #1f2733;
        line-height: 1.4;
      }
      .eas-topbar {
        padding-bottom: 10px;
        margin-bottom: 10px;
        border-bottom: 2px solid #1f2733;
      }
      .eas-topbar-title {
        font-size: 15px;
        font-weight: 700;
        display: block;
        margin-bottom: 3px;
      }
      .eas-topbar-coord { font-size: 12px; color: #555; }

      /* Two-column body: tables left, QR right */
      .eas-body {
        display: flex;
        gap: 20px;
        align-items: flex-start;
      }
      .eas-tables { flex: 1; min-width: 0; }
      .eas-qr-col {
        flex: none;
        width: 160px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding-top: 6px;
      }
      .eas-qr-label {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: #555;
        text-align: center;
      }
      #eas-qr-canvas { display: block; width: 155px; height: 155px; }
      .eas-qr-coord  { font-size: 9px; color: #888; font-family: monospace; text-align: center; }

      .eas-group-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #687385;
        margin: 10px 0 4px;
      }
      .et {
        width: 100%;
        border-collapse: collapse;
        font-variant-numeric: tabular-nums;
      }
      .et th {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #687385;
        font-weight: 600;
        background: #eef0f3;
        padding: 7px 10px;
        text-align: left;
        border-bottom: 1.5px solid #c0c4cc;
        white-space: nowrap;
      }
      .et td {
        padding: 7px 10px;
        border-bottom: 1px solid #e3e6eb;
        white-space: nowrap;
      }
      .et tbody tr:last-child td { border-bottom: none; }
      .er { text-align: right !important; }
      .en { color: #aaa; width: 22px; text-align: right; }
      .ef { color: #687385; font-weight: 600; white-space: nowrap; text-align: left; }
      .eb { font-weight: 600; text-align: left; }
      .eas-foot {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #e3e6eb;
        font-size: 11px;
        color: #888;
      }

      /* ---- Print ---- */
      @media print {
        #eas-distances-btn { display: none !important; }

        #eas-section {
          display: block !important;
          margin: 5mm 0 0;
          padding: 3mm 0 0;
          background: transparent !important;
          border: none !important;
          border-top: 1.5pt solid #000 !important;
          border-radius: 0;
          font-size: 7.5pt;
          color: #000;
          line-height: 1.3;
        }
        .eas-topbar {
          padding-bottom: 1.5mm;
          margin-bottom: 1.5mm;
          border-bottom: 1pt solid #000;
        }
        .eas-topbar-title { font-size: 11pt; margin-bottom: 0.8mm; }
        .eas-topbar-coord { font-size: 8pt; color: #333; }

        .eas-body { gap: 5mm; }
        .eas-qr-col { width: 42mm; padding-top: 1mm; gap: 2mm; }
        .eas-qr-label { font-size: 7pt; }
        #eas-qr-canvas { width: 40mm !important; height: 40mm !important; }
        .eas-qr-coord  { font-size: 7pt; }

        .eas-group-label { font-size: 7.5pt; margin: 2mm 0 1mm; color: #444; }
        .et th {
          font-size: 8pt;
          padding: 1.2mm 1.5mm;
          background: #efefef !important;
          border-bottom: 1pt solid #000;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .et td {
          font-size: 9.5pt;
          padding: 1.2mm 1.5mm;
          border-bottom: 0.4pt solid #ccc;
          color: #000;
        }
        .et tbody tr:last-child td { border-bottom: none; }
        .eas-foot {
          margin-top: 2mm;
          padding-top: 1.5mm;
          border-top: 0.5pt solid #aaa;
          font-size: 7.5pt;
          color: #444;
        }
      }
    `;
    document.head.appendChild(style);

    // ---- HTML ---------------------------------------------------------------
    const qrBlock = ffCoord ? `
      <div class="eas-qr-col">
        <div class="eas-qr-label">Open in ForeFlight</div>
        <canvas id="eas-qr-canvas"></canvas>
        <div class="eas-qr-coord">${ffCoord}</div>
      </div>` : "";

    const section = document.createElement("div");
    section.id = "eas-section";
    section.innerHTML = `
      <div class="eas-topbar">
        <span class="eas-topbar-title">${heading}</span>
        <span class="eas-topbar-coord">${ctx.coord}</span>
      </div>

      <div class="eas-body">
        <div class="eas-tables">
          <div class="eas-group-label">From base to scene</div>
          <div id="eas-bases-wrap"></div>
          <div class="eas-group-label">Distances to hospitals &mdash; nearest first</div>
          <div id="eas-hosp-wrap"></div>
        </div>
        ${qrBlock}
      </div>

      <div class="eas-foot" id="eas-foot"></div>
    `;

    // Wind kicked off once; section renders still-air immediately, then upgrades.
    let windDone = false, windValue = null;
    fetchWind(origin.lat, origin.lng).then((w) => {
      windDone = true; windValue = w;
      if (document.getElementById("eas-section")) renderInline(windValue, true);
    });

    // ---- Inject after .datasheet-footer -------------------------------------
    function inject(target) {
      if (document.getElementById("eas-section")) return;
      target.insertAdjacentElement("afterend", section);
      renderInline(windValue, windDone);
      if (ffUrl) renderQR(ffUrl);
    }

    const footer = document.querySelector(".datasheet-footer");
    if (footer) { inject(footer); return; }

    let timer;
    const observer = new MutationObserver(() => {
      const el = document.querySelector(".datasheet-footer");
      if (el) { clearTimeout(timer); observer.disconnect(); inject(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    timer = setTimeout(() => {
      if (document.getElementById("eas-section")) return;
      observer.disconnect();
      (document.getElementById("vueDatasheetApp") || document.body).appendChild(section);
      renderInline(windValue, windDone);
      if (ffUrl) renderQR(ffUrl);
    }, 4000);
  }

  // ---- Init -----------------------------------------------------------------

  function init() {
    const ctx = readContext();
    addButton(ctx);
    if (ctx.coord) addEasSection(ctx);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
