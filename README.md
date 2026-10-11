# Center Utility Complex — HVAC dashboard

Live link: https://claude.ai/artifact/JY3HRxEQB7mEY5U9ivSrtS

Open `index.html` in a browser to run it locally (fonts load from the internet).
All values are simulated; nothing is connected to a real BMS.

## Files
| File | What it does |
|---|---|
| `index.html` | Layout, styles, header with Schneider Electric / AVEVA logos |
| `hvac-site.png` | Site map image (Iconic Tower, C/D towers, CUC) |
| `roads.js` | Covers the streets on the map with green tree corridors |
| `sim.js` | Plant and tower simulation; pin positions (`x`,`y` = % of the map) |
| `ui.js` | Map pins, hover popups, sidebar (chillers, cooling towers, primary/secondary pumps), view switching |
| `detail.js` | Building / CUC KPI screen, schematics, simulation controls |
| `hookup.js` | Equipment hookup drawings (valves, strainers, pumps, PT/TT/FT sensors) |
| `analytics.js` | Performance — CUC plant vs published benchmarks + all towers with comfort / CO₂ / ΔT checks (merged Analytics + Benchmarks) |

## To edit later
Ask Claude to edit the **"Center Utility Complex"** HVAC dashboard (this folder).
