import {
  parameters,
  RANGE_PRESETS,
  FEED_CACHE_TTL,
  stations,
} from "./config.js";
import { formatNumber } from "./format.js";

const HOUR = 60 * 60 * 1000;
const isValidDate = (date) =>
  date instanceof Date && Number.isFinite(date.getTime());

export function parseDate(value) {
  if (!value) return null;
  const text = value.trim();
  const swiss = text.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
  let date;
  if (swiss || compact) {
    const [, year, month, day, hour, minute, second = "0"] = compact || [
      null,
      swiss[3],
      swiss[2],
      swiss[1],
      swiss[4],
      swiss[5],
    ];
    date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
    if (
      date.getUTCFullYear() !== +year ||
      date.getUTCMonth() !== +month - 1 ||
      date.getUTCDate() !== +day ||
      date.getUTCHours() !== +hour ||
      date.getUTCMinutes() !== +minute ||
      date.getUTCSeconds() !== +second
    )
      return null;
  } else {
    date = new Date(text);
  }
  return isValidDate(date) ? date : null;
}

function splitCSVRow(line, separator) {
  const cells = [];
  let cell = "",
    quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === separator && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

export function parseCSV(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return [];
  const separator = lines[0].includes(";") ? ";" : ",";
  const header = splitCSVRow(lines[0], separator).map((name) =>
    name.toLowerCase(),
  );
  const timeColumn = header.findIndex((name) =>
    /reference_timestamp|timestamp|time|date/.test(name),
  );
  const columns = Object.entries(parameters).map(([key, alias]) => [
    key,
    header.findIndex((name) => name === alias || name.includes(alias)),
  ]);

  return lines
    .slice(1)
    .flatMap((line) => {
      const cells = splitCSVRow(line, separator);
      const date = parseDate(cells[timeColumn >= 0 ? timeColumn : 0]);
      if (!date) return [];
      const values = {};
      for (const [key, index] of columns) {
        if (index < 0 || !cells[index]) continue;
        const number = Number(cells[index].replace(",", "."));
        if (Number.isFinite(number)) values[key] = number;
      }
      return Object.keys(values).length ? [{ date, values }] : [];
    })
    .sort((a, b) => a.date - b.date);
}

export function mergeObservations(...feeds) {
  const byTime = new Map();
  for (const point of feeds.flat()) {
    const key = point.date.getTime();
    const previous = byTime.get(key);
    byTime.set(key, {
      date: point.date,
      values: { ...previous?.values, ...point.values },
    });
  }
  return [...byTime.values()].sort((a, b) => a.date - b.date);
}

export function filterHistoryForRange(data, range, now = Date.now()) {
  const cutoff = now - RANGE_PRESETS[range].hours * HOUR;
  return data.filter(
    (point) =>
      isValidDate(point.date) &&
      point.date.getTime() >= cutoff &&
      point.date.getTime() <= now,
  );
}

export function aggregateSeries(data, group, aggregation) {
  const bucketSize = aggregation === "twoHours" ? 2 * HOUR : HOUR;
  const byInterval = new Map();
  for (const point of data) {
    const interval = Math.floor(point.date.getTime() / bucketSize);
    if (!byInterval.has(interval)) byInterval.set(interval, []);
    byInterval.get(interval).push(point);
  }
  let buckets = [...byInterval.values()];
  if (aggregation === "triads") {
    buckets = buckets.flatMap((points) => {
      const groups = [];
      for (let index = 0; index < points.length; index += 3)
        groups.push(points.slice(index, index + 3));
      return groups;
    });
  }
  return buckets.map((points) => {
    const values = {};
    for (const field of group.fields) {
      const numbers = points
        .map((point) => point.values[field.key])
        .filter(Number.isFinite);
      if (!numbers.length) continue;
      if (field.key === "direction") {
        const radians = numbers.map((value) => (value * Math.PI) / 180);
        const angle = Math.atan2(
          radians.reduce((sum, value) => sum + Math.sin(value), 0),
          radians.reduce((sum, value) => sum + Math.cos(value), 0),
        );
        values[field.key] = ((angle * 180) / Math.PI + 360) % 360;
      } else {
        values[field.key] =
          numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
      }
    }
    return { date: points.at(-1).date, values };
  });
}

export function summarizeSeries(field, displayed, raw) {
  const mode = field.change || "delta";
  if (mode === "sum") {
    let total = 0;
    let count = 0;
    for (const point of raw || []) {
      const value = point.values[field.key];
      if (!Number.isFinite(value)) continue;
      total += value;
      count++;
    }
    return count ? total : null;
  }
  const first = displayed[0]?.values[field.key];
  const last = displayed.at(-1)?.values[field.key];
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  if (mode === "circular") return ((last - first + 540) % 360) - 180;
  return last - first;
}

export function metricTrendForField(field, history, current) {
  const key = field.key;
  const points = (history || []).filter(
    (point) => isValidDate(point.date) && Number.isFinite(point.values[key]),
  );
  if (isValidDate(current?.timestamp) && Number.isFinite(current[key]))
    points.push({ date: current.timestamp, values: current });
  const ordered = mergeObservations(points);
  const latest = ordered.at(-1);
  if (!latest) return null;
  const baseline = ordered.findLast(
    (point) => point.date.getTime() <= latest.date.getTime() - HOUR,
  );
  if (!baseline) return null;
  let delta;
  if (key === "rain" || key === "sunshine") {
    delta = ordered.reduce(
      (sum, point) =>
        point.date > baseline.date ? sum + point.values[key] : sum,
      0,
    );
  } else if (key === "direction") {
    delta = ((latest.values[key] - baseline.values[key] + 540) % 360) - 180;
  } else delta = latest.values[key] - baseline.values[key];
  if (!Number.isFinite(delta)) return null;
  const arrow =
    key === "direction"
      ? delta > 0
        ? "↻"
        : delta < 0
          ? "↺"
          : "→"
      : delta > 0
        ? "↗"
        : delta < 0
          ? "↘"
          : "→";
  const value = `${delta > 0 ? "+" : ""}${formatNumber(field, delta)}${field.unit.trim()}`;
  return { arrow, text: `${arrow} ${value} · 1h`, direction: Math.sign(delta) };
}

export function normalizeStations(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : payload?.stations || payload?.features || [];
  if (!Array.isArray(rows)) return [];
  const normalized = rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const props = Array.isArray(item)
      ? {
          code: item[0],
          lat: item[1],
          lon: item[2],
          name: item[3],
          canton: item[4],
        }
      : item.properties || item;
    const code = String(
      props.code || props.station || props.station_abbr || props.abr || "",
    ).toUpperCase();
    if (!/^[A-Z0-9]+$/.test(code)) return [];
    const fallback = stations.find((station) => station.code === code);
    const coords = props.coordinates || item.geometry?.coordinates || [];
    const rawLat = props.lat ?? coords[1] ?? fallback?.lat;
    const rawLon = props.lon ?? coords[0] ?? fallback?.lon;
    const lat = Number(rawLat),
      lon = Number(rawLon);
    if (
      rawLat == null ||
      rawLon == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return [];
    const elevation = props.altitude ?? props.elevation ?? fallback?.elevation;
    return [
      {
        code,
        name: props.name || props.station_name || fallback?.name || code,
        canton: props.canton || fallback?.canton || "",
        lat,
        lon,
        elevation:
          elevation != null && Number.isFinite(Number(elevation))
            ? Number(elevation)
            : null,
      },
    ];
  });
  return [
    ...new Map(normalized.map((station) => [station.code, station])).values(),
  ];
}

