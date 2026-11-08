import { RANGE_PRESETS } from "./config.js";
import { aggregateSeries, filterHistoryForRange } from "./weather.js";
import {
  esc,
  formatValue,
  formatTableValue,
  tableUnit,
  observationsCSV,
} from "./format.js";

const PLOT = {
  width: 700,
  height: 250,
  left: 38,
  right: 9,
  top: 12,
  bottom: 11,
};

export function createChartView(state, metricGroups) {
  const el = (id) => document.getElementById(id);
  const svg = el("weather-chart");
  const tooltip = el("chart-tooltip");
  const plotWidth = PLOT.width - PLOT.left - PLOT.right;
  const plotHeight = PLOT.height - PLOT.top - PLOT.bottom;
  const selectedGroup = () =>
    metricGroups.find((group) => group.id === state.group);
  const x = (index) =>
    PLOT.left +
    (state.displayData.length === 1
      ? 0.5
      : index / (state.displayData.length - 1)) *
      plotWidth;

  function pointAt(event) {
    const rect = svg.getBoundingClientRect();
    const position = ((event.clientX - rect.left) / rect.width) * PLOT.width;
    const index = Math.round(
      ((position - PLOT.left) / plotWidth) * (state.displayData.length - 1),
    );
    return Math.max(0, Math.min(state.displayData.length - 1, index));
  }

  svg.addEventListener("mousemove", (event) => {
    const point = state.displayData[pointAt(event)];
    if (!point) return;
    const field = selectedGroup().fields[0];
    tooltip.textContent = `${point.date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} · ${formatValue(field, point.values[field.key])}`;
    tooltip.style.left = `${event.clientX - el("chart-wrap").getBoundingClientRect().left}px`;
    tooltip.style.top = "45px";
    tooltip.hidden = false;
  });
  svg.addEventListener("mouseleave", () => {
    tooltip.hidden = true;
  });
  svg.addEventListener("click", (event) => {
    if (!state.displayData.length) return;
    state.chartPoint = pointAt(event);
    render();
    el("readings-body")
      .querySelector("tr.highlighted")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  el("readings-body").addEventListener("click", (event) => {
    const row = event.target.closest("[data-point]");
    if (!row) return;
    state.chartPoint = Number(row.dataset.point);
    render();
  });

  function renderReadings(group) {
    const data = state.displayData.slice().reverse();
    const headers = [
      "Time",
      ...group.fields.map((field) => `${field.label} (${tableUnit(field)})`),
    ];
    el("readings-head").innerHTML =
      `<tr>${headers.map((header) => `<th scope="col">${esc(header)}</th>`).join("")}</tr>`;
    el("readings-body").innerHTML = data
      .map((point, index) => {
        const pointIndex = data.length - 1 - index;
        const classes = [
          state.chartPoint === pointIndex ? "highlighted" : "",
          state.animateReadings ? "reading-enter" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const animation = state.animateReadings
          ? `style="--reading-delay:${Math.min(index, 12) * 45}ms"`
          : "";
        const time = `${point.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} &nbsp; ${point.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        return `<tr data-point="${pointIndex}" class="${classes}" ${animation}><td>${time}</td>${group.fields.map((field) => `<td><strong>${esc(formatTableValue(field, point.values[field.key]))}</strong></td>`).join("")}</tr>`;
      })
      .join("");
    state.animateReadings = false;
    el("table-summary").textContent = data.length
      ? `${data.length} recent chart points · ${state.station.name}`
      : `No ${group.name.toLowerCase()} readings available for ${state.station.name}`;
    el("data-source").textContent = data.length ? "MeteoSwiss" : "No data yet";
  }

  function renderEmpty(group) {
    state.displayData = [];
    state.chartPoint = -1;
    svg.innerHTML = "";
    el("chart-empty").textContent = state.isRefreshing
      ? "Waiting for live observations"
      : `No ${group.name.toLowerCase()} observations available for this range`;
    el("chart-empty").hidden = false;
    el("chart-axis-labels").innerHTML = "";
    el("chart-current-value").textContent = "—";
    el("chart-change").textContent = "";
    el("chart-legend").innerHTML = "";
  }

  function render() {
    const group = selectedGroup();
    const fields = group.fields;
    let data = filterHistoryForRange(state.history, state.range);
    const aggregation = RANGE_PRESETS[state.range].aggregation;
    if (aggregation) data = aggregateSeries(data, group, aggregation);
    state.displayData = data;
    if (state.chartPoint >= data.length) state.chartPoint = -1;
    svg.setAttribute("viewBox", `0 0 ${PLOT.width} ${PLOT.height}`);
    svg.setAttribute(
      "aria-label",
      `${group.name} observations for ${state.station.name}`,
    );
    el("chart-caption").textContent = group.name.toUpperCase();
    tooltip.hidden = true;
    if (
      !data.some((point) =>
        fields.some((field) => Number.isFinite(point.values[field.key])),
      )
    ) {
      renderEmpty(group);
      renderReadings(group);
      return;
    }
    el("chart-empty").hidden = true;

    // Quantities sharing a unit share a scale; wind direction uses 0–360°.
    const primaryValues = data
      .flatMap((point) =>
        fields
          .filter((field) => field.unit === fields[0].unit)
          .map((field) => point.values[field.key]),
      )
      .filter(Number.isFinite);
    let min = primaryValues.length ? Math.min(...primaryValues) : 0;
    let max = primaryValues.length ? Math.max(...primaryValues) : 1;
    if (fields[0].key === "rain") {
      min = 0;
      max = Math.max(1, max);
    }
    const padding = (max - min || 1) * 0.2;
    min -= padding;
    max += padding;
    const y = (value, low = min, high = max) =>
      PLOT.top + ((high - value) / (high - low || 1)) * plotHeight;
    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map((fraction) => {
        const yy = PLOT.top + fraction * plotHeight;
        const value = Math.round((max - fraction * (max - min)) * 10) / 10;
        return `<line x1="${PLOT.left}" y1="${yy}" x2="${PLOT.width}" y2="${yy}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 5"/><text x="0" y="${yy + 3}" fill="var(--faint)" font-size="9" font-family="DM Mono, monospace">${value}${fields[0].unit === "°" ? "°" : ""}</text>`;
      })
      .join("");

    const lines = fields
      .map((field, fieldIndex) => {
        const values = data.map((point) => point.values[field.key]);
        if (!values.some(Number.isFinite)) return "";
        const low = field.key === "direction" ? 0 : min;
        const high = field.key === "direction" ? 360 : max;
        const coords = values
          .map((value, index) =>
            Number.isFinite(value)
              ? `${index > 0 && Number.isFinite(values[index - 1]) ? "L" : "M"} ${x(index)} ${y(value, low, high)}`
              : "",
          )
          .join(" ");
        const area =
          fieldIndex === 0 && values.every(Number.isFinite)
            ? `<path d="${coords} L ${x(values.length - 1)} ${PLOT.top + plotHeight} L ${x(0)} ${PLOT.top + plotHeight} Z" fill="url(#chart-fill)"/>`
            : "";
        const selected =
          state.chartPoint >= 0 && Number.isFinite(values[state.chartPoint])
            ? state.chartPoint
            : values.length === 1 && Number.isFinite(values[0])
              ? 0
              : -1;
        const marker =
          selected >= 0
            ? `<circle cx="${x(selected)}" cy="${y(values[selected], low, high)}" r="4" fill="${field.color}" stroke="var(--surface)" stroke-width="2"/>`
            : "";
        return `${area}<path d="${coords}" fill="none" stroke="${field.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${marker}`;
      })
      .join("");
    const marker =
      state.chartPoint >= 0
        ? `<line x1="${x(state.chartPoint)}" y1="${PLOT.top}" x2="${x(state.chartPoint)}" y2="${PLOT.top + plotHeight}" stroke="var(--ink)" stroke-opacity=".2" stroke-dasharray="3 4"/>`
        : "";
    svg.innerHTML = `<defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${fields[0].color}" stop-opacity=".2"/><stop offset="100%" stop-color="${fields[0].color}" stop-opacity="0"/></linearGradient></defs>${grid}${lines}${marker}`;

    const labels = data.length === 1 ? [0.5] : [0, 0.25, 0.5, 0.75, 1];
    el("chart-axis-labels").innerHTML = labels
      .map((fraction) => {
        const date = data[Math.round(fraction * (data.length - 1))].date;
        const label =
          RANGE_PRESETS[state.range].hours <= 24
            ? date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : date.toLocaleDateString([], { month: "short", day: "numeric" });
        return `<span>${esc(label)}</span>`;
      })
      .join("");
    const first = data[0].values[fields[0].key],
      last = data.at(-1).values[fields[0].key];
    const delta =
      Number.isFinite(first) && Number.isFinite(last) ? last - first : NaN;
    el("chart-current-value").textContent = formatValue(fields[0], last);
    el("chart-change").innerHTML = Number.isFinite(delta)
      ? `${delta >= 0 ? "↗" : "↘"} ${Math.abs(delta).toFixed(1)}${fields[0].unit} <small>in shown data</small>`
      : "";
    el("chart-change").style.color =
      delta >= 0 ? "var(--accent)" : "var(--muted)";
    el("chart-legend").innerHTML = fields
      .map(
        (field) =>
          `<span class="legend-item"><i class="legend-dot" style="background:${field.color}"></i>${esc(field.label)}</span>`,
      )
      .join("");
    renderReadings(group);
  }

  function exportCSV() {
    const csv = observationsCSV(state.displayData, selectedGroup().fields);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `${state.station.code.toLowerCase()}-${state.group}-${state.range}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  return { render, exportCSV };
}
