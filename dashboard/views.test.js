import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDOM } from "./test-support/dom.js";
import { createApp } from "./app.js";
import { createChartView } from "./chart.js";
import { createDashboard } from "./model.js";
import { formatNumber } from "../format.js";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
function fixture(t, group = "temperature") {
  const dom = createDOM(html);
  const dashboard = createDashboard();
  dashboard.state.group = group;
  t.mock.method(Date, "now", () => Date.UTC(2026, 10, 8, 12));
  const el = (id) => dom.document.getElementById(id);
  return {
    ...dom,
    dashboard,
    state: dashboard.state,
    groups: dashboard.metricGroups,
    el,
  };
}
const readings = () => [
  {
    date: new Date("2026-11-08T11:00:00Z"),
    values: {
      temp: 4.5,
      pressure: 1023.6,
      wind: 12.6,
      gust: 21.8,
      direction: 350,
      rain: 0,
    },
  },
  {
    date: new Date("2026-11-08T11:10:00Z"),
    values: { temp: 5.2, pressure: 1024.2, wind: 14.3, direction: 10 },
  },
];

test("chart transitions between waiting, data, missing metrics, and recovery", (t) => {
  const f = fixture(t);
  const view = createChartView(f.state, f.groups, f);
  f.state.isRefreshing = true;
  view.render();
  assert.equal(
    f.el("chart-empty").textContent,
    "Waiting for live observations",
  );
  assert.equal(f.el("weather-chart").innerHTML, "");
  assert.equal(f.el("readings-body").querySelectorAll("tr").length, 0);

  f.state.isRefreshing = false;
  f.state.history = readings();
  view.render();
  assert.equal(f.el("chart-empty").hidden, true);
  assert.match(f.el("weather-chart").innerHTML, /<path/);
  assert.doesNotMatch(f.el("weather-chart").innerHTML, /NaN|Infinity/);
  assert.equal(f.el("chart-current-value").textContent, "5.2°");
  f.el("weather-chart").dispatch("mousemove", { clientX: 38 });
  assert.equal(f.el("chart-tooltip").hidden, false);
  assert.match(f.el("chart-tooltip").textContent, /4.5°/);

  f.state.history = [{ date: readings()[0].date, values: { humidity: 80 } }];
  f.state.chartPoint = 1;
  view.render();
  assert.equal(f.el("chart-empty").hidden, false);
  assert.match(f.el("chart-empty").textContent, /No temperature observations/);
  assert.equal(f.el("chart-tooltip").hidden, true);
  for (const id of [
    "weather-chart",
    "chart-axis-labels",
    "chart-legend",
    "readings-body",
  ])
    assert.equal(f.el(id).innerHTML, "");
  assert.equal(f.el("chart-current-value").textContent, "—");
  assert.equal(f.el("chart-change").textContent, "");
  assert.equal(f.state.chartPoint, -1);

  f.state.history = [readings()[0]];
  view.render();
  assert.equal(f.el("chart-empty").hidden, true);
  assert.match(f.el("weather-chart").innerHTML, /<circle/);
  assert.doesNotMatch(f.el("weather-chart").innerHTML, /NaN|Infinity/);
  assert.equal(f.el("readings-body").querySelectorAll("tr").length, 1);
});

test("chart tooltip shows a value for every plotted field", (t) => {
  const f = fixture(t, "wind");
  f.state.history = readings();
  const view = createChartView(f.state, f.groups, f);
  view.render();
  f.el("weather-chart").dispatch("mousemove", { clientX: 38 });
  const text = f.el("chart-tooltip").textContent;
  assert.match(text, /Avrg wind 12\.6 km\/h/);
  assert.match(text, /Wind gusts 21\.8 km\/h/);
  assert.match(text, /Wind dir 350°/);
});

