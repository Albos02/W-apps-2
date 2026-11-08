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
    globalThis.testApp = { parseCSV, parseDate, loadStationData, metricTrendForField, state, stations };
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

  await loadStationData();
  assert.equal(state.newReadingAvailable, true);
  assert.equal(state.latestObservation.toISOString(), '2026-11-08T00:00:00.000Z');

  await loadStationData({ acknowledge: true });
  assert.equal(state.newReadingAvailable, false);
  assert.equal(state.acknowledgedObservation.toISOString(), '2026-11-08T00:00:00.000Z');
});
