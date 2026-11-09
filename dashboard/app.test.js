import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDashboard } from "./model.js";
import { stations } from "../config.js";
import {
  parseCSV,
  parseDate,
  aggregateSeries,
  filterHistoryForRange,
} from "../weather.js";

function app(fetch, stored = {}) {
  return createDashboard({
    fetch:
      fetch ||
      (() => {
        throw new Error("Unexpected network request");
      }),
    storage: {
      getItem: (key) =>
        Object.hasOwn(stored, key) ? JSON.stringify(stored[key]) : null,
      setItem: (key, value) => {
        stored[key] = JSON.parse(value);
      },
    },
  });
}

const header =
  "station_abbr;reference_timestamp;tre200s0;ure200s0;fu3010z0;fu3010z1;pp0qnhs0;pp0qffs0";
const csv = (station, temperature) =>
  `${header}\n${station};07.11.2026 23:50;${temperature};;2.5;4.3;1023.6;1025.2`;
const csvAt = (station, timestamp, temperature) =>
  `${header}\n${station};${timestamp};${temperature};;2.5;4.3;1023.6;1025.2`;

test("parses MeteoSwiss measurements, UTC timestamps and missing fields", () => {
  const [point] = parseCSV(csv("BER", 4.5));
  assert.equal(point.date.toISOString(), "2026-11-07T23:50:00.000Z");
  assert.equal(point.values.temp, 4.5);
  assert.equal(point.values.wind, 2.5);
  assert.equal(point.values.gust, 4.3);
  assert.equal(point.values.pressure, 1023.6);
  assert.equal(point.values.pressureQFF, 1025.2);
  assert.equal(point.values.humidity, undefined);
  assert.equal(parseCSV(`${header}\nBER;invalid;4.5;;;;;`).length, 0);
});

test("uses Bouveret only on the first visit and restores a selected station", () => {
  const stored = {};
  const firstVisit = app(undefined, stored);
  assert.equal(firstVisit.state.station.code, "BOU");
  assert.equal(stored["isobar-visited"], true);

  const returningWithoutSelection = app(undefined, stored);
  assert.equal(returningWithoutSelection.state.station, null);
  assert.equal(returningWithoutSelection.state.feedStatus, "Select a station");

  stored["isobar-station"] = "PUY";
  const returningVisit = app(undefined, stored);
  assert.equal(returningVisit.state.station.code, "PUY");
});

test("selects the most recent station ahead of the saved station on startup", () => {
  const { state } = app(undefined, {
    "isobar-visited": true,
    "isobar-station": "BER",
    "isobar-recent-stations": ["PUY", "BER"],
  });

  assert.equal(state.station.code, "PUY");
});

test("ignores stale station responses and uses the official endpoint", async () => {
  const pending = [];
  const fetch = (url) =>
    new Promise((resolve) => pending.push({ url, resolve }));
  const { state, loadStationData } = app(fetch);
  const oldRequest = loadStationData();
  state.station = stations.find((station) => station.code === "BER");
  const newRequest = loadStationData();
  assert.match(
    pending[2].url,
    /ch\.meteoschweiz\.ogd-smn\/ber\/ogd-smn_ber_t_now\.csv$/,
  );
  for (const request of pending.slice(2))
    request.resolve({ ok: true, text: async () => csv("BER", 4.5) });
  await newRequest;
  for (const request of pending.slice(0, 2))
    request.resolve({ ok: true, text: async () => csv("PUY", 18) });
  await oldRequest;
  assert.equal(state.station.code, "BER");
  assert.equal(state.current.temp, 4.5);
  assert.equal(state.current.humidity, undefined);
  assert.equal(state.feedStatus, "Live data");
});

test("parses the station list format and skips entries without coordinates", async () => {
  let requestedUrl;
  const { loadStationList, state } = app(async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => [
        ["PUY", "46.512308", "6.667494", "Pully", "VD", 116],
        ["MRP", null, null, null, null, 96],
      ],
    };
  });

  await loadStationList();

  const stationOptions = state.stationOptions;
  assert.equal(requestedUrl, "../assets/coord_station_meteosuisse.json");
  assert.equal(stationOptions.length, 1);
  assert.equal(stationOptions[0].code, "PUY");
  assert.equal(stationOptions[0].lat, 46.512308);
  assert.equal(stationOptions[0].elevation, 456);
});

