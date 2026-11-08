const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function app(fetch) {
  const status = { textContent: '', parentElement: { classList: { add() {}, remove() {} } } };
  const context = { fetch, document: { getElementById: () => status }, localStorage: { getItem: () => null }, console };
  const source = fs.readFileSync(`${__dirname}/app.js`, 'utf8').replace('  init();', `
    renderCurrent = () => {};
    renderChart = () => {};
    renderStationMenu = () => {};
    renderFavoriteStations = () => {};
    globalThis.testApp = { parseCSV, parseDate, loadStationData, loadStationList, aggregateSeries, filterHistoryForRange, metricTrendForField, state, stations, getStationOptions: () => stationOptions };
  `);
  vm.runInNewContext(source, context);
  return { ...context.testApp, status };
}

const header = 'station_abbr;reference_timestamp;tre200s0;ure200s0;fu3010z0;fu3010z1;pp0qnhs0;pp0qffs0';
const csv = (station, temperature) => `${header}\n${station};07.11.2026 23:50;${temperature};;2.5;4.3;1023.6;1025.2`;
const csvAt = (station, timestamp, temperature) => `${header}\n${station};${timestamp};${temperature};;2.5;4.3;1023.6;1025.2`;

test('parses MeteoSwiss measurements, UTC timestamps and missing fields', () => {
  const { parseCSV } = app();
  const [point] = parseCSV(csv('BER', 4.5));
  assert.equal(point.date.toISOString(), '2026-11-07T23:50:00.000Z');
  assert.equal(point.values.temp, 4.5);
  assert.equal(point.values.wind, 2.5);
  assert.equal(point.values.gust, 4.3);
  assert.equal(point.values.pressure, 1023.6);
  assert.equal(point.values.pressureQFF, 1025.2);
  assert.equal(point.values.humidity, undefined);
  assert.equal(parseCSV(`${header}\nBER;invalid;4.5;;;;;`).length, 0);
});

test('ignores stale station responses and uses the official endpoint', async () => {
  const pending = [];
  const fetch = (url) => new Promise((resolve) => pending.push({ url, resolve }));
  const { state, stations, loadStationData, status } = app(fetch);
  const oldRequest = loadStationData();
  state.station = stations.find((station) => station.code === 'BER');
  const newRequest = loadStationData();
  assert.match(pending[2].url, /ch\.meteoschweiz\.ogd-smn\/ber\/ogd-smn_ber_t_now\.csv$/);
  for (const request of pending.slice(2)) request.resolve({ ok: true, text: async () => csv('BER', 4.5) });
  await newRequest;
  for (const request of pending.slice(0, 2)) request.resolve({ ok: true, text: async () => csv('PUY', 18) });
  await oldRequest;
  assert.equal(state.station.code, 'BER');
  assert.equal(state.current.temp, 4.5);
  assert.equal(state.current.humidity, undefined);
  assert.equal(status.textContent, 'Live data');
});

test('parses the station list format and skips entries without coordinates', async () => {
  let requestedUrl;
  const { loadStationList, getStationOptions } = app(async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => [
        ['PUY', '46.512308', '6.667494', 'Pully', 'VD', 116],
        ['MRP', null, null, null, null, 96]
      ]
    };
  });

  await loadStationList();

  const stationOptions = getStationOptions();
  assert.equal(requestedUrl, '../assets/coord_station_meteosuisse.json');
  assert.equal(stationOptions.length, 1);
  assert.equal(stationOptions[0].code, 'PUY');
  assert.equal(stationOptions[0].lat, 46.512308);
  assert.equal(stationOptions[0].elevation, 456);
});

test('bundled station asset includes the complete shared station list', () => {
  const rows = JSON.parse(fs.readFileSync(`${__dirname}/../assets/coord_station_meteosuisse.json`, 'utf8'));
  assert.equal(rows.length, 158);
  assert.equal(new Set(rows.map((row) => row[0])).size, rows.length);
  assert.ok(rows.some((row) => row[0] === 'PUY'));
  assert.ok(rows.some((row) => row[0] === 'PFA'));
});

