import test from "node:test";
import assert from "node:assert/strict";
import { FEED_CACHE_TTL, stations } from "./config.js";
import {
  parseCSV,
  parseDate,
  mergeObservations,
  filterHistoryForRange,
  aggregateSeries,
  summarizeSeries,
  createWeatherClient,
  normalizeStations,
} from "./weather.js";
import { observationsCSV } from "./format.js";

test("parses quoted CSV cells, decimal commas, zeroes, and byte-order marks", () => {
  const [point] = parseCSV(
    '\uFEFFstation_abbr;reference_timestamp;tre200s0;rre150z0;comment\nBOU;08.11.2026 10:00;"4,5";0;"quoted; field"',
  );
  assert.equal(point.values.temp, 4.5);
  assert.equal(point.values.rain, 0);
  assert.equal(point.date.toISOString(), "2026-11-08T10:00:00.000Z");
});

test("compact timestamps use UTC, preserve seconds, and reject invalid dates", () => {
  assert.equal(
    parseDate("20261108123456").toISOString(),
    "2026-11-08T12:34:56.000Z",
  );
  assert.equal(
    parseDate("202611081234").toISOString(),
    "2026-11-08T12:34:00.000Z",
  );
  for (const value of [
    "31.02.2026 10:00",
    "202613011000",
    "202611082500",
    "invalid",
  ]) {
    assert.equal(parseDate(value), null);
  }
});

test("merging feeds retains complementary fields at the same timestamp", () => {
  const date = parseDate("202611081000");
  const merged = mergeObservations(
    [{ date, values: { temp: 4, humidity: 80 } }],
    [{ date, values: { temp: 5, wind: 2 } }],
  );
  assert.deepEqual(merged, [
    { date, values: { temp: 5, humidity: 80, wind: 2 } },
  ]);
});

test("rolling ranges exclude invalid and future timestamps", () => {
  const now = Date.UTC(2026, 10, 8, 12);
  const data = [-4, -3, 0, 1].map((offset) => ({
    date: new Date(now + offset * 3600000),
    values: {},
  }));
  data.push({ date: new Date(NaN), values: {} });
  assert.equal(filterHistoryForRange(data, "3h", now).length, 2);
});

test("station normalization validates coordinates and deduplicates station codes", () => {
  const normalized = normalizeStations({
    features: [
      {
        properties: { code: "puy", name: "Pully" },
        geometry: { coordinates: [6.67, 46.51] },
      },
      {
        properties: { code: "PUY", name: "Pully" },
        geometry: { coordinates: [6.67, 46.51] },
      },
      { code: "BAD", lat: 100, lon: 7 },
      { code: "EMPTY" },
      null,
    ],
  });
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].elevation, 456);
  assert.equal(normalized[0].lat, 46.51);
});

test("feed cache expires after ten minutes and polling leaves it intact", async () => {
  let now = 0,
    requests = 0;
  const client = createWeatherClient(
    async () => {
      requests++;
      return {
        ok: true,
        text: async () => "reference_timestamp;tre200s0\n08.11.2026 10:00;4.5",
      };
    },
    () => now,
  );
  await client.fetchCSV(stations[0], "now");
  await client.fetchCSV(stations[0], "now");
  assert.equal(requests, 1);
  await client.fetchCSV(stations[0], "now", { bypassCache: true });
  await client.fetchCSV(stations[0], "now");
  assert.equal(requests, 2);
  now = FEED_CACHE_TTL;
  await client.fetchCSV(stations[0], "now");
  assert.equal(requests, 3);
  client.clearStationFeedCache(stations[0].code);
  await client.fetchCSV(stations[0], "now");
  assert.equal(requests, 4);
});