test("persists and restores a station outside the bundled fallback list", async () => {
  const stored = { "isobar-visited": true };
  const fetch = async (url) =>
    url === "../assets/coord_station_meteosuisse.json"
      ? {
          ok: true,
          json: async () => [["MRP", "46.4", "6.8", "My Station", "VS"]],
        }
      : { ok: true, text: async () => csv("MRP", 7.5) };
  const firstLoad = app(fetch, stored);
  await firstLoad.loadStationList();
  await firstLoad.selectStation("MRP");
  assert.equal(stored["isobar-station"], "MRP");

  const returningLoad = app(fetch, stored);
  assert.equal(returningLoad.state.station, null);
  await returningLoad.loadStationList();
  assert.equal(returningLoad.state.station.code, "MRP");
  assert.equal(returningLoad.state.current.temp, 7.5);
});

test("selects a recent station once it appears in the loaded station list", async () => {
  const stored = {
    "isobar-visited": true,
    "isobar-station": "BER",
    "isobar-recent-stations": ["MRP"],
  };
  const fetch = async (url) =>
    url === "../assets/coord_station_meteosuisse.json"
      ? {
          ok: true,
          json: async () => [["MRP", "46.4", "6.8", "My Station", "VS"]],
        }
      : { ok: true, text: async () => csv("MRP", 7.5) };
  const dashboard = app(fetch, stored);

  assert.equal(dashboard.state.station.code, "BER");
  await dashboard.loadStationList();

  assert.equal(dashboard.state.station.code, "MRP");
  assert.equal(dashboard.state.current.temp, 7.5);
});

test("bundled station asset includes the complete shared station list", () => {
  const rows = JSON.parse(
    fs.readFileSync(
      new URL("../assets/coord_station_meteosuisse.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(rows.length, 158);
  assert.equal(new Set(rows.map((row) => row[0])).size, rows.length);
  assert.ok(rows.some((row) => row[0] === "PUY"));
  assert.ok(rows.some((row) => row[0] === "PFA"));
});

test("merges both feeds and keeps the rolling 24 hours across midnight", async () => {
  const requested = [];
  const { loadStationData, state } = app(async (url) => {
    requested.push(url);
    const text = url.endsWith("_t_now.csv")
      ? csvAt("PUY", "02.01.2026 00:10", 4.5)
      : `${header}\nPUY;01.01.2026 00:30;3.5;;2.5;4.3;1023.6;1025.2\nPUY;31.12.2025 23:50;2.5;;2.5;4.3;1023.6;1025.2`;
    return { ok: true, text: async () => text };
  });

  await loadStationData();

  assert.equal(requested.length, 2);
  assert.ok(requested.some((url) => url.endsWith("_t_now.csv")));
  assert.ok(requested.some((url) => url.endsWith("_t_recent.csv")));
  assert.equal(state.history.length, 3);
  const rollingDay = filterHistoryForRange(
    state.history,
    "24h",
    Date.UTC(2026, 0, 2, 0, 15),
  );
  assert.deepEqual(
    Array.from(rollingDay, (point) => point.date.toISOString()),
    ["2026-01-01T00:30:00.000Z", "2026-01-02T00:10:00.000Z"],
  );
});

test("uses the current feed alone for ranges up to 12 hours", async () => {
  const requested = [];
  const { loadStationData, state } = app(
    async (url) => {
      requested.push(url);
      return {
        ok: true,
        text: async () => csvAt("PUY", "02.01.2026 00:10", 4.5),
      };
    },
    { "isobar-range": "12h" },
  );

  await loadStationData();

  assert.equal(requested.length, 1);
  assert.ok(requested[0].endsWith("_t_now.csv"));
  assert.equal(state.feedStatus, "Live data");
});

test("averages 7-day observations in threes and 30-day observations in 2-hour blocks", () => {
  const group = { fields: [{ key: "temp" }, { key: "direction" }] };
  const data = Array.from({ length: 24 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, 1, 0, index * 10)),
    values: {
      temp: index + 1,
      direction: index === 0 ? 350 : index === 1 ? 10 : index === 2 ? 0 : 90,
    },
  }));

  const triads = aggregateSeries(data, group, "triads");
  assert.equal(triads.length, 8);
  assert.equal(triads[0].values.temp, 2);
  assert.ok(triads[0].values.direction < 1 || triads[0].values.direction > 359);

  const twoHourly = aggregateSeries(data, group, "twoHours");
  assert.equal(twoHourly.length, 2);
  assert.equal(twoHourly[0].values.temp, 6.5);
  assert.equal(twoHourly[1].values.temp, 18.5);
});

