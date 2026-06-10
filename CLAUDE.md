# EAS Distances — Claude Context

## What This Is

A browser extension for Irish helicopter emergency medical teams. Users highlight a geographic coordinate anywhere in the browser, right-click, and get a table of distances, headings, flight times, and fuel burn to 13 Irish hospitals and landing sites. Results can be printed as two identical A5 slips on one A4 sheet (one for each crew member).

There is also a secondary entry point: a fixed button injected into Health Atlas Ireland datasheet pages that pre-fills the site coordinate and PDLZ identifier automatically.

---

## Architecture

```
manifest.json        MV3 extension manifest (Chrome + Firefox)
background.js        Service worker — context menu + message routing
content.js           Content script — injected only on Health Atlas datasheet pages
results.html         Results page HTML (on-screen + hidden print view)
results.js           All core logic: parsing, maths, rendering
results.css          Styling (on-screen + A4 print media query)
icons/               icon-48.png, icon-128.png
package.ps1          PowerShell build script → dist/*.zip + dist/*.xpi
```

### Two entry points

1. **Right-click any page** → context menu "Distances to Hospitals" → `results.html?q=<encoded-text>`
2. **Health Atlas datasheet** (`https://aeromed.healthatlasireland.ie/datasheet/*`) → content.js injects a button → sends `{ type:"eas-open-results", coord, pdlz, site }` message to background.js → `results.html?q=…&pdlz=…&site=…`

### Message flow

```
Context menu click
  background.js.onClicked
    → opens results.html?q=<selected text>

Health Atlas button click
  content.js → chrome.runtime.sendMessage({type:"eas-open-results", …})
    → background.js.onMessage
      → opens results.html?q=…&pdlz=…&site=…
```

---

## results.js — Core Logic

### Configuration constants
```js
CRUISE_KTS     = 140       // knots (true airspeed)
FUEL_KG_PER_HR = 400       // kg/hr
MAGNETIC_VAR_W = 3         // degrees West magnetic variation for Ireland (2025)
WIND_API       = "https://api.open-meteo.com/v1/forecast"
WIND_SPEED_VAR / WIND_DIR_VAR = "windspeed_975hPa" / "winddirection_975hPa"  // ~1000ft
BASES          = [ … ]    // BKATH + EIME, decimal degrees pre-computed from DMS
DESTINATIONS   = [ … ]    // 13 hospital entries, coords in aviation DDmm.mm format
```

### Wind correction (v1.3.0+)

Flight times are wind-adjusted via groundspeed. `fetchWind(lat,lng)` calls the
free, no-auth **Open-Meteo** API for wind at **975 hPa (~1000 ft)** at the scene
(one call), picks the current UTC hour, and returns `{speedKt, dirDegTrue}`
(direction is FROM, true). `groundspeedKt(tas, trackTrue, wind)` uses the
held-track (E6B/crab) formula: crab to hold the desired true track, then
`GS = TAS·cos(WCA) + alongTrackWind`. `wind === null` ⇒ GS = TAS (still air), so
still-air and wind paths share one code path (`legRow`).

**Fail-safe:** `init()` renders still-air figures immediately (`renderAll(origin,
null, …, "fetching")`), then upgrades to wind on fetch success, or stays still-air
on failure/offline and annunciates "Wind unavailable — still-air times". The tool
never breaks if the API is down.

**Display:** wind direction shown **magnetic** (°M, via `toMagnetic`) to match the
heading column; GS maths runs in **true**. Fuel = (wind-adjusted min / 60) ×
`FUEL_KG_PER_HR`, so headwind raises both time and fuel.

**content.js parity:** the datasheet inline section is wind-adjusted too, but a
content script can't safely fetch cross-origin — it asks `background.js` via an
`{type:"eas-fetch-wind", lat, lng}` message; the worker (holds `host_permissions`)
fetches and replies `{ok, wind}`.

### Coordinate formats

