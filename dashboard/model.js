import {
  stations,
  metricGroups as defaultGroups,
  RANGE_PRESETS,
} from "./config.js";
import { createStorage } from "./storage.js";
import {
  createWeatherClient,
  mergeObservations,
  metricTrendForField,
} from "./weather.js";

export function createDashboard({ fetch, storage, onChange = () => {} } = {}) {
  const preferences = createStorage(storage);
  const client = createWeatherClient(fetch);
  const savedRange = preferences.read("isobar-range", "24h");
  const savedStation = preferences.read("isobar-station", "BOU");
  const order = preferences.read("isobar-metric-order", []);
  const metricGroups = [...defaultGroups].sort((a, b) => {
    const rank = (id) =>
      order.includes(id)
        ? order.indexOf(id)
        : defaultGroups.length + order.length;
    return rank(a.id) - rank(b.id);
  });
  const hiddenGroups = new Set(
    preferences
      .read("isobar-hidden-metrics", [])
      .filter((id) => metricGroups.some((group) => group.id === id)),
  );
  if (hiddenGroups.size === metricGroups.length)
    hiddenGroups.delete(metricGroups[0].id);
  const state = {
    station:
      stations.find((station) => station.code === savedStation) || stations[0],
    stationOptions: [...stations],
    group: metricGroups.find((group) => !hiddenGroups.has(group.id)).id,
    range: Object.hasOwn(RANGE_PRESETS, savedRange) ? savedRange : "24h",
    favorites: preferences.read("isobar-favorites", []),
    hiddenGroups,
    history: [],
    current: null,
    latestObservation: null,
    acknowledgedObservation: null,
    newReadingAvailable: false,
    isRefreshing: false,
    feedStatus: "Connecting",
    chartPoint: -1,
    displayData: [],
    animateReadings: false,
    favoriteDrag: null,
    metricDrag: null,
  };
  let requestId = 0;

  async function loadStationData({
    acknowledge = false,
    forceRefresh = false,
  } = {}) {
    const id = ++requestId;
    const station = state.station;
    if (forceRefresh) client.clearStationFeedCache(station.code);
    Object.assign(state, {
      chartPoint: -1,
      current: null,
      history: [],
      latestObservation: null,
      newReadingAvailable: false,
      isRefreshing: true,
      feedStatus: "Connecting",
    });
    onChange();
    const results = await Promise.allSettled([
      client.fetchCSV(station, "now"),
      client.fetchCSV(station, "recent"),
    ]);
    if (id !== requestId) return;
    const [currentPoints, historyPoints] = results.map((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    state.history = mergeObservations(historyPoints, currentPoints);
    const latest = state.history.at(-1);
    if (latest) state.current = { ...latest.values, timestamp: latest.date };
    state.latestObservation = latest?.date || null;
    if (state.latestObservation) {
      if (acknowledge || !state.acknowledgedObservation)
        state.acknowledgedObservation = state.latestObservation;
      state.newReadingAvailable =
        state.latestObservation > state.acknowledgedObservation;
    }
    state.feedStatus =
      currentPoints.length && historyPoints.length
        ? "Live data"
        : latest
          ? "Partial data"
          : "No live data";
    state.isRefreshing = false;
    state.animateReadings = true;
    onChange();
  }

  function selectStation(code) {
    const station = state.stationOptions.find((item) => item.code === code);
    if (!station) return;
    state.station = station;
    state.acknowledgedObservation = null;
    preferences.save("isobar-station", code);
    return loadStationData();
  }

  async function loadStationList() {
    try {
      const options = await client.fetchStations();
      if (!options.length) return;
      state.stationOptions = options;
      const previousCode = state.station.code;
      const preferred = preferences.read("isobar-station", previousCode);
      state.station =
        options.find((station) => station.code === preferred) ||
        options.find((station) => station.code === previousCode) ||
        state.station;
      if (state.station.code !== previousCode) {
        state.acknowledgedObservation = null;
        await loadStationData();
      } else onChange();
    } catch {
      // The bundled station index is optional; the fallback remains available.
    }
  }

  async function checkForNewObservation() {
    const station = state.station;
    const id = requestId;
    try {
      const points = await client.fetchCSV(station, "now", {
        bypassCache: true,
      });
      if (
        id !== requestId ||
        state.isRefreshing ||
        station.code !== state.station.code
      )
        return;
      const latest = points.at(-1)?.date;
      if (
        !state.newReadingAvailable &&
        latest &&
        (!state.latestObservation || latest > state.latestObservation)
      ) {
        state.newReadingAvailable = true;
        onChange();
      }
    } catch {
      // A later poll or manual refresh retries the feed.
    }
  }

  return {
    state,
    metricGroups,
    preferences,
    loadStationData,
    loadStationList,
    selectStation,
    checkForNewObservation,
    metricTrendForField: (field) =>
      metricTrendForField(field, state.history, state.current),
  };
}
