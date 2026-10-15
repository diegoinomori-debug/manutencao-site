import * as XLSX from "xlsx";
function toLocalDateText(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDate(dateString) {
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

function getTodayLocalDate() {
  return parseLocalDate(toLocalDateText());
}

function isExcelFakeDate(value) {
  if (value === undefined || value === null || value === "" || value === 0 || value === "0") return true;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear() <= 1900;
  const text = String(value).trim();
  if (!text) return true;
  return /(^|[^0-9])(1899|1900)[\/\-.年]/.test(text);
}

function pickDateTime(value, fallback = "") {
  const normalized = normalizeDateTime(value);
  if (normalized && !isExcelFakeDate(normalized)) return normalized;
  const fb = normalizeDateTime(fallback);
  return fb && !isExcelFakeDate(fb) ? fb : "";
}

function normalizeDateTime(value) {
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

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).replace(/,/g, "").replace(/円/g, "").replace(/H/g, "").replace(/%/g, "").trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}

function hoursBetween(startValue, endValue) {
  if (!startValue || !endValue) return 0;
  const start = new Date(normalizeDateTime(startValue));
  const end = new Date(normalizeDateTime(endValue));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return Math.max(0, (end - start) / 3600000);
}

function calculateReport(report = {}) {
  const stopExclusionHours = Math.max(0, toNumber(report.stopExclusionHours ?? report.stopExclusionTime, 0));
  const functionDownRateRaw = Math.min(100, Math.max(0, toNumber(report.functionDownRate, 100)));
  const functionDownRate = functionDownRateRaw / 100;

  // 停止時間は「不具合発生」から「生産開始」までを基本にします。
  // Excel側で 1899/12/30 が入った場合は、作業開始・作業完了で補正します。
  const startForStop = pickDateTime(report.troubleDateTime, report.workStartDateTime);
  const endForStop = pickDateTime(report.productionStartDateTime, report.workEndDateTime);
  const stopTimeHours = Math.max(0, (hoursBetween(startForStop, endForStop) - stopExclusionHours) * functionDownRate);

  const workerCount = Math.max(1, toNumber(report.workerCount, 1));
  const laborRate = Math.max(0, toNumber(report.laborRate, 3000));
  const laborBaseHours = Math.max(0, hoursBetween(report.workStartDateTime, report.workEndDateTime) - stopExclusionHours);
  const laborHours = laborBaseHours * workerCount;
  const laborCost = Math.round(laborHours * laborRate);

  const partAmount1 = toNumber(report.partQty1, 0) * toNumber(report.partUnitPrice1, 0);
  const partAmount2 = toNumber(report.partQty2, 0) * toNumber(report.partUnitPrice2, 0);
  const partAmount3 = toNumber(report.partQty3, 0) * toNumber(report.partUnitPrice3, 0);
  const partsCost = Math.round(partAmount1 + partAmount2 + partAmount3 + toNumber(report.partsCostManual, 0));
  const totalCost = Math.round(laborCost + partsCost);

  return {
    stopExclusionHours,
    functionDownRate: functionDownRateRaw,
    stopTimeHours: Number(stopTimeHours.toFixed(2)),
    laborHours: Number(laborHours.toFixed(2)),
    laborCost,
    partAmount1,
    partAmount2,
    partAmount3,
    partsCost,
    totalCost,
  };
}

export { calculateReport };
