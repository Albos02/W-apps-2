import { createStorage } from "../storage.js";
import { createWeatherClient } from "../weather.js";
import { stations as fallbackStations } from "../config.js";
import { directionText, esc, normalizeSearchText } from "../format.js";
import { bindThemeToggle } from "../site.js";

const mapElement = document.getElementById("station-map");
const list = document.getElementById("station-list");
const filter = document.getElementById("station-filter");
const stationHint = document.getElementById("station-hint");
const mapCount = document.getElementById("map-count");
const stationTotal = document.getElementById("station-total");
const selectedName = document.getElementById("selected-name");
const selectedLocation = document.getElementById("selected-location");
const dashboardLink = document.getElementById("station-dashboard-link");
const themeToggle = document.getElementById("theme-toggle");
const mapStatusCount = document.getElementById("map-status-count");
const mapLoadError = document.getElementById("map-load-error");
const windowStorage = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();
const preferences = createStorage(windowStorage);
const weatherClient = createWeatherClient();

let stations = [];
let selectedCode = preferences.read("isobar-station", "").toUpperCase();
let leaflet;
let map;
let stationLayer;
let stationMarkers = new Map();
let loadedMapTile = false;
let windByCode = new Map();
let windLoading = false;
let stationFeedOffline = false;

const WIND_FETCH_CONCURRENCY = 6;
const WIND_SCALE_MAX = 70;

function matches(station, query) {
  if (!query) return true;
  const normalizedQuery = normalizeSearchText(query);
  return [station.name, station.code, station.canton].some((part) =>
    normalizeSearchText(part).includes(normalizedQuery),
  );
}

function windColor(speed) {
  if (!Number.isFinite(speed)) return "#1689e0";
  if (speed < 5) return "#8b98a0";
  if (speed < 15) return "#4a9fd4";
  if (speed < 30) return "#2f9e72";
  if (speed < 50) return "#d9a22e";
  return "#d9534f";
}

function windArrowSize(speed) {
  const clamped = Math.max(0, Math.min(speed, WIND_SCALE_MAX));
  return Math.round(18 + (clamped / WIND_SCALE_MAX) * 18);
}

function windSummary(data) {
  if (!data || !Number.isFinite(data.wind)) return "";
  const gust = Number.isFinite(data.gust)
    ? ` (gusts ${data.gust.toFixed(1)})`
    : "";
  return `${data.wind.toFixed(1)} km/h · ${directionText(data.direction)}${gust}`;
}

function stationTooltip(station) {
  const wind = windByCode.get(station.code);
  const summary = windSummary(wind);
  return `<strong>${esc(station.name)}</strong><br>${esc(station.canton)} · ${esc(station.code)}${summary ? `<br>${esc(summary)}` : ""}`;
}

function stationPopup(station) {
  const wind = windByCode.get(station.code);
  const summary = windSummary(wind);
  return `<strong>${esc(station.name)}</strong><br>${esc(station.canton)} · ${station.lat.toFixed(3)}° N, ${station.lon.toFixed(3)}° E${summary ? `<br>Wind ${esc(summary)}` : ""}<br><a href="../dashboard/?station=${encodeURIComponent(station.code)}">View live conditions ↗</a>`;
}

