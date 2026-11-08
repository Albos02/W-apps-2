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
    globalThis.testApp = { parseCSV, loadStationData, state, stations };
  `);
  vm.runInNewContext(source, context);
  return { ...context.testApp, status };
}

const header = 'station_abbr;reference_timestamp;tre200s0;ure200s0;fu3010z0;fu3010z1;pp0qnhs0;pp0qffs0';
const csv = (station, temperature) => `${header}\n${station};07.11.2026 23:50;${temperature};;2.5;4.3;1023.6;1025.2`;

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
