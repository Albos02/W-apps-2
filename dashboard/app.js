(() => {
  const stations = [
    { code: 'PUY', name: 'Pully', canton: 'Vaud', lat: 46.51, lon: 6.67, elevation: 456, temp: 18.4, humidity: 64, wind: 8.6, rain: 0, pressure: 1018, direction: 225, condition: 'Partly cloudy' },
    { code: 'GVE', name: 'Geneva', canton: 'Geneva', lat: 46.25, lon: 6.13, elevation: 420, temp: 19.1, humidity: 59, wind: 10.2, rain: 0, pressure: 1017, direction: 240, condition: 'Mostly sunny' },
    { code: 'BER', name: 'Bern / Zollikofen', canton: 'Bern', lat: 46.99, lon: 7.46, elevation: 553, temp: 17.2, humidity: 68, wind: 6.1, rain: 0.2, pressure: 1016, direction: 205, condition: 'Partly cloudy' },
    { code: 'KLO', name: 'Zürich / Kloten', canton: 'Zürich', lat: 47.48, lon: 8.54, elevation: 426, temp: 17.8, humidity: 62, wind: 7.4, rain: 0, pressure: 1017, direction: 230, condition: 'Partly cloudy' },
    { code: 'BAS', name: 'Basel / Binningen', canton: 'Basel-Stadt', lat: 47.54, lon: 7.58, elevation: 316, temp: 20.3, humidity: 55, wind: 12.4, rain: 0, pressure: 1015, direction: 250, condition: 'Mostly sunny' },
    { code: 'LUG', name: 'Lugano', canton: 'Ticino', lat: 46.0, lon: 8.96, elevation: 273, temp: 21.6, humidity: 61, wind: 5.2, rain: 0, pressure: 1018, direction: 185, condition: 'Sunny intervals' },
    { code: 'SIO', name: 'Sion', canton: 'Valais', lat: 46.22, lon: 7.33, elevation: 482, temp: 20.1, humidity: 48, wind: 4.3, rain: 0, pressure: 1019, direction: 190, condition: 'Sunny' },
    { code: 'DAV', name: 'Davos', canton: 'Graubünden', lat: 46.81, lon: 9.85, elevation: 1594, temp: 11.8, humidity: 70, wind: 9.5, rain: 0, pressure: 1013, direction: 220, condition: 'Cloudy' },
    { code: 'ENG', name: 'Engelberg', canton: 'Obwalden', lat: 46.82, lon: 8.41, elevation: 1036, temp: 13.5, humidity: 72, wind: 6.8, rain: 0.4, pressure: 1015, direction: 210, condition: 'Cloudy' },
    { code: 'NEU', name: 'Neuchâtel', canton: 'Neuchâtel', lat: 47.0, lon: 6.95, elevation: 485, temp: 18.1, humidity: 63, wind: 8.1, rain: 0, pressure: 1016, direction: 230, condition: 'Partly cloudy' },
    { code: 'CHU', name: 'Chur', canton: 'Graubünden', lat: 46.87, lon: 9.53, elevation: 556, temp: 18.9, humidity: 56, wind: 5.8, rain: 0, pressure: 1015, direction: 195, condition: 'Mostly sunny' },
    { code: 'SMA', name: 'Zürich / Fluntern', canton: 'Zürich', lat: 47.38, lon: 8.57, elevation: 604, temp: 14.2, humidity: 66, wind: 11.3, rain: 0, pressure: 1013, direction: 235, condition: 'Cloudy' },
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
  const el = (id) => document.getElementById(id);
  const state = { station: stations[0], group: 'temperature', range: '24h', selectedRow: -1, history: null, current: null, favorites: readStorage('isobar-favorites', []), chartPoint: -1, dragId: null };
  let stationOptions = stations.slice();
  let requestId = 0;

  function readStorage(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; }
  }
  function saveStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing */ } }
  function esc(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

  function renderStationMenu(filter = '') {
    const query = filter.trim().toLocaleLowerCase();
    const matches = stationOptions.filter((station) => `${station.name} ${station.canton} ${station.code}`.toLocaleLowerCase().includes(query));
    const favorites = matches.filter((station) => state.favorites.includes(station.code));
    const others = matches.filter((station) => !state.favorites.includes(station.code));
    const option = (station) => `<button class="station-option" role="option" data-station="${esc(station.code)}" aria-selected="${station.code === state.station.code}"><span>${esc(station.name)}</span><small>${station.code}</small></button>`;
    el('station-menu').innerHTML = `${favorites.length ? `<div class="menu-group-label">FAVORITES</div>${favorites.map(option).join('')}` : ''}${others.map(option).join('') || (!favorites.length ? '<div class="empty-stations">No stations found</div>' : '')}`;
  }
  function openStationMenu() { el('station-menu').classList.add('open'); renderStationMenu(el('station-search').value); }
  function closeStationMenu() { el('station-menu').classList.remove('open'); }

  function renderMetricList() {
    const list = el('metric-list');
    list.innerHTML = metricGroups.map((group) => `<div class="metric-row ${group.id === state.group ? 'selected' : ''}" role="button" tabindex="0" aria-pressed="${group.id === state.group}" draggable="true" data-group="${group.id}" style="--symbol:${group.color};--symbol-bg:${group.bg}"><span class="metric-symbol">${group.symbol}</span><span class="metric-name">${group.name}</span><span class="metric-detail">${group.detail}</span><span class="metric-check">✓</span></div>`).join('');
    list.querySelectorAll('.metric-row').forEach((row) => {
      row.addEventListener('click', () => selectGroup(row.dataset.group));
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectGroup(row.dataset.group); } });
      row.addEventListener('dragstart', (event) => { state.dragId = row.dataset.group; row.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); list.querySelectorAll('.metric-row').forEach((item) => item.classList.remove('drag-over')); });
      row.addEventListener('dragover', (event) => { event.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = metricGroups.findIndex((item) => item.id === state.dragId);
        const to = metricGroups.findIndex((item) => item.id === row.dataset.group);
        if (from < 0 || to < 0 || from === to) return;
        const [item] = metricGroups.splice(from, 1); metricGroups.splice(to, 0, item); saveStorage('isobar-metric-order', metricGroups.map((entry) => entry.id)); renderMetricList();
      });
    });
  }
  function selectGroup(id) { state.group = id; state.chartPoint = -1; renderMetricList(); renderChart(); renderReadings(); }

  function seriesFor(group, station = state.station, count = getPointCount()) {
    const now = Date.now(); const hours = state.range === '24h' ? 24 : state.range === '7d' ? 168 : 720; const interval = hours / (count - 1);
    const seed = station.code.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const center = { temp: station.temp, wind: station.wind, gust: station.wind * 1.58, direction: station.direction, pressure: station.pressure, pressureQFE: station.pressure - 60, pressureQFF: station.pressure + 1, dewpoint: station.temp - (100 - station.humidity) * .17, humidity: station.humidity, rain: station.rain, sunshine: 31, radiation: 365 };
    const hourly = state.range === '24h';
    const amplitude = { temp: hourly ? 3.2 : 4.4, wind: 4.4, gust: 7.1, direction: 55, pressure: 2.7, pressureQFE: 2.7, pressureQFF: 2.7, dewpoint: 2.3, humidity: 8.5, rain: 0.8, sunshine: 23, radiation: 220 };
    return Array.from({ length: count }, (_, index) => {
      const progress = index / (count - 1); const hour = (now - hours * 3600000) + progress * hours * 3600000; const daily = Math.sin((progress * (hourly ? Math.PI * 2 : 3.2) - Math.PI / 2));
      const values = {};
      Object.keys(center).forEach((key) => {
        const noise = Math.sin(index * 1.73 + seed * .13) * amplitude[key] * .21 + Math.cos(index * .51 + seed) * amplitude[key] * .1;
        let value = center[key] + daily * amplitude[key] * (key === 'temp' || key === 'radiation' || key === 'sunshine' ? .6 : .34) + noise;
        if (key === 'rain') value = Math.max(0, (index % 13 === seed % 13 ? station.rain + .5 : station.rain === 0 ? 0 : station.rain * .2));
        if (key === 'sunshine') value = Math.max(0, Math.round(value));
        if (key === 'radiation') value = Math.max(0, Math.round(value));
        values[key] = Math.round(value * 10) / 10;
      });
      const date = new Date(hour); return { date, values };
    });
  }
  function getPointCount() { return state.range === '24h' ? 25 : state.range === '7d' ? 28 : 30; }

  function drawChartPoint() {
    const group = metricGroups.find((item) => item.id === state.group);
    let data = state.history && state.history.length ? state.history : seriesFor(group);
    if (state.history && state.history.length) {
      const rangeMs = (state.range === '24h' ? 24 : state.range === '7d' ? 168 : 720) * 3600000;
      const cutoff = Date.now() - rangeMs;
      const inRange = data.filter((point) => point.date.getTime() >= cutoff);
      if (inRange.length > 1) data = inRange;
      if (data.length > getPointCount()) data = aggregateSeries(data, getPointCount(), group);
    }
    const width = 700, height = 190, left = 38, right = 9, top = 12, bottom = 11;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const fields = group.fields; const valuesFor = (field) => data.map((point) => point.values[field.key] ?? null);
    const firstValues = valuesFor(fields[0]).filter(Number.isFinite); let min = firstValues.length ? Math.min(...firstValues) : 0, max = firstValues.length ? Math.max(...firstValues) : 1;
    if (fields[0].key === 'rain') { min = 0; max = Math.max(1, max); }
    const padding = (max - min || 1) * .2; min -= padding; max += padding;
    const x = (index) => left + index / (data.length - 1) * plotWidth;
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
    const labels = [0, .25, .5, .75, 1].map((fraction) => {
      const date = data[Math.round(fraction * (data.length - 1))].date;
      return state.range === '24h' ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  function formatValue(field, value) { if (!Number.isFinite(value)) return '—'; const places = Math.abs(value) < 10 && field.key !== 'direction' ? 1 : 0; return `${value.toFixed(places)}${field.unit}`; }
  function aggregateSeries(data, count, group) {
    return Array.from({ length: count }, (_, bucket) => {
      const start = Math.floor(bucket * data.length / count);
      const end = Math.max(start + 1, Math.floor((bucket + 1) * data.length / count));
      const points = data.slice(start, end);
      const values = {};
      group.fields.forEach((field) => {
        const nums = points.map((point) => point.values[field.key]).filter(Number.isFinite);
        if (!nums.length) return;
        if (field.key === 'rain' || field.key === 'sunshine') values[field.key] = nums.reduce((sum, value) => sum + value, 0);
        else if (field.key === 'direction') {
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
      const rect = svg.getBoundingClientRect(); const px = (event.clientX - rect.left) / rect.width * 700; state.chartPoint = Math.max(0, Math.min(data.length - 1, Math.round((px - left) / plotWidth * (data.length - 1)))); renderChart();
    };
  }

  function renderReadings() {
    const group = metricGroups.find((item) => item.id === state.group); const data = (state.displayData || seriesFor(group)).slice(-7).reverse();
    const headers = ['Observation time', ...group.fields.map((field) => field.label)];
    el('readings-head').innerHTML = `<tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr>`;
    el('readings-body').innerHTML = data.map((point, index) => `<tr data-point="${state.displayData.length - 1 - index}" class="${state.selectedRow === index ? 'highlighted' : ''}"><td>${point.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} &nbsp; ${point.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>${group.fields.map((field) => `<td><strong>${esc(formatValue(field, point.values[field.key]))}</strong></td>`).join('')}</tr>`).join('');
    el('readings-body').querySelectorAll('tr').forEach((row, index) => row.addEventListener('click', () => { state.selectedRow = index; state.chartPoint = Number(row.dataset.point); renderChart(); renderReadings(); }));
    el('table-summary').textContent = `Showing ${data.length} recent chart points · ${state.station.name}`;
    el('data-source').textContent = state.history ? 'MeteoSwiss observations' : 'Sample observations';
  }
  function renderChart() { drawChartPoint(); renderReadings(); }

  function renderCurrent() {
    const station = state.station, current = state.current || station;
    el('current-station').textContent = station.name;
    el('station-coordinates').textContent = `${station.lat.toFixed(2)}° N   ${station.lon.toFixed(2)}° E`;
    el('station-elevation').textContent = `${station.elevation} m`;
    el('current-temperature').textContent = Number.isFinite(current.temp) ? current.temp.toFixed(1) : '—';
    el('current-wind').innerHTML = Number.isFinite(current.wind) ? `${current.wind.toFixed(1)} <small>km/h</small>` : '—';
    el('current-humidity').innerHTML = Number.isFinite(current.humidity) ? `${Math.round(current.humidity)}<small>%</small>` : '—';
    el('current-rain').innerHTML = Number.isFinite(current.rain) ? `${current.rain.toFixed(1)}<small> mm</small>` : '—';
    el('current-pressure').innerHTML = Number.isFinite(current.pressure) ? `${Math.round(current.pressure)}<small> hPa</small>` : '—';
    el('wind-direction').textContent = Number.isFinite(current.direction) ? directionText(current.direction) : 'Direction unavailable';
    el('weather-description').textContent = state.current ? 'Station measurements' : station.condition;
    el('weather-icon').hidden = Boolean(state.current);
    el('local-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el('last-reading').textContent = current.timestamp ? new Date(current.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sample data';
    el('favorite-toggle').classList.toggle('is-favorite', state.favorites.includes(station.code));
    el('favorite-label').textContent = state.favorites.includes(station.code) ? 'Saved to favorites' : 'Add to favorites';
    el('favorite-toggle').querySelector('.star').textContent = state.favorites.includes(station.code) ? '★' : '☆';
  }
  function directionText(degrees) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(Number(degrees) / 45) % 8]; }

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
  async function fetchCSV(station, suffix) {
    const code = station.code.toLowerCase();
    const url = `https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/${code}/ogd-smn_${code}_t_${suffix}.csv`;
    const response = await fetch(url, { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error(`Weather data request failed (${response.status})`);
    return parseCSV(await response.text());
  }
  async function loadStationData() {
    const id = ++requestId;
    const station = state.station;
    state.chartPoint = -1; state.selectedRow = -1;
    state.current = null; state.history = null; renderCurrent(); renderChart();
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
    if (state.current && historyResult.status === 'fulfilled' && historyResult.value.length) {
      el('feed-status').textContent = 'Live data';
    } else if (state.current || state.history) {
      status.classList.add('offline'); el('feed-status').textContent = 'Partial data';
    } else {
      status.classList.add('offline'); el('feed-status').textContent = 'Sample data';
    }
    renderCurrent(); renderChart();
  }

  async function loadStationList() {
    try {
      const response = await fetch('../assets/coord_station_meteosuisse.json');
      if (!response.ok) return;
      const payload = await response.json(); const rows = Array.isArray(payload) ? payload : payload.stations || payload.features || [];
      const normalized = rows.map((item) => {
        const props = item.properties || item; const code = String(props.code || props.station || props.station_abbr || props.abr || '').toUpperCase();
        const fallback = stations.find((station) => station.code === code);
        if (!code) return null;
        const coords = props.coordinates || item.geometry?.coordinates || [];
        return { ...(fallback || {}), code, name: props.name || props.station_name || fallback?.name || code, canton: props.canton || fallback?.canton || '', lat: Number(props.lat ?? coords[1] ?? fallback?.lat ?? 46.8), lon: Number(props.lon ?? coords[0] ?? fallback?.lon ?? 8.2), elevation: Number(props.altitude ?? props.elevation ?? fallback?.elevation ?? 500), temp: fallback?.temp ?? 16, humidity: fallback?.humidity ?? 65, wind: fallback?.wind ?? 7, rain: fallback?.rain ?? 0, pressure: fallback?.pressure ?? 1016, direction: fallback?.direction ?? 220, condition: fallback?.condition ?? 'Partly cloudy' };
      }).filter(Boolean);
      if (normalized.length) { stationOptions = normalized; renderStationMenu(); }
    } catch { /* bundled station list is optional; use the built-in Swiss station index */ }
  }

  function exportCSV() {
    const group = metricGroups.find((item) => item.id === state.group); const data = state.displayData || seriesFor(group);
    const rows = [['timestamp', 'source', ...group.fields.map((field) => field.label)], ...data.map((point) => [point.date.toISOString(), state.history ? 'MeteoSwiss' : 'Sample', ...group.fields.map((field) => point.values[field.key] ?? '')])];
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
      state.station = station; el('station-search').value = station.name; closeStationMenu(); renderCurrent(); loadStationData();
    });
    document.addEventListener('click', (event) => { if (!el('station-picker').contains(event.target)) closeStationMenu(); });
    el('favorite-toggle').addEventListener('click', () => {
      state.favorites = state.favorites.includes(state.station.code) ? state.favorites.filter((code) => code !== state.station.code) : [...state.favorites, state.station.code];
      saveStorage('isobar-favorites', state.favorites); renderCurrent(); renderStationMenu(el('station-search').value);
    });
    el('theme-toggle').addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; saveStorage('isobar-theme', dark ? 'dark' : 'light'); el('theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    });
    document.querySelectorAll('.range-tab').forEach((button) => button.addEventListener('click', () => {
      state.range = button.dataset.range; state.chartPoint = -1; document.querySelectorAll('.range-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
      el('history').querySelector('.section-kicker').textContent = state.range === '24h' ? 'THE LAST 24 HOURS' : state.range === '7d' ? 'THE LAST 7 DAYS' : 'THE LAST 30 DAYS'; renderChart();
    }));
    el('download-csv').addEventListener('click', exportCSV);
    el('refresh-data').addEventListener('click', loadStationData);
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); el('station-search').focus(); }
      if (event.key === 'Escape') { closeStationMenu(); el('station-search').blur(); }
    });
    window.addEventListener('resize', () => renderChart());
  }

  function restoreMetricOrder() {
    const order = readStorage('isobar-metric-order', []);
    if (order.length) metricGroups.sort((a, b) => { const ai = order.indexOf(a.id), bi = order.indexOf(b.id); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
  }
  function init() {
    const theme = readStorage('isobar-theme', 'light'); document.documentElement.dataset.theme = theme;
    el('theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    restoreMetricOrder(); renderMetricList(); renderStationMenu(); bindEvents(); renderCurrent(); renderChart(); loadStationData(); loadStationList();
    window.setInterval(() => { el('local-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 30000);
    window.setInterval(loadStationData, 10 * 60 * 1000);
  }
  init();
})();