test("chart and table clicks highlight the matching chronological point", (t) => {
  const f = fixture(t);
  f.state.history = readings();
  f.state.animateReadings = true;
  const view = createChartView(f.state, f.groups, f);
  view.render();
  assert.equal(f.el("readings-body").querySelector("tr").dataset.point, "1");
  assert.equal(
    f.el("readings-body").querySelectorAll(".reading-enter").length,
    2,
  );

  f.el("weather-chart").dispatch("click", { clientX: 38 });
  assert.equal(f.state.chartPoint, 0);
  let highlighted = f.el("readings-body").querySelectorAll("tr.highlighted");
  assert.equal(highlighted.length, 1);
  assert.equal(highlighted[0].dataset.point, "0");
  assert.equal(highlighted[0].scrolled.block, "center");
  assert.equal(
    f.el("readings-body").querySelectorAll(".reading-enter").length,
    0,
  );

  // Click a nested cell to exercise delegated row selection.
  f.el("readings-body")
    .querySelector('[data-point="1"]')
    .querySelector("strong")
    .click();
  highlighted = f.el("readings-body").querySelectorAll("tr.highlighted");
  assert.equal(highlighted.length, 1);
  assert.equal(highlighted[0].dataset.point, "1");
  assert.equal(f.state.chartPoint, 1);
  assert.match(f.el("weather-chart").innerHTML, /cx="691"/);
});

test("CSV download exports the displayed fields and revokes its object URL", async (t) => {
  const f = fixture(t, "wind");
  f.state.history = readings();
  let blob, downloaded, revoked;
  const createElement = f.document.createElement;
  f.document.createElement = (tag) => {
    const element = createElement(tag);
    if (tag === "a")
      element.click = () => {
        downloaded = element;
      };
    return element;
  };
  const view = createChartView(f.state, f.groups, {
    ...f,
    URL: {
      createObjectURL: (value) => {
        blob = value;
        return "blob:test-export";
      },
      revokeObjectURL: (url) => {
        revoked = url;
      },
    },
  });
  view.render();
  view.exportCSV();
  assert.equal(downloaded.download, "bou-wind-24h.csv");
  assert.equal(downloaded.href, "blob:test-export");
  assert.equal(blob.type, "text/csv;charset=utf-8");
  assert.equal(
    await blob.text(),
    '"timestamp","source","Avrg wind","Wind gusts","Wind dir"\n"2026-11-08T11:00:00.000Z","MeteoSwiss","12.6","21.8","350"\n"2026-11-08T11:10:00.000Z","MeteoSwiss","14.3","","10"',
  );
  assert.equal(revoked, undefined);
  f.timers.forEach((callback) => callback());
  assert.equal(revoked, "blob:test-export");
});

test("app renders an added config metric, selects it, and uses shared formatting", (t) => {
  const f = fixture(t);
  const extra = {
    id: "visibility",
    name: "Visibility",
    symbol: "◉",
    color: "#123456",
    bg: "#eeeeee",
    detail: "km",
    fields: [
      { key: "visibility", label: "Visibility", unit: " km", color: "#123456" },
    ],
  };
  f.groups.push(extra);
  // Keep startup deterministic while exercising the real view and event wiring.
  f.dashboard.loadStationData = () => {};
  f.dashboard.loadStationList = () => {};
  f.state.history = readings();
  f.state.history.at(-1).values.visibility = 12.6;
  f.state.current = { ...f.state.history.at(-1).values, gust: 21.8 };
  const app = createApp({ ...f, dashboard: f.dashboard });
  app.init();
  const tile = f
    .el("condition-grid")
    .querySelector('[data-group="visibility"]');
  assert.ok(tile);
  assert.equal(tile.hidden, false);
  assert.equal(tile.querySelector("strong").textContent, "12.6 km");
  assert.equal(
    tile.querySelector(".condition-trend").classList.contains("unavailable"),
    true,
  );
  tile.querySelector("strong").click();
  assert.equal(f.state.group, "visibility");
  assert.equal(tile.getAttribute("aria-pressed"), "true");
  assert.equal(f.el("chart-current-value").textContent, "12.6 km");
  assert.equal(f.el("history").scrolled.block, "start");

  const pressure = f.groups.find((group) => group.id === "pressure");
  f.state.current.pressure = 1023.6;
  f.groups.splice(f.groups.indexOf(pressure), 1);
  f.groups.unshift(pressure);
  app.render();
  assert.equal(
    f.el("current-temperature").textContent,
    formatNumber(pressure.fields[0], 1023.6),
  );
  assert.equal(f.el("current-pressure").textContent, "1024 hPa");
  assert.equal(f.el("wind-gust").textContent, "Gusts 21.8 km/h");

  f.state.current = null;
  app.render();
  assert.equal(tile.querySelector("strong").textContent, "— km");
  assert.equal(f.el("wind-gust").textContent, "Gusts unavailable");
});

