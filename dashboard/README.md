# W-Apps — Swiss weather

A static MeteoSwiss weather website built with native JavaScript modules and HTML/CSS. The dashboard needs no build step or runtime JavaScript dependencies; the interactive map loads Leaflet from its CDN and OpenStreetMap tiles. The bundled station index lives in `assets/coord_station_meteosuisse.json`; the dashboard and map share its built-in fallback station list.

For example, from the repository root:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/dashboard/` for live conditions or `http://localhost:8000/maps/` to explore the station network.

## Development

Use Node.js 20 or later for the checks. From the repository root:

```sh
npm ci
npm test
npm run format:check
```

Run `npm run format` to format the website. Tests use Node's built-in test runner, injected fetch/storage implementations, and a lightweight DOM stub against the dashboard HTML, so they do not need a browser or a network connection. DOM coverage includes chart empty/data transitions, linked table highlighting, CSV downloads, and config-driven metric tiles.

## Structure

Dashboard-only modules live under `dashboard/`:

| File         | Responsibility                                                                     |
| ------------ | ---------------------------------------------------------------------------------- |
| `app.js`     | Browser startup, current conditions, station/metric controls, and event handling   |
| `model.js`   | Application state, preference restoration, station loading, geocoding, and polling |
| `geocode.js` | Swiss place search and result normalization                                        |
| `chart.js`   | SVG chart, tooltip, linked readings table, and CSV download                        |
| `style.css`  | Theme tokens, component styles, and consolidated responsive layouts                |

Modules shared by the dashboard and map live at the repository root:

| File         | Responsibility                                                                |
| ------------ | ----------------------------------------------------------------------------- |
| `weather.js` | CSV/date parsing, station normalization, proximity, feed caching, and trends  |
| `config.js`  | Metric definitions, API parameter aliases, ranges, and fallback stations      |
| `storage.js` | Validated preference reads and best-effort writes                             |
| `site.js`    | Shared theme toggle and persistence for website pages                         |
| `format.js`  | Escaping, search normalization, measurement formatting, and CSV serialization |

The `/maps/` page shares the root station index loader and fallback list, normalized station records, theme controls, search normalization, HTML escaping, and browser preferences. Its selected station and light/dark theme are the same saved preferences used by the dashboard.

## Data behavior

- Current and recent CSV feeds are cached in memory for 10 minutes. Manual refresh clears the selected station's cache. Failed and empty responses are retried.
- Every 30 seconds the app checks for newer observations and shows a refresh cue without replacing the displayed data.
- Station changes and refreshes abort superseded feed requests and polls. Polling is skipped during a refresh; a new poll cancels any previous poll still in flight.
- Both feeds are merged by timestamp, preserving complementary measurements. If the current feed is unavailable, the latest recent observation supplies current conditions and the status indicates partial data.
- Short ranges show individual observations. The 7-day view averages groups of three within each hour; the 30-day view uses 2-hour averages. Wind direction uses a circular mean.
- The chart, table, and CSV use the same filtered/aggregated observations. Feed coverage may be shorter than the selected range. Missing measurements remain unavailable; no weather readings are generated.
- Theme, station, range, favorites, metric order, and visibility are stored locally. At least one metric remains visible. Malformed preferences fall back to defaults.
- Shared units use the same chart scale; wind direction uses a separate 0–360° scale.

## Controls

Search by station name, canton, or code. Use `Ctrl/Cmd+K` to focus search, `Tab` to move to the second suggestion (the first is preselected) and continue through the list, `Shift+Tab` to return to search, `ArrowDown` as an alternate way to reach suggestions, and `Escape` to close the menu. The first suggestion is highlighted and can be selected with `Enter`. Favorites and metrics support drag reordering; favorites also support `Alt+Left/Right`, and metric order has arrow buttons in the customization dialog. Select a metric to view its history, then select a chart point or table row to highlight the corresponding observation.

The station search also finds Swiss places through the swisstopo SearchServer after a short pause. It immediately shows the five nearest MeteoSwiss stations for each plausible place, with the place name, distance, and text-match score alongside each station. A high-confidence unique place is shown as a single group; ambiguous distant places are shown as separate groups. Results within 5 km are treated as the same place and represented by the shorter name. The 0–100 match score is a heuristic based on the query and result label/detail, not a probability or a score provided by swisstopo. Press Enter when no station name matches to switch to the nearest station for the best-ranked place. Place search uses the public swisstopo API and displays its attribution in the suggestions menu.
