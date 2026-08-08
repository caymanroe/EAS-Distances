// EAS Distances - results page logic

// ---- Configuration -------------------------------------------------------
const CRUISE_KTS = 140;      // knots (true airspeed)
const FUEL_KG_PER_HR = 400;  // kg per hour
// West magnetic variation for Ireland (2025). Magnetic = True + MAGNETIC_VAR_W.
const MAGNETIC_VAR_W = 3;

// Wind at ~1000ft (975 hPa) from Open-Meteo. No key, free for non-commercial use.
const WIND_API = "https://api.open-meteo.com/v1/forecast";
const WIND_SPEED_VAR = "windspeed_975hPa";
const WIND_DIR_VAR = "winddirection_975hPa";

// Known bases (decimal degrees, pre-computed from DMS).
const BASES = [
  { name: "BKATH", lat: 53 + 25/60 + 27.7/3600, lng: -(7 + 56/60 + 52.6/3600) },
  { name: "EIME",  lat: 53 + 18/60 +  8.9/3600, lng: -(6 + 27/60 +  6.8/3600) },
];

// Destinations. Coordinates given in aviation DDMM.mm form (e.g. N5321.00).
const DESTINATIONS = [
  { name: "Phoenix Park",               fms: "PHXPK", lat: "N5321.00", lng: "W00618.34" },
  { name: "Cork University Hospital",   fms: "425AC", lat: "N5153.08", lng: "W00830.55" },
  { name: "Tralee Hospital",            fms: "HOTRL", lat: "N5215.90", lng: "W00941.20" },
  { name: "Tallaght Hospital",          fms: "HOTAT", lat: "N5317.40", lng: "W00622.60" },
  { name: "Sligo Hospital",             fms: "HOSLG", lat: "N5416.50", lng: "W00828.00" },
  { name: "University Hospital Limerick",fms: "HOLIM", lat: "N5238.00", lng: "W00839.10" },
  { name: "Letterkenny Hospital",       fms: "HOLET", lat: "N5457.71", lng: "W00744.10" },
  { name: "University Hospital Galway",  fms: "HOGUH", lat: "N5316.60", lng: "W00904.20" },
  { name: "Castlebar Hospital",         fms: "HOCAS", lat: "N5351.00", lng: "W00918.10" },
  { name: "Beaumont Hospital Pitch",    fms: "1017",  lat: "N5323.30", lng: "W00613.80" },
  { name: "Tullamore Hospital",         fms: "321",   lat: "N5316.87", lng: "W00729.59" },
  { name: "Casement Aerodrome",         fms: "EIME",  lat: "N5318.15", lng: "W00626.63" },
  { name: "Waterford Airport",          fms: "EIWF",  lat: "N5211.22", lng: "W00705.23" }
];

// ---- Coordinate parsing --------------------------------------------------

// Parse aviation form like "N5321.00" / "W00618.34" -> decimal degrees.
function parseAviationCoord(s) {
  s = s.trim();
  const hemi = s[0].toUpperCase();
  const num = s.slice(1);
  const dot = num.indexOf(".");
  const intPart = dot === -1 ? num : num.slice(0, dot);
  const frac = dot === -1 ? "" : num.slice(dot);
  const minStr = intPart.slice(-2) + frac;
  const degStr = intPart.slice(0, -2);
  let dd = parseInt(degStr, 10) + parseFloat(minStr) / 60;
  if (hemi === "S" || hemi === "W") dd = -dd;
  return dd;
}