test('merges both feeds and keeps the rolling 24 hours across midnight', async () => {
  const requested = [];
  const { loadStationData, filterHistoryForRange, state } = app(async (url) => {
    requested.push(url);
    const text = url.endsWith('_t_now.csv')
      ? csvAt('PUY', '02.01.2026 00:10', 4.5)
      : `${header}\nPUY;01.01.2026 00:30;3.5;;2.5;4.3;1023.6;1025.2\nPUY;31.12.2025 23:50;2.5;;2.5;4.3;1023.6;1025.2`;
    return { ok: true, text: async () => text };
  });

  await loadStationData();

  assert.equal(requested.length, 2);
  assert.ok(requested.some((url) => url.endsWith('_t_now.csv')));
  assert.ok(requested.some((url) => url.endsWith('_t_recent.csv')));
  assert.equal(state.history.length, 3);
  const rollingDay = filterHistoryForRange(state.history, '24h', Date.UTC(2026, 0, 2, 0, 15));
  assert.deepEqual(Array.from(rollingDay, (point) => point.date.toISOString()), [
    '2026-01-01T00:30:00.000Z',
    '2026-01-02T00:10:00.000Z'
  ]);
});

test('averages 7-day observations in threes and 30-day observations in 2-hour blocks', () => {
  const { aggregateSeries } = app();
  const group = { fields: [{ key: 'temp' }, { key: 'direction' }] };
  const data = Array.from({ length: 24 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, 1, 0, index * 10)),
    values: { temp: index + 1, direction: index === 0 ? 350 : index === 1 ? 10 : index === 2 ? 0 : 90 }
  }));

  const triads = aggregateSeries(data, group, 'triads');
  assert.equal(triads.length, 8);
  assert.equal(triads[0].values.temp, 2);
  assert.ok(triads[0].values.direction < 1 || triads[0].values.direction > 359);

  const twoHourly = aggregateSeries(data, group, 'twoHours');
  assert.equal(twoHourly.length, 2);
  assert.equal(twoHourly[0].values.temp, 6.5);
  assert.equal(twoHourly[1].values.temp, 18.5);
});

test('calculates wind direction trends across north using the shorter turn', () => {
  const { metricTrendForField, parseDate, state } = app();
  const baseline = parseDate('202611081000');
  state.history = [{ date: baseline, values: { direction: 350 } }];
  state.current = { timestamp: parseDate('202611081100'), direction: 10 };

  assert.equal(metricTrendForField({ key: 'direction', unit: '°' }).text, '↻ +20° · 1h');
});

test('flags a newer observation and clears the cue when refreshed', async () => {
  let fetchCount = 0;
  const fetch = async () => {
    fetchCount++;
    const timestamp = fetchCount <= 2 ? '07.11.2026 23:50' : '08.11.2026 00:00';
    return { ok: true, text: async () => csvAt('PUY', timestamp, 4.5) };
  };
  const { state, loadStationData } = app(fetch);

  await loadStationData();
  assert.equal(state.newReadingAvailable, false);
  assert.equal(state.latestObservation.toISOString(), '2026-11-07T23:50:00.000Z');

  // A normal reload uses the in-memory feed cache until it expires.
  await loadStationData();
  assert.equal(fetchCount, 2);
  assert.equal(state.newReadingAvailable, false);

  await loadStationData({ forceRefresh: true });
  assert.equal(state.newReadingAvailable, true);
  assert.equal(state.latestObservation.toISOString(), '2026-11-08T00:00:00.000Z');

  await loadStationData({ acknowledge: true, forceRefresh: true });
  assert.equal(state.newReadingAvailable, false);
  assert.equal(state.acknowledgedObservation.toISOString(), '2026-11-08T00:00:00.000Z');
});
