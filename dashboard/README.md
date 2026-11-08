# W-Apps — Swiss weather

A static MeteoSwiss station dashboard. Open `index.html` directly for the built-in station list, or serve this folder over HTTP to enable the optional station-list JSON and MeteoSwiss CSV requests.

For example, from the repository root:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/weather/`.

The app stores theme, favorite stations, and metric-card order in local storage. When a live feed is unavailable or a measurement is missing, the dashboard leaves that value unavailable instead of substituting generated weather observations. The chart, table, and CSV show observations from the current and recent feeds, which may cover less than the selected time range. Values may be aggregated for display; exported rows include their source.