test("station search tolerates typos, requires every term, and Enter selects the best match", (t) => {
  const f = fixture(t);
  const kloten = {
    code: "KLO",
    name: "Zürich / Kloten",
    canton: "ZH",
    lat: 47.478653,
    lon: 8.529844,
    elevation: null,
  };
  f.state.stationOptions = [
    kloten,
    {
      code: "ZRH",
      name: "Zürich",
      canton: "ZH",
      lat: 47.45,
      lon: 8.56,
      elevation: null,
    },
  ];
  const stored = {};
  f.dashboard.preferences.read = (key, fallback) => stored[key] ?? fallback;
  f.dashboard.preferences.save = (key, value) => {
    stored[key] = value;
  };
  f.dashboard.loadStationData = () => {};
  f.dashboard.loadStationList = () => {};
  let selectedCode;
  f.dashboard.selectStation = (code) => {
    selectedCode = code;
    f.state.station = f.state.stationOptions.find(
      (station) => station.code === code,
    );
  };

  const app = createApp({ ...f, dashboard: f.dashboard });
  app.init();
  const search = f.el("station-search");
  search.value = "zurcih / kloten";
  search.dispatch("input");

  assert.deepEqual(
    f
      .el("station-menu")
      .querySelectorAll("[data-station]")
      .map((option) => option.dataset.station),
    ["KLO"],
  );
  search.dispatch("keydown", { key: "Enter" });
  assert.equal(selectedCode, "KLO");
  assert.deepEqual(stored["isobar-recent-stations"], ["KLO"]);

  f.el("picker-toggle").click();
  assert.match(f.el("station-menu").innerHTML, /RECENT/);
  assert.equal(
    f.el("station-menu").querySelector("[data-station]").dataset.station,
    "KLO",
  );
});

test("Enter selects the first visible station suggestion", (t) => {
  const f = fixture(t);
  f.state.stationOptions = [
    {
      code: "KLO",
      name: "Zürich / Kloten",
      canton: "ZH",
      lat: 47.478653,
      lon: 8.529844,
    },
    {
      code: "ZRH",
      name: "Zürich",
      canton: "ZH",
      lat: 47.45,
      lon: 8.56,
    },
  ];
  f.state.favorites = ["KLO", "ZRH"];
  f.dashboard.loadStationData = () => {};
  f.dashboard.loadStationList = () => {};
  const stored = {};
  f.dashboard.preferences.read = (key, fallback) => stored[key] ?? fallback;
  f.dashboard.preferences.save = (key, value) => {
    stored[key] = value;
  };
  let selectedCode;
  f.dashboard.selectStation = (code) => {
    selectedCode = code;
  };
  const app = createApp({ ...f, dashboard: f.dashboard });
  app.init();
  const search = f.el("station-search");
  search.value = "zurich";
  search.dispatch("input");

  const suggestions = f.el("station-menu").querySelectorAll("[data-station]");
  assert.deepEqual(
    suggestions.map((option) => option.dataset.station),
    ["KLO", "ZRH"],
  );
  assert.equal(suggestions[0].classList.contains("first-suggestion"), true);
  assert.equal(suggestions[0].getAttribute("aria-keyshortcuts"), "Enter");
  assert.equal(suggestions[0].getAttribute("tabindex"), "-1");
  search.dispatch("keydown", { key: "Tab" });
  assert.equal(f.document.activeElement, suggestions[1]);
  suggestions[1].dispatch("keydown", { key: "Tab", shiftKey: true });
  assert.equal(f.document.activeElement, search);
  search.dispatch("keydown", { key: "Enter" });
  assert.equal(selectedCode, "KLO");
});

