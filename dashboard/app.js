(() => {
  const stations = [
    { code: 'BOU', name: 'Bouveret', canton: 'Valais', lat: 46.393447, lon: 6.857006, elevation: null },
    { code: 'PUY', name: 'Pully', canton: 'Vaud', lat: 46.51, lon: 6.67, elevation: 456 },
    { code: 'GVE', name: 'Geneva', canton: 'Geneva', lat: 46.25, lon: 6.13, elevation: 420 },
    { code: 'BER', name: 'Bern / Zollikofen', canton: 'Bern', lat: 46.99, lon: 7.46, elevation: 553 },
    { code: 'KLO', name: 'Zürich / Kloten', canton: 'Zürich', lat: 47.48, lon: 8.54, elevation: 426 },
    { code: 'BAS', name: 'Basel / Binningen', canton: 'Basel-Stadt', lat: 47.54, lon: 7.58, elevation: 316 },
    { code: 'LUG', name: 'Lugano', canton: 'Ticino', lat: 46.0, lon: 8.96, elevation: 273 },
    { code: 'SIO', name: 'Sion', canton: 'Valais', lat: 46.22, lon: 7.33, elevation: 482 },
    { code: 'DAV', name: 'Davos', canton: 'Graubünden', lat: 46.81, lon: 9.85, elevation: 1594 },
    { code: 'ENG', name: 'Engelberg', canton: 'Obwalden', lat: 46.82, lon: 8.41, elevation: 1036 },
    { code: 'NEU', name: 'Neuchâtel', canton: 'Neuchâtel', lat: 47.0, lon: 6.95, elevation: 485 },
    { code: 'CHU', name: 'Chur', canton: 'Graubünden', lat: 46.87, lon: 9.53, elevation: 556 },
    { code: 'SMA', name: 'Zürich / Fluntern', canton: 'Zürich', lat: 47.38, lon: 8.57, elevation: 604 },
  ];

  const metricGroups = [
    { id: 'temperature', name: 'Temperature', detail: '°C', symbol: '☼', color: '#d98764', bg: '#fbf0e9', fields: [{ key: 'temp', label: 'Air temperature', color: '#d98764', unit: '°' }] },
    { id: 'wind', name: 'Wind', detail: 'km/h', symbol: '↗', color: '#d88f53', bg: '#fbf1e6', fields: [{ key: 'wind', label: 'Average wind', color: '#df9757', unit: ' km/h' }, { key: 'gust', label: 'Wind gusts', color: '#cf675d', unit: ' km/h' }, { key: 'direction', label: 'Direction', color: '#87918a', unit: '°' }] },
    { id: 'pressure', name: 'Pressure', detail: 'hPa', symbol: '⌁', color: '#68a274', bg: '#eaf4eb', fields: [{ key: 'pressure', label: 'Sea level (QNH)', color: '#68a274', unit: ' hPa' }, { key: 'pressureQFE', label: 'Station (QFE)', color: '#5e8db3', unit: ' hPa' }, { key: 'pressureQFF', label: 'Reduced (QFF)', color: '#58a69b', unit: ' hPa' }] },
    { id: 'dewpoint', name: 'Dewpoint', detail: '°C', symbol: '◌', color: '#71a885', bg: '#ebf4ed', fields: [{ key: 'dewpoint', label: 'Dew point', color: '#71a885', unit: '°' }] },
    { id: 'humidity', name: 'Humidity', detail: '%', symbol: '％', color: '#58a9ad', bg: '#e8f3f1', fields: [{ key: 'humidity', label: 'Relative humidity', color: '#58a9ad', unit: '%' }] },
    { id: 'precipitation', name: 'Precipitation', detail: 'mm', symbol: '◒', color: '#5f8eba', bg: '#ebf1f7', fields: [{ key: 'rain', label: 'Precipitation', color: '#5487b3', unit: ' mm' }] },
    { id: 'sunshine', name: 'Sunshine', detail: 'min', symbol: '◷', color: '#d2a34e', bg: '#f8f3e7', fields: [{ key: 'sunshine', label: 'Sunshine duration', color: '#d2a34e', unit: ' min' }] },
    { id: 'radiation', name: 'Radiation', detail: 'W/m²', symbol: '✳', color: '#ae7954', bg: '#f4eee8', fields: [{ key: 'radiation', label: 'Global radiation', color: '#ae7954', unit: ' W/m²' }] },
  ];

  const params = {
    temp: 'tre200s0', wind: 'fu3010z0', gust: 'fu3010z1', direction: 'dkl010z0', pressure: 'pp0qnhs0', pressureQFE: 'prestas0', pressureQFF: 'pp0qffs0', dewpoint: 'tde200s0', humidity: 'ure200s0', rain: 'rre150z0', sunshine: 'sre000z0', radiation: 'gre000z0',
  };
  const RANGE_PRESETS = {
    '3h': { hours: 3, heading: '3 HOURS' },
    '6h': { hours: 6, heading: '6 HOURS' },
    '12h': { hours: 12, heading: '12 HOURS' },
    '24h': { hours: 24, heading: '24 HOURS' },
    '7d': { hours: 168, heading: '7 DAYS', aggregation: 'triads' },
    '30d': { hours: 720, heading: '30 DAYS', aggregation: 'twoHours' }
  };
  const FEED_CACHE_TTL = 10 * 60 * 1000;
  const el = (id) => document.getElementById(id);
  const savedRange = readStorage('isobar-range', '24h');
  const savedStationCode = readStorage('isobar-station', 'BOU');
  const state = { station: stations.find((station) => station.code === savedStationCode) || stations.find((station) => station.code === 'BOU'), group: 'temperature', range: RANGE_PRESETS[savedRange] ? savedRange : '24h', selectedRow: -1, history: null, current: null, latestObservation: null, acknowledgedObservation: null, newReadingAvailable: false, isRefreshing: false, favorites: readStorage('isobar-favorites', []), hiddenGroups: new Set(readStorage('isobar-hidden-metrics', [])), chartPoint: -1, animateReadings: false, favoriteDrag: null, metricDrag: null };
  let stationOptions = stations.slice();
  let requestId = 0;
  const feedCache = new Map();
  let toastTimer = null;

  function readStorage(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; }
  }
  function saveStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing */ } }
  function esc(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function showToast(message) {
    const toast = el('app-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function renderStationMenu(filter = '') {
    const query = filter.trim().toLocaleLowerCase();
    const matches = stationOptions.filter((station) => `${station.name} ${station.canton} ${station.code}`.toLocaleLowerCase().includes(query));
    const matchedCodes = new Set(matches.map((station) => station.code));
    const favorites = state.favorites.map((code) => stationOptions.find((station) => station.code === code)).filter((station) => station && matchedCodes.has(station.code));
    const others = matches.filter((station) => !state.favorites.includes(station.code));
    const option = (station) => `<button class="station-option" role="option" data-station="${esc(station.code)}" aria-selected="${station.code === state.station.code}"><span>${esc(station.name)}</span><small>${station.code}</small></button>`;
    el('station-menu').innerHTML = `${favorites.length ? `<div class="menu-group-label">FAVORITES</div>${favorites.map(option).join('')}` : ''}${others.map(option).join('') || (!favorites.length ? '<div class="empty-stations">No stations found</div>' : '')}`;
  }
  function openStationMenu() { el('station-menu').classList.add('open'); renderStationMenu(el('station-search').value); }
  function closeStationMenu() { el('station-menu').classList.remove('open'); }
  function renderFavoriteStations() {
    const container = el('favorite-stations');
    if (!container) return;
    const favoriteStations = state.favorites.map((code) => stationOptions.find((station) => station.code === code)).filter(Boolean);
    container.classList.toggle('empty', favoriteStations.length === 0);
    container.innerHTML = favoriteStations.length
      ? favoriteStations.map((station) => `<button class="favorite-station ${station.code === state.station.code ? 'active' : ''}" type="button" draggable="true" data-station="${esc(station.code)}" aria-pressed="${station.code === state.station.code}" aria-label="Switch to ${esc(station.name)}. Use Alt plus arrow keys to reorder." title="Drag to reorder favorites"><span aria-hidden="true">★</span>${esc(station.name)}</button>`).join('')
      : '<span class="favorite-stations-hint">Star a station to keep it close</span>';
    container.querySelectorAll('.favorite-station').forEach((button) => {
      button.addEventListener('dragstart', (event) => {
        state.favoriteDrag = button.dataset.station;
        button.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', state.favoriteDrag);
      });
      button.addEventListener('dragover', (event) => {
        if (!state.favoriteDrag || state.favoriteDrag === button.dataset.station) return;
        event.preventDefault();
        button.classList.add('drop-target');
      });
      button.addEventListener('dragleave', () => button.classList.remove('drop-target'));
      button.addEventListener('drop', (event) => {
        event.preventDefault();
        button.classList.remove('drop-target');
        reorderFavorites(state.favoriteDrag, button.dataset.station);
      });
      button.addEventListener('dragend', () => {
        button.classList.remove('dragging', 'drop-target');
        state.favoriteDrag = null;
      });
      button.addEventListener('keydown', (event) => {
        if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const index = state.favorites.indexOf(button.dataset.station);
        const targetIndex = Math.max(0, Math.min(state.favorites.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
        if (targetIndex !== index) reorderFavorites(button.dataset.station, state.favorites[targetIndex]);
      });
    });
  }
  function reorderFavorites(draggedCode, targetCode) {
    if (!draggedCode || !targetCode || draggedCode === targetCode) return;
    const from = state.favorites.indexOf(draggedCode), to = state.favorites.indexOf(targetCode);
    if (from < 0 || to < 0) return;
    const [code] = state.favorites.splice(from, 1);
    state.favorites.splice(to, 0, code);
    state.favoriteDrag = null;
    saveStorage('isobar-favorites', state.favorites);
    renderFavoriteStations();
    renderStationMenu(el('station-search').value);
    showToast('Favorite order saved');
  }

  function renderConditionMetrics() {
    const grid = el('condition-grid');
    const items = new Map();
    grid.querySelectorAll('.condition-item[data-group]').forEach((item) => {
      const groupItems = items.get(item.dataset.group) || [];
      groupItems.push(item);
      items.set(item.dataset.group, groupItems);
    });
    const primary = metricGroups.find((group) => !state.hiddenGroups.has(group.id)) || metricGroups[0];
    const primarySelect = document.querySelector('.primary-metric-select');
    primarySelect.dataset.group = primary.id;
    primarySelect.style.setProperty('--metric-accent', primary.color);
    primarySelect.setAttribute('aria-label', `Show ${primary.name.toLowerCase()} history`);
    metricGroups.forEach((group) => {
      const groupItems = items.get(group.id) || [];
      groupItems.forEach((item) => {
        item.hidden = state.hiddenGroups.has(group.id) || (group.id === primary.id && item.dataset.keepWhenPrimary !== 'true');
        item.style.setProperty('--metric-accent', group.color);
        grid.appendChild(item);
      });
    });
    updateMetricSelection();
  }
  function updateMetricSelection() {
    document.querySelectorAll('.metric-select').forEach((item) => {
      const selected = item.dataset.group === state.group;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
  }
  function selectGroup(id) {
    if (!metricGroups.some((group) => group.id === id) || state.hiddenGroups.has(id)) return;
    state.group = id;
    state.chartPoint = -1;
    renderConditionMetrics();
    renderChart();
    renderReadings();
    el('history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function saveMetricOrder() { saveStorage('isobar-metric-order', metricGroups.map((group) => group.id)); }
  function renderMetricCustomization() {
    const options = el('customizer-options');
    if (!options) return;
    const visibleCount = metricGroups.filter((group) => !state.hiddenGroups.has(group.id)).length;
    const primary = metricGroups.find((group) => !state.hiddenGroups.has(group.id));
    options.innerHTML = metricGroups.map((group, index) => {
      const visible = !state.hiddenGroups.has(group.id);
      const lastVisible = visible && visibleCount === 1;
      return `<div class="customizer-row ${group.id === primary?.id ? 'primary' : ''}" data-customizer-group="${group.id}" draggable="true" style="--symbol:${group.color};--symbol-bg:${group.bg}"><span class="metric-symbol" aria-hidden="true" title="Drag to reorder">${group.symbol}<span class="customizer-grip" aria-hidden="true">⠿</span></span><label class="customizer-label"><input type="checkbox" data-visibility="${group.id}" ${visible ? 'checked' : ''} ${lastVisible ? 'disabled' : ''}><span>${group.name}${group.id === primary?.id ? ' · main' : ''}</span></label><span class="customizer-detail">${group.detail}</span><span class="customizer-order"><button type="button" data-move="up" data-group="${group.id}" aria-label="Move ${group.name} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move="down" data-group="${group.id}" aria-label="Move ${group.name} down" ${index === metricGroups.length - 1 ? 'disabled' : ''}>↓</button></span></div>`;
    }).join('');
  }
  function setMetricVisibility(groupId, visible) {
    const currentlyVisible = metricGroups.filter((group) => !state.hiddenGroups.has(group.id));
    if (!visible && currentlyVisible.length <= 1) return;
    if (visible) state.hiddenGroups.delete(groupId);
    else state.hiddenGroups.add(groupId);
    saveStorage('isobar-hidden-metrics', [...state.hiddenGroups]);
    if (state.hiddenGroups.has(state.group)) {
      state.group = metricGroups.find((group) => !state.hiddenGroups.has(group.id))?.id || state.group;
      state.chartPoint = -1;
    }
    renderConditionMetrics();
    renderMetricCustomization();
    renderCurrent();
    if (state.hiddenGroups.has(state.group)) return;
    renderChart();
    el('customizer-options').querySelector(`[data-visibility="${groupId}"]`)?.focus();
    showToast(`${visible ? 'Showing' : 'Hiding'} ${metricGroups.find((group) => group.id === groupId)?.name || 'metric'}`);
  }

  function reorderMetricGroup(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const from = metricGroups.findIndex((group) => group.id === draggedId);
    const to = metricGroups.findIndex((group) => group.id === targetId);
    if (from < 0 || to < 0) return;
    const [group] = metricGroups.splice(from, 1);
    metricGroups.splice(to, 0, group);
    saveMetricOrder();
    renderConditionMetrics();
    renderMetricCustomization();
    renderCurrent();
    renderChart();
    showToast(`${group.name} moved ${to < from ? 'up' : 'down'}`);
  }

  function renderRangeSelection() {
    document.querySelectorAll('.range-tab').forEach((tab) => {
      const selected = tab.dataset.range === state.range;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
    el('history').querySelector('.section-kicker').textContent = `THE LAST ${RANGE_PRESETS[state.range].heading}`;
  }

  function renderRefreshCue() {
    const button = el('refresh-data');
    const available = Boolean(state.latestObservation);
    const label = el('refresh-label');
    const timestamp = state.latestObservation;
    button.classList.toggle('has-new-reading', state.newReadingAvailable);
    button.classList.toggle('no-reading', !available);
    button.classList.toggle('is-refreshing', state.isRefreshing);
    button.setAttribute('aria-label', state.newReadingAvailable ? 'Refresh: a newer observation is available' : available ? 'Refresh weather data' : 'Refresh weather data; no observation is available');
    if (label) label.textContent = state.newReadingAvailable ? 'New reading' : 'Refresh';
    const time = el('observation-time');
    time.textContent = timestamp ? `Last reading ${timestamp.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'No observation time available';
    time.title = timestamp ? `Latest observation: ${timestamp.toLocaleString()}` : 'No observation time available';
    el('last-reading').textContent = timestamp ? timestamp.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No current reading';
  }

  function showEmptyChart(group, message) {
    const svg = el('weather-chart');
    svg.setAttribute('viewBox', '0 0 700 250');
    svg.setAttribute('aria-label', `${group.name} observations for ${state.station.name}`);
    svg.innerHTML = '';
    el('chart-empty').textContent = message;
    el('chart-empty').hidden = false;
    el('chart-axis-labels').innerHTML = '';
    el('chart-caption').textContent = group.name.toUpperCase();
    el('chart-current-value').textContent = '—';
    el('chart-change').textContent = '';
    el('chart-legend').innerHTML = '';
    el('chart-tooltip').style.display = 'none';
    state.displayData = [];
  }
  function filterHistoryForRange(data, range, now = Date.now()) {
    const cutoff = now - RANGE_PRESETS[range].hours * 3600000;
    return data.filter((point) => point.date instanceof Date && point.date.getTime() >= cutoff);
  }
  function drawChartPoint() {
    const group = metricGroups.find((item) => item.id === state.group);
    const fields = group.fields;
    let data = filterHistoryForRange(state.history || [], state.range);
    const aggregation = RANGE_PRESETS[state.range].aggregation;
    if (aggregation) data = aggregateSeries(data, group, aggregation);
    const hasMetricData = data.some((point) => fields.some((field) => Number.isFinite(point.values[field.key])));
    if (!hasMetricData) {
      const pending = el('feed-status').textContent === 'Connecting';
      showEmptyChart(group, pending ? 'Waiting for live observations' : `No ${group.name.toLowerCase()} observations available for this range`);
      return;
    }
    el('chart-empty').hidden = true;
    const width = 700, height = 250, left = 38, right = 9, top = 12, bottom = 11;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const valuesFor = (field) => data.map((point) => point.values[field.key] ?? null);
    const firstValues = valuesFor(fields[0]).filter(Number.isFinite); let min = firstValues.length ? Math.min(...firstValues) : 0, max = firstValues.length ? Math.max(...firstValues) : 1;
    if (fields[0].key === 'rain') { min = 0; max = Math.max(1, max); }
    const padding = (max - min || 1) * .2; min -= padding; max += padding;
    const x = (index) => left + (data.length === 1 ? .5 : index / (data.length - 1)) * plotWidth;
    const y = (value, low = min, high = max) => top + (high - value) / (high - low || 1) * plotHeight;
    const grid = [0, .25, .5, .75, 1].map((fraction) => {
      const yy = top + fraction * plotHeight; const value = max - fraction * (max - min);
      return `<line x1="${left}" y1="${yy}" x2="${width}" y2="${yy}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 5"/><text x="0" y="${yy + 3}" fill="var(--faint)" font-size="9" font-family="DM Mono, monospace">${formatTick(value, fields[0])}</text>`;
    }).join('');
    const lineMarkup = fields.map((field, fieldIndex) => {
      const vals = valuesFor(field); const available = vals.filter(Number.isFinite); let low = min, high = max;
      if (!available.length) return '';
      if (fieldIndex > 0 && ['direction'].includes(field.key)) { low = 0; high = 360; }
      else if (fieldIndex > 0) { low = Math.min(...available); high = Math.max(...available); const p = (high - low || 1) * .22; low -= p; high += p; }
      const coords = vals.map((value, index) => Number.isFinite(value) ? `${index > 0 && Number.isFinite(vals[index - 1]) ? 'L' : 'M'} ${x(index)} ${y(value, low, high)}` : '').join(' ');
      const area = fieldIndex === 0 && available.length === vals.length ? `<path d="${coords} L ${x(vals.length - 1)} ${top + plotHeight} L ${x(0)} ${top + plotHeight} Z" fill="url(#chart-fill)"/>` : '';
      const currentX = state.chartPoint >= 0 ? x(state.chartPoint) : null;
      return `${area}<path d="${coords}" fill="none" stroke="${field.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${currentX !== null && Number.isFinite(vals[state.chartPoint]) ? `<circle cx="${currentX}" cy="${y(vals[state.chartPoint], low, high)}" r="4" fill="${field.color}" stroke="var(--surface)" stroke-width="2"/>` : ''}`;
    }).join('');
    const marker = state.chartPoint >= 0 ? `<line x1="${x(state.chartPoint)}" y1="${top}" x2="${x(state.chartPoint)}" y2="${top + plotHeight}" stroke="var(--ink)" stroke-opacity=".2" stroke-dasharray="3 4"/>` : '';
    const svg = el('weather-chart'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.innerHTML = `<defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${fields[0].color}" stop-opacity=".2"/><stop offset="100%" stop-color="${fields[0].color}" stop-opacity="0"/></linearGradient></defs>${grid}${lineMarkup}${marker}<rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" data-chart-area="true"/>`;
    svg.setAttribute('aria-label', `${group.name} observations for ${state.station.name}`);
    const labelPositions = data.length === 1 ? [.5] : [0, .25, .5, .75, 1];
    const labels = labelPositions.map((fraction) => {
      const date = data[Math.round(fraction * (data.length - 1))].date;
      return RANGE_PRESETS[state.range].hours <= 24 ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    });
    el('chart-axis-labels').innerHTML = labels.map((label) => `<span>${esc(label)}</span>`).join('');
    el('chart-caption').textContent = group.name.toUpperCase();
    el('chart-current-value').textContent = formatValue(fields[0], data[data.length - 1].values[fields[0].key]);
    const last = data[data.length - 1].values[fields[0].key], first = data[0].values[fields[0].key];
    const delta = Number.isFinite(last) && Number.isFinite(first) ? last - first : NaN;
    el('chart-change').innerHTML = Number.isFinite(delta) ? `${delta >= 0 ? '↗' : '↘'} ${Math.abs(delta).toFixed(1)}${fields[0].unit} <small>in shown data</small>` : '';
    el('chart-change').style.color = delta >= 0 ? '#0087f2' : '#828282';
    el('chart-legend').innerHTML = fields.map((field) => `<span class="legend-item"><i class="legend-dot" style="background:${field.color}"></i>${field.label}</span>`).join('');
    bindChartHover(data, x, left, plotWidth);
    state.displayData = data;
  }
  function formatTick(value, field) { return `${Math.round(value * 10) / 10}${field.unit === '°' ? '°' : ''}`; }
  function formatNumber(field, value) { if (!Number.isFinite(value)) return '—'; const places = Math.abs(value) < 10 && field.key !== 'direction' ? 1 : 0; return value.toFixed(places); }
  function formatValue(field, value) { return Number.isFinite(value) ? `${formatNumber(field, value)}${field.unit}` : '—'; }
  function tableUnit(field) { return ['temp', 'dewpoint'].includes(field.key) ? '°C' : field.unit.trim(); }
  function formatTableValue(field, value) { const number = formatNumber(field, value); return Number.isFinite(value) && field.unit.trim() === '°' ? `${number}°` : number; }
  function aggregateSeries(data, group, aggregation) {
    const bucketSize = aggregation === 'twoHours' ? 2 * 3600000 : 3600000;
    const byInterval = new Map();
    data.forEach((point) => {
      const interval = Math.floor(point.date.getTime() / bucketSize);
      const bucket = byInterval.get(interval) || [];
      bucket.push(point);
      byInterval.set(interval, bucket);
    });
    let buckets = [...byInterval.values()];
    if (aggregation === 'triads') {
      buckets = buckets.flatMap((hourPoints) => {
        const groups = [];
        for (let index = 0; index < hourPoints.length; index += 3) groups.push(hourPoints.slice(index, index + 3));
        return groups;
      });
    }
    return buckets.map((points) => {
      const values = {};
      group.fields.forEach((field) => {
        const nums = points.map((point) => point.values[field.key]).filter(Number.isFinite);
        if (!nums.length) return;
        if (field.key === 'direction') {
          const radians = nums.map((value) => value * Math.PI / 180);
          const angle = Math.atan2(radians.reduce((sum, value) => sum + Math.sin(value), 0), radians.reduce((sum, value) => sum + Math.cos(value), 0));
          values[field.key] = (angle * 180 / Math.PI + 360) % 360;
        } else values[field.key] = nums.reduce((sum, value) => sum + value, 0) / nums.length;
      });
      const source = points[points.length - 1];
      return { date: source.date, values };
    });
  }
  function bindChartHover(data, x, left, plotWidth) {
    const svg = el('weather-chart'), tooltip = el('chart-tooltip');
    svg.onmousemove = (event) => {
      const rect = svg.getBoundingClientRect(); const px = (event.clientX - rect.left) / rect.width * 700; const point = Math.max(0, Math.min(data.length - 1, Math.round((px - left) / plotWidth * (data.length - 1))));
      const group = metricGroups.find((item) => item.id === state.group); const field = group.fields[0]; const current = data[point];
      tooltip.textContent = `${current.date.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${formatValue(field, current.values[field.key])}`;
      const wrap = el('chart-wrap').getBoundingClientRect(); tooltip.style.left = `${event.clientX - wrap.left}px`; tooltip.style.top = '45px'; tooltip.style.display = 'block';
    };
    svg.onmouseleave = () => { tooltip.style.display = 'none'; };
    svg.onclick = (event) => {
      const rect = svg.getBoundingClientRect(); const px = (event.clientX - rect.left) / rect.width * 700; state.chartPoint = Math.max(0, Math.min(data.length - 1, Math.round((px - left) / plotWidth * (data.length - 1)))); state.selectedRow = data.length - 1 - state.chartPoint; renderChart();
      el('readings-body').querySelector('tr.highlighted')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
  }

  function renderReadings() {
    const group = metricGroups.find((item) => item.id === state.group); const data = (state.displayData || []).slice().reverse();
    const animate = state.animateReadings;
    const headers = ['Observation time', ...group.fields.map((field) => `${field.label} (${tableUnit(field)})`)];
    el('readings-head').innerHTML = `<tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr>`;
    el('readings-body').innerHTML = data.map((point, index) => `<tr data-point="${state.displayData.length - 1 - index}" class="${state.selectedRow === index ? 'highlighted ' : ''}${animate ? 'reading-enter' : ''}" ${animate ? `style="--reading-delay:${index * 45}ms"` : ''}><td>${point.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} &nbsp; ${point.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>${group.fields.map((field) => `<td><strong>${esc(formatTableValue(field, point.values[field.key]))}</strong></td>`).join('')}</tr>`).join('');
    state.animateReadings = false;
    el('readings-body').querySelectorAll('tr').forEach((row, index) => row.addEventListener('click', () => { state.selectedRow = index; state.chartPoint = Number(row.dataset.point); renderChart(); renderReadings(); }));
    el('table-summary').textContent = data.length ? `${data.length} recent chart points · ${state.station.name}` : `No ${group.name.toLowerCase()} readings available for ${state.station.name}`;
    el('data-source').textContent = data.length ? 'MeteoSwiss' : 'No data yet';
  }
  function renderChart() { drawChartPoint(); renderReadings(); }

  function renderCurrent() {
    const station = state.station, current = state.current;
    const primaryGroup = metricGroups.find((group) => !state.hiddenGroups.has(group.id)) || metricGroups[0];
    const primaryField = primaryGroup.fields[0];
    const primaryValue = current?.[primaryField.key];
    const primaryPlaces = primaryField.key === 'direction' ? 0 : Math.abs(primaryValue) < 10 ? 1 : 0;
    el('current-station').textContent = station.name;
    el('station-coordinates').textContent = `${station.lat.toFixed(2)}° N   ${station.lon.toFixed(2)}° E`;
    el('station-elevation').textContent = Number.isFinite(station.elevation) ? `${station.elevation} m` : '—';
    el('current-temperature').textContent = Number.isFinite(primaryValue) ? primaryValue.toFixed(primaryPlaces) : '—';
    el('primary-unit').textContent = primaryField.unit.trim();
    el('primary-metric-label').textContent = primaryGroup.name;
    el('primary-metric-select').dataset.group = primaryGroup.id;
    el('primary-metric-select').setAttribute('aria-label', `Show ${primaryGroup.name.toLowerCase()} history`);
    el('primary-metric-select').style.setProperty('--metric-accent', primaryGroup.color);
    el('weather-icon').textContent = primaryGroup.symbol;
    el('weather-icon').hidden = false;
    el('weather-description').textContent = primaryField.label;
    const primaryTrend = metricTrend(primaryGroup);
    el('primary-trend').textContent = primaryTrend?.text || '';
    el('primary-trend').classList.toggle('unavailable', !primaryTrend);
    el('primary-trend').style.setProperty('--metric-accent', primaryGroup.color);
    el('current-temperature-tile').innerHTML = Number.isFinite(current?.temp) ? `${current.temp.toFixed(1)}<small> °</small>` : '—<small> °</small>';
    el('current-wind').innerHTML = Number.isFinite(current?.wind) ? `${current.wind.toFixed(1)} <small>km/h</small>` : '—<small> km/h</small>';
    el('wind-gust').textContent = Number.isFinite(current?.gust) ? `Gusts ${current.gust.toFixed(1)} km/h` : 'Gusts unavailable';
    el('current-humidity').innerHTML = Number.isFinite(current?.humidity) ? `${Math.round(current.humidity)}<small>%</small>` : '—<small>%</small>';
    el('current-rain').innerHTML = Number.isFinite(current?.rain) ? `${current.rain.toFixed(1)}<small> mm</small>` : '—<small> mm</small>';
    el('current-pressure').innerHTML = Number.isFinite(current?.pressure) ? `${Math.round(current.pressure)}<small> hPa</small>` : '—<small> hPa</small>';
    el('current-dewpoint').innerHTML = Number.isFinite(current?.dewpoint) ? `${current.dewpoint.toFixed(1)}<small> °C</small>` : '—<small> °C</small>';
    el('current-sunshine').innerHTML = Number.isFinite(current?.sunshine) ? `${Math.round(current.sunshine)}<small> min</small>` : '—<small> min</small>';
    el('current-radiation').innerHTML = Number.isFinite(current?.radiation) ? `${Math.round(current.radiation)}<small> W/m²</small>` : '—<small> W/m²</small>';
    el('wind-direction-value').textContent = Number.isFinite(current?.direction) ? `${Math.round(current.direction)}°` : '—';
    el('wind-direction-point').textContent = Number.isFinite(current?.direction) ? directionText(current.direction) : 'Direction unavailable';
    el('wind-arrow').style.transform = Number.isFinite(current?.direction) ? `rotate(${current.direction + 180}deg)` : 'rotate(180deg)';
    metricGroups.forEach((group) => {
      const trend = metricTrend(group);
      const trendElement = el(`trend-${group.id}`);
      trendElement.textContent = trend?.text || '';
      trendElement.classList.toggle('unavailable', !trend);
      trendElement.style.setProperty('--metric-accent', group.color);
    });
    const directionTrend = metricTrendForField({ key: 'direction', unit: '°' });
    const directionTrendElement = el('trend-wind-direction');
    directionTrendElement.textContent = directionTrend?.text || '';
    directionTrendElement.classList.toggle('unavailable', !directionTrend);
    directionTrendElement.style.setProperty('--metric-accent', metricGroups.find((group) => group.id === 'wind').color);
    renderRefreshCue();
    el('favorite-toggle').classList.toggle('is-favorite', state.favorites.includes(station.code));
    el('favorite-toggle').setAttribute('aria-pressed', String(state.favorites.includes(station.code)));
    el('favorite-label').textContent = state.favorites.includes(station.code) ? 'Saved to favorites' : 'Add to favorites';
    el('favorite-toggle').querySelector('.star').textContent = state.favorites.includes(station.code) ? '★' : '☆';
    renderFavoriteStations();
    updateMetricSelection();
  }
  function directionText(degrees) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(Number(degrees) / 45) % 8]; }
  function metricTrend(group) {
    return metricTrendForField(group.fields[0]);
  }
  function metricTrendForField(field) {
    const key = field.key;
    const points = (state.history || []).filter((point) => point.date instanceof Date && Number.isFinite(point.values?.[key]));
    if (state.current?.timestamp instanceof Date && Number.isFinite(state.current[key])) {
      points.push({ date: state.current.timestamp, values: state.current });
    }
    const byTime = new Map(points.map((point) => [point.date.getTime(), point]));
    const ordered = [...byTime.values()].sort((a, b) => a.date - b.date);
    const latest = ordered[ordered.length - 1];
    if (!latest) return null;
    const cutoff = latest.date.getTime() - 60 * 60 * 1000;
    let baseline = null;
    for (let index = ordered.length - 1; index >= 0; index--) {
      if (ordered[index].date.getTime() <= cutoff) { baseline = ordered[index]; break; }
    }
    if (!baseline) return null;
    let delta;
    if (key === 'rain' || key === 'sunshine') {
      delta = ordered.reduce((sum, point) => point.date > baseline.date && point.date <= latest.date ? sum + point.values[key] : sum, 0);
    } else if (key === 'direction') {
      delta = (latest.values[key] - baseline.values[key] + 540) % 360 - 180;
    } else {
      delta = latest.values[key] - baseline.values[key];
    }
    if (!Number.isFinite(delta)) return null;
    const arrow = key === 'direction' ? (delta > 0 ? '↻' : delta < 0 ? '↺' : '→') : (delta > 0 ? '↗' : delta < 0 ? '↘' : '→');
    const value = `${delta > 0 ? '+' : ''}${delta.toFixed(Math.abs(delta) < 10 ? 1 : 0)}${field.unit.trim()}`;
    return { arrow, text: `${arrow} ${value} · 1h`, direction: Math.sign(delta) };
  }

  function parseCSV(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];
    const separator = lines[0].includes(';') ? ';' : ',';
    const split = (line) => line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, ''));
    const header = split(lines[0]).map((name) => name.toLowerCase());
    const timeColumn = header.findIndex((name) => /reference_timestamp|timestamp|time|date/.test(name));
    return lines.slice(1).map((line) => {
      const cells = split(line); const values = {};
      Object.entries(params).forEach(([key, alias]) => {
        const index = header.findIndex((name) => name === alias || name.includes(alias));
        if (index >= 0 && cells[index]?.trim()) { const number = Number(cells[index].replace(',', '.')); if (Number.isFinite(number)) values[key] = number; }
      });
      const rawTime = cells[timeColumn >= 0 ? timeColumn : 0]; const date = parseDate(rawTime);
      return { date, values, raw: cells };
    }).filter((point) => point.date && Object.keys(point.values).length > 0).sort((a, b) => a.date - b.date);
  }
  function parseDate(value) {
    if (!value) return null;
    const swiss = value.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
    if (swiss) return new Date(Date.UTC(Number(swiss[3]), Number(swiss[2]) - 1, Number(swiss[1]), Number(swiss[4]), Number(swiss[5])));
    if (/^\d{12,14}$/.test(value)) return new Date(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)), Number(value.slice(8, 10)), Number(value.slice(10, 12)));
    const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date;
  }
  async function fetchCSV(station, suffix, { bypassCache = false } = {}) {
    const cacheKey = `${station.code}:${suffix}`;
    const cached = feedCache.get(cacheKey);
    if (!bypassCache && cached) {
      if (cached.expiresAt > Date.now()) return cached.points;
      feedCache.delete(cacheKey);
    }
    const code = station.code.toLowerCase();
    const url = `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/${code}/ogd-smn_${code}_t_${suffix}.csv`;
    const response = await fetch(url, { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error(`Weather data request failed (${response.status})`);
    const points = parseCSV(await response.text());
    if (!bypassCache && points.length) feedCache.set(cacheKey, { points, expiresAt: Date.now() + FEED_CACHE_TTL });
    return points;
  }
  function clearStationFeedCache(stationCode) {
    for (const key of feedCache.keys()) {
      if (key.startsWith(`${stationCode}:`)) feedCache.delete(key);
    }
  }
  async function loadStationData({ acknowledge = false, forceRefresh = false } = {}) {
    const id = ++requestId;
    const station = state.station;
    if (forceRefresh) clearStationFeedCache(station.code);
    state.chartPoint = -1; state.selectedRow = -1;
    state.current = null; state.history = null; state.latestObservation = null; state.newReadingAvailable = false; state.isRefreshing = true; renderCurrent(); renderChart();
    const status = el('feed-status').parentElement; status.classList.remove('offline'); el('feed-status').textContent = 'Connecting';
    const results = await Promise.allSettled([fetchCSV(station, 'now'), fetchCSV(station, 'recent')]);
    if (id !== requestId) return;
    const [currentResult, historyResult] = results;
    if (currentResult.status === 'fulfilled' && currentResult.value.length) {
      const point = currentResult.value[currentResult.value.length - 1]; state.current = { ...point.values, timestamp: point.date };
    }
    const points = [...(historyResult.status === 'fulfilled' ? historyResult.value : []), ...(currentResult.status === 'fulfilled' ? currentResult.value : [])];
    const byTime = new Map(points.map((point) => [point.date.getTime(), point]));
    if (byTime.size > 1) state.history = [...byTime.values()].sort((a, b) => a.date - b.date);
    const latest = [...byTime.values()].sort((a, b) => b.date - a.date)[0];
    state.latestObservation = latest?.date || null;
    if (state.latestObservation) {
      if (!state.acknowledgedObservation) state.acknowledgedObservation = state.latestObservation;
      state.newReadingAvailable = state.latestObservation > state.acknowledgedObservation;
      if (acknowledge) {
        state.acknowledgedObservation = state.latestObservation;
        state.newReadingAvailable = false;
      }
    } else {
      state.newReadingAvailable = false;
    }
    if (state.current && historyResult.status === 'fulfilled' && historyResult.value.length) {
      el('feed-status').textContent = 'Live data';
    } else if (state.current || state.history) {
      status.classList.add('offline'); el('feed-status').textContent = 'Partial data';
    } else {
      status.classList.add('offline'); el('feed-status').textContent = 'No live data';
    }
    state.isRefreshing = false;
    state.animateReadings = true;
    renderCurrent(); renderChart();
  }

  async function loadStationList() {
    try {
      const response = await fetch('../assets/coord_station_meteosuisse.json');
      if (!response.ok) return;
      const payload = await response.json(); const rows = Array.isArray(payload) ? payload : payload.stations || payload.features || [];
      const normalized = rows.map((item) => {
        if (Array.isArray(item)) {
          const [rawCode, rawLat, rawLon, name, canton] = item;
          const code = String(rawCode || '').toUpperCase();
          const fallback = stations.find((station) => station.code === code);
          const lat = Number(rawLat), lon = Number(rawLon);
          if (!code || !name || rawLat == null || rawLon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          return { ...(fallback || {}), code, name: String(name).replace(' / ', '/'), canton: canton || fallback?.canton || '', lat, lon, elevation: fallback?.elevation ?? null };
        }
        const props = item.properties || item; const code = String(props.code || props.station || props.station_abbr || props.abr || '').toUpperCase();
        const fallback = stations.find((station) => station.code === code);
        if (!code) return null;
        const coords = props.coordinates || item.geometry?.coordinates || [];
        const elevation = props.altitude ?? props.elevation ?? fallback?.elevation;
        return { ...(fallback || {}), code, name: props.name || props.station_name || fallback?.name || code, canton: props.canton || fallback?.canton || '', lat: Number(props.lat ?? coords[1] ?? fallback?.lat ?? 46.8), lon: Number(props.lon ?? coords[0] ?? fallback?.lon ?? 8.2), elevation: elevation == null ? null : Number(elevation) };
      }).filter(Boolean);
      if (normalized.length) {
        stationOptions = normalized;
        const previousCode = state.station.code;
        const preferredCode = readStorage('isobar-station', 'BOU');
        state.station = stationOptions.find((station) => station.code === preferredCode) || stationOptions.find((station) => station.code === previousCode) || state.station;
        const search = el('station-search');
        if (search) search.value = state.station.name;
        renderStationMenu(); renderFavoriteStations(); renderCurrent();
        if (state.station.code !== previousCode) loadStationData();
      }
    } catch { /* shared station list is optional; use the built-in Swiss station index */ }
  }

  async function checkForNewObservation() {
    const station = state.station;
    try {
      const points = await fetchCSV(station, 'now', { bypassCache: true });
      if (station.code !== state.station.code) return;
      const latest = points[points.length - 1]?.date;
      if (latest && state.latestObservation && latest > state.latestObservation) {
        state.newReadingAvailable = true;
        renderRefreshCue();
      }
    } catch { /* the next manual refresh can retry the live feed */ }
  }

  function exportCSV() {
    const group = metricGroups.find((item) => item.id === state.group); const data = state.displayData || [];
    const rows = [['timestamp', 'source', ...group.fields.map((field) => field.label)], ...data.map((point) => [point.date.toISOString(), state.history ? 'MeteoSwiss' : 'Unavailable', ...group.fields.map((field) => point.values[field.key] ?? '')])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `${state.station.code.toLowerCase()}-${state.group}-${state.range}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  function bindEvents() {
    el('station-search').addEventListener('focus', () => { if (el('station-search').value === state.station.name) el('station-search').select(); openStationMenu(); if (!el('station-search').value || el('station-search').value === state.station.name) renderStationMenu(''); });
    el('station-search').addEventListener('input', (event) => { openStationMenu(); renderStationMenu(event.target.value); });
    el('picker-toggle').addEventListener('click', () => {
      const menu = el('station-menu'); const opening = !menu.classList.contains('open'); menu.classList.toggle('open', opening);
      if (opening) renderStationMenu(el('station-search').value === state.station.name ? '' : el('station-search').value);
    });
    el('station-menu').addEventListener('click', (event) => {
      const option = event.target.closest('[data-station]'); if (!option) return;
      const station = stationOptions.find((item) => item.code === option.dataset.station); if (!station) return;
      state.station = station; saveStorage('isobar-station', station.code); state.acknowledgedObservation = null; state.newReadingAvailable = false; el('station-search').value = station.name; closeStationMenu(); renderCurrent(); loadStationData();
    });
    el('favorite-stations').addEventListener('click', (event) => {
      const button = event.target.closest('[data-station]');
      if (!button) return;
      const station = stationOptions.find((item) => item.code === button.dataset.station);
      if (!station) return;
      state.station = station;
      saveStorage('isobar-station', station.code);
      state.acknowledgedObservation = null;
      state.newReadingAvailable = false;
      el('station-search').value = station.name;
      closeStationMenu();
      renderCurrent();
      loadStationData();
    });
    el('current-card').addEventListener('click', (event) => {
      const metric = event.target.closest('.metric-select[data-group]');
      if (metric) selectGroup(metric.dataset.group);
    });
    el('current-card').addEventListener('keydown', (event) => {
      const metric = event.target.closest('.metric-select[role="button"][data-group]');
      if (metric && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        selectGroup(metric.dataset.group);
      }
    });
    el('customize-metrics').addEventListener('click', () => {
      renderMetricCustomization();
      el('metric-customizer').showModal();
    });
    el('close-customizer').addEventListener('click', () => el('metric-customizer').close());
    el('metric-customizer').addEventListener('click', (event) => {
      if (event.target === el('metric-customizer')) el('metric-customizer').close();
    });
    el('customizer-options').addEventListener('change', (event) => {
      const input = event.target.closest('[data-visibility]');
      if (input) setMetricVisibility(input.dataset.visibility, input.checked);
    });
    el('customizer-options').addEventListener('click', (event) => {
      const button = event.target.closest('[data-move]');
      if (!button || button.disabled) return;
      const index = metricGroups.findIndex((group) => group.id === button.dataset.group);
      const targetIndex = button.dataset.move === 'up' ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= metricGroups.length) return;
      reorderMetricGroup(button.dataset.group, metricGroups[targetIndex].id);
    });
    el('customizer-options').addEventListener('dragstart', (event) => {
      const row = event.target.closest('[data-customizer-group]');
      if (!row || event.target.closest('input,button,label')) { event.preventDefault(); return; }
      state.metricDrag = row.dataset.customizerGroup;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', state.metricDrag);
    });
    el('customizer-options').addEventListener('dragover', (event) => {
      const row = event.target.closest('[data-customizer-group]');
      if (!row || !state.metricDrag || row.dataset.customizerGroup === state.metricDrag) return;
      event.preventDefault();
      el('customizer-options').querySelector('.drop-target')?.classList.remove('drop-target');
      row.classList.add('drop-target');
    });
    el('customizer-options').addEventListener('dragleave', (event) => {
      const row = event.target.closest('[data-customizer-group]');
      if (row && !row.contains(event.relatedTarget)) row.classList.remove('drop-target');
    });
    el('customizer-options').addEventListener('drop', (event) => {
      const row = event.target.closest('[data-customizer-group]');
      if (!row || !state.metricDrag) return;
      event.preventDefault();
      reorderMetricGroup(state.metricDrag, row.dataset.customizerGroup);
      state.metricDrag = null;
    });
    el('customizer-options').addEventListener('dragend', () => {
      state.metricDrag = null;
      el('customizer-options').querySelectorAll('.dragging,.drop-target').forEach((row) => row.classList.remove('dragging', 'drop-target'));
    });
    document.addEventListener('click', (event) => { if (!el('station-picker').contains(event.target)) closeStationMenu(); });
    el('favorite-toggle').addEventListener('click', () => {
      const wasFavorite = state.favorites.includes(state.station.code);
      state.favorites = wasFavorite ? state.favorites.filter((code) => code !== state.station.code) : [...state.favorites, state.station.code];
      saveStorage('isobar-favorites', state.favorites); renderCurrent(); renderStationMenu(el('station-search').value);
      showToast(wasFavorite ? `${state.station.name} removed from favorites` : `${state.station.name} added to favorites`);
    });
    el('theme-toggle').addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; saveStorage('isobar-theme', dark ? 'dark' : 'light'); el('theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    });
    document.querySelectorAll('.range-tab').forEach((button) => button.addEventListener('click', () => {
      state.range = button.dataset.range; state.chartPoint = -1;
      saveStorage('isobar-range', state.range);
      renderRangeSelection(); renderChart();
    }));
    el('download-csv').addEventListener('click', exportCSV);
    el('refresh-data').addEventListener('click', async () => {
      showToast('Refreshing weather observations…');
      await loadStationData({ acknowledge: true, forceRefresh: true });
      const status = el('feed-status').textContent;
      showToast(status === 'Live data' ? 'Weather data is up to date' : `${status} available`);
    });
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); el('station-search').focus(); }
      if (event.key === 'Escape') { closeStationMenu(); el('station-search').blur(); }
    });
    window.addEventListener('resize', () => renderChart());
  }

  function restoreMetricOrder() {
    const order = readStorage('isobar-metric-order', []);
    if (order.length) metricGroups.sort((a, b) => { const ai = order.indexOf(a.id), bi = order.indexOf(b.id); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
    state.hiddenGroups = new Set([...state.hiddenGroups].filter((id) => metricGroups.some((group) => group.id === id)));
    if (state.hiddenGroups.size === metricGroups.length) state.hiddenGroups.delete(metricGroups[0].id);
    state.group = metricGroups.find((group) => !state.hiddenGroups.has(group.id)).id;
  }
  function setupSpotlight() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const track = (item, event) => {
      const bounds = item.getBoundingClientRect();
      item.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
      item.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
    };
    document.querySelectorAll('.current-card, .chart-card, .readings-card, .metric-select').forEach((item) => {
      item.addEventListener('pointermove', (event) => track(item, event));
    });
  }
  function init() {
    const theme = readStorage('isobar-theme', 'light'); document.documentElement.dataset.theme = theme;
    el('theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    restoreMetricOrder(); renderConditionMetrics(); renderMetricCustomization(); renderStationMenu(); bindEvents(); renderRangeSelection(); renderCurrent(); renderChart(); setupSpotlight(); loadStationData(); loadStationList();
    window.requestAnimationFrame(() => {
      const search = el('station-search');
      search.focus({ preventScroll: true });
      search.select();
      closeStationMenu();
    });
    window.setInterval(checkForNewObservation, 30 * 1000);
  }
  init();
})();