test("calculates wind direction trends across north using the shorter turn", () => {
  const { metricTrendForField, state } = app();
  const baseline = parseDate("202611081000");
  state.history = [{ date: baseline, values: { direction: 350 } }];
  state.current = { timestamp: parseDate("202611081100"), direction: 10 };

  assert.equal(
    metricTrendForField({ key: "direction", unit: "°" }).text,
    "↻ +20° · 1h",
  );
});

test("flags a newer observation and clears the cue when refreshed", async () => {
  let fetchCount = 0;
  const fetch = async () => {
    fetchCount++;
    const timestamp = fetchCount <= 2 ? "07.11.2026 23:50" : "08.11.2026 00:00";
    return { ok: true, text: async () => csvAt("PUY", timestamp, 4.5) };
  };
  const { state, loadStationData } = app(fetch);

  await loadStationData();
  assert.equal(state.newReadingAvailable, false);
  assert.equal(
    state.latestObservation.toISOString(),
    "2026-11-07T23:50:00.000Z",
  );

  // A normal reload uses the in-memory feed cache until it expires.
  await loadStationData();
  assert.equal(fetchCount, 2);
  assert.equal(state.newReadingAvailable, false);

  await loadStationData({ forceRefresh: true });
  assert.equal(state.newReadingAvailable, true);
  assert.equal(
    state.latestObservation.toISOString(),
    "2026-11-08T00:00:00.000Z",
  );

  await loadStationData({ acknowledge: true, forceRefresh: true });
  assert.equal(state.newReadingAvailable, false);
  assert.equal(
    state.acknowledgedObservation.toISOString(),
    "2026-11-08T00:00:00.000Z",
  );
});

test("recovers current conditions from history when the current feed fails", async () => {
  const { state, loadStationData } = app(async (url) => {
    if (url.endsWith("_t_now.csv")) throw new Error("Unavailable");
    return { ok: true, text: async () => csv("BOU", 4.5) };
  });
  await loadStationData();
  assert.equal(state.feedStatus, "Partial data");
  assert.equal(state.current.temp, 4.5);
  assert.equal(state.history.length, 1);
  assert.equal(state.isRefreshing, false);
});

test("reports unavailable feeds without fabricating observations", async () => {
  const { state, loadStationData } = app(async () => {
    throw new Error("Offline");
  });
  await loadStationData();
  assert.equal(state.feedStatus, "No live data");
  assert.equal(state.current, null);
  assert.equal(state.history.length, 0);
  assert.equal(state.isRefreshing, false);
});

test("invalid saved preferences fall back to usable defaults", () => {
  const { state } = app(undefined, {
    "isobar-favorites": {},
    "isobar-hidden-metrics": 42,
    "isobar-metric-order": "temperature",
    "isobar-range": "constructor",
  });
  assert.deepEqual(state.favorites, []);
  assert.equal(state.hiddenGroups.size, 0);
  assert.equal(state.range, "24h");
  assert.equal(state.group, "temperature");
});

test("keeps one metric visible and ignores duplicate saved IDs", () => {
  const { metricGroups } = app();
  const ids = metricGroups.map((group) => group.id);
  const { state } = app(undefined, {
    "isobar-hidden-metrics": [...ids, ...ids],
  });
  assert.equal(state.hiddenGroups.size, ids.length - 1);
  assert.equal(state.hiddenGroups.has(state.group), false);
});

test("polls for new readings without replacing displayed observations", async () => {
  let newer = false;
  const { state, loadStationData, checkForNewObservation } = app(async () => ({
    ok: true,
    text: async () =>
      csvAt(
        "BOU",
        newer ? "08.11.2026 00:00" : "07.11.2026 23:50",
        newer ? 8 : 4,
      ),
  }));
  await loadStationData();
  newer = true;
  await checkForNewObservation();
  assert.equal(state.newReadingAvailable, true);
  assert.equal(state.current.temp, 4);
  assert.equal(
    state.latestObservation.toISOString(),
    "2026-11-07T23:50:00.000Z",
  );
});

test("changing stations resets the acknowledged observation", async () => {
  const { state, loadStationData, selectStation } = app(async () => ({
    ok: true,
    text: async () => csv("BER", 4.5),
  }));
  await loadStationData();
  state.acknowledgedObservation = new Date("2020-01-01T00:00:00Z");
  await selectStation("BER");
  assert.equal(state.station.code, "BER");
  assert.equal(state.newReadingAvailable, false);
  assert.equal(
    state.acknowledgedObservation.getTime(),
    state.latestObservation.getTime(),
  );
});

