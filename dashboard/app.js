import { RANGE_PRESETS, OBSERVATION_POLL_INTERVAL } from "./config.js";
import { createDashboard } from "./model.js";
import { createChartView } from "./chart.js";
import { esc, formatNumber, formatValue, directionText } from "./format.js";

export function createApp({
  document = globalThis.document,
  window = globalThis.window,
  dashboard: suppliedDashboard,
} = {}) {
  const el = (id) => document.getElementById(id);
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    /* Browser storage may be blocked. */
  }
  const dashboard =
    suppliedDashboard ||
    createDashboard({ storage, onChange: renderDashboard });
  const {
    state,
    metricGroups,
    preferences,
    loadStationData,
    metricTrendForField,
  } = dashboard;
  const { render: renderChart, exportCSV } = createChartView(
    state,
    metricGroups,
    { document, window },
  );
  const primaryGroup = () =>
    metricGroups.find((group) => !state.hiddenGroups.has(group.id));
  let toastTimer;
  let placeSearchTimer;

  function showToast(message) {
    el("app-toast").textContent = message;
    el("app-toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(
      () => el("app-toast").classList.remove("show"),
      2600,
    );
  }

  function renderDashboard() {
    el("feed-status").textContent = state.feedStatus;
    el("feed-status").parentElement.classList.toggle(
      "offline",
      !["Connecting", "Live data"].includes(state.feedStatus),
    );
    if (document.activeElement !== el("station-search"))
      el("station-search").value = state.station.name;
    renderStationMenu();
    renderCurrent();
    renderChart();
  }

  function normalizeSearchText(value) {
    return value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function editDistanceAtMostOne(left, right) {
    if (Math.abs(left.length - right.length) > 1) return false;
    let leftIndex = 0;
    let rightIndex = 0;
    let edits = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
      if (left[leftIndex] === right[rightIndex]) {
        leftIndex++;
        rightIndex++;
        continue;
      }
      if (++edits > 1) return false;
      if (left.length > right.length) leftIndex++;
      else if (right.length > left.length) rightIndex++;
      else {
        if (
          leftIndex + 1 < left.length &&
          left[leftIndex] === right[rightIndex + 1] &&
          left[leftIndex + 1] === right[rightIndex]
        ) {
          leftIndex += 2;
          rightIndex += 2;
        } else {
          leftIndex++;
          rightIndex++;
        }
      }
    }
    return (
      edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1
    );
  }

  function stationScore(station, queryTerms) {
    if (!queryTerms.length) return 0;
    const nameTerms = normalizeSearchText(station.name).split(" ");
    const code = normalizeSearchText(station.code);
    const canton = normalizeSearchText(station.canton);
    let score = 0;

    for (const term of queryTerms) {
      let best = 0;
      if (code === term) best = 100;
      else if (code.startsWith(term)) best = 70;
      else if (code.includes(term)) best = 40;

      if (canton === term) best = Math.max(best, 60);
      else if (canton.startsWith(term)) best = Math.max(best, 35);

      for (const nameTerm of nameTerms) {
        if (nameTerm === term) best = Math.max(best, 80);
        else if (nameTerm.startsWith(term)) best = Math.max(best, 50);
        else if (nameTerm.includes(term)) best = Math.max(best, 30);
        else if (
          term.length >= 4 &&
          nameTerm.length >= 4 &&
          editDistanceAtMostOne(nameTerm, term)
        )
          best = Math.max(best, 20);
      }

      // Treat all query words as constraints so unrelated partial matches
      // don't crowd out the result the user actually described.
      if (!best) return 0;
      score += best;
    }
    return score;
  }

  function stationQuery(input) {
    if (normalizeSearchText(input) === normalizeSearchText(state.station.name))
      return [];
    return normalizeSearchText(input).split(/\s+/).filter(Boolean);
  }

  function getRecentStations() {
    return preferences
      .read("isobar-recent-stations", [])
      .filter((code) =>
        state.stationOptions.some((station) => station.code === code),
      )
      .slice(0, 5);
  }

  function saveRecentStation(code) {
    const recent = getRecentStations().filter(
      (recentCode) => recentCode !== code,
    );
    preferences.save("isobar-recent-stations", [code, ...recent].slice(0, 5));
  }

  function renderStationMenu() {
    const input = el("station-search").value;
    const queryTerms = stationQuery(input);
    const recent = queryTerms.length ? [] : getRecentStations();
    const scored = state.stationOptions.map((station) => ({
      station,
      score: queryTerms.length ? stationScore(station, queryTerms) : 0,
    }));
    const sorted = scored
      .filter((s) => !queryTerms.length || s.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.station.name.localeCompare(b.station.name),
      );
    const matched = sorted.map((s) => s.station);
    const codes = new Set(matched.map((station) => station.code));
    const favorites = state.favorites
      .map((code) =>
        state.stationOptions.find((station) => station.code === code),
      )
      .filter((station) => station && codes.has(station.code));
    const others = matched.filter(
      (station) =>
        !state.favorites.includes(station.code) &&
        !recent.includes(station.code),
    );
    const option = (station) =>
      `<button type="button" class="station-option" role="option" data-station="${esc(station.code)}" aria-selected="${station.code === state.station.code}"><span>${esc(station.name)}</span><small>${esc(station.code)}</small></button>`;
    const nearbyGroups = state.nearbyPlaces
      .map(
        ({ place, stations }) =>
          `<div class="menu-group-label">NEAR ${esc(place.label)} · MATCH ${place.confidence}/100</div>${stations
            .map(
              ({ station, distanceKm }) =>
                `<button type="button" class="station-option nearby-option" role="option" data-station="${esc(station.code)}" aria-selected="${station.code === state.station.code}"><span>${esc(station.name)}</span><small>${esc(place.label)} · ${distanceKm.toFixed(1)} km · ${place.confidence}/100</small></button>`,
            )
            .join("")}`,
      )
      .join("");
    const recentOptions = recent
      .map((code) =>
        state.stationOptions.find((station) => station.code === code),
      )
      .filter((station) => station && !state.favorites.includes(station.code));
    const statuses =
      state.geocodeStatus === "loading"
        ? '<div class="place-status" role="status">Searching for places…</div>'
        : state.geocodeStatus === "error"
          ? '<div class="place-status place-error" role="status">Place not found</div>'
          : "";
    const nearbyAttribution = state.nearbyPlaces.length
      ? '<div class="place-attribution">Places © swisstopo</div>'
      : "";
    const noStations =
      !matched.length &&
      !state.nearbyPlaces.length &&
      state.geocodeStatus !== "loading" &&
      state.geocodeStatus !== "error" &&
      normalizeSearchText(input).length < 3
        ? '<div class="empty-stations">No stations found</div>'
        : "";
    el("station-menu").innerHTML =
      `${recentOptions.length ? `<div class="menu-group-label">RECENT</div>${recentOptions.map(option).join("")}` : ""}${favorites.length ? `<div class="menu-group-label">FAVORITES</div>${favorites.map(option).join("")}` : ""}${others.map(option).join("")}${nearbyGroups}${nearbyAttribution}${statuses}${noStations}`;
    const firstSuggestion = el("station-menu").querySelector("[data-station]");
    firstSuggestion?.classList.add("first-suggestion");
    firstSuggestion?.setAttribute("aria-keyshortcuts", "Enter");
    firstSuggestion?.setAttribute("tabindex", "-1");
  }

  function setStationMenu(open) {
    if (!open) {
      window.clearTimeout?.(placeSearchTimer);
      placeSearchTimer = undefined;
      dashboard.cancelPlaceSearch?.();
    }
    el("station-menu").classList.toggle("open", open);
    el("station-search").setAttribute("aria-expanded", String(open));
    el("picker-toggle").setAttribute("aria-expanded", String(open));
    if (open) renderStationMenu();
  }

  function selectStation(event) {
    const button = event.target.closest("[data-station]");
    if (!button) return;
    setStationMenu(false);
    const station = state.stationOptions.find(
      (item) => item.code === button.dataset.station,
    );
    if (!station) return;
    saveRecentStation(station.code);
    el("station-search").value = station.name;
    dashboard.selectStation(station.code);
  }

  function renderFavorites() {
    const favorites = state.favorites
      .map((code) =>
        state.stationOptions.find((station) => station.code === code),
      )
      .filter(Boolean);
    el("favorite-stations").classList.toggle("empty", favorites.length === 0);
    el("favorite-stations").innerHTML = favorites
      .map(
        (station) =>
          `<button class="favorite-station ${station.code === state.station.code ? "active" : ""}" type="button" draggable="true" data-station="${esc(station.code)}" aria-pressed="${station.code === state.station.code}" aria-label="Switch to ${esc(station.name)}. Use Alt plus arrow keys to reorder." title="Drag to reorder favorites"><span aria-hidden="true">★</span>${esc(station.name)}</button>`,
      )
      .join("");
    const saved = state.favorites.includes(state.station.code);
    el("favorite-toggle").classList.toggle("is-favorite", saved);
    el("favorite-toggle").setAttribute("aria-pressed", String(saved));
    el("favorite-label").textContent = saved
      ? "Saved to favorites"
      : "Add to favorites";
    el("favorite-toggle").querySelector(".star").textContent = saved
      ? "★"
      : "☆";
  }

  function reorder(items, from, to) {
    if (from < 0 || to < 0 || from === to || to >= items.length) return false;
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    return true;
  }

  function reorderFavorites(fromCode, toCode) {
    if (
      !reorder(
        state.favorites,
        state.favorites.indexOf(fromCode),
        state.favorites.indexOf(toCode),
      )
    )
      return;
    preferences.save("isobar-favorites", state.favorites);
    state.favoriteDrag = null;
    renderFavorites();
    renderStationMenu();
    showToast("Favorite order saved");
  }

  // Current conditions and metric customization.
  function renderMetricSelection() {
    document.querySelectorAll(".metric-select").forEach((item) => {
      const selected = item.dataset.group === state.group;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
  }

  function renderConditionMetrics() {
    const grid = el("condition-grid");
    for (const group of metricGroups) {
      let items = [...grid.querySelectorAll("[data-group]")].filter(
        (item) => item.dataset.group === group.id,
      );
      if (!items.length) {
        const item = document.createElement("button");
        item.className = "condition-item metric-select";
        item.type = "button";
        item.dataset.group = group.id;
        item.setAttribute(
          "aria-label",
          `Show ${group.name.toLowerCase()} history`,
        );
        item.innerHTML = `<span class="condition-icon" aria-hidden="true">${esc(group.symbol)}</span><span class="condition-label">${esc(group.name)}</span><strong></strong><span class="condition-meta"><span class="condition-note">${esc(group.fields[0].label)}</span><span class="condition-trend"></span></span>`;
        items = [item];
      }
      items.forEach((item) => {
        item.hidden =
          state.hiddenGroups.has(group.id) ||
          (group.id === primaryGroup().id &&
            item.dataset.keepWhenPrimary !== "true");
        item.style.setProperty("--metric-accent", group.color);
        grid.appendChild(item);
      });
    }
    renderMetricSelection();
  }

  function selectGroup(id) {
    if (
      !metricGroups.some((group) => group.id === id) ||
      state.hiddenGroups.has(id)
    )
      return;
    state.group = id;
    state.chartPoint = -1;
    renderMetricSelection();
    renderChart();
    el("history").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderCustomizer() {
    const visibleCount = metricGroups.filter(
      (group) => !state.hiddenGroups.has(group.id),
    ).length;
    el("customizer-options").innerHTML = metricGroups
      .map((group, index) => {
        const visible = !state.hiddenGroups.has(group.id);
        const primary = group.id === primaryGroup().id;
        return `<div class="customizer-row ${primary ? "primary" : ""}" data-customizer-group="${group.id}" draggable="true" style="--symbol:${group.color};--symbol-bg:${group.bg}"><span class="metric-symbol" aria-hidden="true" title="Drag to reorder">${group.symbol}<span class="customizer-grip">⠿</span></span><label class="customizer-label"><input type="checkbox" data-visibility="${group.id}" ${visible ? "checked" : ""} ${visible && visibleCount === 1 ? "disabled" : ""}><span>${group.name}${primary ? " · main" : ""}</span></label><span class="customizer-detail">${group.detail}</span><span class="customizer-order"><button type="button" data-move="up" data-group="${group.id}" aria-label="Move ${group.name} up" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move="down" data-group="${group.id}" aria-label="Move ${group.name} down" ${index === metricGroups.length - 1 ? "disabled" : ""}>↓</button></span></div>`;
      })
      .join("");
  }

  function updateMetrics() {
    renderConditionMetrics();
    renderCustomizer();
    renderCurrent();
    renderChart();
  }

  function setMetricVisibility(id, visible) {
    if (
      !visible &&
      metricGroups.filter((group) => !state.hiddenGroups.has(group.id))
        .length <= 1
    )
      return;
    if (visible) state.hiddenGroups.delete(id);
    else state.hiddenGroups.add(id);
    preferences.save("isobar-hidden-metrics", [...state.hiddenGroups]);
    if (state.hiddenGroups.has(state.group)) {
      state.group = primaryGroup().id;
      state.chartPoint = -1;
    }
    updateMetrics();
    el("customizer-options")
      .querySelector(`[data-visibility="${id}"]`)
      ?.focus();
    showToast(
      `${visible ? "Showing" : "Hiding"} ${metricGroups.find((group) => group.id === id).name}`,
    );
  }

  function reorderMetrics(fromId, toId) {
    const from = metricGroups.findIndex((group) => group.id === fromId);
    const to = metricGroups.findIndex((group) => group.id === toId);
    if (!reorder(metricGroups, from, to)) return;
    preferences.save(
      "isobar-metric-order",
      metricGroups.map((group) => group.id),
    );
    updateMetrics();
    showToast(`${metricGroups[to].name} moved ${to < from ? "up" : "down"}`);
  }

  function renderTrend(element, field, color) {
    if (!element) return;
    const trend = metricTrendForField(field);
    element.textContent = trend?.text || "";
    element.classList.toggle("unavailable", !trend);
    element.style.setProperty("--metric-accent", color);
  }

  function renderRefreshCue() {
    const timestamp = state.latestObservation;
    const button = el("refresh-data");
    button.classList.toggle("has-new-reading", state.newReadingAvailable);
    button.classList.toggle("no-reading", !timestamp);
    button.classList.toggle("is-refreshing", state.isRefreshing);
    button.setAttribute("aria-busy", String(state.isRefreshing));
    button.setAttribute(
      "aria-label",
      state.newReadingAvailable
        ? "Refresh: a newer observation is available"
        : timestamp
          ? "Refresh weather data"
          : "Refresh weather data; no observation is available",
    );
    el("refresh-label").textContent = state.newReadingAvailable
      ? "New reading"
      : "Refresh";
    const formatted = timestamp?.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    el("observation-time").textContent = timestamp
      ? `Last reading ${formatted}`
      : "No observation time available";
    el("observation-time").title = timestamp
      ? `Latest observation: ${timestamp.toLocaleString()}`
      : "No observation time available";
    el("last-reading").textContent = formatted || "No current reading";
  }

  function renderCurrent() {
    const { station, current } = state;
    const primary = primaryGroup();
    const field = primary.fields[0];
    el("current-station").textContent = station.name;
    el("station-coordinates").textContent =
      `${station.lat.toFixed(2)}° N   ${station.lon.toFixed(2)}° E`;
    el("station-elevation").textContent = Number.isFinite(station.elevation)
      ? `${station.elevation} m`
      : "—";
    el("current-temperature").textContent = formatNumber(
      field,
      current?.[field.key],
    );
    el("primary-unit").textContent = field.unit.trim();
    el("primary-metric-label").textContent = primary.name;
    el("primary-metric-select").dataset.group = primary.id;
    el("primary-metric-select").setAttribute(
      "aria-label",
      `Show ${primary.name.toLowerCase()} history`,
    );
    el("primary-metric-select").style.setProperty(
      "--metric-accent",
      primary.color,
    );
    el("weather-icon").textContent = primary.symbol;
    el("weather-description").textContent = field.label;
    renderTrend(el("primary-trend"), field, primary.color);

    for (const tile of el("condition-grid").querySelectorAll("[data-group]")) {
      const group = metricGroups.find(
        (group) => group.id === tile.dataset.group,
      );
      if (!group) continue;
      const field =
        tile.dataset.keepWhenPrimary === "true"
          ? group.fields.find((field) => field.key === "direction")
          : group.fields[0];
      if (!field) continue;
      tile.querySelector("strong").innerHTML =
        `${esc(formatNumber(field, current?.[field.key]))}<small>${esc(field.unit)}</small>`;
      renderTrend(tile.querySelector(".condition-trend"), field, group.color);
    }
    const wind = metricGroups.find((group) => group.id === "wind");
    const gust = wind?.fields.find((field) => field.key === "gust");
    if (el("wind-gust"))
      el("wind-gust").textContent =
        gust && Number.isFinite(current?.gust)
          ? `Gusts ${formatValue(gust, current.gust)}`
          : "Gusts unavailable";
    const direction = current?.direction;
    if (el("wind-direction-point"))
      el("wind-direction-point").textContent = Number.isFinite(direction)
        ? directionText(direction)
        : "Direction unavailable";
    if (el("wind-arrow"))
      el("wind-arrow").style.transform =
        `rotate(${Number.isFinite(direction) ? direction + 180 : 180}deg)`;
    renderRefreshCue();
    renderFavorites();
    renderMetricSelection();
  }

  function renderRange() {
    document.querySelectorAll(".range-tab").forEach((button) => {
      const selected = button.dataset.range === state.range;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    el("history").querySelector(".section-kicker").textContent =
      `THE LAST ${RANGE_PRESETS[state.range].heading}`;
  }

  function setTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    el("theme-toggle").setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme",
    );
  }

  // Delegation keeps handlers stable when lists and cards are re-rendered.
  function bindStationEvents() {
    el("station-search").addEventListener("focus", () => {
      if (el("station-search").value === state.station.name)
        el("station-search").select();
      setStationMenu(true);
    });
    el("station-search").addEventListener("input", () => {
      setStationMenu(true);
      window.clearTimeout?.(placeSearchTimer);
      dashboard.clearPlaceSearch?.();
      const query = el("station-search").value.trim();
      if (
        normalizeSearchText(query).length < 3 ||
        normalizeSearchText(query) === normalizeSearchText(state.station.name)
      )
        return;
      placeSearchTimer = window.setTimeout(() => {
        placeSearchTimer = undefined;
        dashboard.searchPlace(query);
      }, 450);
    });
    el("station-search").addEventListener("keydown", (event) => {
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        el("station-menu").classList.contains("open")
      ) {
        const suggestions =
          el("station-menu").querySelectorAll("[data-station]");
        const nextSuggestion = suggestions[1] || suggestions[0];
        if (nextSuggestion) {
          event.preventDefault();
          suggestions[0]?.classList.remove("first-suggestion");
          suggestions[0]?.setAttribute("aria-selected", "false");
          nextSuggestion.focus();
          return;
        }
      }
      if (
        event.key === "Enter" &&
        el("station-menu").classList.contains("open")
      ) {
        event.preventDefault();
        const firstOption = () =>
          el("station-menu").querySelector("[data-station]");
        const option = firstOption();
        if (option) {
          option.click();
          return;
        }
        const selectFirstSuggestion = () => {
          if (
            el("station-search").value.trim() !== input ||
            !el("station-menu").classList.contains("open")
          )
            return;
          firstOption()?.click();
        };
        const input = el("station-search").value.trim();
        if (state.nearbyPlaces.length || state.nearbyStations.length) {
          selectFirstSuggestion();
        } else if (state.geocodeStatus === "loading") {
          dashboard.searchPlace(input).then(selectFirstSuggestion);
        } else if (normalizeSearchText(input).length >= 3) {
          window.clearTimeout?.(placeSearchTimer);
          placeSearchTimer = undefined;
          dashboard.searchPlace(input).then(selectFirstSuggestion);
        }
      }
    });
    el("picker-toggle").addEventListener("click", () =>
      setStationMenu(!el("station-menu").classList.contains("open")),
    );
    el("station-menu").addEventListener("keydown", (event) => {
      const suggestions = el("station-menu").querySelectorAll("[data-station]");
      const firstTabStop = suggestions[1] || suggestions[0];
      if (
        event.key === "Tab" &&
        event.shiftKey &&
        event.target === firstTabStop
      ) {
        event.preventDefault();
        el("station-search").focus();
      }
    });
    el("station-menu").addEventListener("click", selectStation);
    el("favorite-stations").addEventListener("click", selectStation);
    document.addEventListener("click", (event) => {
      if (!el("station-picker").contains(event.target)) setStationMenu(false);
    });
    el("favorite-toggle").addEventListener("click", () => {
      const saved = state.favorites.includes(state.station.code);
      state.favorites = saved
        ? state.favorites.filter((code) => code !== state.station.code)
        : [...state.favorites, state.station.code];
      preferences.save("isobar-favorites", state.favorites);
      renderFavorites();
      renderStationMenu();
      showToast(
        `${state.station.name} ${saved ? "removed from" : "added to"} favorites`,
      );
    });
    el("favorite-stations").addEventListener("keydown", (event) => {
      const button = event.target.closest("[data-station]");
      if (
        !button ||
        !event.altKey ||
        !["ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      event.preventDefault();
      const index = state.favorites.indexOf(button.dataset.station);
      const target = index + (event.key === "ArrowLeft" ? -1 : 1);
      reorderFavorites(button.dataset.station, state.favorites[target]);
      el("favorite-stations")
        .querySelector(`[data-station="${button.dataset.station}"]`)
        ?.focus();
    });
  }

  function bindMetricEvents() {
    el("current-card").addEventListener("click", (event) => {
      const metric = event.target.closest(".metric-select[data-group]");
      if (metric) selectGroup(metric.dataset.group);
    });
    el("current-card").addEventListener("keydown", (event) => {
      const metric = event.target.closest('.metric-select[role="button"]');
      if (metric && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        selectGroup(metric.dataset.group);
      }
    });
    el("customize-metrics").addEventListener("click", () => {
      renderCustomizer();
      el("metric-customizer").showModal();
    });
    el("close-customizer").addEventListener("click", () =>
      el("metric-customizer").close(),
    );
    el("metric-customizer").addEventListener("click", (event) => {
      if (event.target === el("metric-customizer"))
        el("metric-customizer").close();
    });
    el("customizer-options").addEventListener("change", (event) => {
      const input = event.target.closest("[data-visibility]");
      if (input) setMetricVisibility(input.dataset.visibility, input.checked);
    });
    el("customizer-options").addEventListener("click", (event) => {
      const button = event.target.closest("[data-move]");
      if (!button || button.disabled) return;
      const index = metricGroups.findIndex(
        (group) => group.id === button.dataset.group,
      );
      const target = index + (button.dataset.move === "up" ? -1 : 1);
      reorderMetrics(button.dataset.group, metricGroups[target]?.id);
      el("customizer-options")
        .querySelector(
          `[data-move="${button.dataset.move}"][data-group="${button.dataset.group}"]`,
        )
        ?.focus();
    });
  }

  function bindReordering(
    container,
    selector,
    dataKey,
    dragKey,
    move,
    ignoreControls = false,
  ) {
    container.addEventListener("dragstart", (event) => {
      const item = event.target.closest(selector);
      if (
        !item ||
        (ignoreControls && event.target.closest("input,button,label"))
      ) {
        event.preventDefault();
        return;
      }
      state[dragKey] = item.dataset[dataKey];
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state[dragKey]);
    });
    container.addEventListener("dragover", (event) => {
      const item = event.target.closest(selector);
      if (!item || !state[dragKey] || item.dataset[dataKey] === state[dragKey])
        return;
      event.preventDefault();
      container.querySelector(".drop-target")?.classList.remove("drop-target");
      item.classList.add("drop-target");
    });
    container.addEventListener("dragleave", (event) => {
      const item = event.target.closest(selector);
      if (item && !item.contains(event.relatedTarget))
        item.classList.remove("drop-target");
    });
    container.addEventListener("drop", (event) => {
      const item = event.target.closest(selector);
      if (!item || !state[dragKey]) return;
      event.preventDefault();
      move(state[dragKey], item.dataset[dataKey]);
      state[dragKey] = null;
      container
        .querySelectorAll(".dragging,.drop-target")
        .forEach((node) => node.classList.remove("dragging", "drop-target"));
    });
    container.addEventListener("dragend", () => {
      state[dragKey] = null;
      container
        .querySelectorAll(".dragging,.drop-target")
        .forEach((node) => node.classList.remove("dragging", "drop-target"));
    });
  }

  function bindEvents() {
    bindStationEvents();
    bindMetricEvents();
    bindReordering(
      el("favorite-stations"),
      "[data-station]",
      "station",
      "favoriteDrag",
      reorderFavorites,
    );
    bindReordering(
      el("customizer-options"),
      "[data-customizer-group]",
      "customizerGroup",
      "metricDrag",
      reorderMetrics,
      true,
    );
    el("theme-toggle").addEventListener("click", () => {
      const theme =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      setTheme(theme);
      preferences.save("isobar-theme", theme);
    });
    document.querySelectorAll(".range-tab").forEach((button) =>
      button.addEventListener("click", () => {
        state.range = button.dataset.range;
        state.chartPoint = -1;
        preferences.save("isobar-range", state.range);
        renderRange();
        renderChart();
      }),
    );
    el("download-csv").addEventListener("click", exportCSV);
    el("refresh-data").addEventListener("click", async () => {
      showToast("Refreshing weather observations…");
      await loadStationData({ acknowledge: true, forceRefresh: true });
      showToast(
        state.feedStatus === "Live data"
          ? "Weather data is up to date"
          : `${state.feedStatus} available`,
      );
    });
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        el("station-search").focus();
      }
      if (event.key === "Escape") {
        setStationMenu(false);
        el("station-search").blur();
      }
      if (event.key === "ArrowDown" && event.target === el("station-search")) {
        event.preventDefault();
        setStationMenu(true);
        el("station-menu")
          .querySelector("[data-station], [data-place]")
          ?.focus();
      }
    });
  }

  function setupSpotlight() {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    document
      .querySelectorAll(
        ".current-card,.chart-card,.readings-card,.metric-select",
      )
      .forEach((item) => {
        item.addEventListener("pointermove", (event) => {
          const bounds = item.getBoundingClientRect();
          item.style.setProperty(
            "--spotlight-x",
            `${event.clientX - bounds.left}px`,
          );
          item.style.setProperty(
            "--spotlight-y",
            `${event.clientY - bounds.top}px`,
          );
        });
      });
  }

  function init() {
    setTheme(preferences.read("isobar-theme", "light"));
    renderConditionMetrics();
    renderCustomizer();
    renderRange();
    renderDashboard();
    bindEvents();
    setupSpotlight();
    loadStationData();
    dashboard.loadStationList();
    window.requestAnimationFrame(() => {
      el("station-search").focus({ preventScroll: true });
      el("station-search").select();
      setStationMenu(false);
    });
    window.setInterval(
      dashboard.checkForNewObservation,
      OBSERVATION_POLL_INTERVAL,
    );
  }

  return { init, render: renderDashboard };
}

if (typeof document !== "undefined") createApp().init();
