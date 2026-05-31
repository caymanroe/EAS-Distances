// EAS Distances - results page logic

// ---- Configuration -------------------------------------------------------
const CRUISE_KTS = 140;      // knots
const FUEL_KG_PER_HR = 400;  // kg per hour
// West magnetic variation for Ireland (2025). Magnetic = True + MAGNETIC_VAR_W.
const MAGNETIC_VAR_W = 3;

// Known bases (decimal degrees, pre-computed from DMS).
const BASES = [
  { name: "BKATH", lat: 53 + 25/60 + 27.7/3600, lng: -(7 + 56/60 + 52.6/3600) },
  { name: "EIME",  lat: 53 + 18/60 +  8.9/3600, lng: -(6 + 27/60 +  6.8/3600) },
];

// Destinations. Coordinates given in aviation DDMM.mm form (e.g. N5321.00).
const DESTINATIONS = [
  { name: "Phoenix Park",               lat: "N5321.00", lng: "W00618.34" },
  { name: "Cathal Brugha Barracks",     lat: "N5319.63", lng: "W00616.30" },
  { name: "Bishopstown GAA",            lat: "N5153.10", lng: "W00831.30" },
  { name: "Cork University Hospital",   lat: "N5153.08", lng: "W00830.55" },
  { name: "Tralee Hospital",            lat: "N5215.90", lng: "W00941.20" },
  { name: "Tallaght Hospital",          lat: "N5317.40", lng: "W00622.60" },
  { name: "Sligo Hospital",             lat: "N5416.50", lng: "W00828.00" },
  { name: "University Hospital Limerick",lat: "N5238.00", lng: "W00839.10" },
  { name: "Letterkenny Hospital",       lat: "N5457.71", lng: "W00744.10" },
  { name: "University Hospital Galway",  lat: "N5316.60", lng: "W00904.20" },
  { name: "Castlebar Hospital",         lat: "N5351.00", lng: "W00918.10" },
  { name: "Beaumont Hospital Pitch",    lat: "N5323.30", lng: "W00613.80" },
  { name: "Altnagelvin Hospital",       lat: "N5459.10", lng: "W00717.50" }
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

// ---- Formatting ----------------------------------------------------------

function fmtBearing(b) {
  return String(Math.round(b)).padStart(3, "0") + "°";
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

// Scene → hospitals (sorted nearest first).
function computeRows(origin) {
  return DESTINATIONS.map((d) => {
    const dlat = parseAviationCoord(d.lat);
    const dlng = parseAviationCoord(d.lng);
    const dist = distanceNM(origin.lat, origin.lng, dlat, dlng);
    const brg = toMagnetic(bearingDeg(origin.lat, origin.lng, dlat, dlng));
    const timeMin = (dist / CRUISE_KTS) * 60;
    const fuelKg = (dist / CRUISE_KTS) * FUEL_KG_PER_HR;
    return { name: d.name, dist, brg, timeMin, fuelKg };
  }).sort((a, b) => a.dist - b.dist);
}

// Base → scene (one row per base, order preserved).
function computeBaseRows(scene) {
  return BASES.map((b) => {
    const dist = distanceNM(b.lat, b.lng, scene.lat, scene.lng);
    const brg = toMagnetic(bearingDeg(b.lat, b.lng, scene.lat, scene.lng));
    const timeMin = (dist / CRUISE_KTS) * 60;
    const fuelKg = (dist / CRUISE_KTS) * FUEL_KG_PER_HR;
    return { name: b.name, dist, brg, timeMin, fuelKg };
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
function copyHTML(origin, rows, stamp, meta, baseRows) {
  const title = meta.pdlz
    ? `Distances to Hospitals &middot; PDLZ ${meta.pdlz}`
    : "Distances to Hospitals";
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
      <div class="copy-foot">140 kts &middot; 400 kg/hr &middot; Headings &deg;M (var ${MAGNETIC_VAR_W}&deg;W) &middot; ${stamp}</div>
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

  const rows = computeRows(origin);
  const baseRows = computeBaseRows(origin);
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

  const pdlzChip = pdlz
    ? `<span class="chip chip-pdlz">PDLZ <strong>${pdlz}</strong></span>`
    : "";
  document.getElementById("assumptions").innerHTML = `
    ${pdlzChip}
    <span class="chip">Cruise <strong>140 kts</strong></span>
    <span class="chip">Fuel burn <strong>400 kg/hr</strong></span>
    <span class="chip">${rows.length} destinations &middot; nearest first</span>`;

  document.getElementById("bases-section").hidden = false;
  document.getElementById("bases-wrap").innerHTML = basesTableHTML(baseRows);

  document.getElementById("hospitals-section").hidden = false;
  document.getElementById("table-wrap").innerHTML = tableHTML(rows);

  // Two identical A5 copies on one A4 sheet.
  document.getElementById("print-sheet").innerHTML =
    copyHTML(origin, rows, stamp, meta, baseRows) + copyHTML(origin, rows, stamp, meta, baseRows);
}

document.addEventListener("DOMContentLoaded", init);
