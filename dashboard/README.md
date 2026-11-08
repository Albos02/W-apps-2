# Isobar — Swiss weather

A static MeteoSwiss station dashboard. Open `index.html` directly for the built-in station list and sample observations, or serve this folder over HTTP to enable the optional station-list JSON and MeteoSwiss CSV requests.

For example, from the repository root:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/weather/`.

The app stores theme, favorite stations, and metric-card order in local storage. If a feed cannot be reached, it uses labeled sample data for that part of the dashboard. Missing live measurements are shown as unavailable rather than filled with sample values. The chart, table, and CSV show the available observations from the current and recent feeds, which may cover less than the selected time range. Values may be aggregated for display; exported rows include their source.
