import test from "node:test";
import assert from "node:assert/strict";
import { createGeocodeClient } from "./geocode.js";

test("queries the Swiss search service and normalizes place results", async () => {
  let requestedUrl;
  const client = createGeocodeClient(async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            attrs: {
              label: "<b>Kloten</b> &amp; Umgebung",
              detail: "Kloten, ZH",
              lat: "47.4587",
              lon: "8.5821",
              origin: "gg25",
            },
          },
          { attrs: { label: "Invalid", lat: 95, lon: 8 } },
          {
            attrs: {
              label: "Kloten & Umgebung",
              detail: "Duplicate",
              lat: 47.4587,
              lon: 8.5821,
            },
          },
        ],
      }),
    };
  });

  const places = await client.searchPlaces("Kloten");
  assert.equal(requestedUrl.searchParams.get("searchText"), "Kloten");
  assert.equal(requestedUrl.searchParams.get("type"), "locations");
  assert.equal(requestedUrl.searchParams.get("sr"), "4326");
  assert.equal(requestedUrl.searchParams.get("limit"), "5");
  assert.equal(
    requestedUrl.searchParams.get("origins"),
    "gg25,zipcode,gazetteer,address",
  );
  assert.deepEqual(places, [
    {
      label: "Kloten & Umgebung",
      detail: "Kloten, ZH",
      lat: 47.4587,
      lon: 8.5821,
      origin: "gg25",
      confidence: 100,
    },
  ]);
});

test("scores fuzzy place-name matches lower than exact matches", async () => {
  const client = createGeocodeClient(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          attrs: {
            label: "Kloten (ZH)",
            detail: "Kloten ZH",
            lat: 47.4587,
            lon: 8.5821,
          },
        },
      ],
    }),
  }));
  const [place] = await client.searchPlaces("Kloton");
  assert.equal(place.confidence, 83);
});

test("caches normalized query results and respects aborted requests", async () => {
  let requests = 0;
  const client = createGeocodeClient(async () => {
    requests++;
    return { ok: true, json: async () => ({ results: [] }) };
  });
  await client.searchPlaces("Geneva");
  await client.searchPlaces(" geneva ");
  assert.equal(requests, 1);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.searchPlaces("Lausanne", { signal: controller.signal }),
    { name: "AbortError" },
  );
  assert.equal(requests, 1);
});

test("reports unsuccessful search responses", async () => {
  const client = createGeocodeClient(async () => ({ ok: false, status: 503 }));
  await assert.rejects(client.searchPlaces("Bern"), /503/);
});
