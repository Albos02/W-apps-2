# W-Apps — Swiss weather

A static MeteoSwiss station dashboard built with native JavaScript modules, HTML, CSS, and SVG charts. No build step or runtime JavaScript dependencies are required. The bundled station index lives in `assets/coord_station_meteosuisse.json`; a small built-in index is available if that file cannot be loaded.

For example, from the repository root:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/dashboard/`.

## Development

Use Node.js 20 or later for the checks. From the repository root:

```sh
npm ci
npm test
npm run format:check
```

Run `npm run format` to format the dashboard. Tests use Node's built-in test runner and injected fetch/storage implementations, so they do not need a browser or a network connection.

## Structure

| File         | Responsibility                                                                          |
| ------------ | --------------------------------------------------------------------------------------- |
| `app.js`     | Browser startup, current conditions, station/metric controls, and event handling        |
| `model.js`   | Application state, preference restoration, station loading, and observation polling     |
| `weather.js` | CSV/date parsing, station normalization, feed caching, merging, aggregation, and trends |
| `chart.js`   | SVG chart, tooltip, linked readings table, and CSV download                             |
| `config.js`  | Metric definitions, API parameter aliases, ranges, and fallback stations                |
| `storage.js` | Validated preference reads and best-effort writes                                       |
| `format.js`  | Escaping, measurement formatting, compass labels, and CSV serialization                 |
| `style.css`  | Theme tokens, component styles, and consolidated responsive layouts                     |

## Data behavior

- Current and recent CSV feeds are cached in memory for 10 minutes. Manual refresh clears the selected station's cache. Failed and empty responses are retried.
- Every 30 seconds the app checks for newer observations and shows a refresh cue without replacing the displayed data.
- Both feeds are merged by timestamp, preserving complementary measurements. If the current feed is unavailable, the latest recent observation supplies current conditions and the status indicates partial data.
- Short ranges show individual observations. The 7-day view averages groups of three within each hour; the 30-day view uses 2-hour averages. Wind direction uses a circular mean.
- The chart, table, and CSV use the same filtered/aggregated observations. Feed coverage may be shorter than the selected range. Missing measurements remain unavailable; no weather readings are generated.
- Theme, station, range, favorites, metric order, and visibility are stored locally. At least one metric remains visible. Malformed preferences fall back to defaults.
- Shared units use the same chart scale; wind direction uses a separate 0–360° scale.

## Controls

Search by station name, canton, or code. Use `Ctrl/Cmd+K` to focus search, `ArrowDown` to reach station options, and `Escape` to close the menu. Favorites and metrics support drag reordering; favorites also support `Alt+Left/Right`, and metric order has arrow buttons in the customization dialog. Select a metric to view its history, then select a chart point or table row to highlight the corresponding observation.