test("place search shows nearby stations for every plausible place with distance labels", async (t) => {
  const f = fixture(t);
  f.state.stationOptions = [
    { code: "BCH", name: "Station West", canton: "AG", lat: 47.39, lon: 8.08 },
    { code: "SGN", name: "Station East", canton: "SG", lat: 47.16, lon: 9.47 },
  ];
  f.dashboard.loadStationData = () => {};
  f.dashboard.loadStationList = () => {};
  f.dashboard.searchPlace = async () => {
    f.state.placeOptions = [
      {
        label: "Buchs, St. Gallen",
        detail: "SG",
        lat: 47.1667,
        lon: 9.4667,
        confidence: 100,
      },
      {
        label: "Buchs, Aargau",
        detail: "AG",
        lat: 47.3933,
        lon: 8.1858,
        confidence: 100,
      },
    ];
    f.state.nearbyPlaces = [
      {
        place: f.state.placeOptions[0],
        stations: [
          { station: f.state.stationOptions[1], distanceKm: 0.5 },
          { station: f.state.stationOptions[0], distanceKm: 98.4 },
        ],
      },
      {
        place: f.state.placeOptions[1],
        stations: [
          { station: f.state.stationOptions[0], distanceKm: 7.2 },
          { station: f.state.stationOptions[1], distanceKm: 97.1 },
        ],
      },
    ];
    f.state.geocodeStatus = "idle";
    f.app.render();
    return f.state.placeOptions;
  };
  f.app = createApp({ ...f, dashboard: f.dashboard });
  f.app.init();
  const search = f.el("station-search");
  search.value = "Buchs";
  search.dispatch("input");
  await f.timers.at(-1)();

  assert.deepEqual(
    f
      .el("station-menu")
      .querySelectorAll(".nearby-option")
      .map((option) => option.textContent),
    [
      "Station EastBuchs, St. Gallen · 0.5 km · 100/100",
      "Station WestBuchs, St. Gallen · 98.4 km · 100/100",
      "Station WestBuchs, Aargau · 7.2 km · 100/100",
      "Station EastBuchs, Aargau · 97.1 km · 100/100",
    ],
  );
  assert.equal(f.el("station-menu").querySelectorAll("[data-place]").length, 0);
  assert.match(f.el("station-menu").innerHTML, /NEAR Buchs, St\. Gallen/);
  assert.match(f.el("station-menu").innerHTML, /NEAR Buchs, Aargau/);
  assert.match(f.el("station-menu").innerHTML, /Places © swisstopo/);
});

test("Enter selects the closest station when no station name matches the place", async (t) => {
  const f = fixture(t);
  f.state.stationOptions = [
    { code: "FAR", name: "Remote station", canton: "VD", lat: 46.7, lon: 6.2 },
    { code: "CLO", name: "Nearest station", canton: "GE", lat: 46.2, lon: 6.1 },
  ];
  f.dashboard.loadStationData = () => {};
  f.dashboard.loadStationList = () => {};
  f.dashboard.searchPlace = async () => {
    f.state.placeOptions = [
      {
        label: "Geneva",
        detail: "GE",
        lat: 46.2044,
        lon: 6.1432,
        confidence: 100,
      },
    ];
    f.state.nearbyPlaces = [
      {
        place: f.state.placeOptions[0],
        stations: [{ station: f.state.stationOptions[1], distanceKm: 1.2 }],
      },
    ];
    f.state.geocodeStatus = "idle";
    f.app.render();
    return f.state.placeOptions;
  };
  const stored = {};
  f.dashboard.preferences.read = (key, fallback) => stored[key] ?? fallback;
  f.dashboard.preferences.save = (key, value) => {
    stored[key] = value;
  };
  let selectedCode;
  f.dashboard.selectStation = (code) => {
    selectedCode = code;
  };
  f.app = createApp({ ...f, dashboard: f.dashboard });
  f.app.init();
  const search = f.el("station-search");
  search.value = "Geneva";
  search.dispatch("input");
  await f.timers.at(-1)();
  search.dispatch("keydown", { key: "Enter" });
  assert.equal(selectedCode, "CLO");
  assert.deepEqual(stored["isobar-recent-stations"], ["CLO"]);
});
