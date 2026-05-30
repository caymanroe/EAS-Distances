# EAS Distances

A browser extension (Chrome + Firefox) for helicopter crews. Highlight a
coordinate from a PDLZ / map page, right-click, and choose **"Distances to
Hospitals"**. A new tab opens listing distance, heading, flight time and fuel
burn from that point to hospitals and landing sites around Ireland — sorted
nearest first — with a print layout that fits **two A5 copies on one A4 page**
(one per crew member).

## Install

Download the latest release from the
[Releases page](../../releases/latest):

### Firefox (one-click install)
1. Download **eas-distances.xpi**
2. In Firefox go to `about:addons`
3. Gear icon → **Install Add-on From File** → select the `.xpi`

The extension persists across restarts.

### Chrome / Edge
1. Download **eas-distances.zip** and unzip it anywhere permanent
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the unzipped folder

> Chrome only allows extensions from the Web Store in normal mode.
> Developer mode is required for side-loaded extensions.

## Build the packages yourself

```powershell
.\package.ps1
```

Outputs `dist/eas-distances.zip` (Chrome) and `dist/eas-distances.xpi`
(Firefox).

## Install from source (developer / temporary)

### Chrome / Edge
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** and select this folder

### Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** → select `manifest.json`

Temporary add-ons in Firefox are removed on restart.

---

## Two ways to use it

1. **Any page — right-click a coordinate.** Highlight a coordinate, right-click,
   choose **"Distances to Hospitals"**.
2. **PDLZ datasheet pages — one click.** On a Health Atlas datasheet
   (`https://aeromed.healthatlasireland.ie/datasheet/…`) a
   **"Distances to Hospitals (PDLZ …)"** button appears fixed at the bottom of
   the page. It reads the site's coordinate and PDLZ number automatically.

## Coordinate format

Highlight a coordinate in degrees-minutes-seconds, for example:

```
53°10'39.38''N, 6°31'35.21''W
```

The parser also accepts the degrees-decimal-minutes format used by the
Health Atlas datasheets:

```
53° 19.687" N 7° 20.825" W
```

## Assumptions

| Figure   | Basis                                    |
|----------|------------------------------------------|
| Distance | Great-circle (haversine), nautical miles |
| Heading  | Initial true track, `°T`                 |
| Time     | Cruise speed **140 kts**                 |
| Fuel     | **400 kg/hr** burn                       |

> Headings are **true**. Apply local magnetic variation if needed.

## Destinations

Phoenix Park, Cathal Brugha Barracks, Bishopstown GAA, Cork University
Hospital, Tralee Hospital, Tallaght Hospital, Sligo Hospital, University
Hospital Limerick, Letterkenny Hospital, University Hospital Galway, Castlebar
Hospital, Beaumont Hospital Pitch, Altnagelvin Hospital.

To add or edit a destination, change the `DESTINATIONS` array in
[`results.js`](results.js). Coordinates use the aviation `DDMM.mm` form,
e.g. `N5321.00`, `W00618.34`.

## Printing

Click **Print (2× A5)** on the results page. The print stylesheet renders the
list twice on a single A4 portrait sheet with a dashed cut line across the
middle — cut once to give an identical copy to each of two crew members.
The PDLZ number (when available) is printed on each copy.

## Files

| File            | Purpose                                              |
|-----------------|------------------------------------------------------|
| `manifest.json` | Extension manifest (MV3, cross-browser)              |
| `background.js` | Context-menu item + message handler for results tab  |
| `content.js`    | Injects button on PDLZ datasheet pages               |
| `results.html`  | Results page                                         |
| `results.js`    | Parsing, great-circle maths, rendering               |
| `results.css`   | On-screen styling + A4→2×A5 print layout             |
| `icons/`        | Toolbar icons                                        |
| `package.ps1`   | Build script — creates `dist/` ZIP and XPI           |
