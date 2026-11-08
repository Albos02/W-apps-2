import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDOM } from "./test-support/dom.js";
import { createApp } from "./app.js";
import { createChartView } from "./chart.js";
import { createDashboard } from "./model.js";
import { formatNumber } from "./format.js";

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
  assert.equal(tile.querySelector("strong").textContent, "13 km");
  assert.equal(
    tile.querySelector(".condition-trend").classList.contains("unavailable"),
    true,
  );
  tile.querySelector("strong").click();
  assert.equal(f.state.group, "visibility");
  assert.equal(tile.getAttribute("aria-pressed"), "true");
  assert.equal(f.el("chart-current-value").textContent, "13 km");
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
  assert.equal(f.el("wind-gust").textContent, "Gusts 22 km/h");

  f.state.current = null;
  app.render();
  assert.equal(tile.querySelector("strong").textContent, "— km");
  assert.equal(f.el("wind-gust").textContent, "Gusts unavailable");
});
