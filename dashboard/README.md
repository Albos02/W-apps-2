# W-Apps — Swiss weather

A static MeteoSwiss station dashboard. It uses a bundled copy of the station list from the sibling `W-apps/assets` directory and falls back to a small built-in station list if the JSON cannot be loaded. Serve this repository over HTTP to load the station list and request MeteoSwiss CSV data.

For example, from the repository root:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/dashboard/`.

The app keeps successful current and recent CSV responses in memory for 10 minutes; manual refresh bypasses that cache. It checks for a newer observation every 30 seconds but does not automatically reload the dashboard data. The 7-day view averages groups of three observations (two displayed averages per hour when readings arrive every 10 minutes); the 30-day view averages observations in 2-hour blocks. Shorter ranges show every observation. Theme, favorite stations, and metric-card order are stored in local storage. When a live feed is unavailable or a measurement is missing, the dashboard leaves that value unavailable instead of substituting generated weather observations. The chart, table, and CSV show observations from the current and recent feeds, which may cover less than the selected time range. Exported rows include their source.