export function createWeatherClient(fetch = globalThis.fetch, now = Date.now) {
  const cache = new Map();
  const cacheVersions = new Map();

  async function fetchCSV(
    station,
    suffix,
    { bypassCache = false, signal } = {},
  ) {
    signal?.throwIfAborted();
    const key = `${station.code}:${suffix}`;
    const version = cacheVersions.get(station.code) || 0;
    const cached = cache.get(key);
    if (!bypassCache && cached?.expiresAt > now()) return cached.points;
    if (!bypassCache) cache.delete(key);
    const code = station.code.toLowerCase();
    const response = await fetch(
      `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/${code}/ogd-smn_${code}_t_${suffix}.csv`,
      { cache: "no-store", mode: "cors", signal },
    );
    if (!response.ok)
      throw new Error(`Weather data request failed (${response.status})`);
    const points = parseCSV(await response.text());
    signal?.throwIfAborted();
    if (
      !bypassCache &&
      points.length &&
      version === (cacheVersions.get(station.code) || 0)
    )
      cache.set(key, { points, expiresAt: now() + FEED_CACHE_TTL });
    return points;
  }

  function clearStationFeedCache(code) {
    cacheVersions.set(code, (cacheVersions.get(code) || 0) + 1);
    for (const key of cache.keys())
      if (key.startsWith(`${code}:`)) cache.delete(key);
  }

  async function fetchStations() {
    const response = await fetch("../assets/coord_station_meteosuisse.json");
    if (!response.ok)
      throw new Error(`Station list request failed (${response.status})`);
    return normalizeStations(await response.json());
  }

  return { fetchCSV, clearStationFeedCache, fetchStations };
}
