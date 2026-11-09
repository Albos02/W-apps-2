import {
  parameters,
  RANGE_PRESETS,
  FEED_CACHE_TTL,
  stations,
} from "./config.js";
import { formatNumber } from "./format.js";

const HOUR = 60 * 60 * 1000;
const CSV_HEADER_RANGE = 4095;
const CSV_BYTES_PER_OBSERVATION = 112;
const MAX_CSV_RANGE_BYTES = 16 * 1024 * 1024;
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

export function parseCSV(text, { cutoff = null } = {}) {
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
  const cutoffTime = cutoff instanceof Date ? cutoff.getTime() : Number(cutoff);
  const hasCutoff = cutoff != null && Number.isFinite(cutoffTime);
  const points = [];

  // The MeteoSwiss feed is chronological. Walking a tail response backwards
  // lets us stop as soon as it reaches the requested range instead of parsing
  // values from the older rows in that response.
  for (
    let index = hasCutoff ? lines.length - 1 : 1;
    hasCutoff ? index > 0 : index < lines.length;
    index += hasCutoff ? -1 : 1
  ) {
    const cells = splitCSVRow(lines[index], separator);
    const date = parseDate(cells[timeColumn >= 0 ? timeColumn : 0]);
    if (!date) continue;

    const isBeforeCutoff = hasCutoff && date.getTime() < cutoffTime;
    const values = {};
    for (const [key, columnIndex] of columns) {
      if (columnIndex < 0 || !cells[columnIndex]) continue;
      const number = Number(cells[columnIndex].replace(",", "."));
      if (Number.isFinite(number)) values[key] = number;
    }
    if (Object.keys(values).length || isBeforeCutoff)
      points.push({ date, values });
    if (isBeforeCutoff) break;
  }

  if (hasCutoff) points.reverse();
  return points;
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

export function distanceKm(a, b) {
  const coordinates = [a?.lat, a?.lon, b?.lat, b?.lon];
  if (
    coordinates.some(
      (value) =>
        value == null || value === "" || !Number.isFinite(Number(value)),
    ) ||
    Math.abs(Number(a.lat)) > 90 ||
    Math.abs(Number(b.lat)) > 90 ||
    Math.abs(Number(a.lon)) > 180 ||
    Math.abs(Number(b.lon)) > 180
  )
    return null;
  const radians = (degrees) => (Number(degrees) * Math.PI) / 180;
  const latA = radians(a.lat);
  const latB = radians(b.lat);
  const deltaLat = latB - latA;
  const deltaLon = radians(b.lon) - radians(a.lon);
  const haversine = Math.min(
    1,
    Math.sin(deltaLat / 2) ** 2 +
      Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2,
  );
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function nearestStations(stationList, place, limit = 5) {
  if (!Array.isArray(stationList) || !place) return [];
  return stationList
    .map((station) => ({ station, distanceKm: distanceKm(station, place) }))
    .filter((result) => Number.isFinite(result.distanceKm))
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm ||
        String(a.station.name).localeCompare(String(b.station.name)),
    )
    .slice(0, Math.max(0, limit));
}

function responseHeader(response, name) {
  return response.headers?.get?.(name) || "";
}

function firstCSVLine(text) {
  const lineEnd = text.search(/\r?\n/);
  return lineEnd < 0 ? "" : text.slice(0, lineEnd + 1);
}

function withoutFirstCSVLine(text) {
  const lineEnd = text.search(/\r?\n/);
  return lineEnd < 0
    ? ""
    : text.slice(lineEnd + (text[lineEnd] === "\r" ? 2 : 1));
}

export function createWeatherClient(fetch = globalThis.fetch, now = Date.now) {
  const cache = new Map();
  const cacheVersions = new Map();

  async function fetchCSV(
    station,
    suffix,
    { bypassCache = false, signal, range = "24h" } = {},
  ) {
    signal?.throwIfAborted();
    const key = `${station.code}:${suffix}${suffix === "recent" ? `:${range}` : ""}`;
    const version = cacheVersions.get(station.code) || 0;
    const cached = cache.get(key);
    if (!bypassCache && cached?.expiresAt > now()) return cached.points;
    if (!bypassCache) cache.delete(key);
    const code = station.code.toLowerCase();
    const url = `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/${code}/ogd-smn_${code}_t_${suffix}.csv`;
    const request = (byteRange) =>
      fetch(url, {
        headers: { Range: byteRange },
        mode: "cors",
        signal,
      });
    const checkedText = async (response) => {
      if (!response.ok)
        throw new Error(`Weather data request failed (${response.status})`);
      return response.text();
    };
    let points;
    if (suffix !== "recent" || !Object.hasOwn(RANGE_PRESETS, range)) {
      const response = await fetch(url, { mode: "cors", signal });
      points = parseCSV(await checkedText(response));
    } else {
      const headerResponse = await request(`bytes=0-${CSV_HEADER_RANGE}`);
      const headerText = await checkedText(headerResponse);
      if (headerResponse.status !== 206) {
        points = parseCSV(headerText);
      } else {
        const header = firstCSVLine(headerText);
        if (!header) {
          points = parseCSV(headerText);
        } else {
          const cutoff = now() - RANGE_PRESETS[range].hours * HOUR;
          let byteCount = Math.ceil(
            RANGE_PRESETS[range].hours * 6 * CSV_BYTES_PER_OBSERVATION * 1.5,
          );
          points = [];
          while (byteCount <= MAX_CSV_RANGE_BYTES) {
            signal?.throwIfAborted();
            const totalBytes = Number(
              responseHeader(headerResponse, "content-range").match(
                /\/(\d+)$/,
              )?.[1],
            );
            const tailRange = Number.isFinite(totalBytes)
              ? `bytes=${Math.max(0, totalBytes - byteCount - 1)}-${totalBytes - 1}`
              : `bytes=-${byteCount}`;
            const tailResponse = await request(tailRange);
            const tailText = await checkedText(tailResponse);
            if (tailResponse.status !== 206) {
              points = parseCSV(tailText);
              break;
            }
            const contentRange = responseHeader(tailResponse, "content-range");
            const startsAtBeginning = /^bytes\s+0-/i.test(contentRange);
            const csvText = startsAtBeginning
              ? tailText
              : `${header}${withoutFirstCSVLine(tailText)}`;
            points = parseCSV(csvText, { cutoff: new Date(cutoff) });
            if (
              startsAtBeginning ||
              points.some((point) => point.date.getTime() <= cutoff)
            )
              break;
            if (byteCount === MAX_CSV_RANGE_BYTES) break;
            byteCount = Math.min(byteCount * 2, MAX_CSV_RANGE_BYTES);
          }
        }
      }
    }
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