function stationIcon(station, isSelected) {
  const wind = windByCode.get(station.code);
  const speed = wind?.wind;
  const direction = wind?.direction;
  const classes = ["station-div-icon", isSelected ? "selected" : ""]
    .filter(Boolean)
    .join(" ");

  if (!Number.isFinite(speed) || !Number.isFinite(direction)) {
    return leaflet.divIcon({
      className: classes,
      html: '<span class="station-pin" aria-hidden="true"></span>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      tooltipAnchor: [0, -10],
    });
  }

  // MeteoSwiss reports the direction the wind blows *from*, so point the
  // arrow the opposite way (toward where it is heading).
  const rotation = direction + 180;
  const size = windArrowSize(speed);
  const arrowClasses = ["wind-div-icon", isSelected ? "selected" : ""]
    .filter(Boolean)
    .join(" ");
  return leaflet.divIcon({
    className: arrowClasses,
    html: `<span class="wind-marker" style="width:${size}px;height:${size}px;color:${windColor(speed)}"><svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${rotation}deg)"><path d="M12 20V4"/><path d="M5.5 10.5 12 4l6.5 6.5"/></svg></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -size / 2],
  });
}

function renderMarkers(query) {
  if (!stationLayer) return;
  stationLayer.clearLayers();
  stationMarkers = new Map();

  for (const station of stations) {
    if (!matches(station, query)) continue;
    const marker = leaflet.marker([station.lat, station.lon], {
      icon: stationIcon(station, station.code === selectedCode),
      title: `${station.name} · ${station.canton}`,
      alt: `MeteoSwiss weather station ${station.name}`,
      keyboard: true,
    });
    marker.bindTooltip(() => stationTooltip(station));
    marker.bindPopup(() => stationPopup(station));
    marker.on("click", () => selectStation(station.code, { panTo: false }));
    marker.addTo(stationLayer);
    stationMarkers.set(station.code, marker);
  }
}

async function loadWindData() {
  if (windLoading || !stations.length) return;
  windLoading = true;
  const targets = [...stations];
  let completed = 0;
  const pending = targets[Symbol.iterator]();
  mapStatusCount.textContent = `Loading wind 0/${targets.length}`;

  const worker = async () => {
    for (;;) {
      const next = pending.next();
      if (next.done) return;
      const station = next.value;
      try {
        const points = await weatherClient.fetchCSV(station, "now");
        const latest = points.at(-1);
        const values = latest?.values || {};
        if (Number.isFinite(values.wind) && Number.isFinite(values.direction)) {
          windByCode.set(station.code, {
            wind: values.wind,
            gust: Number.isFinite(values.gust) ? values.gust : null,
            direction: values.direction,
            timestamp: latest.date,
          });
          const marker = stationMarkers.get(station.code);
          if (marker)
            marker.setIcon(stationIcon(station, station.code === selectedCode));
        }
      } catch {
        // A station without a usable now feed simply keeps its station dot.
      }
      completed++;
      mapStatusCount.textContent = `Loading wind ${completed}/${targets.length}`;
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(WIND_FETCH_CONCURRENCY, targets.length) },
      worker,
    ),
  );

  windLoading = false;
  mapStatusCount.textContent = `${stations.length} stations · wind${stationFeedOffline ? " · offline" : ""}`;
  renderMarkers(filter.value.trim());
}

function renderList(query) {
  const filtered = stations
    .filter((station) => matches(station, query))
    .sort(
      (left, right) =>
        Number(right.code === selectedCode) -
          Number(left.code === selectedCode) ||
        left.name.localeCompare(right.name),
    );
  const display = query ? filtered : filtered.slice(0, 9);
  list.innerHTML = display.length
    ? display
        .map(
          (station) =>
            `<button type="button" class="station-option ${station.code === selectedCode ? "selected" : ""}" role="option" aria-selected="${station.code === selectedCode}" data-code="${esc(station.code)}"><span class="station-option-marker" aria-hidden="true"></span><span class="station-option-copy"><span class="station-option-name">${esc(station.name)}</span><span class="station-option-meta">${esc(station.canton)} · ${station.lat.toFixed(3)}° N, ${station.lon.toFixed(3)}° E</span></span><span class="station-option-code">${esc(station.code)}</span></button>`,
        )
        .join("")
    : '<p class="station-empty">No stations match that search.</p>';
  stationHint.textContent = query
    ? `${filtered.length} ${filtered.length === 1 ? "station" : "stations"} matching “${query}”`
    : `Showing 9 of ${stations.length} stations · search to explore all`;
  stationTotal.textContent = query
    ? `${filtered.length} / ${stations.length}`
    : `${stations.length} total`;
  mapCount.textContent = `${filtered.length} of ${stations.length} visible`;
}

function fitStationNetwork() {
  if (!map || !stations.length) return;
  const bounds = leaflet.latLngBounds(
    stations.map(({ lat, lon }) => [lat, lon]),
  );
  map.fitBounds(bounds, { padding: [36, 36], maxZoom: 8 });
}

function selectStation(code, { persist = true, panTo = true } = {}) {
  const station = stations.find((item) => item.code === code);
  if (!station) return;
  selectedCode = station.code;
  if (persist) preferences.save("isobar-station", station.code);
  selectedName.textContent = station.name;
  selectedLocation.textContent = `${station.canton} · ${station.lat.toFixed(3)}° N, ${station.lon.toFixed(3)}° E${Number.isFinite(station.elevation) ? ` · ${station.elevation} m` : ""} · ${station.code}`;
  dashboardLink.href = `../dashboard/?station=${encodeURIComponent(station.code)}`;
  for (const [markerCode, marker] of stationMarkers) {
    const markerStation = stations.find((item) => item.code === markerCode);
    if (markerStation)
      marker.setIcon(stationIcon(markerStation, markerCode === selectedCode));
  }
  renderList(filter.value.trim());

  if (map && panTo) {
    map.setView([station.lat, station.lon], Math.max(map.getZoom(), 9), {
      animate: true,
    });
  }
}

function initializeMap() {
  leaflet = globalThis.L;
  if (!leaflet) {
    mapLoadError.hidden = false;
    mapLoadError.textContent =
      "The interactive map library could not be loaded. Check your connection and reload.";
    mapStatusCount.textContent = "Map unavailable";
    return false;
  }

  map = leaflet
    .map(mapElement, {
      scrollWheelZoom: true,
      zoomControl: true,
      minZoom: 5,
      maxZoom: 19,
    })
    .setView([46.8, 8.2], 8);
  leaflet.control.scale({ imperial: false, maxWidth: 120 }).addTo(map);
  stationLayer = leaflet.layerGroup().addTo(map);

  const tiles = leaflet
    .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      subdomains: "abc",
      updateWhenIdle: true,
      keepBuffer: 3,
    })
    .addTo(map);
  tiles.on("tileload", () => {
    loadedMapTile = true;
    mapLoadError.hidden = true;
  });
  tiles.on("tileerror", () => {
    if (!loadedMapTile) mapLoadError.hidden = false;
  });

  requestAnimationFrame(() => map.invalidateSize());
  return true;
}

function codeFromUrl() {
  try {
    return (
      new URLSearchParams(window.location.search)
        .get("station")
        ?.toUpperCase() || ""
    );
  } catch {
    return "";
  }
}

async function init() {
  bindThemeToggle({ document, button: themeToggle, preferences });
  const mapAvailable = initializeMap();
  const requestedCode = codeFromUrl();
  if (requestedCode) selectedCode = requestedCode;
  const preferredCode = selectedCode;
  stations = [...fallbackStations];
  selectedCode = stations.some((station) => station.code === preferredCode)
    ? preferredCode
    : "";
  if (selectedCode)
    selectStation(selectedCode, { persist: false, panTo: false });
  renderMarkers(filter.value.trim());
  mapStatusCount.textContent = `${stations.length} stations`;
  if (mapAvailable) fitStationNetwork();

  try {
    stations = await weatherClient.fetchStations();
    mapStatusCount.textContent = `${stations.length} stations`;
    selectedCode = stations.some((station) => station.code === preferredCode)
      ? preferredCode
      : stations.some((station) => station.code === selectedCode)
        ? selectedCode
        : "";
    if (selectedCode)
      selectStation(selectedCode, { persist: false, panTo: false });
    renderMarkers(filter.value.trim());
    if (mapAvailable) fitStationNetwork();
  } catch {
    stationFeedOffline = true;
    mapStatusCount.textContent = `${stations.length} stations · offline`;
  }

  if (mapAvailable) loadWindData();
}

filter.addEventListener("input", () => {
  const query = filter.value.trim();
  renderMarkers(query);
  renderList(query);
});

list.addEventListener("click", (event) => {
  const option = event.target.closest("[data-code]");
  if (option) selectStation(option.dataset.code);
});

init();
