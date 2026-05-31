# EAS Distances

A browser extension (Chrome + Firefox) for helicopter crews. Right-click a
coordinate on any page, or open a Health Atlas datasheet — and get distances,
magnetic headings, flight times and fuel burn from that point to hospitals
around Ireland, plus distances from your home bases (BKATH and EIME) to
the scene.

> **Performance figures are fixed at 140 KIAS cruise speed and 400 kg/hr fuel
> burn.** This extension is only suited for aircraft operating at these values.

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

No build tools or npm required.

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

### 1. Any page — right-click a coordinate

Highlight a coordinate anywhere, right-click, and choose **"Distances to
Hospitals"**. A new tab opens with the full results page showing:

- **Base to scene** — distance, magnetic heading, time and fuel from BKATH
  and EIME to the highlighted coordinate
- **Distances to hospitals** — the same figures for all destinations, sorted
  nearest first

Click **Print (2× A5)** to get a print-ready layout: two identical A5 copies
on one A4 portrait page (one for each crew member), with a dashed cut line
across the middle. The PDLZ number is printed when available.

### 2. Health Atlas datasheet pages — inline section + Ctrl+P

On a Health Atlas datasheet page
(`https://aeromed.healthatlasireland.ie/datasheet/…`) the extension
automatically injects:

- A fixed **"Distances to Hospitals"** button at the bottom — click to open
  the full results tab as above.
- An **inline EAS section** injected directly into the datasheet, showing:
  - Base-to-scene distances (BKATH and EIME)
  - Full hospital distance table
  - A **ForeFlight QR code** — scan with an iPad running ForeFlight to jump
    directly to the scene location on the moving map

The inline section is designed to print with Ctrl+P on a single A4 page
alongside the datasheet content. The button is hidden during printing.

## Coordinate formats

The parser accepts degrees-minutes-seconds:

```
53°10'39.38''N, 6°31'35.21''W
```

And the degrees-decimal-minutes format used by Health Atlas datasheets:

```
53° 19.687" N 7° 20.825" W
```

## Assumptions

| Figure   | Value                                           |
|----------|-------------------------------------------------|
| Distance | Great-circle (haversine), nautical miles        |
| Heading  | Magnetic, `°M` — variation **3° West** applied |
| Speed    | **140 KIAS**                                    |
| Fuel     | **400 kg/hr**                                   |

> Headings throughout the app are **magnetic** (true + 3°W variation for
> Ireland). This is hardcoded and not adjustable.

## Bases

Two home bases are included and appear as a separate "Base to scene" section
above the hospital list on both the results page and the datasheet inline
section:

| Callsign | Location       | Coordinates            |
|----------|----------------|------------------------|
| BKATH    | Custume Barracks, Athlone | 53°25'27.7"N 7°56'52.6"W |
| EIME     | Casement Aerodrome, Baldonnel | 53°18'08.9"N 6°27'06.8"W |

## Destinations

Phoenix Park, Cathal Brugha Barracks, Bishopstown GAA, Cork University
Hospital, Tralee Hospital, Tallaght Hospital, Sligo Hospital, University
Hospital Limerick, Letterkenny Hospital, University Hospital Galway, Castlebar
Hospital, Beaumont Hospital Pitch, Altnagelvin Hospital.

To add or edit a destination, change the `DESTINATIONS` array in
[`results.js`](results.js) and mirror any changes in the `DESTINATIONS` array
inside [`content.js`](content.js). Coordinates use the aviation `DDMM.mm`
form, e.g. `N5321.00`, `W00618.34`.

## ForeFlight QR code

On datasheet pages the injected section includes a QR code encoding a
ForeFlight deep link in the format:

```
foreflightmobile://maps/search?q=531039N0063135W
```

Scanning the QR from an iPad running ForeFlight opens the app and centres the
map on the scene coordinate. The coordinate is converted to **DDMMSS** format
internally — this is the only format reliably accepted by ForeFlight's URL
scheme.

## Printing

### Results tab (right-click flow)
Click **Print (2× A5)** on the results tab. The print stylesheet renders the
table twice on a single A4 portrait sheet with a dashed cut line across the
middle — cut once to give a copy to each of two crew members.

### Datasheet page (Ctrl+P)
Press Ctrl+P on a Health Atlas datasheet page. The injected EAS section
(base-to-scene table, hospital table, QR code) prints alongside the existing
datasheet content. The "Distances to Hospitals" button is suppressed in print.

## Files

| File            | Purpose                                                       |
|-----------------|---------------------------------------------------------------|
| `manifest.json` | Extension manifest (MV3, Chrome + Firefox)                    |
| `background.js` | Context-menu item + message handler for results tab           |
| `content.js`    | Injects button and inline EAS section on datasheet pages      |
| `qrcode.js`     | Browser-native QR code library (qrcode-generator, MIT)        |
| `results.html`  | Results page layout                                           |
| `results.js`    | Coordinate parsing, great-circle maths, results rendering     |
| `results.css`   | On-screen styling + A4→2×A5 print layout                      |
| `icons/`        | Toolbar icons (48px, 128px)                                   |
| `package.ps1`   | Build script — creates `dist/eas-distances.zip` and `.xpi`   |
| `CLAUDE.md`     | Developer context for AI-assisted development sessions        |
