import {
  stations,
  metricGroups as defaultGroups,
  RANGE_PRESETS,
} from "../config.js";
import { createStorage } from "../storage.js";
import { createGeocodeClient } from "./geocode.js";
import {
  createWeatherClient,
  distanceKm,
  mergeObservations,
  metricTrendForField,
  nearestStations,
} from "../weather.js";

const PLACE_CLUSTER_DISTANCE_KM = 5;
const CONFIDENT_PLACE_SCORE = 90;
const CONFIDENCE_MARGIN = 15;

function distinctPlaceCandidates(places) {
  const clusters = [];
  for (const place of places) {
    const cluster = clusters.find((items) =>
      items.some(
        (candidate) =>
          distanceKm(candidate, place) <= PLACE_CLUSTER_DISTANCE_KM,
      ),
    );
    if (cluster) cluster.push(place);
    else clusters.push([place]);
  }

  return clusters
    .map((items) => {
      const representative = [...items].sort(
        (a, b) =>
          Array.from(a.label).length - Array.from(b.label).length ||
          b.confidence - a.confidence,
      )[0];
      return {
        ...representative,
        confidence: Math.max(...items.map((item) => item.confidence)),
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

export function createDashboard({ fetch, storage, onChange = () => {} } = {}) {
  const preferences = createStorage(storage);
  const client = createWeatherClient(fetch);
  const geocodeClient = createGeocodeClient(fetch);
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
    placeOptions: [],
    selectedPlace: null,
    nearbyStations: [],
    nearbyPlaces: [],
    geocodeStatus: "idle",
    geocodeQuery: "",
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
  let stationController;
  let pollController;
  let geocodeController;
  let geocodeRequestId = 0;
  let geocodePromise;

  function cancelPlaceSearch() {
    geocodeRequestId++;
    geocodeController?.abort();
    geocodeController = null;
    geocodePromise = null;
    if (state.geocodeStatus === "loading") state.geocodeStatus = "idle";
  }

  function clearPlaceSearch() {
    cancelPlaceSearch();
    Object.assign(state, {
      placeOptions: [],
      selectedPlace: null,
      nearbyStations: [],
      nearbyPlaces: [],
      geocodeStatus: "idle",
      geocodeQuery: "",
    });
    onChange();
  }

  function updateNearbyPlaces() {
    state.nearbyPlaces = state.placeOptions
      .map((place) => ({
        place,
        stations: nearestStations(state.stationOptions, place, 5),
      }))
      .filter(({ stations: nearby }) => nearby.length);
    state.nearbyStations = state.selectedPlace
      ? nearestStations(state.stationOptions, state.selectedPlace, 5)
      : [];
  }

  async function searchPlace(query) {
    const text = String(query || "").trim();
    if (
      text &&
      text === state.geocodeQuery &&
      state.geocodeStatus === "loading" &&
      geocodePromise
    )
      return geocodePromise;
    cancelPlaceSearch();
    Object.assign(state, {
      placeOptions: [],
      selectedPlace: null,
      nearbyStations: [],
      nearbyPlaces: [],
      geocodeQuery: text,
      geocodeStatus: text ? "loading" : "idle",
    });
    const id = geocodeRequestId;
    if (!text) {
      onChange();
      return [];
    }
    const controller = new AbortController();
    geocodeController = controller;
    onChange();
    geocodePromise = (async () => {
      try {
        const results = await geocodeClient.searchPlaces(text, {
          signal: controller.signal,
        });
        if (id !== geocodeRequestId) return [];
        const places = distinctPlaceCandidates(results);
        const best = places[0];
        const isConfident =
          best?.confidence >= CONFIDENT_PLACE_SCORE &&
          (!places[1] ||
            best.confidence - places[1].confidence >= CONFIDENCE_MARGIN);
        state.placeOptions = isConfident ? [best] : places;
        state.selectedPlace = isConfident ? best : null;
        updateNearbyPlaces();
        state.geocodeStatus = results.length ? "idle" : "error";
        onChange();
        return places;
      } catch {
        if (id !== geocodeRequestId) return [];
        state.geocodeStatus = "error";
        onChange();
        return [];
      } finally {
        if (id === geocodeRequestId) {
          geocodeController = null;
          geocodePromise = null;
        }
      }
    })();
    return geocodePromise;
  }

  function selectPlace(place) {
    const candidate =
      typeof place === "number" ? state.placeOptions[place] : place;
    if (!candidate || !state.placeOptions.includes(candidate)) return false;
    state.selectedPlace = candidate;
    state.nearbyStations = nearestStations(state.stationOptions, candidate, 5);
    state.geocodeStatus = "idle";
    onChange();
    return true;
  }

  async function loadStationData({
    acknowledge = false,
    forceRefresh = false,
  } = {}) {
    const id = ++requestId;
    stationController?.abort();
    pollController?.abort();
    const controller = new AbortController();
    stationController = controller;
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
      client.fetchCSV(station, "now", { signal: controller.signal }),
      client.fetchCSV(station, "recent", { signal: controller.signal }),
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
    clearPlaceSearch();
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
      updateNearbyPlaces();
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
    if (state.isRefreshing) return;
    pollController?.abort();
    const controller = new AbortController();
    pollController = controller;
    const station = state.station;
    const id = requestId;
    try {
      const points = await client.fetchCSV(station, "now", {
        bypassCache: true,
        signal: controller.signal,
      });
      if (
        controller.signal.aborted ||
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
    searchPlace,
    selectPlace,
    cancelPlaceSearch,
    clearPlaceSearch,
    checkForNewObservation,
    metricTrendForField: (field) =>
      metricTrendForField(field, state.history, state.current),
  };
}
