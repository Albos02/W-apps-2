const GEOCODE_URL = "https://api3.geo.admin.ch/rest/services/ech/SearchServer";

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity, name) => {
      if (name[0] === "#") {
        const code =
          name[1].toLowerCase() === "x"
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      }
      return (
        {
          amp: "&",
          apos: "'",
          gt: ">",
          lt: "<",
          nbsp: " ",
          quot: '"',
        }[name.toLowerCase()] || entity
      );
    })
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function editDistance(left, right) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let row = 1; row <= left.length; row++) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column++) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + Number(left[row - 1] !== right[column - 1]),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function confidenceFor(query, place) {
  const queryTerms = normalizeSearchText(query).split(" ").filter(Boolean);
  const placeTerms = normalizeSearchText(
    `${place.label} ${place.detail}`,
  ).split(" ");
  if (!queryTerms.length || !placeTerms.length) return 0;
  const similarities = queryTerms.map((term) =>
    Math.max(
      ...placeTerms.map((candidate) => {
        if (candidate === term) return 1;
        if (candidate.startsWith(term) || term.startsWith(candidate))
          return (
            Math.min(term.length, candidate.length) /
            Math.max(term.length, candidate.length)
          );
        if (Math.min(term.length, candidate.length) < 4) return 0;
        return Math.max(
          0,
          1 -
            editDistance(term, candidate) /
              Math.max(term.length, candidate.length),
        );
      }),
    ),
  );
  return Math.round(
    (similarities.reduce((sum, score) => sum + score, 0) /
      similarities.length) *
      100,
  );
}

function normalizePlace(item, query) {
  const attrs = item?.attrs || item?.properties || item || {};
  const lat = Number(attrs.lat ?? attrs.latitude);
  const lon = Number(attrs.lon ?? attrs.lng ?? attrs.longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  const label = cleanText(attrs.label || attrs.name || attrs.detail);
  if (!label) return null;
  const place = {
    label,
    detail: cleanText(attrs.detail),
    lat,
    lon,
    origin: cleanText(attrs.origin),
  };
  return { ...place, confidence: confidenceFor(query, place) };
}

export function createGeocodeClient(fetch = globalThis.fetch) {
  const cache = new Map();

  async function searchPlaces(query, { signal } = {}) {
    const normalizedQuery = String(query || "")
      .trim()
      .toLocaleLowerCase();
    if (!normalizedQuery) return [];
    signal?.throwIfAborted();
    if (cache.has(normalizedQuery)) return cache.get(normalizedQuery);

    const params = new URLSearchParams({
      searchText: String(query).trim(),
      type: "locations",
      sr: "4326",
      limit: "5",
      origins: "gg25,zipcode,gazetteer,address",
    });
    const response = await fetch(`${GEOCODE_URL}?${params}`, {
      mode: "cors",
      signal,
    });
    if (!response.ok)
      throw new Error(`Place search failed (${response.status})`);
    const payload = await response.json();
    signal?.throwIfAborted();
    const seen = new Set();
    const places = (Array.isArray(payload?.results) ? payload.results : [])
      .map((item) => normalizePlace(item, query))
      .filter((place) => {
        if (!place) return false;
        const key = `${place.lat}:${place.lon}:${place.label.toLocaleLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    cache.set(normalizedQuery, places);
    return places;
  }

  return { searchPlaces };
}