test("empty and failed feed responses are retried instead of cached", async () => {
  let requests = 0;
  const client = createWeatherClient(async () => {
    requests++;
    return requests === 1
      ? { ok: false, status: 503 }
      : { ok: true, text: async () => "" };
  });
  await assert.rejects(client.fetchCSV(stations[0], "now"), /503/);
  await client.fetchCSV(stations[0], "now");
  await client.fetchCSV(stations[0], "now");
  assert.equal(requests, 3);
});

test("a response started before manual refresh cannot repopulate the cleared cache", async () => {
  const pending = [];
  const client = createWeatherClient(
    () => new Promise((resolve) => pending.push(resolve)),
  );
  const station = stations[0];
  const response = (temperature) => ({
    ok: true,
    text: async () =>
      `reference_timestamp;tre200s0\n08.11.2026 10:00;${temperature}`,
  });
  const oldRequest = client.fetchCSV(station, "now");
  client.clearStationFeedCache(station.code);
  const refreshedRequest = client.fetchCSV(station, "now");
  pending[1](response(8));
  await refreshedRequest;
  pending[0](response(4));
  await oldRequest;
  assert.equal((await client.fetchCSV(station, "now"))[0].values.temp, 8);
  assert.equal(pending.length, 2);
});

test("CSV export preserves zeroes and escapes labels", () => {
  const result = observationsCSV(
    [{ date: parseDate("202611081000"), values: { rain: 0 } }],
    [
      { key: "rain", label: 'Rain "total"' },
      { key: "wind", label: "Wind" },
    ],
  );
  assert.equal(
    result,
    '"timestamp","source","Rain ""total""","Wind"\n"2026-11-08T10:00:00.000Z","MeteoSwiss","0",""',
  );
});

test("rain sums raw observations instead of differencing visible values", () => {
  const field = { key: "rain", unit: " mm", change: "sum" };
  const raw = [2, 0, 0].map((rain) => ({ values: { rain } }));
  assert.equal(summarizeSeries(field, raw, raw), 2);
});

test("wind direction changes across north use the shorter turn", () => {
  const field = { key: "direction", unit: "°", change: "circular" };
  const displayed = [
    { values: { direction: 350 } },
    { values: { direction: 10 } },
  ];
  assert.equal(summarizeSeries(field, displayed, displayed), 20);
});

test("aggregated totals come from raw observations, not bucket averages", () => {
  const field = { key: "rain", unit: " mm", change: "sum" };
  const group = { fields: [field] };
  const start = parseDate("202611081000").getTime();
  const raw = [1, 3, 0, 4].map((rain, index) => ({
    date: new Date(start + index * 3600000),
    values: { rain },
  }));
  const displayed = aggregateSeries(raw, group, "twoHours");
  assert.deepEqual(
    displayed.map((point) => point.values.rain),
    [2, 2],
  );
  assert.equal(summarizeSeries(field, displayed, raw), 8);
});

test("series without usable endpoints have no summary", () => {
  const point = (values) => ({ values });
  assert.equal(
    summarizeSeries({ key: "temp" }, [point({}), point({ temp: 3 })], []),
    null,
  );
  assert.equal(
    summarizeSeries(
      { key: "direction", change: "circular" },
      [point({ direction: 10 }), point({})],
      [],
    ),
    null,
  );
  assert.equal(
    summarizeSeries({ key: "rain", change: "sum" }, [point({})], [point({})]),
    null,
  );
});

test("aborted responses cannot populate the feed cache", async () => {
  const controller = new AbortController();
  let requests = 0;
  const client = createWeatherClient(async (_url, { signal }) => {
    requests++;
    return {
      ok: true,
      text: async () => {
        if (requests === 1) {
          assert.equal(signal, controller.signal);
          controller.abort();
        }
        return "reference_timestamp;tre200s0\n08.11.2026 10:00;4.5";
      },
    };
  });
  await assert.rejects(
    client.fetchCSV(stations[0], "now", { signal: controller.signal }),
    { name: "AbortError" },
  );
  await client.fetchCSV(stations[0], "now");
  assert.equal(requests, 2);
});