// Parse a free-text DMS string like "53°10'39.38''N, 6°31'35.21''W"
// (also tolerates 53 10 39.38 N etc) -> { lat, lng }.
function parseInputCoord(text) {
  if (!text) return null;
  const re = /([0-9.\s°'"′″]+?)\s*([NSEW])/gi;
  let m;
  let lat = null;
  let lng = null;
  while ((m = re.exec(text)) !== null) {
    const nums = (m[1].match(/[0-9.]+/g) || []).map(Number);
    if (!nums.length) continue;
    const deg = nums[0] || 0;
    const min = nums[1] || 0;
    const sec = nums[2] || 0;
    let dd = deg + min / 60 + sec / 3600;
    const hemi = m[2].toUpperCase();
    if (hemi === "S" || hemi === "W") dd = -dd;
    if (hemi === "N" || hemi === "S") lat = dd;
    else lng = dd;
  }
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

// ---- Great-circle maths --------------------------------------------------

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// Distance in nautical miles (haversine).
function distanceNM(lat1, lon1, lat2, lon2) {
  const R = 6371000; // mean Earth radius, metres
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c) / 1852;
}

// Initial true bearing (degrees) from point 1 to point 2.
function bearingDeg(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Convert true bearing to magnetic using fixed Irish variation (West, so add).
function toMagnetic(trueBrg) {
  return (trueBrg + MAGNETIC_VAR_W + 360) % 360;
}

// ---- Wind ----------------------------------------------------------------

// Fetch wind at ~1000ft for the current UTC hour. Returns
// { speedKt, dirDegTrue, hourISO } or throws on any failure.
async function fetchWind(lat, lng) {
  const url =
    `${WIND_API}?latitude=${lat}&longitude=${lng}` +
    `&hourly=${WIND_SPEED_VAR},${WIND_DIR_VAR}` +
    `&wind_speed_unit=kn&timeformat=iso8601&forecast_days=1`;
  // Bound the wait so a hung request falls back to still-air rather than
  // leaving the crew on a "fetching…" state forever.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Wind API HTTP ${res.status}`);
  const data = await res.json();
  const times = data?.hourly?.time;
  const speeds = data?.hourly?.[WIND_SPEED_VAR];
  const dirs = data?.hourly?.[WIND_DIR_VAR];
  if (!times || !speeds || !dirs) throw new Error("Wind data missing");
  const nowUTC = new Date().toISOString().slice(0, 13); // e.g. "2026-06-01T14"
  let idx = times.findIndex((t) => t.startsWith(nowUTC));
  if (idx < 0) idx = 0;
  const speedKt = speeds[idx];
  const dirDegTrue = dirs[idx];
  if (speedKt == null || dirDegTrue == null) throw new Error("Wind data missing");
  return { speedKt, dirDegTrue, hourISO: times[idx] };
}

// Groundspeed (kt) holding a desired true track against wind (E6B / crab).
// wind = { speedKt, dirDegTrue } where dir is the direction the wind comes FROM.
// Null wind -> still air -> groundspeed equals airspeed.
function groundspeedKt(tasKt, trackTrueDeg, wind) {
  if (!wind) return tasKt;
  const windTo = (wind.dirDegTrue + 180) % 360;     // direction wind blows TO
  const rel = toRad(windTo - trackTrueDeg);         // wind angle relative to track
  const crossWind = wind.speedKt * Math.sin(rel);   // perpendicular component
  const alongWind = wind.speedKt * Math.cos(rel);   // +tailwind / -headwind
  const sinWca = Math.max(-1, Math.min(1, crossWind / tasKt));
  const wca = Math.asin(sinWca);                    // crab angle
  return tasKt * Math.cos(wca) + alongWind;
}

// ---- Formatting ----------------------------------------------------------

function fmtBearing(b) {
  return String(Math.round(b)).padStart(3, "0") + "°";
}

// Wind for annunciation, direction shown magnetic (°M) to match headings.
function fmtWind(wind) {
  if (!wind) return "unavailable";
  const dirM = String(Math.round(toMagnetic(wind.dirDegTrue))).padStart(3, "0");
  return `${dirM}°M / ${Math.round(wind.speedKt)} kt`;
}

function fmtTime(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const mm = total % 60;
  if (h > 0) return `${h}:${String(mm).padStart(2, "0")}`;
  return `${mm} min`;
}

function decimalToDM(dd, isLat) {
  const hemi = isLat ? (dd >= 0 ? "N" : "S") : (dd >= 0 ? "E" : "W");
  const abs = Math.abs(dd);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${hemi}${deg}° ${min.toFixed(2)}'`;
}

// ---- Build rows ----------------------------------------------------------

// Build a single leg row. trueBrg drives the groundspeed; brg shown is magnetic.
// wind null -> still-air groundspeed (= cruise TAS).
function legRow(name, dist, trueBrg, wind, fms) {
  const gs = groundspeedKt(CRUISE_KTS, trueBrg, wind);
  const timeMin = (dist / gs) * 60;
  const fuelKg = (timeMin / 60) * FUEL_KG_PER_HR;
  return { name, fms, dist, brg: toMagnetic(trueBrg), timeMin, fuelKg };
}

// Scene → hospitals (sorted nearest first).
function computeRows(origin, wind) {
  return DESTINATIONS.map((d) => {
    const dlat = parseAviationCoord(d.lat);
    const dlng = parseAviationCoord(d.lng);
    const dist = distanceNM(origin.lat, origin.lng, dlat, dlng);
    const trueBrg = bearingDeg(origin.lat, origin.lng, dlat, dlng);
    return legRow(d.name, dist, trueBrg, wind, d.fms);
  }).sort((a, b) => a.dist - b.dist);
}

// Base → scene (one row per base, order preserved).
function computeBaseRows(scene, wind) {
  return BASES.map((b) => {
    const dist = distanceNM(b.lat, b.lng, scene.lat, scene.lng);
    const trueBrg = bearingDeg(b.lat, b.lng, scene.lat, scene.lng);
    return legRow(b.name, dist, trueBrg, wind);
  });
}

function basesTableHTML(rows) {
  const body = rows.map((r) => `
      <tr>
        <td class="name">${r.name}</td>
        <td class="figure">${r.dist.toFixed(1)}</td>
        <td class="figure">${fmtBearing(r.brg)}</td>
        <td class="figure">${fmtTime(r.timeMin)}</td>
        <td class="figure">${Math.round(r.fuelKg)}</td>
      </tr>`).join("");
  return `
    <table class="dist-table">
      <thead>
        <tr>
          <th class="name">Base</th>
          <th class="figure">Dist (NM)</th>
          <th class="figure">Hdg (°M)</th>
          <th class="figure">Time</th>
          <th class="figure">Fuel (kg)</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function tableHTML(rows) {
  const body = rows
    .map(
      (r, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="fms">${r.fms || ""}</td>
        <td class="name">${r.name}</td>
        <td class="figure">${r.dist.toFixed(1)}</td>
        <td class="figure">${fmtBearing(r.brg)}</td>
        <td class="figure">${fmtTime(r.timeMin)}</td>
        <td class="figure">${Math.round(r.fuelKg)}</td>
      </tr>`
    )
    .join("");
  return `
    <table class="dist-table">
      <thead>
        <tr>
          <th class="num">#</th>
          <th class="fms">FMS</th>
          <th class="name">Destination</th>
          <th class="figure">Dist (NM)</th>
          <th class="figure">Hdg (°M)</th>
          <th class="figure">Time</th>
          <th class="figure">Fuel (kg)</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

// One A5 copy used in the print sheet.
function copyHTML(origin, rows, stamp, meta, baseRows, wind) {
  const title = meta.pdlz
    ? `Distances to Hospitals &middot; PDLZ ${meta.pdlz}`
    : "Distances to Hospitals";
  const windTxt = wind
    ? `Wind 1000ft ${fmtWind(wind)} (times wind-adjusted)`
    : "Wind unavailable &mdash; still-air times";
  return `
    <div class="a5-copy">
      <div class="copy-head">
        <span class="copy-title">${title}</span>
        <span class="copy-origin">${meta.site ? meta.site + " &middot; " : ""}${decimalToDM(origin.lat, true)}, ${decimalToDM(origin.lng, false)}</span>
      </div>
      <div class="copy-section-label">Base &#x2192; Scene</div>
      ${basesTableHTML(baseRows)}
      <div class="copy-section-label">Hospitals &#x2014; nearest first</div>
      ${tableHTML(rows)}
      <div class="copy-foot">TAS 140 kts &middot; 400 kg/hr &middot; Headings &deg;M (var ${MAGNETIC_VAR_W}&deg;W) &middot; ${windTxt} &middot; ${stamp}</div>
    </div>`;
}

// ---- Main ----------------------------------------------------------------

function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.hidden = false;
}

function init() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("q") || "").trim();
  const pdlz = (params.get("pdlz") || "").trim();
  const site = (params.get("site") || "").trim();

  document.getElementById("print-btn").addEventListener("click", () => window.print());

  if (!raw) {
    showError("No coordinate was selected. Highlight a coordinate on the page, right-click it, and choose “Distances to Hospitals”.");
    return;
  }

  const origin = parseInputCoord(raw);
  if (!origin) {
    showError(`Could not read a coordinate from: “${raw}”.\nExpected something like  53°10'39.38''N, 6°31'35.21''W`);
    return;
  }

  const stamp = new Date().toLocaleString();
  const meta = { pdlz, site };

  if (pdlz) {
    document.title = `Distances — PDLZ ${pdlz}`;
    const h1 = document.querySelector(".title-block h1");
    h1.textContent = site
      ? `Distances to Hospitals — ${site}`
      : "Distances to Hospitals";
  }

  document.getElementById("origin-line").textContent =
    `Origin:  ${decimalToDM(origin.lat, true)}, ${decimalToDM(origin.lng, false)}   (from “${raw}”)`;

  // Phase 1: render still-air figures immediately so the crew always has numbers,
  // even if the wind lookup is slow or fails.
  renderAll(origin, null, meta, stamp, "fetching");

  // Phase 2: fetch wind and re-render wind-adjusted; fall back to still air on error.
  fetchWind(origin.lat, origin.lng)
    .then((wind) => renderAll(origin, wind, meta, stamp, "ok"))
    .catch((err) => {
      console.warn("Wind lookup failed, using still-air times:", err);
      renderAll(origin, null, meta, stamp, "failed");
    });
}

// Builds both on-screen tables, the chip row, the footer note and the print sheet.
// windState: "fetching" | "ok" | "failed" — drives the wind annunciation only.
function renderAll(origin, wind, meta, stamp, windState) {
  const rows = computeRows(origin, wind);
  const baseRows = computeBaseRows(origin, wind);

  const pdlzChip = meta.pdlz
    ? `<span class="chip chip-pdlz">PDLZ <strong>${meta.pdlz}</strong></span>`
    : "";
  document.getElementById("assumptions").innerHTML = `
    ${pdlzChip}
    ${windChipHTML(wind, windState)}
    <span class="chip">TAS <strong>140 kts</strong></span>
    <span class="chip">Fuel burn <strong>400 kg/hr</strong></span>
    <span class="chip">${rows.length} destinations &middot; nearest first</span>`;

  document.getElementById("bases-section").hidden = false;
  document.getElementById("bases-wrap").innerHTML = basesTableHTML(baseRows);

  document.getElementById("hospitals-section").hidden = false;
  document.getElementById("table-wrap").innerHTML = tableHTML(rows);

  const footNote = document.getElementById("wind-footnote");
  if (footNote) footNote.textContent = windFootnote(wind, windState);

  // Two identical A5 copies on one A4 sheet.
  document.getElementById("print-sheet").innerHTML =
    copyHTML(origin, rows, stamp, meta, baseRows, wind) +
    copyHTML(origin, rows, stamp, meta, baseRows, wind);
}

function windChipHTML(wind, windState) {
  if (windState === "fetching")
    return `<span class="chip chip-wind">Wind 1000ft <strong>fetching…</strong></span>`;
  if (wind)
    return `<span class="chip chip-wind">Wind 1000ft <strong>${fmtWind(wind)}</strong></span>`;
  return `<span class="chip chip-warn">Wind unavailable — still-air times</span>`;
}

function windFootnote(wind, windState) {
  if (windState === "fetching") return "Fetching wind at 1000 ft…";
  if (wind)
    return `Times wind-adjusted using ${fmtWind(wind)} at 1000 ft (975 hPa) at the scene.`;
  return "Wind unavailable — times shown are still-air (no wind correction).";
}

document.addEventListener("DOMContentLoaded", init);
