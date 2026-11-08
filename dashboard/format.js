export function esc(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, (char) => entities[char]);
}

export function formatNumber(field, value) {
  if (!Number.isFinite(value)) return "—";
  const digits =
    field.key.startsWith("pressure") || field.key === "direction" ? 0 : 1;
  return value.toFixed(digits);
}

export function formatValue(field, value) {
  return Number.isFinite(value)
    ? `${formatNumber(field, value)}${field.unit}`
    : "—";
}

export function tableUnit(field) {
  return ["temp", "dewpoint"].includes(field.key) ? "°C" : field.unit.trim();
}

export function formatTableValue(field, value) {
  const number = formatNumber(field, value);
  return Number.isFinite(value) && field.unit.trim() === "°"
    ? `${number}°`
    : number;
}

export function directionText(degrees) {
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][index];
}

export function observationsCSV(data, fields) {
  const rows = [
    ["timestamp", "source", ...fields.map((field) => field.label)],
    ...data.map((point) => [
      point.date.toISOString(),
      "MeteoSwiss",
      ...fields.map((field) => point.values[field.key] ?? ""),
    ]),
  ];
  return rows
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
}