test("ignores a poll completed after switching stations", async () => {
  let polling = false,
    resolvePoll;
  const { state, loadStationData, selectStation, checkForNewObservation } = app(
    (url) => {
      if (polling && url.includes("/bou/"))
        return new Promise((resolve) => {
          resolvePoll = resolve;
        });
      return Promise.resolve({ ok: true, text: async () => csv("BER", 4.5) });
    },
  );
  await loadStationData();
  polling = true;
  const poll = checkForNewObservation();
  await selectStation("BER");
  resolvePoll({
    ok: true,
    text: async () => csvAt("BOU", "08.11.2026 00:00", 9),
  });
  await poll;
  assert.equal(state.station.code, "BER");
  assert.equal(state.newReadingAvailable, false);
});

test("aborts superseded station requests and polls", async () => {
  const pending = [];
  const dashboard = app(
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        pending.push({ url, signal, resolve });
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const first = dashboard.loadStationData();
  const second = dashboard.selectStation("BER");
  assert.ok(pending.slice(0, 2).every(({ signal }) => signal.aborted));
  for (const request of pending.slice(2))
    request.resolve({ ok: true, text: async () => csv("BER", 4.5) });
  await Promise.all([first, second]);
  assert.equal(dashboard.state.feedStatus, "Live data");

  const poll = dashboard.checkForNewObservation();
  const newerPoll = dashboard.checkForNewObservation();
  assert.equal(pending[4].signal.aborted, true);
  const refresh = dashboard.loadStationData({ forceRefresh: true });
  assert.equal(pending[5].signal.aborted, true);
  // Polling during a refresh must not start another background request.
  await dashboard.checkForNewObservation();
  assert.equal(pending.length, 8);
  for (const request of pending.slice(6))
    request.resolve({ ok: true, text: async () => csv("BER", 8) });
  await Promise.all([poll, newerPoll, refresh]);
  assert.equal(dashboard.state.current.temp, 8);
  assert.equal(dashboard.state.isRefreshing, false);
});

test("geocoding cancels stale requests and station selection clears nearby places", async () => {
  const pending = [];
  const dashboard = app((url, { signal } = {}) => {
    if (url.includes("SearchServer"))
      return new Promise((resolve, reject) => {
        pending.push({ signal, resolve });
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    return Promise.resolve({ ok: true, text: async () => "" });
  });
  dashboard.loadStationData = async () => {};
  const staleSearch = dashboard.searchPlace("First place");
  const currentSearch = dashboard.searchPlace("Second place");
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve({
    ok: true,
    json: async () => ({
      results: [
        {
          attrs: {
            label: "Second place",
            detail: "ZH",
            lat: 47.45,
            lon: 8.56,
          },
        },
      ],
    }),
  });
  await Promise.all([staleSearch, currentSearch]);
  assert.equal(dashboard.state.placeOptions[0].label, "Second place");
  assert.equal(dashboard.state.selectedPlace.label, "Second place");
  assert.ok(dashboard.state.nearbyStations.length);
  assert.equal(dashboard.state.nearbyPlaces.length, 1);
  dashboard.selectPlace(0);
  assert.ok(dashboard.state.nearbyStations.length);
  await dashboard.selectStation("BER");
  assert.equal(dashboard.state.selectedPlace, null);
  assert.deepEqual(dashboard.state.placeOptions, []);
  assert.deepEqual(dashboard.state.nearbyStations, []);
  assert.deepEqual(dashboard.state.nearbyPlaces, []);
});

test("groups nearby duplicate place results and offers far-apart ambiguities", async () => {
  const dashboard = app(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          attrs: {
            label: "Buchs (SG)",
            detail: "Buchs SG",
            lat: 47.1667,
            lon: 9.4667,
          },
        },
        {
          attrs: {
            label: "Populated Place Buchs (SG) - Buchs",
            detail: "Buchs SG",
            lat: 47.167,
            lon: 9.467,
          },
        },
        {
          attrs: {
            label: "Buchs (AG)",
            detail: "Buchs AG",
            lat: 47.3933,
            lon: 8.1858,
          },
        },
      ],
    }),
  }));

  await dashboard.searchPlace("Buchs");

  assert.deepEqual(
    dashboard.state.placeOptions.map((place) => place.label),
    ["Buchs (SG)", "Buchs (AG)"],
  );
  assert.equal(dashboard.state.nearbyPlaces.length, 2);
  assert.ok(
    dashboard.state.nearbyPlaces.every(({ stations }) => stations.length),
  );
  assert.equal(dashboard.state.selectedPlace, null);
  assert.deepEqual(dashboard.state.nearbyStations, []);
});