| Context | Format | Example |
|---------|--------|---------|
| User input (selected text) | DMS, free-form | `53°10'39.38''N, 6°31'35.21''W` |
| Destination list | Aviation DDmm.mm | `N5321.00 W00631.59` |
| Display (origin) | Degrees-minutes | `N53° 10.66' W006° 31.59'` |

### Key functions

| Function | What it does |
|----------|-------------|
| `parseInputCoord(text)` | Parses user free-text DMS → `{lat, lng}` decimal degrees. Accepts Unicode symbols, spaces, varied quote marks. |
| `parseAviationCoord(s)` | Converts `N5321.00` → decimal degrees. Used for destinations. |
| `distanceNM(lat1,lon1,lat2,lon2)` | Haversine great-circle distance in NM. Earth radius = 6,371 km → ÷ 1,852 m/NM. |
| `bearingDeg(lat1,lon1,lat2,lon2)` | Initial true bearing, 0–360. |
| `toMagnetic(trueBrg)` | Converts true → magnetic by adding `MAGNETIC_VAR_W`. West variation means magnetic = true + var. |
| `fetchWind(lat,lng)` | Open-Meteo wind at 975 hPa, current UTC hour → `{speedKt, dirDegTrue}`; throws on failure. |
| `groundspeedKt(tas,trackTrue,wind)` | Held-track (E6B) groundspeed; returns `tas` when `wind` is null. |
| `legRow(name,dist,trueBrg,wind)` | Builds one row: GS-based `timeMin`, fuel from time, magnetic `brg` for display. |
| `computeRows(origin, wind)` | Maps all 13 destinations → rows via `legRow`, sorted ASC. |
| `computeBaseRows(scene, wind)` | Maps BKATH + EIME → same row shape, direction is base→scene, order preserved. |
| `basesTableHTML(rows)` | Table for the two base rows (no # column, "Base" header). |
| `fmtBearing(b)` | → `"045°"` (suffix-free; column header carries the °M label) |
| `fmtTime(minutes)` | → `"45 min"` or `"1:30"` |
| `decimalToDM(dd, isLat)` | → `"N53° 21.00'"` for display |
| `tableHTML(rows)` | Generates `<table class="dist-table">` for hospitals |
| `copyHTML(origin, rows, stamp, meta, baseRows, wind)` | Generates one A5 copy block (used twice for print); base→scene above hospitals; wind in the footer |
| `renderAll(origin, wind, meta, stamp, windState)` | Shared render: chips, both tables, footer note, print sheet. Called for still-air then again with wind. |
| `init()` | Entry point on DOMContentLoaded: parse/validate → render still-air → `fetchWind` → re-render or fall back |

### Calculations
```
GS             = groundspeedKt(CRUISE_KTS, trueTrack, wind)  // = CRUISE_KTS if no wind
timeMin        = (dist_NM / GS) * 60
fuelKg         = (timeMin / 60) * FUEL_KG_PER_HR
magneticBrg    = (trueBrg + MAGNETIC_VAR_W + 360) % 360       // West var → add
```

---

## content.js — Health Atlas Integration

Runs only on `https://aeromed.healthatlasireland.ie/datasheet/*`.

**Critical constraint:** Content scripts cannot read page JS variables directly (browser security isolation). Instead, `readContext()` uses regex to parse the raw text of `<script>` tags to extract the `datasheetVueContext` object, pulling out:
- `coordinates` — the site coordinate string
- `helisiteID` — numeric ID (e.g. `"1778"`)
- `helisitePrefix` — letter prefix (e.g. `"AC"`)
- `siteName` — human-readable name

PDLZ is assembled as `"<ID>-<PREFIX>"`. Fallback: parse from the URL path `/datasheet/<PREFIX>/<ID>`.

Button is injected at `bottom: 18px`, centered, with id `"eas-distances-btn"` (prevents duplicates).

The inline section is **wind-adjusted** to match the results page. `content.js`
mirrors `groundspeedKt` / `legRow` / `computeRows(origin, wind)` and requests wind
from `background.js` (`eas-fetch-wind` message). It renders still-air immediately,
then re-renders (`renderInline`) when wind resolves; `#eas-bases-wrap`,
`#eas-hosp-wrap` and `#eas-foot` are the update targets. **content.js keeps its own
copy of `DESTINATIONS`** — Waterford and any future site must be added in both
`results.js` and `content.js`.

---

## Print Layout

Two separate HTML blocks in `results.html`:
- `.screen` — visible on screen, hidden in print
- `.print-sheet` — hidden on screen (`display:none`), visible in print

CSS `@media print` switches visibility. Both A5 copies are generated by `copyHTML()` and inserted into `.print-sheet` before the page loads — no DOM work at print time.

Print spec: A4 portrait, 8mm margins, two `.a5-copy` blocks at 138mm height each, dashed border between them as a cut guide. Table font: 9pt with `font-variant-numeric: tabular-nums` for column alignment. **Row padding is `1.05mm` (tightened from 1.4mm)** so 13 hospitals + 2 base rows + the wind footer fit two copies on one A4; `.a5-copy` keeps `overflow:hidden` as the safety net. Re-check print preview when adding rows.

---

## Destinations (13 sites)

Phoenix Park, Cork University Hospital, Tralee Hospital, Tallaght Hospital, Sligo Hospital, University Hospital Limerick, Letterkenny Hospital, University Hospital Galway, Castlebar Hospital, Beaumont Hospital Pitch, Tullamore Hospital, Casement Aerodrome, Waterford Airport.

Coordinates are stored in aviation `DDmm.mm` format inside the `DESTINATIONS` array in `results.js` **and mirrored in `content.js`**.

---

## Build & Packaging

```powershell
.\package.ps1
```

Produces:
- `dist/eas-distances.zip` — for Chrome/Edge (unzip + "Load unpacked")
- `dist/eas-distances.xpi` — for Firefox (direct install via `about:addons`)

Both files are identical ZIP archives; only the extension differs.

**Important:** Entry paths in the ZIP must use forward slashes (`/`), not Windows backslashes. The script explicitly converts with `-replace '\\', '/'`. Firefox validation rejects backslash paths.

---

## Manifest Notes

- MV3 (Manifest Version 3) — required for modern Chrome and Firefox 140+
- Permissions: `contextMenus`; **host_permissions: `https://api.open-meteo.com/*`** (wind lookup)
- Firefox gecko ID: `eas-distances@eas.local`
- Min Firefox version: 140.0
- Data collection: **`locationInfo`** — the scene coordinate is sent to Open-Meteo for wind (declared for AMO honesty; was `none` pre-1.3.0)
- Content script timing: `document_idle`

---

## Non-Obvious Constraints

- **Service worker lifecycle:** `background.js` is a service worker (MV3). The context menu is recreated on both `onInstalled` and `onStartup` to survive browser restarts and extension updates.
- **No external dependencies:** Pure vanilla JS — no libraries, no bundler, no npm. All files ship as-is.
- **Magnetic variation is a fixed constant** (`MAGNETIC_VAR_W = 3`, degrees West) at the top of `results.js`. West variation → add to true bearing to get magnetic. Update this value periodically as Irish declination drifts.
- **Cruise speed and fuel are hardcoded constants** at the top of `results.js` — easy to change without touching the maths.
- **Bases (BKATH, EIME) are stored as pre-computed decimal degrees** in the `BASES` array. The on-screen results show a "From base to scene" section above the hospitals table; the print sheet includes both sections in each A5 copy.
- **Both sections hidden until JS succeeds** — `#bases-section` and `#hospitals-section` have `hidden` attribute in HTML; `init()` reveals them only after a valid coordinate is parsed.
- **Destination list is a plain array** in `results.js` — adding or removing sites means editing that array **and the mirror in `content.js`**. No external data source.
- **Wind is best-effort, never blocking** — a single Open-Meteo call at the scene; any failure (offline, HTTP error, missing data) silently falls back to still-air with a visible "Wind unavailable" note. Never let wind errors break rendering.
- **`background.js` proxies wind for `content.js`** — content scripts can hit CORS/CSP limits, so the worker (which holds `host_permissions`) does the fetch and replies; the listener returns `true` to keep the async channel open.
