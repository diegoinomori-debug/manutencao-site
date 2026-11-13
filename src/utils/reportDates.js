import * as XLSX from "xlsx";

export function toLocalDateText(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseLocalDate(dateString) {
  if (!dateString) return null;
  if (dateString instanceof Date && !Number.isNaN(dateString.getTime())) {
    const d = new Date(dateString);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const text = String(dateString).trim().replace(/\//g, "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);

  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }

  return d;
}

export function normalizeDateTime(value) {
  if (value === undefined || value === null || value === "" || value === 0) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (value.getFullYear() <= 1900) return "";
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    const hh = String(value.getHours()).padStart(2, "0");
    const mi = String(value.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  // Excel serial date/time number support.
  // Example: 46189.354166 -> 2026-06-16T08:30
  if (typeof value === "number") {
    if (value <= 0) return "";
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || parsed.y <= 1900) return "";
    const yyyy = parsed.y;
    const mm = String(parsed.m).padStart(2, "0");
    const dd = String(parsed.d).padStart(2, "0");
    const hh = String(parsed.H || 0).padStart(2, "0");
    const mi = String(parsed.M || 0).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  const text = String(value).trim();
  if (!text || text === "0") return "";
  if (/^(1899|1900)[\/\-.年]/.test(text)) return "";

  // Excel may return strings like 2026/06/16 8:30, 2026-06-16 08:30, 2026年6月16日 8:30
  const normalized = text
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/[時]/g, ":")
    .replace(/[分]/g, "")
    .replace(/\s+/g, " ");

  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const yyyy = match[1];
    const mm = String(match[2]).padStart(2, "0");
    const dd = String(match[3]).padStart(2, "0");
    const hh = String(match[4] || "0").padStart(2, "0");
    const mi = String(match[5] || "0").padStart(2, "0");

    const validDate = parseLocalDate(`${yyyy}-${mm}-${dd}`);
    const hourNumber = Number(hh);
    const minuteNumber = Number(mi);
    if (!validDate || hourNumber > 23 || minuteNumber > 59) return "";

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  const parsed = new Date(normalized.replace(" ", "T"));
  if (!Number.isNaN(parsed.getTime())) {
    return normalizeDateTime(parsed);
  }

  return normalized.replace(" ", "T").slice(0, 16);
}

export function normalizeDateOnly(value) {
  if (value === undefined || value === null || value === "") return "";

  const raw = String(value).trim();
  if (!raw) return "";

  // Normalize Japanese/manual separators first.
  const separated = raw
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/[./]/g, "-")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-");

  // Correct accidental six-digit year produced by some browsers/IME inputs.
  // Example: 202605-05-29 or 202605/05/29 -> 2026-05-29.
  const duplicatedMonth = separated.match(/^(\d{4})(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (duplicatedMonth && duplicatedMonth[2] === String(duplicatedMonth[3]).padStart(2, "0")) {
    const candidate = `${duplicatedMonth[1]}-${String(duplicatedMonth[3]).padStart(2, "0")}-${String(duplicatedMonth[4]).padStart(2, "0")}`;
    const parsed = parseLocalDate(candidate);
    if (parsed && toLocalDateText(parsed) === candidate) return candidate;
  }

  // Accept compact manual entry: 20260529.
  const compact = separated.replace(/[^0-9]/g, "");
  if (/^\d{8}$/.test(compact)) {
    const candidate = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    const parsed = parseLocalDate(candidate);
    if (parsed && toLocalDateText(parsed) === candidate) return candidate;
  }

  // Standard YYYY-M-D / YYYY-MM-DD.
  const standard = separated.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (standard) {
    const candidate = `${standard[1]}-${String(standard[2]).padStart(2, "0")}-${String(standard[3]).padStart(2, "0")}`;
    const parsed = parseLocalDate(candidate);
    if (parsed && toLocalDateText(parsed) === candidate) return candidate;
  }

  const dt = normalizeDateTime(value);
  if (!dt) return "";
  const candidate = dt.slice(0, 10);
  const parsed = parseLocalDate(candidate);
  return parsed && toLocalDateText(parsed) === candidate ? candidate : "";
}

export function reportPeriodDate(row) {
  return normalizeDateOnly(row.createdAt || row.troubleDateTime || row.reportCreatedDate || row.workStartDateTime);
}

export function equipmentHistoryDate(row) {
  return normalizeDateOnly(row.troubleDateTime || row.reportCreatedDate || row.createdAt);
}
