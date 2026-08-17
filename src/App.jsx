import React, { useEffect, useMemo, useRef, useState } from "react";
// V14: 日本語IME対応、設備選択、日付入力補正、次回実施日・残り日数の即時計算を安定化。
import * as XLSX from "xlsx";

import {
  Plus,
  Trash2,
  Search,
  Home,
  Wrench,
  CalendarDays,
  FileText,
  Package,
  Hammer,
  Bot,
  Save,
  X,
  Printer,
  Download,
  QrCode,
  ShieldCheck,
  AlertTriangle,
  BarChart3,
  FileSpreadsheet,
  Users,
  UserPlus,
  RefreshCw,
} from "lucide-react";
import "./index.css";
import "./components/HomeDashboard.css";
import { db, auth } from "./firebase";
import { initializeApp, deleteApp, getApp } from "firebase/app";
import { askMiyamaAI } from "./services/miyamaAI";
import { searchHistory } from "./services/historySearch";
import SimilarProblems from "./components/SimilarProblems";
import LoginScreen from "./components/LoginScreen";

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signOut, getAuth, createUserWithEmailAndPassword } from "firebase/auth";

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

function addDays(dateString, days) {
  if (!dateString || days === undefined || days === null || days === "") return "";
  const date = parseLocalDate(dateString);
  if (!date) return "";
  date.setDate(date.getDate() + Number(days));
  return toLocalDateText(date);
}

function diffDays(dateString) {
  if (!dateString) return "";
  const target = parseLocalDate(dateString);
  if (!target) return "";
  return Math.ceil((target - getTodayLocalDate()) / (1000 * 60 * 60 * 24));
}

function getStatus(daysLeft) {
  if (daysLeft === "") return "未入力";
  if (daysLeft < 0) return "交換超過";
  if (daysLeft <= 7) return "交換間近";
  return "正常";
}

function todayText() {
  return toLocalDateText();
}

function createBlankReport() {
  return {
    reportTitle: "保全作業報告書",
    reportType: "保全作業報告書",
    createdAt: todayText(),
    maintenanceType: "CM",

    troubleDateTime: "",
    workStartDateTime: "",
    workEndDateTime: "",
    productionStartDateTime: "",
    stopExclusionHours: 0,
    stopExclusionTime: "0",
    functionDownRate: 100,
    stopTimeHours: 0,

    groupName: "",
    lineName: "",
    equipment: "",

    phenomenon: "",
    troublePoint: "",
    why1: "",
    why2: "",
    why3: "",
    action: "",
    linkUrl: "",

    recurrenceCategory: "必要",
    recurrenceStatus: "未実施",
    recurrencePrevention: "",
    outflowPrevention: "",
    changeRank: "",
    fpInspection: "点検不要",

    worker: "",
    workerCount: 1,
    laborRate: 3000,
    laborHours: 0,
    laborCost: 0,

    replacedPart: "",
    stockQty: "",
    partQty1: "",
    partUnitPrice1: "",
    partName1: "",
    partQty2: "",
    partUnitPrice2: "",
    partName2: "",
    partQty3: "",
    partUnitPrice3: "",
    partName3: "",
    partsCost: 0,
    totalCost: 0,

    approvalStatus: "下書き",
    dbInputBy: "",
    approvedBy: "",
    inspectedBy: "",
    createdBy: "",
    dbInputDate: "",
    approvedDate: "",
    inspectedDate: "",
    reportCreatedDate: todayText(),

    beforeImage: "",
    afterImage: "",
    image: "",
    note: "",
  };
}

function createBlankPlannedWork(date = "") {
  return {
    date: date || todayText(),
    endDate: "",
    title: "",
    equipment: "",
    purpose: "",
    detail: "",
    owner: "",
    status: "計画中",
    progress: 0,
    risk: "",
    note: "",
    image: "",
  };
}

function createBlankCalendarEvent(date = "") {
  return {
    date: date || todayText(),
    time: "",
    title: "",
    detail: "",
    owner: "",
    importance: "通常",
    category: "定期保全",
    image: "",
  };
}

function containsAll(text, keywords) {
  const target = String(text || "").toLowerCase();
  return keywords.every((keyword) => target.includes(keyword));
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

function sanitizeReportDates(report = {}) {
  const workStart = pickDateTime(report.workStartDateTime);
  const workEnd = pickDateTime(report.workEndDateTime);
  const productionStart = pickDateTime(report.productionStartDateTime, workEnd);
  const trouble = pickDateTime(report.troubleDateTime, workStart);
  const cleaned = {
    ...report,
    troubleDateTime: trouble,
    workStartDateTime: workStart,
    workEndDateTime: workEnd,
    productionStartDateTime: productionStart,
  };
  return { ...cleaned, ...calculateReport(cleaned) };
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

function getValidDatePart(value) {
  const dt = normalizeDateTime(value);
  if (!dt) return "";
  const datePart = dt.slice(0, 10);
  // Excel time-only cells can become 1899-12-30 / 1899-12-31.
  // These are not real dates for our reports, so do not use them as a base date.
  if (datePart.startsWith("1899-") || datePart.startsWith("1900-")) return "";
  return datePart;
}

function excelDateTime(value, baseValue = "") {
  if (value === undefined || value === null || value === "" || value === 0) return "";

  const baseDate = getValidDatePart(baseValue) || todayText();

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hh = String(value.getHours() || 0).padStart(2, "0");
    const mi = String(value.getMinutes() || 0).padStart(2, "0");
    if (value.getFullYear() <= 1900) {
      if (hh === "00" && mi === "00") return "";
      return `${baseDate}T${hh}:${mi}`;
    }
    return normalizeDateTime(value);
  }

  // Excel stores "time only" as a number under 1. Example: 0.354166 = 08:30.
  // Without this correction it becomes 1899/12/30 08:30.
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";

    const hh = String(parsed.H || 0).padStart(2, "0");
    const mi = String(parsed.M || 0).padStart(2, "0");

    if (value > 0 && value < 1) {
      if (hh === "00" && mi === "00") return "";
      return `${baseDate}T${hh}:${mi}`;
    }

    const yyyy = parsed.y;
    const mm = String(parsed.m).padStart(2, "0");
    const dd = String(parsed.d).padStart(2, "0");

    if (yyyy <= 1900) {
      if (hh === "00" && mi === "00") return "";
      return `${baseDate}T${hh}:${mi}`;
    }

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  const text = String(value).trim();
  if (!text) return "";

  // Time only strings: 8:30 / 08:30 / 8時30分
  const timeOnly = text
    .replace(/[時]/g, ":")
    .replace(/[分]/g, "")
    .match(/^(\d{1,2})(?::(\d{1,2}))$/);

  if (timeOnly) {
    const hh = String(timeOnly[1]).padStart(2, "0");
    const mi = String(timeOnly[2] || "0").padStart(2, "0");
    return `${baseDate}T${hh}:${mi}`;
  }

  const dt = normalizeDateTime(value);
  if (!dt) return "";

  // If normalization still produced Excel's fake date, reuse the report base date.
  if (dt.startsWith("1899-") || dt.startsWith("1900-")) {
    return `${baseDate}T${dt.slice(11, 16) || "00:00"}`;
  }

  return dt;
}

function normalizeDateOnly(value) {
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

function normalizeMaintenanceDateInput(value) {
  return normalizeDateOnly(value);
}

function dateTimeInputValue(value) {
  return isExcelFakeDate(value) ? "" : normalizeDateTime(value);
}

function dateOnlyInputValue(value) {
  return normalizeDateOnly(value);
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
  const functionDownRateRaw = Math.max(0, toNumber(report.functionDownRate, 100));
  const functionDownRate = functionDownRateRaw <= 1 ? functionDownRateRaw : functionDownRateRaw / 100;

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


function calculateSmartMaintenance(part = {}) {
  const lastDate = normalizeDateOnly(part.lastDate);
  const cycleDays = toNumber(part.cycle, 0);
  const dateNextDate = lastDate && cycleDays > 0 ? addDays(lastDate, cycleDays) : "";

  const currentProductionCount = toNumber(part.currentProductionCount, 0);
  const lastProductionCount = toNumber(part.lastProductionCount, 0);
  const cycleProductionCount = toNumber(part.cycleProductionCount, 0);
  const productionUsed = Math.max(0, currentProductionCount - lastProductionCount);
  const productionRemain = cycleProductionCount > 0 ? Math.max(0, cycleProductionCount - productionUsed) : "";

  const daysFromLast = lastDate ? Math.max(1, Math.ceil((parseLocalDate(todayText()) - parseLocalDate(lastDate)) / (1000 * 60 * 60 * 24))) : 0;
  const autoDailyAverage = daysFromLast > 0 && productionUsed > 0 ? Math.round(productionUsed / daysFromLast) : 0;
  const dailyAverageProduction = toNumber(part.dailyAverageProduction, autoDailyAverage);

  let productionNextDate = "";
  if (cycleProductionCount > 0 && productionRemain !== "" && dailyAverageProduction > 0) {
    productionNextDate = addDays(todayText(), Math.ceil(productionRemain / dailyAverageProduction));
  }

  const candidates = [dateNextDate, productionNextDate].filter(Boolean).sort();
  // Always recalculate from the latest lastDate/cycle values.
  // Do not keep a stale nextDate saved before the user changed the cycle.
  const nextDate = candidates[0] || dateNextDate || productionNextDate || "";
  const daysLeft = diffDays(nextDate);
  const status = getStatus(daysLeft);

  let urgentReason = "周期";
  if (productionNextDate && (!dateNextDate || productionNextDate <= dateNextDate)) urgentReason = "生産数周期";
  if (!productionNextDate && !dateNextDate) urgentReason = "未入力";

  return {
    dateNextDate,
    productionNextDate,
    nextDate,
    daysLeft,
    status,
    productionUsed,
    productionRemain,
    dailyAverageProduction,
    urgentReason,
  };
}

function cleanEquipmentName(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let text = raw
    .replace(/設備名\s*[:：]/g, "")
    .replace(/装置名\s*[:：]/g, "")
    .replace(/機械名\s*[:：]/g, "")
    .replace(/ライン名\s*[:：]/g, "")
    .replace(/\s+/g, " ")
    .replace(/：/g, ":")
    .trim();

  // Excelの「型式：」は設備名ではないため、設備リストには出さない。
  // 例："76-060かしめ機 型式：" -> "76-060かしめ機"
  // 例："かしめ機 型式：" -> "76-060かしめ機"（社内標準名へ補正）
  if (text.includes("型式")) {
    text = text.split("型式")[0].trim();
  }

  text = text
    .replace(/[:：]+$/g, "")
    .replace(/[-ー－]+$/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!text || text === "設備未設定" || text === "未設定" || text === "-") return "";

  // Excel取込で短い名称だけになった場合も、表示名は統一する。
  if (text === "かしめ機") return "76-060かしめ機";
  if (text === "ねじ切り機") return "76-060ねじ切り機";

  return text;
}

function getEquipmentNameFromRecord(record = {}) {
  const candidates = [
    record.equipment,
    record.machine,
    record.machineName,
    record.equipmentName,
    record.lineName,
    record.equipment2Name,
  ];

  const cleaned = candidates
    .map((value) => cleanEquipmentName(value))
    .filter(Boolean);

  // 76-060 / NL / TPS / A05 など、より正式名称に近いものを優先する。
  const formal = cleaned.find((name) => /^(76-|NL|TPS|A05|A|[0-9])/.test(name));
  return formal || cleaned[0] || "";
}

function normalizeMachineKey(value = "") {
  const cleaned = cleanEquipmentName(value);
  if (!cleaned) return "NL自動機";

  return cleaned
    .replace("76-060 /", "76-060")
    .replace("76-060/", "76-060")
    .trim() || "NL自動機";
}

function normalizeMaintenanceMode(value, part = {}) {
  const text = String(value || "").trim();
  if (text.includes("定量") || text.includes("生産数")) return "定量保全";
  if (text.includes("定期") || text.includes("日数") || text.includes("時間")) return "定期保全";

  // 既存データに保全方式が入っていない場合の自動判定。
  // 保全周期（日）が入っていれば定期保全、保全サイクル（回）が入っていれば定量保全。
  if (toNumber(part.cycle, 0) > 0) return "定期保全";
  if (toNumber(part.cycleProductionCount, 0) > 0) return "定量保全";
  return "定期保全";
}

function calculateSmartMaintenanceByDailyProduction(part = {}, dailyProductions = []) {
  const lastDate = normalizeDateOnly(part.lastDate);

  // 保全方式を分けます。
  // 定期保全（日数）：前回実施日 + 保全周期（日）
  // 定量保全（生産数）：前回実施日 + 保全サイクル ÷ 1日平均生産数
  const maintenanceMode = normalizeMaintenanceMode(part.maintenanceMode, part);
  const cycleDays = toNumber(part.cycle, 0);
  const cycleProductionCount = toNumber(part.cycleProductionCount, 0);

  const machine = normalizeMachineKey(getEquipmentNameFromRecord(part));
  const validDailyRows = dailyProductions
    .map((row) => ({
      ...row,
      date: normalizeDateOnly(row.date),
      machine: normalizeMachineKey(getEquipmentNameFromRecord(row)),
      quantity: toNumber(row.quantity ?? row.productionCount ?? row.count, 0),
    }))
    .filter((row) => row.date && row.quantity > 0 && row.machine === machine);

  const rowsAfterLast = lastDate
    ? validDailyRows.filter((row) => row.date >= lastDate && row.date <= todayText())
    : [];

  const last30Start = addDays(todayText(), -29);
  const last30 = validDailyRows.filter((row) => row.date >= last30Start && row.date <= todayText());
  const total30 = last30.reduce((sum, row) => sum + row.quantity, 0);
  const distinctProductionDays = new Set(last30.map((row) => row.date)).size;
  const dailyAverageFromDb = distinctProductionDays > 0
    ? Math.round(total30 / distinctProductionDays)
    : 0;
  const manualDailyAverage = toNumber(part.dailyAverageProduction, 0);
  const dailyAverageProduction = dailyAverageFromDb || manualDailyAverage;

  const elapsedDaysFromLast = lastDate
    ? Math.max(0, Math.ceil((parseLocalDate(todayText()) - parseLocalDate(lastDate)) / (1000 * 60 * 60 * 24)))
    : 0;

  const productionUsedByAverage = dailyAverageProduction > 0 ? elapsedDaysFromLast * dailyAverageProduction : 0;
  const productionUsedFromDailyRows = rowsAfterLast.reduce((sum, row) => sum + row.quantity, 0);
  const productionUsed = Math.max(productionUsedByAverage, productionUsedFromDailyRows);
  const productionRemain = cycleProductionCount > 0 ? Math.max(0, cycleProductionCount - productionUsed) : "";

  let nextDate = "";
  let dateNextDate = "";
  let productionNextDate = "";
  let productionTargetDays = "";
  let urgentReason = "未入力";

  if (maintenanceMode === "定期保全") {
    if (lastDate && cycleDays > 0) {
      dateNextDate = addDays(lastDate, cycleDays);
      nextDate = dateNextDate;
      urgentReason = "日数計算";
    }
  } else {
    if (lastDate && cycleProductionCount > 0 && dailyAverageProduction > 0) {
      productionTargetDays = Math.ceil(cycleProductionCount / dailyAverageProduction);
      productionNextDate = addDays(lastDate, productionTargetDays);
      nextDate = productionNextDate;
      urgentReason = "生産数計算";
    }
  }

  const daysLeft = diffDays(nextDate);
  const status = getStatus(daysLeft);

  return {
    maintenanceMode,
    dateNextDate,
    productionNextDate,
    nextDate,
    daysLeft,
    status,
    cycleDays,
    productionUsed,
    productionRemain,
    dailyAverageProduction,
    productionTargetDays,
    elapsedDaysFromLast,
    urgentReason,
    dailyProductionRows: rowsAfterLast.length,
    dailyProductionSource: dailyAverageFromDb > 0 ? "生産数DB" : manualDailyAverage > 0 ? "部品カード平均" : "生産数未登録",
  };
}

function reportStatusColor(status) {
  if (status === "承認済み") return "#dcfce7";
  if (status === "承認待ち") return "#fef3c7";
  if (status === "点検待ち") return "#dbeafe";
  if (status === "差戻し") return "#fee2e2";
  return "#f1f5f9";
}


function clampPercent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function formatYen(value) {
  return `${Math.round(Number(value || 0)).toLocaleString()}円`;
}

function makeCsvSafe(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// ===== V11 Professional JP/EN language + duplicate prevention patch =====
// Important: Firebase data is kept in the original language. The language switcher only changes what is displayed.
// V11 removes Thai and prevents broken partial translations such as 区Minutes / 鈴Thu / このDay.
const MIYAMA_LANGUAGES = {
  ja: "🇯🇵 日本語",
  en: "🇺🇸 English",
  es: "🇪🇸 Español",
};

const MIYAMA_TRANSLATIONS = {
  en: {
    // Menus / core screens
    "ホーム": "Home",
    "MIYAMA AI": "MIYAMA AI",
    "保全報告書": "Maintenance Reports",
    "保全修理報告書": "Maintenance Repair Reports",
    "保全作業報告書": "Maintenance Work Report",
    "修理報告書": "Repair Report",
    "定期保全": "Time-Based Maintenance",
    "定量保全": "Production-Based Maintenance",
    "生産数DB": "Production DB",
    "予備品管理": "Spare Parts",
    "カレンダー": "Calendar",
    "保全分析": "Maintenance Analytics",
    "CSV分析": "CSV Analysis",
    "計画工事": "Planned Work",
    "工事管理": "Work Management",
    "修理報告": "Repair Reports",
    "ユーザー管理": "User Management",
    "AI統合検索": "AI Unified Search",
    "保全分析センター": "Maintenance Analytics Center",
    "CSV分析センター": "CSV Analysis Center",
    "生産分析・改善AIセンター": "Production Analysis / Improvement AI Center",

    // Language
    "言語": "Language",
    "日本語": "Japanese",
    "英語": "English",
    "Language": "Language",

    // Buttons
    "検索": "Search",
    "再読込": "Reload",
    "削除": "Delete",
    "保存": "Save",
    "保存確認": "Save / Confirm",
    "保存して閉じる": "Save and Close",
    "交換完了": "Completed",
    "追加": "Add",
    "選択": "Select",
    "印刷": "Print",
    "ダウンロード": "Download",
    "CSV取込": "Import CSV",
    "CSV全削除": "Delete All CSV",
    "CSV出力": "Export CSV",
    "画像検索": "Image Search",
    "AI補完・画像検索": "AI Assist / Image Search",
    "定期保全から外す": "Remove from Maintenance",
    "関連画面を開く": "Open Related Report",
    "このDayに追加": "Add to This Day",
    "この日に追加": "Add to This Day",

    // Forms / common labels
    "概要": "Summary",
    "基本": "Basic",
    "基本情報": "Basic Information",
    "基本情報・設備情報": "Basic / Equipment Information",
    "対象設備": "Target Equipment",
    "設備名": "Equipment",
    "設備": "Equipment",
    "ライン名": "Line Name",
    "ライン": "Line",
    "グループ名": "Group Name",
    "保全方式": "Maintenance Mode",
    "保全種類": "Maintenance Type",
    "部品名": "Part Name",
    "部品": "Part",
    "保全サイクル（回）": "Maintenance Cycle (Count)",
    "保全サイクル": "Maintenance Cycle",
    "保全周期（日）": "Maintenance Interval (Days)",
    "部品命数": "Part Life",
    "1日平均生産数": "Daily Average Production",
    "前回実施日": "Last Done Date",
    "次回実施日": "Next Due Date",
    "残り日数": "Days Left",
    "残日数": "Days Left",
    "残り回数": "Remaining Count",
    "残り": "Remaining",
    "担当者": "Owner",
    "担当": "Owner",
    "メモ": "Memo",
    "備考": "Notes",
    "内容": "Details",
    "内容未入力": "Details Not Entered",
    "詳細なし": "No Details",
    "内容なし": "No Content",
    "日付": "Date",
    "時刻": "Time",
    "時間": "Hours",
    "月カレンダー": "Monthly Calendar",
    "予定": "Schedule",
    "の予定": " Schedule",
    "予定編集": "Edit Schedule",
    "新しい予定": "New Schedule",
    "予定はありません": "No schedule",
    "選択日の予定追加": "Add Schedule for Selected Date",

    // Maintenance modes
    "定期保全（日数）": "Time-Based Maintenance (Days)",
    "定量保全（生産数）": "Production-Based Maintenance",
    "日数計算": "Day Calculation",
    "生産数計算": "Production Calculation",
    "生産数で自動計算": "Auto calculated by production quantity",
    "この部品は何回使用できますか？": "How many times can this part be used?",
    "定期保全は日数": "Time-based maintenance uses days",
    "定量保全は生産数で次回実施日を自動計算します": "Production-based maintenance calculates the next due date from production quantity",

    // Status
    "全期間": "All",
    "全て": "All",
    "全部": "All",
    "1ヶ月": "1 Month",
    "3ヶ月": "3 Months",
    "6ヶ月": "6 Months",
    "1年": "1 Year",
    "正常": "OK",
    "交換超過": "Replacement Overdue",
    "交換間近": "Replacement Soon",
    "本日実施": "Due Today",
    "期限超過": "Overdue",
    "実施完了": "Completed",
    "実施中": "In Progress",
    "未実施": "Not Done",
    "未登録": "Not Registered",
    "未設定": "Not Set",
    "未入力": "Not Entered",
    "準備中": "Preparing",
    "入力中": "Inputting",
    "保存中": "Saving",
    "保存済み": "Saved",
    "在庫なし": "No Stock",
    "在庫あり": "In Stock",
    "在庫OK": "Stock OK",
    "在庫注意": "Stock Warning",
    "在庫不足": "Stock Shortage",
    "重要": "Important",
    "通常": "Normal",
    "注意": "Warning",
    "緊急": "Urgent",
    "必要": "Required",
    "不要": "Not Required",
    "点検不要": "Inspection Not Required",

    // Spare parts
    "予備品": "Spare Part",
    "在庫数": "Stock Qty",
    "現在在庫": "Current Stock",
    "最低在庫": "Minimum Stock",
    "価格": "Price",
    "金額": "Amount",
    "単価": "Unit Price",
    "メーカー": "Maker",
    "購入先": "Supplier",
    "購入URL": "Purchase URL",
    "使用設備": "Used Equipment",
    "カテゴリ": "Category",
    "写真なし": "No Photo",
    "画像なし": "No Image",
    "型式・品番": "Model / Part No.",
    "型式・図番": "Model / Drawing No.",
    "型式": "Model",
    "品番": "Part No.",
    "品名": "Item Name",
    "図番": "Drawing No.",
    "名称": "Name",
    "保管場所": "Storage Location",
    "納期": "Lead Time",

    // Reports / failure content
    "不具合現象": "Failure Symptom",
    "不具合箇所": "Failure Point",
    "不具合原因": "Failure Cause",
    "不具合内容": "Failure Details",
    "不具合": "Failure",
    "現象": "Symptom",
    "箇所": "Point",
    "原因": "Cause",
    "原因調査": "Cause Investigation",
    "推定原因": "Estimated Cause",
    "処置内容": "Action Taken",
    "処置": "Action",
    "対策": "Countermeasure",
    "推奨対策": "Recommended Action",
    "確認ポイント": "Check Points",
    "なぜなぜ分析": "Why-Why Analysis",
    "なぜ1": "Why 1",
    "なぜ2": "Why 2",
    "なぜ3": "Why 3",
    "再発防止": "Recurrence Prevention",
    "流出防止": "Outflow Prevention",
    "承認": "Approval",
    "承認者": "Approver",
    "承認日": "Approval Date",
    "承認状態": "Approval Status",
    "承認ステータス": "Approval Status",
    "承認済み": "Approved",
    "承認待ち": "Waiting Approval",
    "点検待ち": "Waiting Inspection",
    "差戻し": "Returned",
    "点検者": "Inspector",
    "確認・承認": "Check / Approval",

    // Cost / time
    "停止時間合計": "Total Downtime",
    "停止時間": "Downtime",
    "停止回数": "Stop Count",
    "停止原因分類": "Stop Cause Category",
    "機械停止時間": "Machine Downtime",
    "保全費用合計": "Total Maintenance Cost",
    "保全費用": "Maintenance Cost",
    "労務費": "Labor Cost",
    "労務時間": "Labor Hours",
    "部品費合計": "Total Parts Cost",
    "部品費": "Parts Cost",
    "合計費用": "Total Cost",
    "費用": "Cost",
    "突発保全": "Corrective Maintenance",
    "計画保全": "Planned Maintenance",
    "設備別 停止時間ランキング": "Downtime Ranking by Equipment",
    "アラーム別 TOP10": "Top 10 Alarms",
    "CSVアラーム 件数": "CSV Alarm Count",
    "最多アラーム": "Most Frequent Alarm",
    "最多原因分類": "Top Cause Category",
    "最多設備": "Top Equipment",
    "発生回数": "Occurrences",
    "生産数": "Production Qty",
    "登録件数": "Registered Count",
    "登録設備": "Registered Equipment",
    "登録部品": "Registered Parts",
    "操作": "Action",
    "データがありません。": "No data.",
    "重複データ削除": "Remove Duplicates",
    "重複": "Duplicate",
    "新規": "New",
    "取込": "Import",

    // Maintenance work types
    "点検": "Inspection",
    "交換": "Replacement",
    "給油": "Lubrication",
    "清掃": "Cleaning",
    "調整": "Adjustment",
    "修理": "Repair",
    "校正": "Calibration",
    "確認": "Check",
    "保全": "Maintenance",

    // Common machine / alarm words from DB. These are display-only translations.
    "リベット": "Rivet",
    "リベットつまり": "Rivet Jam",
    "つまり": "Jam",
    "詰まり": "Jam",
    "詰り": "Jam",
    "供給不良": "Supply Failure",
    "未到達": "Not Reached",
    "未検出": "Not Detected",
    "異常停止": "Abnormal Stop",
    "異常": "Abnormal",
    "破損": "Damage",
    "摩耗": "Wear",
    "劣化": "Deterioration",
    "漏れ": "Leak",
    "油漏れ": "Oil Leak",
    "エア漏れ": "Air Leak",
    "水漏れ": "Water Leak",
    "折れ": "Broken",
    "割れ": "Crack",
    "欠け": "Chipping",
    "汚れ": "Dirt",
    "焼損": "Burnout",
    "センサー": "Sensor",
    "シリンダ": "Cylinder",
    "バルブ": "Valve",
    "ロードセル": "Load Cell",
    "モーター": "Motor",
    "コンベア": "Conveyor",
    "ベルト": "Belt",
    "カメラ": "Camera",
    "画像": "Image",
    "治具": "Jig",
    "ワーク": "Workpiece",
    "スライド": "Slide",
    "クランプ": "Clamp",
    "ピース": "Piece",
    "ロッキング": "Locking",
    "ASSY": "Assy",
    "原点復帰": "Origin Return",
    "原点": "Origin",
    "下降": "Down",
    "前進": "Forward",
    "後退": "Backward",
    "上昇": "Up",
    "下降端": "Down End",
    "上昇端": "Up End",
    "押し込み": "Push-in",
    "圧入": "Press Fit",
    "カシメ": "Caulking",
    "かしめ": "Caulking",
    "組付": "Assembly",
    "組立": "Assembly",
    "搬入": "Loading",
    "搬出": "Unloading",
    "排出": "Ejection",
    "吸着": "Vacuum Pick",
    "チャック": "Chuck",
    "クランプ": "Clamp",
    "グリス": "Grease",
    "油圧": "Hydraulic",
    "空圧": "Pneumatic",
    "電気": "Electrical",
    "配線": "Wiring",
    "端子": "Terminal",
    "確認リンク候補": "Candidate Check Links",
    "自動連携データ": "Auto Linked Data",
    "区分": "Category",
    "所有者": "Owner",
    "作業者": "Worker",
    "責任者": "Owner",
    "最新": "Latest",
    "件数": "Count",
    "件": "items",
    "回": "times",
    "個/日": "pcs/day",
    "個": "pcs",
    "円": "yen"
  },

  es: {
    "ホーム": "Inicio",
    "MIYAMA AI": "MIYAMA AI",
    "保全報告書": "Informes de mantenimiento",
    "保全修理報告書": "Informes de reparación",
    "保全作業報告書": "Informe de trabajo de mantenimiento",
    "修理報告書": "Informe de reparación",
    "定期保全": "Mantenimiento por tiempo",
    "定量保全": "Mantenimiento por producción",
    "生産数DB": "Base de datos de producción",
    "予備品管理": "Repuestos",
    "カレンダー": "Calendario",
    "保全分析": "Análisis de mantenimiento",
    "CSV分析": "Análisis CSV",
    "計画工事": "Trabajo planificado",
    "工事管理": "Gestión de trabajos",
    "修理報告": "Informes de reparación",
    "ユーザー管理": "Gestión de usuarios",
    "AI統合検索": "Búsqueda unificada con IA",
    "言語": "Idioma",
    "日本語": "Japonés",
    "英語": "Inglés",
    "検索": "Buscar",
    "再読込": "Recargar",
    "削除": "Eliminar",
    "保存": "Guardar",
    "保存確認": "Guardar / Confirmar",
    "保存して閉じる": "Guardar y cerrar",
    "追加": "Agregar",
    "選択": "Seleccionar",
    "印刷": "Imprimir",
    "ダウンロード": "Descargar",
    "キャンセル": "Cancelar",
    "基本情報・設備情報": "Información básica y del equipo",
    "作成日": "Fecha de creación",
    "保全分類": "Clasificación de mantenimiento",
    "グループ名": "Nombre del grupo",
    "ライン名": "Nombre de la línea",
    "設備名": "Equipo",
    "作業者": "Técnico",
    "時間・停止時間（自動計算）": "Tiempo y parada (cálculo automático)",
    "不具合発生日時": "Fecha y hora de la falla",
    "保全作業開始日時": "Inicio del mantenimiento",
    "保全作業完了日時": "Fin del mantenimiento",
    "生産開始日時": "Reinicio de producción",
    "停止除外時間": "Tiempo excluido de parada",
    "機能低下": "Reducción de función",
    "停止時間": "Tiempo de parada",
    "不具合内容": "Detalles de la falla",
    "不具合現象": "Síntoma de la falla",
    "不具合箇所": "Punto de la falla",
    "リンク先": "Enlace",
    "不具合原因・なぜなぜ分析": "Causa y análisis de los 3 porqués",
    "なぜなぜ分析": "Análisis de los 3 porqués",
    "なぜ1": "Por qué 1",
    "なぜ2": "Por qué 2",
    "なぜ3": "Por qué 3",
    "処置内容": "Acción correctiva",
    "再発防止・流出防止・変化点": "Prevención de recurrencia, escape y cambios",
    "再発防止": "Prevención de recurrencia",
    "再発防止・残工事": "Prevención de recurrencia / trabajo pendiente",
    "流出防止": "Prevención de escape",
    "変化点ランク": "Rango del punto de cambio",
    "承認": "Aprobación",
    "点検": "Inspección",
    "作成": "Creación",
    "承認ステータス": "Estado de aprobación",
    "下書き": "Borrador",
    "点検待ち": "Pendiente de inspección",
    "承認待ち": "Pendiente de aprobación",
    "承認済み": "Aprobado",
    "差戻し": "Devuelto",
    "Excel取込": "Importado desde Excel",
    "必要": "Necesario",
    "不要": "No necesario",
    "未実施": "No realizado",
    "実施完了": "Completado",
    "正常": "Normal",
    "交換超過": "Reemplazo vencido",
    "交換間近": "Reemplazo próximo",
    "未入力": "Sin datos",
    "修理": "Reparación",
    "交換": "Reemplazo",
    "給油": "Lubricación",
    "清掃": "Limpieza",
    "調整": "Ajuste",
    "校正": "Calibración",
    "確認": "Verificación",
    "保全": "Mantenimiento",
    "メモ": "Nota",
    "備考": "Observaciones",
    "原因": "Causa",
    "推定原因": "Causa probable",
    "対策": "Contramedida",
    "担当者": "Responsable",
    "次回実施日": "Próxima fecha",
    "前回実施日": "Última fecha",
    "残り日数": "Días restantes",
    "部品名": "Nombre de la pieza",
    "保全方式": "Modo de mantenimiento",
    "保全種類": "Tipo de mantenimiento",
    "保全周期（日）": "Intervalo de mantenimiento (días)",
    "定期保全（日数）": "Mantenimiento por tiempo (días)",
    "定量保全（生産数）": "Mantenimiento por producción",
    "交換完了": "Completado",
    "定期保全から外す": "Quitar del mantenimiento",
    "さらに20件表示": "Mostrar 20 más",
    "データがありません。": "No hay datos.",
    "生成中": "Generando",
    "3つのなぜを生成": "Generar 3 porqués"
  },

};

// Words below caused broken translations inside names or Japanese phrases.
// Example: 区分 -> 区Minutes, 鈴木 -> 鈴Thu, この日 -> このDay.
const MIYAMA_BLOCKED_TRANSLATION_KEYS = new Set(["分", "日", "月", "年", "火", "水", "木", "金", "土"]);

Object.keys(MIYAMA_TRANSLATIONS).forEach((lang) => {
  MIYAMA_BLOCKED_TRANSLATION_KEYS.forEach((key) => delete MIYAMA_TRANSLATIONS[lang][key]);
});


// ===== V11.1 stable JP/EN translations =====
// The app now translates official UI labels only.
// Database/free-text content is not word-by-word translated, because partial replacement caused broken mixed text.
Object.assign(MIYAMA_TRANSLATIONS.en, {
  "設備保全を、もっとスマートに。": "Make equipment maintenance smarter.",
  "設備・部品・トラブル詳細を検索してください": "Search equipment, parts, or trouble details",
  "設備・部品・トラブルDetailsをSearchしてください": "Search equipment, parts, or trouble details",
  "システムへ入る": "Enter System",
  "今月停止時間": "This Month Downtime",
  "今月修理時間": "This Month Repair Hours",
  "今月参考費用": "This Month Estimated Cost",
  "今月報告書": "This Month Reports",
  "推定稼働率（2直16H基準）": "Estimated Availability (2 shifts / 16h basis)",
  "今月Downtimeを16H基準で比較": "Compared with 16h monthly downtime basis",
  "1直8H": "1 shift / 8h",
  "2直16H": "2 shifts / 16h",
  "保全作業に使った時間": "Hours used for maintenance work",
  "労務費＋部品費": "Labor cost + parts cost",
  "統合AI": "Integrated AI",
  "選んだ日の詳細です。": "Details for the selected day.",
  "Monthly Calendarで選んだ日の詳細です。": "Details for the selected day in the monthly calendar.",
  "この画面は 保全修理報告書だけ を使って、停止時間・MTTR・費用・設備ランキングを計算します。CSVアラームはここでは使いません。": "This screen uses only maintenance repair reports to calculate downtime, MTTR, cost, and equipment rankings. CSV alarms are not used here.",
  "対象期間": "Target Period",
  "必要な場合だけ入力": "Enter only if needed",
  "保全修理報告書のみ": "Maintenance repair reports only",
  "生産停止に直結する時間": "Time directly connected to production stoppage",
  "1件あたり平均停止時間": "Average downtime per item",
  "工数費＋部品費": "Labor + parts cost",
  "CM/修理系": "CM / repair type",
  "報告書分類から集計": "Calculated from report classification",
  "どの設備が一番長く止まっているかを、保全修理報告書の停止時間から集計します。": "Ranks which equipment stopped the longest, based on downtime in maintenance repair reports.",
  "表示テーマを選択": "Choose Display Theme",
  "長い報告書を全部出さず、必要なテーマだけ表示できます。": "Show only the needed sections instead of the whole long report.",
  "報告書概要": "Report Summary",
  "作成日": "Created Date",
  "作業者": "Worker",
  "承認状態": "Approval Status",
  "保存済み": "Saved",
  "PDF印刷": "PDF / Print",
  "Excel/CSV": "Excel / CSV",
  "QRリンク": "QR Link",
  "No.1": "No.1",
  "No": "No",
  "なし": "None",
  "から": "from",
  "まで": "to",
  "例：76-060 センサー Rivet 停止": "Example: 76-060 sensor rivet stop",
  "例：76-060 Sensor Rivet 停止": "Example: 76-060 sensor rivet stop",
  "例：76-060 センサー リベット 停止": "Example: 76-060 sensor rivet stop"
});

function normalizeDuplicateText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function makeProductionLogDuplicateKey(row = {}) {
  const date = normalizeDateOnly(row.csvRealDate || row.csvDate || row.alarmDate || row.date || row.createdAt || "");
  return [
    date,
    normalizeDuplicateText(row.time),
    normalizeDuplicateText(row.machine || row.equipment),
    normalizeDuplicateText(row.lineName),
    normalizeDuplicateText(row.alarmNo || row.no),
    normalizeDuplicateText(row.message || row.alarmMessage || row.detail),
  ].join("|");
}

function makeMaintenanceReportDuplicateKey(row = {}) {
  return [
    normalizeDateTime(row.troubleDateTime || row.workStartDateTime || row.createdAt || ""),
    normalizeDuplicateText(row.equipment),
    normalizeDuplicateText(row.lineName),
    normalizeDuplicateText(row.phenomenon),
    normalizeDuplicateText(row.troublePoint),
  ].join("|");
}

function makePartDuplicateKey(row = {}) {
  return [
    normalizeDuplicateText(row.equipment || row.machine || row.machineName),
    normalizeDuplicateText(row.partName || row.name),
    normalizeDuplicateText(row.model || row.modelNo || row.partNo),
    normalizeDuplicateText(row.maintenanceDetail || row.standard || row.method),
    normalizeDuplicateText(row.sourceFile),
  ].join("|");
}

let MIYAMA_REVERSE_DICTIONARY_CACHE = null;

function buildMiyamaReverseDictionary() {
  if (MIYAMA_REVERSE_DICTIONARY_CACHE) return MIYAMA_REVERSE_DICTIONARY_CACHE;

  const reverse = {};
  Object.values(MIYAMA_TRANSLATIONS).forEach((langDict) => {
    Object.entries(langDict).forEach(([ja, translated]) => {
      if (translated && ja && !MIYAMA_BLOCKED_TRANSLATION_KEYS.has(ja)) {
        reverse[String(translated).trim()] = String(ja);
      }
    });
  });

  MIYAMA_REVERSE_DICTIONARY_CACHE = reverse;
  return reverse;
}

function translateMiyamaText(text = "", language = "ja") {
  const original = String(text ?? "");
  const selectedLanguage = MIYAMA_LANGUAGES[language] ? language : "ja";
  const trimmed = original.trim();
  if (!trimmed) return original;

  const leading = original.match(/^\s*/)?.[0] || "";
  const trailing = original.match(/\s*$/)?.[0] || "";

  const reverse = buildMiyamaReverseDictionary();

  // Japanese mode: only convert complete English UI labels back to Japanese.
  // Do not replace English words inside database text.
  if (selectedLanguage === "ja") {
    if (reverse[trimmed]) return leading + reverse[trimmed] + trailing;
    return original;
  }

  const dict = MIYAMA_TRANSLATIONS[selectedLanguage] || {};

  // 1) Exact UI label translation: safest and prevents mixed strings.
  if (dict[trimmed]) return leading + dict[trimmed] + trailing;

  // 2) UI prefixes that often appear together with DB data. Keep DB text original.
  let output = original;
  const safePrefixPairs = [
    ["【Important】 保全報告：", "【Important】 Maintenance Report: "],
    ["【Important】 保全報告 :", "【Important】 Maintenance Report: "],
    ["【Important】 Maintenance報告：", "【Important】 Maintenance Report: "],
    ["区分:", "Category:"],
    ["Category:", "Category:"],
    ["担当者:", "Owner:"],
    ["担当:", "Owner:"],
    ["Owner:", "Owner:"],
    ["件数", "Count"],
    ["最新", "Latest"],
    ["停止時間", "Downtime"],
  ];
  safePrefixPairs.forEach(([ja, en]) => {
    output = output.split(ja).join(en);
  });

  // 3) Translate short pure UI text or short labels.
  // Long Japanese sentences are usually Firebase/report body content. Keep them original
  // instead of producing broken half-English half-Japanese text.
  const hasJapanese = /[ぁ-んァ-ン一-龯]/.test(output);
  const isLongFreeText = hasJapanese && output.length > 24;
  if (isLongFreeText) return output;

  // 4) For remaining short labels, replace only reasonably long UI phrases.
  Object.entries(dict)
    .filter(([ja]) => ja && ja.length >= 3 && !MIYAMA_BLOCKED_TRANSLATION_KEYS.has(ja))
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([ja, translated]) => {
      if (!translated) return;
      output = output.split(ja).join(translated);
    });

  return output;
}

function shouldSkipLanguageNode(parent) {
  if (!parent) return true;
  const tag = parent.tagName;
  if (["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION", "SELECT"].includes(tag)) return true;
  if (parent.closest && parent.closest("[data-no-translate='true']")) return true;
  return false;
}

async function applyMiyamaLanguage(language = "ja", signal) {
  if (typeof document === "undefined") return;

  const root = document.querySelector(".page");
  if (!root) return;

  const selectedLanguage = MIYAMA_LANGUAGES[language] ? language : "ja";
  root.setAttribute("data-language", selectedLanguage);

  const translateAttribute = (element, attributeName) => {
    const currentValue = element.getAttribute(attributeName) || "";
    const nextValue = translateMiyamaText(currentValue, selectedLanguage);
    if (currentValue !== nextValue) element.setAttribute(attributeName, nextValue);
  };

  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (shouldSkipLanguageNode(parent)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    const nextText = translateMiyamaText(node.nodeValue, selectedLanguage);
    if (node.nodeValue !== nextText) node.nodeValue = nextText;
  });

  root.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((element) => {
    translateAttribute(element, "placeholder");
  });
  root.querySelectorAll("[title]").forEach((element) => translateAttribute(element, "title"));
  root.querySelectorAll("[aria-label]").forEach((element) => translateAttribute(element, "aria-label"));

  if (selectedLanguage === "ja") return;

  const remainingNodes = textNodes.filter((node) => containsJapaneseText(node.nodeValue));
  const uniqueTexts = [...new Set(
    remainingNodes
      .map((node) => node.nodeValue.trim())
      .filter(Boolean)
  )]
    // Campos longos do relatório usam os componentes de tradução dedicados.
    // Limitar a tradução automática do DOM evita centenas de chamadas ao abrir a página.
    .filter((value) => value.length <= 140)
    .slice(0, 80);

  const translatedByOriginal = {};
  const concurrency = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < uniqueTexts.length) {
      if (signal?.aborted) return;

      const currentIndex = cursor;
      cursor += 1;
      const original = uniqueTexts[currentIndex];

      try {
        translatedByOriginal[original] = await translateJapaneseLongText(original, signal, selectedLanguage);
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.warn("Display translation failed:", error);
        }
        translatedByOriginal[original] = original;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueTexts.length) }, worker));
  if (signal?.aborted) return;

  remainingNodes.forEach((node) => {
    const original = node.nodeValue.trim();
    const translated = translatedByOriginal[original];
    if (!translated || translated === original) return;

    const leading = node.nodeValue.match(/^\s*/)?.[0] || "";
    const trailing = node.nodeValue.match(/\s*$/)?.[0] || "";
    node.nodeValue = `${leading}${translated}${trailing}`;
  });
}

const PROFESSIONAL_RESPONSIVE_CSS = `
/* ===== MIYAMA Professional Responsive UI Patch ===== */
:root {
  --miyama-blue:#2563eb;
  --miyama-blue-dark:#1d4ed8;
  --miyama-bg:#f6f8fb;
  --miyama-card:#ffffff;
  --miyama-border:#dbe3ef;
  --miyama-text:#0f172a;
  --miyama-muted:#64748b;
  --miyama-danger:#dc2626;
  --miyama-warn:#f59e0b;
  --miyama-ok:#16a34a;
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}


.moneyText {
  display:inline-block;
  white-space:nowrap !important;
  word-break:keep-all !important;
  overflow-wrap:normal !important;
  font-variant-numeric:tabular-nums;
}
.card .moneyText {
  font-size:clamp(24px, 2.4vw, 34px) !important;
  line-height:1.12 !important;
}
.card {
  overflow:hidden;
}
@media (max-width: 520px) {
  .card .moneyText { font-size:22px !important; }
}

html, body, #root { width:100%; min-height:100%; overflow-x:hidden; }
body { background:#f6f8fb !important; color:var(--miyama-text); -webkit-text-size-adjust:100%; }
.page { width:100%; max-width:100vw; overflow-x:hidden; padding:20px clamp(12px, 2vw, 28px) 80px !important; }
.container { width:100%; max-width:1560px !important; }

.tableWrap, .calendarEditCard, .card {
  background:rgba(255,255,255,.96) !important;
  border:1px solid rgba(148,163,184,.28) !important;
  box-shadow:0 12px 34px rgba(15,23,42,.08) !important;
}
.tableWrap { border-radius:22px !important; padding:clamp(14px,2vw,22px) !important; overflow-x:auto; }
.calendarEditCard { border-radius:18px !important; }

.header { align-items:flex-start !important; }
.header h1, .header h2, .header h3 { line-height:1.25 !important; word-break:keep-all; overflow-wrap:anywhere; }
p, h1, h2, h3, strong, span, label, div { word-break:normal; overflow-wrap:anywhere; }

input, select, textarea {
  border:1px solid #cbd5e1 !important;
  border-radius:14px !important;
  min-height:44px;
  line-height:1.45;
  background:#fff !important;
}
textarea { min-height:96px !important; white-space:pre-wrap; }

.primaryButton, .deleteButton {
  border-radius:14px !important;
  min-height:44px !important;
  white-space:normal !important;
  text-align:center;
  justify-content:center;
}
.primaryButton { background:linear-gradient(135deg,#2563eb,#1d4ed8) !important; }
.quickQuestionGrid button {
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}
.quickQuestionGrid button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(37,99,235,.12);
  border-color: #93c5fd !important;
}
.aiAnswerBox {
  min-height: 140px;
  white-space: pre-wrap;
  line-height: 1.65;
}
.miyamaAiPremiumHero {
  background:
    radial-gradient(circle at top left, rgba(96,165,250,.36), transparent 35%),
    linear-gradient(135deg,#0f172a 0%,#172554 55%,#1d4ed8 100%) !important;
  color:#ffffff !important;
  border:1px solid rgba(255,255,255,.18) !important;
  box-shadow:0 24px 60px rgba(15,23,42,.28) !important;
  border-radius:26px !important;
  overflow:hidden !important;
}
.miyamaAiPremiumHero h1,
.miyamaAiPremiumHero h2,
.miyamaAiPremiumHero h3,
.miyamaAiPremiumHero strong,
.miyamaAiPremiumHero span,
.miyamaAiPremiumHero p,
.miyamaAiPremiumHero div {
  color:#ffffff !important;
  opacity:1 !important;
}
.miyamaAiPremiumHero > div:last-child > div {
  background:rgba(255,255,255,.13) !important;
  border:1px solid rgba(255,255,255,.18) !important;
  box-shadow:0 8px 22px rgba(15,23,42,.16);
}
.miyamaAiPremiumHero > div:last-child > div span {
  color:#dbeafe !important;
}
@media (max-width:700px) {
  .miyamaAiPremiumHero { padding:20px !important; }
}

.deleteButton { background:#fee2e2 !important; color:#b91c1c !important; }

.tabs {
  position:sticky;
  top:0;
  z-index:50;
  padding:10px 0 12px;
  background:linear-gradient(180deg,rgba(246,248,251,.98),rgba(246,248,251,.86));
  backdrop-filter:blur(12px);
  border-bottom:1px solid rgba(148,163,184,.18);
}
.tabs button { white-space:nowrap; min-height:46px; }

.cards { grid-template-columns:repeat(auto-fit,minmax(180px,1fr)) !important; }
.card { min-width:0; }
.card strong { overflow-wrap:anywhere; line-height:1.1; }
.reportGrid { grid-template-columns:repeat(auto-fit,minmax(240px,1fr)) !important; }

.calendarLayout { grid-template-columns:minmax(0,1.4fr) minmax(320px,.8fr) !important; }
.calendarDay { min-width:0; }
.calendarEventTag { max-width:100%; }

/* Inline grid overrides from App.jsx */
div[style*="grid-template-columns: 320px 1fr"],
div[style*="grid-template-columns: 1fr 420px"],
div[style*="grid-template-columns: repeat(4, 1fr)"],
div[style*="grid-template-columns: repeat(3, 1fr)"] {
  min-width:0;
}

/* Better desktop cards for spare parts */
div[style*="grid-template-columns: 320px 1fr"] h2 { overflow-wrap:anywhere !important; }
div[style*="grid-template-columns: 320px 1fr"] input,
div[style*="grid-template-columns: 320px 1fr"] textarea,
div[style*="grid-template-columns: 320px 1fr"] select { max-width:100%; }

/* Modals */
.modalBackdrop { padding:16px !important; }
.modalCard { width:min(980px,96vw) !important; max-height:92vh; overflow:auto; border-radius:22px !important; }

@media (min-width: 901px) {
  .tabs { overflow-x:auto; flex-wrap:nowrap !important; }
  .tabs::-webkit-scrollbar { height:6px; }
  .tabs::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:999px; }
}

@media (max-width: 900px) {
  .page { padding:10px 10px calc(90px + var(--safe-bottom)) !important; }
  .container { max-width:100% !important; }
  .page::before { font-size:42px !important; line-height:96px !important; letter-spacing:22px !important; opacity:.035 !important; }

  .tabs {
    display:flex !important;
    flex-wrap:nowrap !important;
    overflow-x:auto !important;
    gap:8px !important;
    margin:0 -10px 14px !important;
    padding:8px 10px 10px !important;
    scroll-snap-type:x proximity;
    -webkit-overflow-scrolling:touch;
  }
  .tabs button {
    flex:0 0 auto !important;
    min-width:118px !important;
    padding:10px 12px !important;
    font-size:13px !important;
    scroll-snap-align:start;
  }

  .header { flex-direction:column !important; gap:10px !important; margin-bottom:12px !important; }
  .header > div, .header > button, .header > label { width:100%; }
  .header h1 { font-size:26px !important; }
  .header h2 { font-size:22px !important; }
  .header p, .tableWrap p { font-size:14px !important; }

  .tableWrap { border-radius:18px !important; margin-bottom:14px !important; padding:14px !important; }
  .calendarEditCard { padding:14px !important; }
  .reportGrid { grid-template-columns:1fr !important; gap:10px !important; }
  .cards { grid-template-columns:1fr 1fr !important; gap:10px !important; }
  .card { padding:14px !important; border-radius:16px !important; }
  .card strong { font-size:24px !important; }

  input, select, textarea { font-size:16px !important; width:100% !important; max-width:100% !important; }
  .primaryButton, .deleteButton { width:auto; max-width:100%; font-size:14px !important; padding:10px 12px !important; }

  /* Spare parts product card: one column on mobile */
  div[style*="grid-template-columns: 320px 1fr"] {
    display:grid !important;
    grid-template-columns:1fr !important;
    gap:14px !important;
    padding:14px !important;
    margin-bottom:14px !important;
    overflow:hidden !important;
  }
  div[style*="grid-template-columns: 320px 1fr"] > div:first-child {
    width:100% !important;
    text-align:center !important;
  }
  div[style*="grid-template-columns: 320px 1fr"] img,
  div[style*="width: 300px"][style*="height: 300px"] {
    width:min(190px, 72vw) !important;
    height:min(190px, 72vw) !important;
    margin:0 auto !important;
    display:flex !important;
  }
  div[style*="grid-template-columns: 320px 1fr"] h2 {
    font-size:22px !important;
    line-height:1.35 !important;
    margin-top:4px !important;
  }
  div[style*="text-align: right"] { text-align:left !important; }

  /* Approval/header area from report form */
  div[style*="grid-template-columns: 1fr 420px"] {
    display:grid !important;
    grid-template-columns:1fr !important;
  }
  div[style*="grid-template-columns: repeat(4, 1fr)"] {
    display:grid !important;
    grid-template-columns:1fr 1fr !important;
    border-left:0 !important;
  }
  div[style*="grid-template-columns: repeat(4, 1fr)"] > div {
    min-height:auto !important;
    border:1px solid #dbe3ef !important;
    border-radius:14px !important;
    margin:6px !important;
    background:#f8fafc !important;
  }

  /* Calendar */
  .calendarLayout { grid-template-columns:1fr !important; }
  .calendarTop { gap:8px !important; flex-wrap:wrap !important; }
  .calendarTop h2 { width:100%; text-align:center; font-size:20px !important; order:-1; }
  .calendarWeek, .calendarGrid { grid-template-columns:repeat(7,minmax(0,1fr)) !important; }
  .calendarWeek div { font-size:11px !important; padding:6px 2px !important; }
  .calendarGrid { gap:4px !important; }
  .calendarDay { min-height:66px !important; padding:5px !important; border-radius:10px !important; font-size:12px !important; }
  .calendarEventTag { font-size:9px !important; padding:2px 3px !important; }

  /* Tables stay usable, but don't break page width */
  table { min-width:760px !important; }
  th, td { padding:8px !important; }
}

@media (max-width: 520px) {
  .page { padding-left:8px !important; padding-right:8px !important; }
  .tabs { margin-left:-8px !important; margin-right:-8px !important; }
  .cards { grid-template-columns:1fr !important; }
  .tableWrap { padding:12px !important; }
  .card strong { font-size:22px !important; }

  div[style*="grid-template-columns: repeat(4, 1fr)"] { grid-template-columns:1fr !important; }

  /* Button groups become readable */
  div[style*="display: flex"][style*="gap: 10px"] {
    gap:8px !important;
  }
  div[style*="display: flex"][style*="gap: 10px"] > button,
  div[style*="display: flex"][style*="gap: 10px"] > label {
    flex:1 1 auto;
  }

  .calendarDay { min-height:58px !important; }
  .calendarEventList { display:none !important; }
}


/* 定期保全の設備選択バー */
@media (max-width: 1050px) {
  div[style*="grid-template-columns: minmax(260px,1fr) 240px 180px 190px"] {
    grid-template-columns: 1fr 1fr !important;
  }
}
@media (max-width: 620px) {
  div[style*="grid-template-columns: minmax(260px,1fr) 240px 180px 190px"] {
    grid-template-columns: 1fr !important;
  }
}

/* ===== Spectacular calendar redesign ===== */
.calendarDay {
  position:relative;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.calendarDay.emptyDay {
  background:transparent !important;
  border:1px dashed rgba(148,163,184,.18) !important;
  box-shadow:none !important;
  cursor:default !important;
}
.calendarDayHeader {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:4px;
  width:100%;
}
.calendarDayNumber {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:28px;
  height:28px;
  border-radius:999px;
  font-weight:900;
  font-size:15px;
  color:#0f172a;
  background:#f8fafc;
}
.selectedDay .calendarDayNumber {
  color:#fff;
  background:#2563eb;
}
.calendarSummaryPills {
  display:flex;
  gap:4px;
  flex-wrap:wrap;
  align-items:center;
  width:100%;
}
.calendarSummaryPill {
  display:inline-flex;
  align-items:center;
  gap:3px;
  padding:3px 6px;
  border-radius:999px;
  background:#eff6ff;
  color:#1d4ed8;
  font-weight:800;
  font-size:11px;
  line-height:1.1;
  border:1px solid #bfdbfe;
}
.calendarSummaryPill.urgentPill {
  background:#fee2e2;
  color:#b91c1c;
  border-color:#fecaca;
}
.calendarMiniText {
  width:100%;
  display:block;
  font-size:11px;
  color:#475569;
  line-height:1.25;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  background:#f8fafc;
  border:1px solid #e2e8f0;
  border-radius:8px;
  padding:4px 6px;
}
.selectedEventsHeader {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
  margin-top:18px;
  padding:12px;
  border-radius:16px;
  background:linear-gradient(135deg,#eff6ff,#ffffff);
  border:1px solid #bfdbfe;
}
.selectedEventCards {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  gap:12px;
  margin-top:12px;
}
.eventRow {
  border-radius:16px !important;
  border:1px solid #dbe3ef !important;
  background:#fff !important;
  box-shadow:0 10px 24px rgba(15,23,42,.06) !important;
  padding:14px !important;
}
.eventRowTitle {
  font-size:16px;
  line-height:1.35;
  margin-bottom:8px;
  color:#0f172a;
}
.eventMetaLine {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  margin:8px 0;
}
.eventMetaBadge {
  display:inline-flex;
  align-items:center;
  padding:4px 8px;
  border-radius:999px;
  background:#f1f5f9;
  color:#334155;
  font-size:12px;
  font-weight:700;
}
.eventDetailText {
  color:#475569;
  font-size:13px;
  line-height:1.6;
  white-space:pre-wrap;
}
@media (max-width: 520px) {
  .calendarGrid { gap:6px !important; }
  .calendarDay { min-height:78px !important; padding:6px !important; }
  .calendarDayNumber { min-width:24px; height:24px; font-size:13px; }
  .eventCount { display:none !important; }
  .calendarEventList { display:block !important; }
  .calendarEventTag { display:none !important; }
  .calendarMiniText { display:none; }
  .calendarSummaryPill { font-size:10px; padding:3px 5px; }
  .selectedEventCards { grid-template-columns:1fr; }
}

/* ===== Easy icon tabs and colored report cards ===== */
.subTabs { display:flex; flex-wrap:wrap; gap:10px; margin:14px 0 16px; }
.subTabs button { border:1px solid #dbe3ef; background:#fff; color:#334155; border-radius:999px; padding:10px 14px; min-height:42px; font-weight:800; cursor:pointer; box-shadow:0 6px 16px rgba(15,23,42,.06); }
.subTabs button.active { color:#fff; background:linear-gradient(135deg,#2563eb,#1d4ed8); border-color:#1d4ed8; }
.reportCardShell { position:relative; overflow:hidden; }
.reportCardShell::before { content:""; position:absolute; inset:0 auto 0 0; width:9px; background:var(--report-accent,#2563eb); }
.reportCardShell > * { position:relative; }
.reportHeaderPanel { border-radius:20px; background:linear-gradient(135deg, rgba(37,99,235,.10), rgba(255,255,255,.96)); border:1px solid #dbe3ef; padding:16px; margin-bottom:14px; }
.reportSummaryGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-top:14px; }
.reportSummaryItem { border:1px solid #dbe3ef; background:#f8fafc; border-radius:16px; padding:12px; }
.reportSummaryItem span { display:block; color:#64748b; font-size:13px; font-weight:800; }
.reportSummaryItem strong { display:block; margin-top:5px; font-size:18px; color:#0f172a; }
.iconMetric { display:flex; align-items:center; gap:10px; }
.iconMetric .iconBubble { width:38px; height:38px; border-radius:14px; display:flex; align-items:center; justify-content:center; background:#eff6ff; font-size:20px; }
@media (max-width: 760px) { .subTabs { flex-wrap:nowrap; overflow-x:auto; padding-bottom:4px; -webkit-overflow-scrolling:touch; } .subTabs button { flex:0 0 auto; } }

.compareGraphGrid { grid-template-columns: 280px 1fr 130px !important; }
@media (max-width: 760px) {
  .compareGraphGrid {
    grid-template-columns: 1fr !important;
    gap: 6px !important;
  }
  .compareGraphGrid strong {
    margin-bottom: 10px;
  }
}


/* ===== MIYAMA V3 Executive Dashboard / Approval / QR / Export ===== */
.executiveHero {
  background:linear-gradient(135deg,#0f172a,#1d4ed8 55%,#2563eb) !important;
  color:#fff !important;
  border:0 !important;
  position:relative;
  overflow:hidden;
}
.executiveHero::after {
  content:"MIYAMA";
  position:absolute;
  right:22px;
  bottom:-18px;
  font-size:74px;
  font-weight:900;
  opacity:.08;
  letter-spacing:8px;
}
.executiveHero h1, .executiveHero p { color:#fff !important; }
.executiveDashboardGrid {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:14px;
  margin:18px 0;
}
.executiveMetricCard {
  border-radius:22px;
  padding:18px;
  background:#fff;
  border:1px solid #dbe3ef;
  box-shadow:0 14px 34px rgba(15,23,42,.08);
}
.executiveMetricTop {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
}
.executiveMetricIcon {
  width:46px;
  height:46px;
  border-radius:16px;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#eff6ff;
  color:#1d4ed8;
  font-size:24px;
}
.executiveMetricValue {
  display:block;
  font-size:30px;
  font-weight:900;
  color:#0f172a;
  margin-top:10px;
}
.executiveMetricLabel {
  color:#64748b;
  font-size:13px;
  font-weight:800;
}
.kpiBarOuter {
  height:12px;
  border-radius:999px;
  background:#e2e8f0;
  overflow:hidden;
  margin-top:12px;
}
.kpiBarInner {
  height:100%;
  border-radius:999px;
  background:linear-gradient(90deg,#2563eb,#60a5fa);
  transition:width .35s ease;
}
.kpiBarInner.danger { background:linear-gradient(90deg,#dc2626,#fb7185); }
.kpiBarInner.warn { background:linear-gradient(90deg,#f59e0b,#fbbf24); }
.quickActionRow { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
.approvalFlow {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
  gap:12px;
  margin-top:14px;
}
.approvalStep {
  border:1px solid #dbe3ef;
  background:#f8fafc;
  border-radius:18px;
  padding:14px;
  text-align:center;
}
.approvalStep strong { display:block; font-size:18px; margin-top:6px; }
.approvalStepIcon { font-size:30px; }
.aiDiagnosisBox {
  border:2px solid #bfdbfe !important;
  background:linear-gradient(135deg,#eff6ff,#ffffff) !important;
}
.qrPreviewBox {
  display:flex;
  align-items:center;
  gap:14px;
  flex-wrap:wrap;
  border-radius:18px;
  border:1px solid #dbe3ef;
  background:#f8fafc;
  padding:14px;
  margin-top:12px;
}
@media (max-width: 700px) {
  .executiveHero::after { font-size:48px; }
  .executiveMetricValue { font-size:24px; }
}



/* ===== Report header perfect responsive fix ===== */
.reportCardShell, .tableWrap { overflow-x: hidden !important; }
.reportTopCompact {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}
.reportTitleCompact {
  min-width: 0 !important;
  box-sizing: border-box !important;
}
.reportTitleCompact h1, .reportTitleCompact h2, .reportTitleCompact h3, .reportTitleCompact p {
  max-width: 100% !important;
  overflow-wrap: anywhere !important;
}
.reportApprovalCompact {
  min-width: 0 !important;
  max-width: 100% !important;
  width: 100% !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}
.reportApprovalCompact > div {
  min-width: 0 !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}
.reportApprovalCompact input {
  min-width: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  padding-left: 10px !important;
  padding-right: 10px !important;
}
.reportActionBar {
  display:flex !important;
  gap:10px !important;
  flex-wrap:wrap !important;
  align-items:center !important;
  width:100% !important;
  max-width:100% !important;
  box-sizing:border-box !important;
}
.reportActionBar button,
.reportActionBar select {
  flex:0 1 auto !important;
  max-width:100% !important;
}
@media (max-width: 900px) {
  .reportTopCompact { flex-direction: column !important; }
  .reportTitleCompact { flex: 1 1 auto !important; width: 100% !important; }
  .reportApprovalCompact {
    flex: 1 1 auto !important;
    width: 100% !important;
    border-left: 0 !important;
    border-top: 2px solid #0f172a !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
  .reportActionBar button { flex:1 1 140px !important; }
  .reportActionBar select { flex:1 1 160px !important; }
}
@media (max-width: 560px) {
  .reportApprovalCompact { grid-template-columns: 1fr !important; }
  .reportTitleCompact { padding: 12px !important; text-align:left !important; }
  .reportTitleCompact h1 { font-size: 22px !important; }
  .reportTitleCompact h2 { font-size: 20px !important; }
  .reportTitleCompact h3 { font-size: 18px !important; }
  .reportActionBar { gap:8px !important; }
  .reportActionBar button, .reportActionBar select { flex:1 1 100% !important; width:100% !important; }
}

/* ===== Icon label readability patch ===== */
label {
  font-weight: 800 !important;
  color: #334155 !important;
}
.reportGrid label {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
}
.card span, .eventMetaBadge, .calendarSummaryPill {
  letter-spacing: .01em;
}
.tableWrap h2, .tableWrap h3, .calendarEditCard h3 {
  display: flex;
  align-items: center;
  gap: 6px;
}


/* ===== MIYAMA v2 Professional polish ===== */
.tableWrap, .calendarEditCard, .card, .reportSummaryItem {
  transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
}
.tableWrap:hover, .calendarEditCard:hover, .card:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 38px rgba(15,23,42,.10) !important;
}
.primaryButton, .deleteButton, .tabs button, .subTabs button {
  display: inline-flex !important;
  align-items: center !important;
  gap: 7px !important;
}
input:focus, select:focus, textarea:focus {
  outline: 3px solid rgba(37,99,235,.18) !important;
  border-color: #2563eb !important;
}
.readOnlyCalc {
  background: #eff6ff !important;
  color: #1d4ed8 !important;
  font-weight: 900 !important;
}



/* ===== V3.1 anti-cut layout + Miyama AI ===== */
* { box-sizing: border-box; }
.tableWrap, .calendarEditCard, .card, .reportCardShell { max-width: 100% !important; }
.tableWrap { overflow-x: auto !important; overflow-y: visible !important; }
div[style*="grid-template-columns: 1fr 420px"] { grid-template-columns: minmax(0, 1fr) minmax(260px, 360px) !important; width: 100% !important; max-width: 100% !important; overflow-x: auto !important; }
div[style*="grid-template-columns: repeat(4, 1fr)"] { min-width: 0 !important; }
div[style*="grid-template-columns: repeat(4, 1fr)"] input { min-width: 0 !important; width: 100% !important; }
.miyamaAiShell { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr); gap: 18px; align-items: start; }
.miyamaAiHero { background: linear-gradient(135deg, #eff6ff, #ffffff 55%, #eef2ff) !important; border: 1px solid #bfdbfe !important; }
.miyamaAiInput { min-height: 120px !important; font-size: 16px !important; }
.aiAnswerBox { white-space: pre-wrap; line-height: 1.75; font-size: 15px; color: #0f172a; background: #f8fafc; border: 1px solid #dbe3ef; border-radius: 18px; padding: 16px; }
.quickQuestionGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.quickQuestionGrid button { border: 1px solid #dbe3ef; background: #fff; color: #334155; border-radius: 14px; min-height: 46px; padding: 10px 12px; text-align: left; font-weight: 800; cursor: pointer; box-shadow: 0 8px 18px rgba(15,23,42,.06); }
.quickQuestionGrid button:hover { border-color: #2563eb; color: #1d4ed8; transform: translateY(-1px); }
@media (max-width: 980px) { .miyamaAiShell { grid-template-columns: 1fr; } }

/* ===== Production Condition Specialist Page ===== */
.productionHero {
  background: linear-gradient(135deg, #ecfeff, #ffffff 52%, #eff6ff) !important;
  border: 1px solid #bae6fd !important;
}
.productionControlGrid {
  display:grid;
  grid-template-columns: 1.1fr .9fr .9fr auto;
  gap:10px;
  align-items:end;
}
.productionKpiGrid {
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap:12px;
}
.productionKpi {
  border:1px solid #dbe3ef;
  border-radius:18px;
  padding:16px;
  background:#fff;
  box-shadow:0 10px 24px rgba(15,23,42,.06);
}
.productionKpi span { display:block; color:#64748b; font-size:13px; font-weight:800; }
.productionKpi strong { display:block; margin-top:6px; font-size:28px; color:#0f172a; }
.productionGraphCard {
  border:1px solid #dbe3ef;
  background:#fff;
  border-radius:18px;
  padding:14px;
  margin-top:12px;
  box-shadow:0 10px 24px rgba(15,23,42,.05);
}
.productionBarRow {
  display:grid;
  grid-template-columns: minmax(170px, 280px) 1fr 110px;
  gap:12px;
  align-items:center;
  margin:10px 0;
}
.productionBarBg { height:16px; background:#e2e8f0; border-radius:999px; overflow:hidden; }
.productionBarFill { height:100%; border-radius:999px; background:linear-gradient(90deg,#2563eb,#38bdf8); }
.productionBarFill.red { background:linear-gradient(90deg,#ef4444,#fb7185); }
.productionBarFill.orange { background:linear-gradient(90deg,#f97316,#facc15); }
.productionAiShell { display:grid; grid-template-columns:minmax(0,1fr) minmax(330px,.8fr); gap:16px; align-items:start; }
.productionIssueGrid { display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:12px; }
.productionIssueCard { border:1px solid #dbe3ef; border-left:8px solid #ef4444; border-radius:18px; padding:14px; background:#fff; box-shadow:0 10px 24px rgba(15,23,42,.06); }
.productionIssueCard.medium { border-left-color:#f59e0b; }
.productionIssueCard.low { border-left-color:#2563eb; }
.productionMiniChart { width:100%; min-height:220px; border:1px solid #dbe3ef; border-radius:18px; background:linear-gradient(180deg,#fff,#f8fafc); padding:12px; }
.productionLineSvg { width:100%; height:220px; overflow:visible; }
@media (max-width: 980px) {
  .productionControlGrid, .productionAiShell { grid-template-columns:1fr; }
  .productionBarRow { grid-template-columns:1fr; gap:6px; }
}

@media (max-width: 700px) { div[style*="grid-template-columns: 1fr 420px"] { grid-template-columns: 1fr !important; } }


/* ===== Production trend detailed chart ===== */
.productionTrendToolbar {
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:10px;
  margin:12px 0 16px;
}
.productionTrendToolbar button {
  border:1px solid #dbe3ef;
  border-radius:999px;
  padding:10px 16px;
  background:#fff;
  color:#334155;
  font-weight:900;
  cursor:pointer;
  box-shadow:0 8px 18px rgba(15,23,42,.06);
}
.productionTrendToolbar button.active {
  background:linear-gradient(135deg,#2563eb,#1d4ed8);
  border-color:#1d4ed8;
  color:white;
}
.productionTrendGuide {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
  gap:10px;
  margin:10px 0 14px;
}
.productionTrendGuide div {
  border:1px solid #dbe3ef;
  background:linear-gradient(135deg,#f8fafc,#ffffff);
  border-radius:16px;
  padding:12px;
  color:#334155;
  font-size:13px;
  line-height:1.6;
}
.productionTrendGuide b { color:#0f172a; }
.productionTrendTable {
  display:grid;
  gap:8px;
  margin-top:12px;
}
.productionTrendRow {
  display:grid;
  grid-template-columns:150px minmax(0,1fr) 120px 100px;
  gap:10px;
  align-items:center;
  padding:10px 12px;
  border:1px solid #e2e8f0;
  border-radius:14px;
  background:#fff;
}
.productionTrendRow strong { color:#0f172a; }
.productionTrendRow small { color:#64748b; }
.productionTrendBarBg {
  height:18px;
  background:#eaf1fb;
  border-radius:999px;
  overflow:hidden;
}
.productionTrendBarFill {
  height:100%;
  border-radius:999px;
  background:linear-gradient(90deg,#2563eb,#60a5fa);
}
.productionTrendRow.hot .productionTrendBarFill { background:linear-gradient(90deg,#ef4444,#fb7185); }
.productionTrendRow.warn .productionTrendBarFill { background:linear-gradient(90deg,#f97316,#facc15); }
@media (max-width:760px){
  .productionTrendRow { grid-template-columns:1fr; gap:6px; }
  .productionTrendToolbar { flex-wrap:nowrap; overflow-x:auto; padding-bottom:4px; }
  .productionTrendToolbar button { flex:0 0 auto; }
}




/* ===== V5 Supreme production stop-analysis center ===== */
.productionHero { background:linear-gradient(135deg,#ffffff,#eff6ff) !important; border:1px solid #bfdbfe !important; }
.productionKpiGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:16px; }
.productionKpi { border:1px solid #dbe3ef; border-radius:18px; background:linear-gradient(180deg,#fff,#f8fafc); padding:16px; box-shadow:0 10px 26px rgba(15,23,42,.07); }
.productionKpi small { display:block; color:#64748b; margin-top:4px; font-weight:700; }
.productionGraphCard { margin-top:14px; padding:14px; border:1px solid #dbe3ef; border-radius:18px; background:#fff; }
.productionBarRow { display:grid; grid-template-columns:260px 1fr 130px; gap:12px; align-items:center; padding:10px 0; border-bottom:1px dashed #e2e8f0; }
.productionBarRow:last-child { border-bottom:0; }

.productionRankToolbar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin:12px 0 16px; }
.productionRankToolbar button, .productionRankToolbar select { border:1px solid #cbd5e1; background:#fff; border-radius:999px; padding:10px 14px; min-height:42px; font-weight:900; cursor:pointer; }
.productionRankToolbar button.active { color:#fff; background:linear-gradient(135deg,#2563eb,#1d4ed8); border-color:#1d4ed8; box-shadow:0 10px 24px rgba(37,99,235,.22); }
.productionRankExplain { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; margin:10px 0 14px; }
.productionRankExplain div { background:#f8fafc; border:1px solid #dbe3ef; border-radius:14px; padding:10px; color:#334155; font-size:13px; line-height:1.5; }
.productionDetailBarRow { display:grid; grid-template-columns:54px minmax(210px,280px) 1fr minmax(120px,170px); gap:12px; align-items:center; padding:13px 0; border-bottom:1px dashed #dbe3ef; }
.productionDetailBarRow:last-child { border-bottom:0; }
.productionRankNo { width:38px; height:38px; border-radius:12px; display:flex; align-items:center; justify-content:center; background:#eff6ff; color:#1d4ed8; font-weight:1000; }
.productionRankNo.top { background:#fee2e2; color:#b91c1c; }
.productionRankName b { display:block; font-size:15px; color:#0f172a; margin-bottom:3px; }
.productionRankName small { display:block; color:#64748b; line-height:1.45; }
.productionBarBg.detail { height:18px; border-radius:999px; overflow:hidden; background:#e2e8f0; position:relative; }
.productionBarBg.detail::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg,rgba(255,255,255,.30),rgba(255,255,255,0)); pointer-events:none; }
.productionRankValue { text-align:right; font-weight:1000; color:#0f172a; }
.productionRankValue span { display:block; font-size:12px; color:#64748b; font-weight:800; }
.productionRankChips { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
.productionRankChip { display:inline-flex; align-items:center; border-radius:999px; padding:3px 8px; background:#f1f5f9; color:#334155; font-size:11px; font-weight:800; }
.machineBreakdownGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; margin-top:14px; }
.machineBreakdownCard { border:1px solid #dbe3ef; border-radius:18px; background:#fff; padding:14px; box-shadow:0 10px 24px rgba(15,23,42,.06); }
.machineBreakdownCard h3 { margin:0 0 8px; }
.machineMiniRow { display:grid; grid-template-columns:1fr 70px; gap:8px; align-items:center; padding:7px 0; border-top:1px dashed #e2e8f0; }
.machineMiniRow small { color:#64748b; }
@media (max-width: 900px) { .productionDetailBarRow { grid-template-columns:44px 1fr; } .productionDetailBarRow .productionBarBg, .productionDetailBarRow .productionRankValue { grid-column:2; text-align:left; } }

.productionBarBg { height:18px; background:#e2e8f0; border-radius:999px; overflow:hidden; }
.productionBarFill { height:100%; border-radius:999px; background:linear-gradient(90deg,#2563eb,#38bdf8); }
.productionBarFill.red { background:linear-gradient(90deg,#ef4444,#fb7185); }
.productionBarFill.orange { background:linear-gradient(90deg,#f97316,#facc15); }
.productionAiShell { display:grid; grid-template-columns:minmax(0,1fr) minmax(330px,.85fr); gap:16px; align-items:start; }
.productionIssueGrid { display:grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap:12px; }
.productionIssueCard { border:1px solid #dbe3ef; border-left:8px solid #ef4444; border-radius:20px; padding:16px; background:#fff; box-shadow:0 10px 24px rgba(15,23,42,.06); }
.productionIssueCard.medium { border-left-color:#f59e0b; }
.productionIssueCard.low { border-left-color:#2563eb; }
.productionMiniChart { width:100%; min-height:250px; border:1px solid #dbe3ef; border-radius:18px; background:linear-gradient(180deg,#fff,#f8fafc); padding:12px; overflow-x:auto; }
.productionLineSvg { width:100%; min-width:900px; height:260px; overflow:visible; }
.productionTrendToolbar { display:flex; flex-wrap:wrap; gap:10px; margin:14px 0; }
.productionTrendToolbar button { border:1px solid #cbd5e1; background:#fff; border-radius:999px; padding:10px 14px; font-weight:900; cursor:pointer; }
.productionTrendToolbar button.active { color:#fff; background:linear-gradient(135deg,#2563eb,#1d4ed8); border-color:#1d4ed8; box-shadow:0 8px 18px rgba(37,99,235,.24); }
.productionTrendGuide { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; margin:10px 0 14px; }
.productionTrendGuide div { border:1px solid #dbe3ef; border-radius:16px; background:#f8fafc; padding:12px; color:#475569; }
.productionTrendTable { display:grid; gap:8px; margin-top:12px; }
.productionTrendRow { display:grid; grid-template-columns:180px 1fr 110px 220px; gap:10px; align-items:center; border:1px solid #e2e8f0; border-radius:14px; padding:10px; background:#fff; }
.productionTrendRow.hot { border-color:#fecaca; background:#fff7f7; }
.productionTrendRow.warn { border-color:#fed7aa; background:#fffaf0; }
.productionTrendBarBg { height:14px; background:#e2e8f0; border-radius:999px; overflow:hidden; }
.productionTrendBarFill { height:100%; border-radius:999px; background:linear-gradient(90deg,#2563eb,#60a5fa); }
.productionTrendRow.hot .productionTrendBarFill { background:linear-gradient(90deg,#ef4444,#fb7185); }
.productionTrendRow.warn .productionTrendBarFill { background:linear-gradient(90deg,#f97316,#facc15); }
@media (max-width: 900px) { .productionAiShell, .productionControlGrid { grid-template-columns:1fr !important; } .productionBarRow, .productionTrendRow { grid-template-columns:1fr !important; gap:6px; } .productionLineSvg { min-width:720px; } }


/* ===== V6.9 Kaizen Decision Dashboard ===== */
.kaizenMissionBox {
  border:1px solid #bfdbfe;
  background:linear-gradient(135deg,#eff6ff,#ffffff);
  border-radius:22px;
  padding:18px;
  margin:16px 0;
}
.kaizenMissionText {
  font-size:18px;
  font-weight:1000;
  color:#0f172a;
  line-height:1.7;
}
.kaizenFlowGrid {
  display:grid;
  grid-template-columns:1fr auto 1fr;
  gap:14px;
  align-items:stretch;
  margin-top:14px;
}
.kaizenFlowCard {
  border:1px solid #dbe3ef;
  border-left:8px solid #ef4444;
  border-radius:18px;
  padding:16px;
  background:#fff;
}
.kaizenFlowCard.target { border-left-color:#2563eb; }
.kaizenArrow { display:flex; align-items:center; justify-content:center; font-size:30px; font-weight:1000; color:#2563eb; }
.kaizenKpiGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:14px 0 18px; }
.kaizenKpiCard { border:1px solid #dbe3ef; background:#fff; border-radius:18px; padding:16px; box-shadow:0 10px 24px rgba(15,23,42,.06); }
.kaizenKpiCard span { display:block; color:#64748b; font-size:13px; font-weight:900; }
.kaizenKpiCard strong { display:block; color:#0f172a; font-size:28px; margin-top:6px; line-height:1.2; }
.kaizenKpiCard small { display:block; color:#64748b; margin-top:6px; font-weight:800; }
.kaizenKpiCard.danger { border-left:7px solid #ef4444; }
.kaizenKpiCard.good { border-left:7px solid #2563eb; }
.kaizenKpiCard.warn { border-left:7px solid #f59e0b; }
.kaizenMaturity { font-size:26px !important; }
.chronicThemeGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin-top:12px; }
.chronicThemeCard { border:1px solid #dbe3ef; border-left:8px solid #ef4444; background:#fff; border-radius:18px; padding:16px; box-shadow:0 10px 24px rgba(15,23,42,.06); }
.chronicThemeCard.medium { border-left-color:#f59e0b; }
.chronicThemeCard.low { border-left-color:#2563eb; }
.chronicThemeCard h3 { margin:8px 0; line-height:1.35; }
.chronicMetricGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:10px 0; }
.chronicMetric { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:8px; font-weight:900; color:#0f172a; }
.chronicMetric small { display:block; color:#64748b; font-weight:800; margin-bottom:2px; }
.stopReasonTop { margin-top:12px; }
.stopReasonRow { display:grid; grid-template-columns:52px minmax(180px,260px) 1fr 95px; gap:12px; align-items:center; padding:12px 0; border-bottom:1px dashed #dbe3ef; }
.stopReasonRow:last-child { border-bottom:0; }
.stopReasonName b { display:block; color:#0f172a; }
.stopReasonName small { color:#64748b; }
.stopReasonValue { text-align:right; font-weight:1000; color:#0f172a; }
@media (max-width:900px){ .kaizenFlowGrid{grid-template-columns:1fr;} .kaizenArrow{transform:rotate(90deg);} .stopReasonRow{grid-template-columns:44px 1fr;} .stopReasonRow .productionBarBg,.stopReasonRow .stopReasonValue{grid-column:2;text-align:left;} }

/* ===== V7 Decision cards - easy for managers ===== */
.kaizenDecisionHeadline {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
  gap:12px;
  margin:14px 0;
}
.kaizenDecisionBox {
  border-radius:18px;
  background:#fff;
  border:1px solid #dbe3ef;
  border-left:8px solid #ef4444;
  padding:16px;
  box-shadow:0 10px 24px rgba(15,23,42,.06);
}
.kaizenDecisionBox.target { border-left-color:#2563eb; }
.kaizenDecisionBox h3 { margin:0 0 8px; color:#0f172a; }
.kaizenDecisionBox p { margin:0; color:#475569; line-height:1.7; }
.chronicThemeGrid { grid-template-columns:repeat(auto-fit,minmax(360px,1fr)) !important; }
.chronicThemeCard { padding:18px !important; }
.chronicThemeHeader { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; }
.chronicThemeTitle { display:flex; align-items:center; gap:8px; font-size:18px; font-weight:1000; color:#0f172a; }
.chronicThemeNo { display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#fee2e2; color:#b91c1c; padding:6px 10px; font-weight:1000; }
.chronicThemeCard.medium .chronicThemeNo { background:#ffedd5; color:#c2410c; }
.chronicThemeCard.low .chronicThemeNo { background:#eff6ff; color:#1d4ed8; }
.chronicSimpleTable { display:grid; grid-template-columns:110px 1fr; gap:8px 12px; margin:12px 0; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; }
.chronicSimpleTable span { color:#64748b; font-weight:900; }
.chronicSimpleTable strong { color:#0f172a; font-weight:1000; }
.chronicStarBlock { display:grid; grid-template-columns:110px 1fr; gap:8px 12px; margin:12px 0; }
.chronicStars { letter-spacing:3px; color:#f59e0b; font-size:18px; font-weight:1000; }
.chronicTextBlock { color:#475569; line-height:1.7; margin:10px 0; }
.chronicActionFooter { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
.chronicActionFooter button { flex:0 1 auto; }
@media (max-width:700px){ .chronicThemeGrid { grid-template-columns:1fr !important; } .chronicSimpleTable,.chronicStarBlock{grid-template-columns:1fr;} }



/* ===== V7.1 9.9 Kaizen executive decision layout ===== */
.maintenanceMaturityHero { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:16px 0; }
.maturityPanel { border:1px solid #dbe3ef; background:linear-gradient(180deg,#ffffff,#f8fafc); border-radius:22px; padding:18px; box-shadow:0 12px 30px rgba(15,23,42,.07); }
.maturityPanel.current { border-left:9px solid #ef4444; }
.maturityPanel.goal { border-left:9px solid #2563eb; }
.maturityPanel.future { border-left:9px solid #16a34a; }
.maturityPanel span { display:block; color:#64748b; font-weight:900; font-size:13px; }
.maturityPanel strong { display:block; color:#0f172a; font-size:30px; line-height:1.2; margin-top:6px; }
.maturityPanel small { display:block; color:#475569; font-weight:800; line-height:1.6; margin-top:8px; }
.maintenanceGoalTable { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:14px; }
.goalMetric { border:1px solid #dbe3ef; border-radius:18px; padding:14px; background:#fff; }
.goalMetric span { display:block; color:#64748b; font-weight:900; font-size:13px; }
.goalMetric strong { display:block; color:#0f172a; font-size:24px; margin-top:5px; }
.goalMetric small { display:block; color:#64748b; font-weight:800; margin-top:5px; }
.stopReasonTop.v71 { display:grid; gap:12px; }
.stopReasonRow.v71 { grid-template-columns:62px minmax(220px,320px) 1fr 120px; padding:14px 0; }
.stopReasonRow.v71 .stopReasonValue strong { display:block; font-size:20px; }
.stopReasonRow.v71 .stopReasonValue small { color:#64748b; font-weight:800; }
.rankHintGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:10px; margin:12px 0; }
.rankHintGrid div { border:1px solid #dbe3ef; background:#f8fafc; border-radius:15px; padding:11px; color:#475569; font-weight:800; line-height:1.55; }
@media (max-width:900px){ .maintenanceMaturityHero { grid-template-columns:1fr; } .stopReasonRow.v71 { grid-template-columns:44px 1fr; } .stopReasonRow.v71 .productionBarBg,.stopReasonRow.v71 .stopReasonValue{ grid-column:2; text-align:left; } }


/* ===== V8 Daily production database ===== */
.productionDbHero { background:linear-gradient(135deg,#ecfeff,#ffffff 55%,#eff6ff) !important; border:1px solid #bae6fd !important; }
.productionDbGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-top:12px; }
.productionDbCard { border:1px solid #dbe3ef; border-radius:18px; background:#fff; padding:16px; box-shadow:0 10px 24px rgba(15,23,42,.06); }
.productionDbCard span { display:block; color:#64748b; font-size:13px; font-weight:900; }
.productionDbCard strong { display:block; margin-top:6px; font-size:26px; color:#0f172a; }
.productionDbTable { width:100%; border-collapse:collapse; min-width:760px; }
.productionDbTable th, .productionDbTable td { border-bottom:1px solid #e2e8f0; padding:10px; text-align:left; }
.productionDbTable th { background:#f8fafc; color:#334155; font-size:13px; }
.productionDbExample { border:1px solid #dbe3ef; background:#f8fafc; border-radius:16px; padding:14px; line-height:1.75; color:#334155; }

`;


function Section({ sectionKey, title, children, openSections, toggleSection }) {
  const open = openSections?.[sectionKey] ?? true;
  return (
    <div className="calendarEditCard" style={{ marginTop: "14px" }}>
      <div
        onClick={() => toggleSection?.(sectionKey)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
        }}
      >
        <h3>{title}</h3>
        <strong>{open ? "▲" : "▼"}</strong>
      </div>
      {open && <div style={{ marginTop: "10px" }}>{children}</div>}
    </div>
  );
}


// ===== V12 日本語IME安定入力 =====
// Reactの再描画やFirebase自動保存が日本語変換中に走らないよう、
// 入力中はローカル値を保持し、変換確定・フォーカス解除時だけ保存します。
function ImeSafeInput({ value = "", onCommit, onChange, ...props }) {
  const [localValue, setLocalValue] = useState(value ?? "");
  const composingRef = useRef(false);
  const lastCommittedRef = useRef(String(value ?? ""));

  useEffect(() => {
    if (!composingRef.current) {
      const nextValue = String(value ?? "");
      setLocalValue(nextValue);
      lastCommittedRef.current = nextValue;
    }
  }, [value]);

  const commit = (nextValue) => {
    const normalized = String(nextValue ?? "");
    setLocalValue(normalized);

    if (normalized === lastCommittedRef.current) return;
    lastCommittedRef.current = normalized;

    if (onCommit) {
      Promise.resolve(onCommit(normalized)).catch((error) => {
        console.error("IME input save error:", error);
      });
    } else if (onChange) {
      onChange({ target: { value: normalized } });
    }
  };

  return (
    <input
      {...props}
      value={localValue}
      onCompositionStart={(event) => {
        composingRef.current = true;
        props.onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const nextValue = event.currentTarget.value;
        setLocalValue(nextValue);
        props.onCompositionEnd?.(event);
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setLocalValue(nextValue);

        if (!composingRef.current && props.type === "number") {
          commit(nextValue);
        }
      }}
      onBlur={(event) => {
        if (!composingRef.current) commit(event.currentTarget.value);
        props.onBlur?.(event);
      }}
    />
  );
}

function ImeSafeTextarea({ value = "", onCommit, onChange, ...props }) {
  const [localValue, setLocalValue] = useState(value ?? "");
  const composingRef = useRef(false);
  const lastCommittedRef = useRef(String(value ?? ""));

  useEffect(() => {
    if (!composingRef.current) {
      const nextValue = String(value ?? "");
      setLocalValue(nextValue);
      lastCommittedRef.current = nextValue;
    }
  }, [value]);

  const commit = (nextValue) => {
    const normalized = String(nextValue ?? "");
    setLocalValue(normalized);

    if (normalized === lastCommittedRef.current) return;
    lastCommittedRef.current = normalized;

    if (onCommit) {
      Promise.resolve(onCommit(normalized)).catch((error) => {
        console.error("IME textarea save error:", error);
      });
    } else if (onChange) {
      onChange({ target: { value: normalized } });
    }
  };

  return (
    <textarea
      {...props}
      value={localValue}
      onCompositionStart={(event) => {
        composingRef.current = true;
        props.onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        setLocalValue(event.currentTarget.value);
        props.onCompositionEnd?.(event);
      }}
      onChange={(event) => setLocalValue(event.target.value)}
      onBlur={(event) => {
        if (!composingRef.current) commit(event.currentTarget.value);
        props.onBlur?.(event);
      }}
    />
  );
}


function AsyncTranslatedText({ text = "", language = "ja", as: Tag = "span", ...props }) {
  const original = String(text ?? "");
  const [displayText, setDisplayText] = useState(original);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (language === "ja" || !containsJapaneseText(original)) {
      setDisplayText(original);
      return () => controller.abort();
    }

    setDisplayText(original);

    translateJapaneseLongText(original, controller.signal, language)
      .then((translated) => {
        if (!cancelled) setDisplayText(translated || original);
      })
      .catch((error) => {
        if (!cancelled && error?.name !== "AbortError") {
          console.warn("Field translation failed:", error);
          setDisplayText(original);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [original, language]);

  return <Tag {...props}>{displayText}</Tag>;
}

function TranslatedReadOnlyInput({ value = "", language = "ja", placeholder = "", ...props }) {
  const original = String(value ?? "");
  const [displayValue, setDisplayValue] = useState(original);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (language === "ja" || !containsJapaneseText(original)) {
      setDisplayValue(original);
      return () => controller.abort();
    }

    setDisplayValue(
      language === "es" ? "Traduciendo..." : language === "en" ? "Translating..." : original
    );

    translateJapaneseLongText(original, controller.signal, language)
      .then((translated) => {
        if (!cancelled) setDisplayValue(translated || original);
      })
      .catch((error) => {
        if (!cancelled && error?.name !== "AbortError") {
          console.warn("Input display translation failed:", error);
          setDisplayValue(original);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [original, language]);

  return (
    <input
      {...props}
      value={displayValue}
      placeholder={placeholder}
      readOnly
      title={
        language === "es"
          ? "Cambie a japonés para editar los datos originales."
          : language === "en"
            ? "Switch to Japanese to edit the original data."
            : undefined
      }
    />
  );
}

function TranslatedReadOnlyTextarea({ value = "", language = "ja", placeholder = "", ...props }) {
  const original = String(value ?? "");
  const [displayValue, setDisplayValue] = useState(original);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (language === "ja" || !containsJapaneseText(original)) {
      setDisplayValue(original);
      return () => controller.abort();
    }

    setDisplayValue(
      language === "es" ? "Traduciendo..." : language === "en" ? "Translating..." : original
    );

    translateJapaneseLongText(original, controller.signal, language)
      .then((translated) => {
        if (!cancelled) setDisplayValue(translated || original);
      })
      .catch((error) => {
        if (!cancelled && error?.name !== "AbortError") {
          console.warn("Textarea display translation failed:", error);
          setDisplayValue(original);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [original, language]);

  return (
    <textarea
      {...props}
      value={displayValue}
      placeholder={placeholder}
      readOnly
      title={
        language === "es"
          ? "Cambie a japonés para editar los datos originales."
          : language === "en"
            ? "Switch to Japanese to edit the original data."
            : undefined
      }
    />
  );
}


// ===== V15 Firebase長文の表示翻訳（日本語 → 英語） =====
// Firebaseの原文は変更せず、AI検索結果に表示する長文だけを翻訳します。
// 翻訳結果はブラウザにキャッシュし、同じ文章を何度も通信しません。
const MIYAMA_LONG_TRANSLATION_CACHE_KEY = "miyamaLongTranslationCacheV1";
const MIYAMA_TRANSLATE_ENDPOINT =
  import.meta.env.VITE_TRANSLATION_API_URL ||
  "https://translate.googleapis.com/translate_a/single";

function containsJapaneseText(value = "") {
  return /[ぁ-んァ-ン一-龯々〆ヵヶ]/.test(String(value || ""));
}

function makeLongTranslationKey(value = "") {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}_${(hash >>> 0).toString(36)}`;
}

let MIYAMA_LONG_TRANSLATION_MEMORY_CACHE = null;
let MIYAMA_LONG_TRANSLATION_SAVE_TIMER = null;

function readLongTranslationCache() {
  if (MIYAMA_LONG_TRANSLATION_MEMORY_CACHE) {
    return MIYAMA_LONG_TRANSLATION_MEMORY_CACHE;
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(MIYAMA_LONG_TRANSLATION_CACHE_KEY) || "{}");
    MIYAMA_LONG_TRANSLATION_MEMORY_CACHE =
      parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    MIYAMA_LONG_TRANSLATION_MEMORY_CACHE = {};
  }

  return MIYAMA_LONG_TRANSLATION_MEMORY_CACHE;
}

function writeLongTranslationCache(cache = {}) {
  MIYAMA_LONG_TRANSLATION_MEMORY_CACHE = cache;

  if (MIYAMA_LONG_TRANSLATION_SAVE_TIMER) {
    window.clearTimeout(MIYAMA_LONG_TRANSLATION_SAVE_TIMER);
  }

  MIYAMA_LONG_TRANSLATION_SAVE_TIMER = window.setTimeout(() => {
    try {
      const entries = Object.entries(MIYAMA_LONG_TRANSLATION_MEMORY_CACHE || {});
      const limited = Object.fromEntries(entries.slice(-800));
      MIYAMA_LONG_TRANSLATION_MEMORY_CACHE = limited;
      localStorage.setItem(
        MIYAMA_LONG_TRANSLATION_CACHE_KEY,
        JSON.stringify(limited)
      );
    } catch (error) {
      console.warn("Translation cache could not be saved:", error);
    }
  }, 700);
}

function splitTranslationText(value = "", maxLength = 1200) {
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let cut = Math.max(
      remaining.lastIndexOf("。", maxLength),
      remaining.lastIndexOf("\n", maxLength),
      remaining.lastIndexOf(" ", maxLength)
    );
    if (cut < Math.floor(maxLength * 0.5)) cut = maxLength;
    else cut += 1;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function translateJapaneseChunk(text, targetLanguage = "en", signal) {
  const original = String(text ?? "");
  if (!original || !containsJapaneseText(original)) return original;

  const response = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: original,
      targetLanguage: targetLanguage === "es" ? "es" : "en",
    }),
    signal,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    throw new Error("Translation server returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(data?.error || `Translation HTTP ${response.status}`);
  }

  return String(data?.translatedText || original);
}

async function translateJapaneseLongText(value, signal, targetLanguage = "en") {
  const original = String(value || "");
  if (!original || !containsJapaneseText(original)) return original;

  const cacheKey = makeLongTranslationKey(`${targetLanguage}|${original}`);
  const cache = readLongTranslationCache();
  if (cache[cacheKey]) return cache[cacheKey];

  const chunks = splitTranslationText(original);
  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateJapaneseChunk(chunk, targetLanguage, signal));
  }

  const translated = translatedChunks.join("");
  cache[cacheKey] = translated;
  writeLongTranslationCache(cache);
  return translated;
}

function makeAiTranslationItemKey(item = {}, index = 0) {
  return makeLongTranslationKey(`${index}|${item.category || ""}|${item.date || ""}|${item.title || ""}|${item.text || ""}`);
}


function extractJsonObject(text = "") {
  const source = String(text || "").trim();
  if (!source) throw new Error("A IA retornou uma resposta vazia.");

  const withoutFence = source
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const firstBrace = withoutFence.indexOf("{");
    const lastBrace = withoutFence.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Não foi possível interpretar a resposta da IA.");
  }
}

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authProfile, setAuthProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      setAuthMessage("");

      if (!user) {
        setAuthUser(null);
        setAuthProfile(null);
        setAuthLoading(false);
        return;
      }

      try {
        const profileSnap = await getDoc(doc(db, "users", user.uid));

        if (!profileSnap.exists()) {
          setAuthMessage("このユーザーの権限設定がありません。管理者へ連絡してください。");
          setAuthUser(null);
          setAuthProfile(null);
          await signOut(auth);
          setAuthLoading(false);
          return;
        }

        const profile = { id: profileSnap.id, ...profileSnap.data() };

        if (profile.active === false) {
          setAuthMessage("このユーザーは無効になっています。管理者へ連絡してください。");
          setAuthUser(null);
          setAuthProfile(null);
          await signOut(auth);
          setAuthLoading(false);
          return;
        }

        setAuthUser(user);
        setAuthProfile(profile);
      } catch (error) {
        console.error("User profile load error:", error);
        setAuthMessage("ユーザー権限の読込に失敗しました。");
        setAuthUser(null);
        setAuthProfile(null);
      } finally {
        setAuthLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  if (authLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg,#eff6ff,#f8fafc)"
      }}>
        <div style={{
          padding: "28px",
          borderRadius: "22px",
          background: "#fff",
          boxShadow: "0 20px 55px rgba(15,23,42,.12)",
          fontWeight: 900
        }}>
          🔐 MIYAMA Maintenance — 読み込み中...
        </div>
      </div>
    );
  }

  if (!authUser || !authProfile) {
    return <LoginScreen message={authMessage} />;
  }

  return (
    <MaintenanceApp
      currentUser={authUser}
      userProfile={authProfile}
    />
  );
}

function MaintenanceApp({ currentUser, userProfile }) {
  const currentUserName =
    String(
      userProfile?.name ||
      currentUser?.displayName ||
      currentUser?.email ||
      ""
    ).trim();

  const currentRole = String(userProfile?.role || "operator").toLowerCase();

  const canInspect =
    userProfile?.canInspect === true ||
    ["inspector", "approver", "admin"].includes(currentRole);

  const canApprove =
    userProfile?.canApprove === true ||
    ["approver", "admin"].includes(currentRole);

  const isAdmin =
    userProfile?.isAdmin === true ||
    currentRole === "admin";

  function roleLabel() {
    if (currentRole === "admin") return "管理者 / Admin";
    if (currentRole === "approver") return "承認者 / Approver";
    if (currentRole === "inspector") return "点検者 / Inspector";
    if (currentRole === "viewer") return "閲覧のみ / View only";
    return "作業者 / Operator";
  }

  function approvalPermissionMessage(type) {
    if (type === "approve") {
      return appLanguage === "es"
        ? "No tiene permiso para aprobar este informe."
        : appLanguage === "en"
          ? "You do not have permission to approve this report."
          : "この報告書を承認する権限がありません。";
    }

    return appLanguage === "es"
      ? "No tiene permiso para inspeccionar este informe."
      : appLanguage === "en"
        ? "You do not have permission to inspect this report."
        : "この報告書を点検する権限がありません。";
  }

  async function logoutCurrentUser() {
    if (!window.confirm("ログアウトしますか？")) return;
    await signOut(auth);
  }

  function permissionsForRole(role = "operator") {
    const normalized = String(role || "operator").toLowerCase();
    if (normalized === "admin") {
      return { isAdmin: true, canApprove: true, canInspect: true, readOnly: false };
    }
    if (normalized === "approver") {
      return { isAdmin: false, canApprove: true, canInspect: true, readOnly: false };
    }
    if (normalized === "inspector") {
      return { isAdmin: false, canApprove: false, canInspect: true, readOnly: false };
    }
    if (normalized === "viewer") {
      return { isAdmin: false, canApprove: false, canInspect: false, readOnly: true };
    }
    return { isAdmin: false, canApprove: false, canInspect: false, readOnly: false };
  }

  function userRoleJapanese(role = "operator") {
    const normalized = String(role || "operator").toLowerCase();
    if (normalized === "admin") return "管理者";
    if (normalized === "approver") return "承認者";
    if (normalized === "inspector") return "点検者";
    if (normalized === "viewer") return "閲覧のみ";
    return "一般ユーザー";
  }

  async function loadSystemUsers() {
    if (!isAdmin) return;
    setSystemUsersLoading(true);
    setUserAdminMessage("");
    try {
      const snap = await getDocs(collection(db, "users"));
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")));
      setSystemUsers(rows);
    } catch (error) {
      console.error("Load users error:", error);
      setUserAdminMessage(`ユーザー一覧の読込に失敗しました: ${error?.message || error}`);
    } finally {
      setSystemUsersLoading(false);
    }
  }

  async function createSystemUserAccount() {
    if (!isAdmin) return;
    const name = String(newSystemUser.name || "").trim();
    const email = String(newSystemUser.email || "").trim().toLowerCase();
    const password = String(newSystemUser.password || "");
    const role = String(newSystemUser.role || "operator").toLowerCase();

    if (!name) {
      setUserAdminMessage("名前を入力してください。");
      return;
    }
    if (!email || !email.includes("@")) {
      setUserAdminMessage("正しいメールアドレスを入力してください。");
      return;
    }
    if (password.length < 6) {
      setUserAdminMessage("初期パスワードは6文字以上で入力してください。");
      return;
    }

    setCreatingSystemUser(true);
    setUserAdminMessage("");

    let secondaryApp = null;
    let secondaryAuth = null;

    try {
      // Secondary Firebase app creates the account without logging out the current admin.
      secondaryApp = initializeApp(getApp().options, `miyama-user-create-${Date.now()}`);
      secondaryAuth = getAuth(secondaryApp);

      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const permissions = permissionsForRole(role);

      const profile = {
        name,
        email,
        role,
        active: true,
        ...permissions,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.uid || "",
      };

      await setDoc(doc(db, "users", credential.user.uid), profile);
      await signOut(secondaryAuth);

      setNewSystemUser({ name: "", email: "", password: "", role: "operator" });
      setUserAdminMessage(`✅ ${name} のアカウントを作成しました。`);
      await loadSystemUsers();
    } catch (error) {
      console.error("Create user error:", error);
      const codeText = String(error?.code || "");
      let message = error?.message || String(error);
      if (codeText.includes("email-already-in-use")) message = "このメールアドレスはすでに使用されています。";
      if (codeText.includes("invalid-email")) message = "メールアドレスが正しくありません。";
      if (codeText.includes("weak-password")) message = "パスワードが弱すぎます。6文字以上にしてください。";
      if (codeText.includes("permission-denied")) message = "Firestoreの権限でユーザー作成が拒否されました。";
      setUserAdminMessage(`❌ ${message}`);
    } finally {
      try {
        if (secondaryAuth?.currentUser) await signOut(secondaryAuth);
      } catch {}
      try {
        if (secondaryApp) await deleteApp(secondaryApp);
      } catch {}
      setCreatingSystemUser(false);
    }
  }

  async function updateSystemUserProfile(userId, patch = {}) {
    if (!isAdmin || !userId) return;
    if (userId === currentUser?.uid && patch.active === false) {
      setUserAdminMessage("現在ログイン中の管理者アカウントは無効化できません。");
      return;
    }

    try {
      const nextPatch = { ...patch, updatedAt: new Date().toISOString() };
      if (patch.role) Object.assign(nextPatch, permissionsForRole(patch.role));
      await updateDoc(doc(db, "users", userId), nextPatch);
      setUserAdminMessage("✅ ユーザー設定を更新しました。");
      await loadSystemUsers();
    } catch (error) {
      console.error("Update user error:", error);
      setUserAdminMessage(`❌ 更新に失敗しました: ${error?.message || error}`);
    }
  }

  const [parts, setParts] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [similarProblems, setSimilarProblems] = useState([]);
  const [plannedWorks, setPlannedWorks] = useState([]);

  // ===== Admin: user management =====
  const [systemUsers, setSystemUsers] = useState([]);
  const [systemUsersLoading, setSystemUsersLoading] = useState(false);
  const [userAdminMessage, setUserAdminMessage] = useState("");
  const [newSystemUser, setNewSystemUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "operator",
  });
  const [creatingSystemUser, setCreatingSystemUser] = useState(false);

  // 編集中の報告書はローカル下書きで保持します。
  // 文字入力ごとにFirebase保存しないため、入力欄が消える・戻る不具合を防ぎます。
  const [reportDrafts, setReportDrafts] = useState({});
  const [reportDirty, setReportDirty] = useState({});
  const [reportSavingId, setReportSavingId] = useState(null);

  const [page, setPage] = useState("home");
  const topMenuRef = useRef(null);
  const [appLanguage, setAppLanguage] = useState(() => {
    const savedLanguage = localStorage.getItem("miyamaLanguage") || "ja";
    return MIYAMA_LANGUAGES[savedLanguage] ? savedLanguage : "ja";
  });

  useEffect(() => {
    if (isAdmin && page === "users") loadSystemUsers();
  }, [isAdmin, page]);

  const [globalSearch, setGlobalSearch] = useState("");
  const GLOBAL_RESULTS_PER_PAGE = 20;
  const [globalPage, setGlobalPage] = useState(1);
  const [reportSearch, setReportSearch] = useState("");
  const [reportPage, setReportPage] = useState(1);
  const REPORTS_PER_PAGE = 8;
  const [spareSearch, setSpareSearch] = useState("");
  const [maintenanceSearch, setMaintenanceSearch] = useState("");
  const [maintenanceTypeFilter, setMaintenanceTypeFilter] = useState("全て");
  const [maintenanceEquipmentFilter, setMaintenanceEquipmentFilter] = useState("全て");
  const [maintenanceSort, setMaintenanceSort] = useState("urgent");
  const [spareAiInput, setSpareAiInput] = useState("");
  const [spareAiPreview, setSpareAiPreview] = useState(null);
  const [sparePhotoImage, setSparePhotoImage] = useState("");
  const [sparePhotoOcrText, setSparePhotoOcrText] = useState("");
  const [sparePhotoLoading, setSparePhotoLoading] = useState(false);
  const [ocrCandidates, setOcrCandidates] = useState([]);
  const [aiSearch, setAiSearch] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiVisibleCount, setAiVisibleCount] = useState(20);
  const [aiResultTranslations, setAiResultTranslations] = useState({});
  const [aiTranslationLoading, setAiTranslationLoading] = useState(false);
  const [globalTranslationLoading, setGlobalTranslationLoading] = useState(false);
  const [globalTranslationError, setGlobalTranslationError] = useState("");
  const [aiTranslationError, setAiTranslationError] = useState("");
  const [miyamaAiQuestion, setMiyamaAiQuestion] = useState("");
  const [miyamaAiAnswer, setMiyamaAiAnswer] = useState("MIYAMA AIへようこそ。設備名・部品名・不具合内容・費用・予定などを質問してください。");
  const [paidAiQuestion, setPaidAiQuestion] = useState("");
  const [paidAiAnswer, setPaidAiAnswer] = useState("");
  const [paidAiLoading, setPaidAiLoading] = useState(false);
  const [paidAiError, setPaidAiError] = useState("");
  const [productionLogs, setProductionLogs] = useState([]);
  const [dailyProductions, setDailyProductions] = useState([]);
  const [dailyProductionDraft, setDailyProductionDraft] = useState({ date: "", equipment: "", quantity: "", note: "" });
  const [dailyProductionSearch, setDailyProductionSearch] = useState("");
  const [productionMachineName, setProductionMachineName] = useState("");
  const [productionLineName, setProductionLineName] = useState("");
  const [productionSearch, setProductionSearch] = useState("");
  const [productionTrendMode, setProductionTrendMode] = useState("day");
  const [productionRankMode, setProductionRankMode] = useState("count");
  const [productionRankTarget, setProductionRankTarget] = useState("machine");
  const [productionDailyPeriod, setProductionDailyPeriod] = useState("today");
  const [productionDailyStart, setProductionDailyStart] = useState(todayText());
  const [productionDailyEnd, setProductionDailyEnd] = useState(todayText());
  const [productionDailyMachine, setProductionDailyMachine] = useState("all");
  const [productionSelectedMachine, setProductionSelectedMachine] = useState("all");
  const [productionAiQuestion, setProductionAiQuestion] = useState("");
  const [productionAiAnswer, setProductionAiAnswer] = useState("生産状況AIへようこそ。停止理由・設備名・アラームNo・改善案などを質問してください。");
  const [aiLevel, setAiLevel] = useState("");
  const [autoReportInput, setAutoReportInput] = useState("");
  const [autoReportAiLoading, setAutoReportAiLoading] = useState(false);
  const [autoReportAiAnswer, setAutoReportAiAnswer] = useState("");
  const [autoReportAiError, setAutoReportAiError] = useState("");
  const [autoReportHistoryMessage, setAutoReportHistoryMessage] = useState("");
  const [analyticsPeriod, setAnalyticsPeriod] = useState("all");
  const [analyticsBaseDate, setAnalyticsBaseDate] = useState(todayText());
  const [reportViewMode, setReportViewMode] = useState("summary");
  const [maintenanceViewMode, setMaintenanceViewMode] = useState("cards");
  const [spareViewMode, setSpareViewMode] = useState("cards");
  const [workViewMode, setWorkViewMode] = useState("cards");

  const [newReport, setNewReport] = useState(null);
  const [whyAiLoading, setWhyAiLoading] = useState(false);
  const [whyAiError, setWhyAiError] = useState("");
  const [historyAiQuestion, setHistoryAiQuestion] = useState("");
  const [historyAiAnswer, setHistoryAiAnswer] = useState("");
  const [historyAiLoading, setHistoryAiLoading] = useState(false);
  const [historyAiError, setHistoryAiError] = useState("");
  const [newCalendarEvent, setNewCalendarEvent] = useState(null);
  const [editingCalendarEventId, setEditingCalendarEventId] = useState(null);
  const [newPlannedWork, setNewPlannedWork] = useState(null);

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(todayText());

  const [openSections, setOpenSections] = useState({
    basic: true,
    trouble: true,
    why: false,
    cost: false,
    other: false,
  });

  useEffect(() => {
    if (!newReport) {
      setSimilarProblems([]);
      return undefined;
    }

    const equipment = String(newReport.equipment || "").trim();
    const lineName = String(newReport.lineName || "").trim();
    const phenomenon = String(newReport.phenomenon || "").trim();
    const troublePoint = String(newReport.troublePoint || "").trim();

    if (!equipment && !lineName && !phenomenon && !troublePoint) {
      setSimilarProblems([]);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      try {
        const matches = searchHistory(
          {
            equipment,
            lineName,
            machineName: newReport.machineName || "",
            phenomenon,
            troublePoint,
            why1: newReport.why1 || "",
            why2: newReport.why2 || "",
            why3: newReport.why3 || "",
            action: newReport.action || "",
            replacedPart: newReport.replacedPart || "",
          },
          reports,
          {
            limit: 12,
            minimumScore: 12,
          }
        );

        setSimilarProblems(matches);
      } catch (error) {
        console.error("MIYAMA history search error:", error);
        setSimilarProblems([]);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    newReport?.equipment,
    newReport?.lineName,
    newReport?.phenomenon,
    newReport?.troublePoint,
    newReport?.why1,
    newReport?.why2,
    newReport?.why3,
    newReport?.action,
    newReport?.replacedPart,
    reports,
  ]);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setReportPage(1);
  }, [reportSearch, reportViewMode]);

  // Tradução otimizada: executa somente ao trocar idioma/página ou quando a quantidade
  // principal de dados muda. Antes ela era executada várias vezes a cada tecla digitada
  // e um MutationObserver varria toda a página continuamente, causando travamentos.
  useEffect(() => {
    const safeLanguage = MIYAMA_LANGUAGES[appLanguage] ? appLanguage : "ja";
    if (safeLanguage !== appLanguage) {
      setAppLanguage(safeLanguage);
      return undefined;
    }

    localStorage.setItem("miyamaLanguage", safeLanguage);

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        applyMiyamaLanguage(safeLanguage, controller.signal).catch((error) => {
          if (error?.name !== "AbortError") {
            console.error("Language application error:", error);
          }
        });
      });
    }, 120);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    appLanguage,
    page,
    parts.length,
    reports.length,
    productionLogs.length,
    dailyProductions.length,
    calendarEvents.length,
    plannedWorks.length,
  ]);

  useEffect(() => {
    setReportDrafts((current) => {
      const next = { ...current };
      reports.forEach((report) => {
        if (!next[report.id] || !reportDirty[report.id]) {
          next[report.id] = sanitizeReportDates(report);
        }
      });
      return next;
    });
  }, [reports, reportDirty]);

  function setReportDraftField(reportId, field, value) {
    setReportDrafts((current) => ({
      ...current,
      [reportId]: { ...(current[reportId] || reports.find((r) => r.id === reportId) || {}), [field]: value },
    }));
    setReportDirty((current) => ({ ...current, [reportId]: true }));
  }

  function resetReportDraft(reportId) {
    const source = reports.find((r) => r.id === reportId);
    if (!source) return;
    setReportDrafts((current) => ({ ...current, [reportId]: source }));
    setReportDirty((current) => ({ ...current, [reportId]: false }));
  }

  async function saveReportDraft(reportId) {
    const draft = reportDrafts[reportId] || reports.find((r) => r.id === reportId);
    if (!draft) return;

    if (draft.approvalStatus === "承認済み") {
      alert("🔒 この報告書は承認済みのため編集できません。修正が必要な場合は、承認権限者が差戻ししてください。");
      return;
    }

    try {
      setReportSavingId(reportId);
      const { id, ...plainDraft } = draft;
      const reportToSave = sanitizeReportDates(plainDraft);
      await updateDoc(doc(db, "maintenanceReports", reportId), reportToSave);
      setReports((current) =>
        current.map((item) =>
          item.id === reportId ? { ...item, ...reportToSave } : item
        )
      );
      setReportDirty((current) => ({ ...current, [reportId]: false }));
      alert("保存しました。");
    } catch (error) {
      console.error("report save error:", error);
      alert("保存エラーが発生しました。もう一度確認してください。");
    } finally {
      setReportSavingId(null);
    }
  }

  async function loadAll() {
    const results = await Promise.allSettled([
      loadParts(),
      loadCalendar(),
      loadReports(),
      loadPlannedWorks(),
      loadProductionLogs(),
      loadDailyProductions(),
    ]);

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const names = ["parts", "calendar", "maintenanceReports", "plannedWorks", "productionLogs", "dailyProductions"];
        console.error(`Failed to load ${names[index]}:`, result.reason);
      }
    });
  }

  async function loadParts() {
    const snap = await getDocs(collection(db, "parts"));
    setParts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadCalendar() {
    const snap = await getDocs(collection(db, "calendar"));
    setCalendarEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadReports() {
    const snap = await getDocs(collection(db, "maintenanceReports"));
    // Firebaseに過去取込の 1899/12/30 が残っていても、表示時に正しい日時へ補正します。
    setReports(snap.docs.map((d) => sanitizeReportDates({ id: d.id, ...d.data() })));
  }

  async function loadPlannedWorks() {
    try {
      const snap = await getDocs(collection(db, "plannedWorks"));
      setPlannedWorks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("plannedWorks load error:", err);
      setPlannedWorks([]);
    }
  }


  async function loadProductionLogs() {
    try {
      const snap = await getDocs(collection(db, "productionLogs"));
      setProductionLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("productionLogs load error:", err);
      setProductionLogs([]);
    }
  }

  async function loadDailyProductions() {
    try {
      const snap = await getDocs(collection(db, "dailyProductions"));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      setDailyProductions(rows);
    } catch (err) {
      console.error("dailyProductions load error:", err);
      setDailyProductions([]);
    }
  }

  async function saveDailyProduction() {
    const date = normalizeDateOnly(dailyProductionDraft.date);
    const rawEquipment = String(dailyProductionDraft.equipment || "").trim();
    const equipment = normalizeMachineKey(rawEquipment);
    const quantity = toNumber(dailyProductionDraft.quantity, 0);

    if (!date) {
      alert("日付を入力してください。");
      return;
    }
    if (!rawEquipment) {
      alert("設備名を入力してください。");
      return;
    }
    if (quantity <= 0) {
      alert("生産数を入力してください。");
      return;
    }

    await addDoc(collection(db, "dailyProductions"), {
      date,
      equipment,
      quantity,
      note: dailyProductionDraft.note || "",
      createdAt: new Date().toISOString(),
    });

    setDailyProductionDraft({ date: "", equipment: "", quantity: "", note: "" });
    await loadDailyProductions();
    alert("生産数を登録しました。");
  }

  async function deleteDailyProduction(id) {
    if (!confirm("この生産数データを削除しますか？")) return;
    await deleteDoc(doc(db, "dailyProductions", id));
    await loadDailyProductions();
  }


  async function deleteDailyProductionBySelectedDate() {
    const targetDate = normalizeDateOnly(dailyProductionDraft.date);
    if (!targetDate) {
      alert("削除する日付を選択してください。");
      return;
    }
    const rows = dailyProductions.filter((row) => normalizeDateOnly(row.date) === targetDate);

    if (rows.length === 0) {
      alert(`${targetDate} の生産数データはありません。`);
      return;
    }

    const ok = window.confirm(
      `${targetDate} の生産数データを削除します。\n\n対象：${rows.length}件\n\n本当に削除しますか？`
    );
    if (!ok) return;

    await Promise.all(rows.map((row) => deleteDoc(doc(db, "dailyProductions", row.id))));
    await loadDailyProductions();
    alert(`${targetDate} の生産数データを削除しました。`);
  }

  async function clearAllDailyProductions() {
    const ok = window.confirm(
      "⚠️ 生産数DBをすべて初期化します。\n\n平均生産数・保全サイクルによる交換予測の元データが削除されます。\n保全報告書・予備品・カレンダー・計画工事は削除されません。\n\n本当に削除しますか？"
    );
    if (!ok) return;

    const ok2 = window.confirm(
      "最終確認です。\n\n生産数DBの全データを削除します。\nテストデータをリセットする場合だけOKを押してください。"
    );
    if (!ok2) return;

    const snap = await getDocs(collection(db, "dailyProductions"));
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "dailyProductions", d.id))));
    setDailyProductions([]);
    alert("生産数DBを初期化しました。");
  }

  async function clearAllProductionLogs() {
    const ok = window.confirm(
      "CSV取込データ（productionLogs）をすべて削除します。\n\n保全報告書・予備品・カレンダー・計画工事は削除されません。\n\n本当に削除しますか？"
    );
    if (!ok) return;

    const ok2 = window.confirm(
      "最終確認です。\n\nCSVアラームデータを全削除して、もう一度アップロードし直しますか？"
    );
    if (!ok2) return;

    try {
      const snap = await getDocs(collection(db, "productionLogs"));
      await Promise.all(snap.docs.map((item) => deleteDoc(doc(db, "productionLogs", item.id))));
      setProductionLogs([]);
      alert("CSV取込データをすべて削除しました。");
    } catch (err) {
      console.error("productionLogs delete error:", err);
      alert("CSV削除エラーが発生しました。Firebase接続と権限を確認してください。");
    }
  }

  async function updateField(collectionName, id, field, value) {
    const setterMap = {
      parts: setParts,
      calendar: setCalendarEvents,
      maintenanceReports: setReports,
      plannedWorks: setPlannedWorks,
      dailyProductions: setDailyProductions,
    };

    const setter = setterMap[collectionName];

    if (setter) {
      setter((current) =>
        current.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        )
      );
    }

    await updateDoc(doc(db, collectionName, id), { [field]: value });
  }

  async function updateMaintenanceSchedule(row, changes = {}) {
    // Use the newest state value, not only the row captured by the render.
    // This prevents a quick date/cycle edit from calculating with stale data.
    let patchToSave = null;

    setParts((current) => {
      const latest = current.find((item) => item.id === row.id) || row;
      const updated = { ...latest, ...changes };
      updated.lastDate = normalizeMaintenanceDateInput(updated.lastDate);
      updated.maintenanceMode = normalizeMaintenanceMode(updated.maintenanceMode, updated);

      const smart = calculateSmartMaintenanceByDailyProduction(updated, dailyProductions);
      patchToSave = {
        ...changes,
        lastDate: updated.lastDate,
        maintenanceMode: updated.maintenanceMode,
        nextDate: smart.nextDate || "",
        dateNextDate: smart.dateNextDate || "",
        productionNextDate: smart.productionNextDate || "",
        daysLeft: smart.daysLeft,
        status: smart.status,
      };

      return current.map((item) =>
        item.id === row.id ? { ...item, ...patchToSave } : item
      );
    });

    // React state updates are synchronous for the updater callback, but keep a safe fallback.
    if (!patchToSave) {
      const updated = { ...row, ...changes };
      updated.lastDate = normalizeMaintenanceDateInput(updated.lastDate);
      updated.maintenanceMode = normalizeMaintenanceMode(updated.maintenanceMode, updated);
      const smart = calculateSmartMaintenanceByDailyProduction(updated, dailyProductions);
      patchToSave = {
        ...changes,
        lastDate: updated.lastDate,
        maintenanceMode: updated.maintenanceMode,
        nextDate: smart.nextDate || "",
        dateNextDate: smart.dateNextDate || "",
        productionNextDate: smart.productionNextDate || "",
        daysLeft: smart.daysLeft,
        status: smart.status,
      };
    }

    await updateDoc(doc(db, "parts", row.id), patchToSave);
  }

  async function saveMaintenanceSchedule(row) {
    const latest = parts.find((item) => item.id === row.id) || row;
    const normalized = {
      ...latest,
      lastDate: normalizeMaintenanceDateInput(latest.lastDate),
      maintenanceMode: normalizeMaintenanceMode(latest.maintenanceMode, latest),
    };
    const smart = calculateSmartMaintenanceByDailyProduction(normalized, dailyProductions);
    const patch = {
      lastDate: normalized.lastDate,
      maintenanceMode: normalized.maintenanceMode,
      nextDate: smart.nextDate || "",
      dateNextDate: smart.dateNextDate || "",
      productionNextDate: smart.productionNextDate || "",
      daysLeft: smart.daysLeft,
      status: smart.status,
    };

    setParts((current) => current.map((item) => item.id === row.id ? { ...item, ...patch } : item));
    await updateDoc(doc(db, "parts", row.id), patch);
    alert(smart.nextDate ? `保存しました。次回実施日：${smart.nextDate}` : "保存しました。前回実施日と保全周期を確認してください。");
  }

  async function removeItem(collectionName, id) {
    await deleteDoc(doc(db, collectionName, id));
    if (collectionName === "parts") loadParts();
    if (collectionName === "calendar") loadCalendar();
    if (collectionName === "maintenanceReports") loadReports();
    if (collectionName === "plannedWorks") loadPlannedWorks();
    if (collectionName === "dailyProductions") loadDailyProductions();
  }

  async function addPart() {
    await addDoc(collection(db, "parts"), {
      equipment: "",
      lineName: "",
      partName: "",
      partNo: "",
      serialNo: "",
      maker: "",
      price: "",
      supplier: "",
      purchaseUrl: "",
      location: "",
      locationRack: "",
      lot: "",
      shelf: "",
      box: "",
      address: "",
      leadTime: "",
      reorderPoint: "",
      reorderQty: "",
      category: "手入力",
      maintenanceType: "交換",
      maintenanceMode: "定期保全",
      maintenanceDetail: "",
      equipment2Name: "",
      sectionName: "",
      method: "",
      standard: "",
      responseAction: "",
      result: "",
      prepDays: "",
      isMaintenanceTarget: false,
      cycle: 90,
      cycleProductionCount: "",
      dailyAverageProduction: "",
      lastDate: "",
      owner: "",
      note: "",
      stockQty: 0,
      minStock: 1,
      stockNote: "",
      image: "",
      imageUrl: "",
    });
    loadParts();
  }

  async function addMaintenancePart() {
    await addDoc(collection(db, "parts"), {
      equipment: "",
      lineName: "",
      partName: "",
      partNo: "",
      serialNo: "",
      maker: "",
      price: "",
      supplier: "",
      purchaseUrl: "",
      location: "",
      locationRack: "",
      lot: "",
      shelf: "",
      box: "",
      address: "",
      leadTime: "",
      reorderPoint: "",
      reorderQty: "",
      category: "定期保全",
      maintenanceType: "交換",
      maintenanceMode: "定期保全",
      maintenanceDetail: "",
      equipment2Name: "",
      sectionName: "",
      method: "",
      standard: "",
      responseAction: "",
      result: "",
      prepDays: "",
      isMaintenanceTarget: true,
      cycle: 90,
      cycleProductionCount: "",
      dailyAverageProduction: "",
      lastDate: "",
      owner: "",
      note: "",
      stockQty: 0,
      minStock: 1,
      stockNote: "",
      image: "",
      imageUrl: "",
    });
    await loadParts();
  }

  function startNewReport() {
    setWhyAiLoading(false);
    setWhyAiError("");
    setHistoryAiQuestion("");
    setHistoryAiAnswer("");
    setHistoryAiError("");
    setSimilarProblems([]);
    setNewReport({
      ...createBlankReport(),
      createdBy: currentUserName,
      worker: currentUserName,
      reportCreatedDate: todayText(),
    });
  }

  function cancelNewReport() {
    setWhyAiLoading(false);
    setWhyAiError("");
    setHistoryAiQuestion("");
    setHistoryAiAnswer("");
    setHistoryAiError("");
    setSimilarProblems([]);
    setNewReport(null);
  }

  async function saveNewReport() {
    if (!newReport) return;
    if (!newReport.equipment && !newReport.phenomenon) {
      alert("設備名または不具合現象を入力してください。");
      return;
    }

    const createdNow = new Date().toISOString();
    const reportToSave = {
      ...sanitizeReportDates(newReport),
      createdAt: newReport.createdAt || normalizeDateOnly(newReport.workStartDateTime) || todayText(),
      reportCreatedDate: newReport.reportCreatedDate || todayText(),
      createdBy: currentUserName,
      createdByUid: currentUser.uid,
      createdByEmail: currentUser.email || "",
      createdAtAudit: newReport.createdAtAudit || createdNow,
      approvalStatus:
        !newReport.approvalStatus || newReport.approvalStatus === "下書き"
          ? "点検待ち"
          : newReport.approvalStatus,
    };

    await addDoc(collection(db, "maintenanceReports"), reportToSave);

    await addDoc(collection(db, "calendar"), {
      date: reportToSave.createdAt || todayText(),
      time: "",
      title: `保全修理報告書：${reportToSave.equipment || "設備名なし"}`,
      detail: `${reportToSave.maintenanceType || ""} ${reportToSave.lineName || ""} ${reportToSave.phenomenon || ""} ${reportToSave.action || ""}`,
      owner: reportToSave.worker || reportToSave.createdBy || "",
      importance: reportToSave.approvalStatus === "承認済み" ? "通常" : "重要",
      category: "保全修理報告書",
      image: reportToSave.image || reportToSave.beforeImage || "",
    });

    setNewReport(null);
    await Promise.all([loadReports(), loadCalendar()]);
    alert("保存しました。カレンダーとAI検索に反映されます。");
  }

  function startNewCalendarEvent(date = selectedDate) {
    setEditingCalendarEventId(null);
    setNewCalendarEvent(createBlankCalendarEvent(date));
  }

  function startEditCalendarEvent(event) {
    if (!event?.sourceId && !event?.id) return;

    setEditingCalendarEventId(event.sourceId || event.id);
    setNewCalendarEvent({
      date: event.date || selectedDate || todayText(),
      time: event.time || "",
      title: event.title || "",
      detail: event.detail || "",
      owner: event.owner || "",
      importance: event.importance || "通常",
      category: event.category || "定期保全",
      image: event.image || "",
    });
  }

  function cancelNewCalendarEvent() {
    setNewCalendarEvent(null);
    setEditingCalendarEventId(null);
  }

  async function saveNewCalendarEvent() {
    if (!newCalendarEvent) return;
    if (!newCalendarEvent.title) {
      alert("予定タイトルを入力してください。");
      return;
    }

    const eventToSave = {
      date: newCalendarEvent.date || selectedDate || todayText(),
      time: newCalendarEvent.time || "",
      title: newCalendarEvent.title || "",
      detail: newCalendarEvent.detail || "",
      owner: newCalendarEvent.owner || "",
      importance: newCalendarEvent.importance || "通常",
      category: newCalendarEvent.category || "定期保全",
      image: newCalendarEvent.image || "",
    };

    if (editingCalendarEventId) {
      await updateDoc(doc(db, "calendar", editingCalendarEventId), eventToSave);
      alert("予定を更新しました。");
    } else {
      await addDoc(collection(db, "calendar"), eventToSave);
      alert("予定を保存しました。");
    }

    setNewCalendarEvent(null);
    setEditingCalendarEventId(null);
    await loadCalendar();
  }

  function startNewPlannedWork() {
    setNewPlannedWork(createBlankPlannedWork());
  }

  function cancelNewPlannedWork() {
    setNewPlannedWork(null);
  }

  async function saveNewPlannedWork() {
    if (!newPlannedWork) return;
    if (!newPlannedWork.title) {
      alert("工事件名を入力してください。");
      return;
    }

    const docRef = await addDoc(collection(db, "plannedWorks"), newPlannedWork);

    await addDoc(collection(db, "calendar"), {
      date: newPlannedWork.date || todayText(),
      time: "",
      title: `計画工事：${newPlannedWork.title}`,
      detail: `${newPlannedWork.equipment || ""} ${newPlannedWork.purpose || ""} ${newPlannedWork.detail || ""}`,
      owner: newPlannedWork.owner || "",
      importance: "重要",
      category: "計画工事",
      plannedWorkId: docRef.id,
      image: newPlannedWork.image || "",
    });

    setNewPlannedWork(null);
    await Promise.all([loadPlannedWorks(), loadCalendar()]);
    alert("計画工事を保存しました。カレンダーにも追加されました。");
  }

  function handleImageUpload(event, collectionName, rowId) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => updateField(collectionName, rowId, "image", reader.result);
    reader.readAsDataURL(file);
  }

  function handleDraftImageUpload(event, setter) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setter((current) => ({ ...current, image: reader.result }));
    };
    reader.readAsDataURL(file);
  }

  function handleReportDraftPhotoUpload(event, field) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewReport((current) => ({ ...current, [field]: reader.result }));
    };
    reader.readAsDataURL(file);
  }

  function toggleSection(key) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  }

  function getCalendarDays() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const days = [];

    for (let i = 0; i < startDay; i++) days.push(null);

    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= lastDate; day++) {
      const date = new Date(year, month, day);
      days.push(toLocalDateText(date));
    }

    return days;
  }

  function changeMonth(value) {
    const newDate = new Date(calendarMonth);
    newDate.setMonth(newDate.getMonth() + value);
    setCalendarMonth(newDate);
  }

  const maintenanceRows = useMemo(() => {
    return parts
      .filter((part) => part.isMaintenanceTarget === true)
      .map((part) => {
        const smart = calculateSmartMaintenanceByDailyProduction(part, dailyProductions);
        const nextDate = smart.nextDate;
        const daysLeft = smart.daysLeft;
        const status = smart.status;
        const maintenanceType = part.maintenanceType || part.category || "交換";
        const searchText = [
          maintenanceType,
          part.equipment,
          part.lineName,
          part.equipment2Name,
          part.sectionName,
          part.partName,
          part.partNo,
          part.serialNo,
          part.maker,
          part.maintenanceDetail,
          part.method,
          part.standard,
          part.responseAction,
          part.result,
          part.owner,
          part.note,
          part.cycle,
          part.cycleProductionCount,
          part.maintenanceMode,
        ].join(" ");

        return { ...part, ...smart, nextDate, daysLeft, status, maintenanceType, searchText };
      })
      .sort((a, b) => {
        if (a.daysLeft === "") return 1;
        if (b.daysLeft === "") return -1;
        return a.daysLeft - b.daysLeft;
      });
  }, [parts, dailyProductions]);

  const maintenanceEquipmentOptions = useMemo(() => {
    const names = maintenanceRows
      .map((row) => cleanEquipmentName(row.equipment || row.lineName || row.equipment2Name || ""))
      .filter(Boolean);
    return ["全て", ...Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "ja"))];
  }, [maintenanceRows]);

  const filteredMaintenanceRows = useMemo(() => {
    const keyword = maintenanceSearch.toLowerCase().trim();
    const keywords = keyword ? keyword.split(/\s+/) : [];

    const filtered = maintenanceRows.filter((row) => {
      const typeOk = maintenanceTypeFilter === "全て" || row.maintenanceType === maintenanceTypeFilter;
      const rowEquipment = cleanEquipmentName(row.equipment || row.lineName || row.equipment2Name || "");
      const equipmentOk = maintenanceEquipmentFilter === "全て" || rowEquipment === maintenanceEquipmentFilter;
      const keywordOk = keywords.length === 0 || containsAll(row.searchText, keywords);
      return typeOk && equipmentOk && keywordOk;
    });

    const getText = (row) => [
      row.equipment,
      row.lineName,
      row.sectionName,
      row.equipment1Name,
      row.equipment2Name,
      row.partName,
      row.maintenanceDetail,
    ].filter(Boolean).join(" ");

    return [...filtered].sort((a, b) => {
      if (maintenanceSort === "az") {
        return getText(a).localeCompare(getText(b), "ja");
      }
      if (maintenanceSort === "type") {
        return String(a.maintenanceType || "").localeCompare(String(b.maintenanceType || ""), "ja");
      }
      if (maintenanceSort === "equipment") {
        return String(a.equipment || a.lineName || "").localeCompare(String(b.equipment || b.lineName || ""), "ja");
      }
      if (maintenanceSort === "owner") {
        return String(a.owner || "").localeCompare(String(b.owner || ""), "ja");
      }

      if (a.daysLeft === "") return 1;
      if (b.daysLeft === "") return -1;
      return Number(a.daysLeft) - Number(b.daysLeft);
    });
  }, [maintenanceRows, maintenanceSearch, maintenanceTypeFilter, maintenanceEquipmentFilter, maintenanceSort]);

  const spareRows = useMemo(() => {
    return parts.map((part) => {
      const stockQty = Number(part.stockQty || 0);
      const minStock = Number(part.minStock || 1);
      let stockStatus = "🟢 在庫OK";

      if (stockQty <= 0) {
        stockStatus = "🔴 在庫なし";
      } else if (stockQty <= minStock) {
        stockStatus = "🟡 在庫注意";
      }

      const searchText = [
        part.equipment,
        part.lineName,
        part.partName,
        part.partNo,
        part.serialNo,
        part.maker,
        part.supplier,
        part.purchaseUrl,
        part.location,
        part.locationRack,
        part.lot,
        part.shelf,
        part.box,
        part.address,
        part.category,
        part.note,
        part.stockNote,
      ].join(" ");

      return { ...part, stockQty, minStock, stockStatus, searchText };
    });
  }, [parts]);

  const filteredSpareRows = useMemo(() => {
    const keyword = spareSearch.toLowerCase().trim();
    if (!keyword) return spareRows;
    const keywords = keyword.split(/\s+/);
    return spareRows.filter((row) => containsAll(row.searchText, keywords));
  }, [spareRows, spareSearch]);

  const overCount = maintenanceRows.filter((r) => r.status === "交換超過").length;
  const nearCount = maintenanceRows.filter((r) => r.status === "交換間近").length;
  const lowStockCount = spareRows.filter((r) => r.stockStatus.includes("なし") || r.stockStatus.includes("不足")).length;
  const monthReportCount = reports.filter((report) =>
    (report.createdAt || "").startsWith(new Date().toISOString().slice(0, 7))
  ).length;


  const currentMonthText = todayText().slice(0, 7);
  const monthReports = reports.filter((report) => String(report.createdAt || report.workStartDateTime || "").startsWith(currentMonthText));
  const monthStopHours = monthReports.reduce((sum, report) => sum + Number(calculateReport(report).stopTimeHours || 0), 0);
  const monthRepairHours = monthReports.reduce((sum, report) => sum + hoursBetween(report.workStartDateTime, report.workEndDateTime), 0);
  const monthTotalCost = monthReports.reduce((sum, report) => sum + Number(calculateReport(report).totalCost || 0), 0);
  const stopPercentOneShift = (monthStopHours / 8) * 100;
  const stopPercentTwoShift = (monthStopHours / 16) * 100;
  const estimatedAvailabilityTwoShift = clampPercent(100 - stopPercentTwoShift);


  const unifiedCalendarEvents = useMemo(() => {
    const reportEvents = reports
      .filter((report) => report.createdAt || report.troubleDateTime || report.workStartDateTime)
      .map((report) => {
        const date = String(report.createdAt || report.troubleDateTime || report.workStartDateTime || "").slice(0, 10);
        return {
          id: `report-${report.id}`,
          sourceId: report.id,
          sourceType: "maintenanceReports",
          page: "report",
          date,
          time: "",
          title: `保全報告：${report.equipment || report.lineName || "設備名なし"}`,
          detail: [
            report.phenomenon,
            report.troublePoint,
            report.action,
          ].filter(Boolean).join(" / "),
          owner: report.worker || "",
          importance: "重要",
          category: "保全報告書",
          image: report.image || "",
          deletable: false,
        };
      })
      .filter((event) => event.date);

    const maintenanceEvents = maintenanceRows
      .filter((part) => part.nextDate)
      .map((part) => ({
        id: `maintenance-${part.id}`,
        sourceId: part.id,
        sourceType: "parts",
        page: "maintenance",
        date: part.nextDate,
        time: "",
        title: `${part.maintenanceType || "定期保全"}：${part.equipment || part.lineName || part.partName || "設備名なし"}`,
        detail: [
          part.equipment2Name ? `装置：${part.equipment2Name}` : "",
          part.sectionName ? `部位：${part.sectionName}` : "",
          part.maintenanceDetail ? `内容：${part.maintenanceDetail}` : "",
          part.partName ? `部品：${part.partName}` : "",
          part.partNo ? `型式：${part.partNo}` : "",
          part.method ? `方法：${part.method}` : "",
          part.standard ? `基準：${part.standard}` : "",
          part.status ? `状態：${part.status}` : "",
          part.daysLeft !== "" ? `残日数：${part.daysLeft}` : "",
        ].filter(Boolean).join(" / "),
        owner: part.owner || "",
        importance: part.status === "交換超過" || part.status === "交換間近" ? "重要" : "通常",
        category: "定期保全",
        image: part.image || "",
        deletable: false,
      }));

    const manualEvents = calendarEvents.map((event) => ({
      ...event,
      sourceId: event.id,
      sourceType: "calendar",
      page: "calendar",
      deletable: true,
    }));

    // 計画工事を保存すると calendar にも1件作成されます。
    // そのため plannedWorks をそのまま足すと同じ予定が2枚表示されます。
    // calendar 側に plannedWorkId があるものは重複防止のため plannedWorks 側を表示しません。
    const linkedPlannedWorkIds = new Set(
      manualEvents
        .map((event) => event.plannedWorkId)
        .filter(Boolean)
    );

    const plannedWorkEvents = plannedWorks
      .filter((work) => work.date)
      .filter((work) => !linkedPlannedWorkIds.has(work.id))
      .map((work) => ({
        id: `planned-${work.id}`,
        sourceId: work.id,
        sourceType: "plannedWorks",
        page: "work",
        date: work.date,
        time: "",
        title: `計画工事：${work.title || work.equipment || "工事"}`,
        detail: [work.equipment, work.purpose, work.detail, work.status].filter(Boolean).join(" / "),
        owner: work.owner || "",
        importance: "重要",
        category: "計画工事",
        image: work.image || "",
        deletable: false,
      }));

    return [
      ...manualEvents,
      ...reportEvents,
      ...maintenanceEvents,
      ...plannedWorkEvents,
    ].sort((a, b) => `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`));
  }, [calendarEvents, reports, maintenanceRows, plannedWorks]);

  const filteredReports = useMemo(() => {
    const keyword = reportSearch.toLowerCase().trim();
    const sorted = [...reports].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (!keyword) return sorted;

    const keywords = keyword.split(/\s+/);

    return sorted.filter((r) =>
      containsAll(
        [
          r.id,
          r.createdAt,
          r.maintenanceType,
          r.groupName,
          r.lineName,
          r.equipment,
          r.phenomenon,
          r.troublePoint,
          r.why1,
          r.why2,
          r.why3,
          r.action,
          r.worker,
          r.approvalStatus,
          r.dbInputBy,
          r.approvedBy,
          r.inspectedBy,
          r.createdBy,
          r.note,
        ].join(" "),
        keywords
      )
    );
  }, [reports, reportSearch]);

  const globalResults = useMemo(() => {
    const keyword = globalSearch.toLowerCase().trim();
    if (!keyword) return [];

    const keywords = keyword.split(/\s+/);

    const allItems = [
      ...reports.map((r) => ({
        category: "📝 保全報告書",
        page: "report",
        title: r.equipment || "設備名なし",
        date: r.createdAt || "-",
        text: `${r.lineName || ""} ${r.phenomenon || ""} ${r.troublePoint || ""} ${r.why1 || ""} ${r.why2 || ""} ${r.why3 || ""} ${r.action || ""} ${r.note || ""}`,
      })),

      ...maintenanceRows.map((p) => ({
        category: "🔧 定期保全",
        page: "maintenance",
        title: p.equipment || "設備名なし",
        date: p.nextDate || "-",
        text: `${p.partName || ""} ${p.partNo || ""} ${p.supplier || ""} ${p.location || ""} ${p.status || ""} ${p.note || ""}`,
      })),

      ...spareRows.map((p) => ({
        category: "📦 予備品管理",
        page: "spare",
        title: p.partName || "部品名なし",
        date: p.leadTime || "-",
        text: `${p.equipment || ""} ${p.lineName || ""} ${p.partNo || ""} ${p.serialNo || ""} ${p.maker || ""} ${p.supplier || ""} ${p.purchaseUrl || ""} ${p.location || ""} ${p.locationRack || ""} ${p.category || ""} ${p.stockStatus || ""} ${p.stockNote || ""}`,
      })),

      ...calendarEvents.map((c) => ({
        category: "📅 カレンダー",
        page: "calendar",
        title: c.title || "予定",
        date: c.date || "-",
        text: `${c.category || ""} ${c.detail || ""} ${c.owner || ""} ${c.importance || ""}`,
      })),

      ...plannedWorks.map((w) => ({
        category: "🏗️ 計画工事",
        page: "work",
        title: w.title || "計画工事",
        date: w.date || "-",
        text: `${w.equipment || ""} ${w.purpose || ""} ${w.detail || ""} ${w.owner || ""} ${w.status || ""} ${w.note || ""}`,
      })),
    ];

    return allItems
      .map((item) => {
        const allText = `${item.category} ${item.title} ${item.date} ${item.text}`.toLowerCase();
        const score = keywords.filter((k) => allText.includes(k)).length;
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [globalSearch, reports, maintenanceRows, spareRows, calendarEvents, plannedWorks]);

  const aiResults = useMemo(() => {
    const keyword = aiSearch.toLowerCase().trim();
    if (!keyword) return [];

    const keywords = keyword.split(/\s+/);

    const allItems = [
      ...reports.map((r) => ({
        category: "📝 保全報告書",
        page: "report",
        title: r.equipment || "設備名なし",
        date: r.createdAt || "-",
        text: `${r.lineName || ""} ${r.phenomenon || ""} ${r.troublePoint || ""} ${r.why1 || ""} ${r.why2 || ""} ${r.why3 || ""} ${r.action || ""} ${r.note || ""}`,
      })),
      ...maintenanceRows.map((p) => ({
        category: "🔧 定期保全",
        page: "maintenance",
        title: p.equipment || "設備名なし",
        date: p.nextDate || "-",
        text: `${p.partName || ""} ${p.partNo || ""} ${p.status || ""} ${p.note || ""}`,
      })),
      ...spareRows.map((p) => ({
        category: "📦 予備品管理",
        page: "spare",
        title: p.partName || "部品名なし",
        date: p.leadTime || "-",
        text: `${p.equipment || ""} ${p.lineName || ""} ${p.partNo || ""} ${p.serialNo || ""} ${p.maker || ""} ${p.supplier || ""} ${p.purchaseUrl || ""} ${p.location || ""} ${p.locationRack || ""} ${p.category || ""} ${p.stockStatus || ""}`,
      })),
      ...calendarEvents.map((c) => ({
        category: "📅 カレンダー",
        page: "calendar",
        title: c.title || "予定",
        date: c.date || "-",
        text: `${c.category || ""} ${c.detail || ""} ${c.owner || ""}`,
      })),
      ...plannedWorks.map((w) => ({
        category: "🏗️ 計画工事",
        page: "work",
        title: w.title || "計画工事",
        date: w.date || "-",
        text: `${w.equipment || ""} ${w.purpose || ""} ${w.detail || ""} ${w.status || ""} ${w.note || ""}`,
      })),
    ];

    return allItems
      .map((item) => {
        const allText = `${item.category} ${item.title} ${item.date} ${item.text}`.toLowerCase();
        const score = keywords.filter((k) => allText.includes(k)).length;
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [aiSearch, reports, maintenanceRows, spareRows, calendarEvents, plannedWorks]);


  const visibleAiResults = useMemo(
    () => aiResults.slice(0, aiVisibleCount),
    [aiResults, aiVisibleCount]
  );

  useEffect(() => {
    setAiVisibleCount(20);
  }, [aiSearch]);

  useEffect(() => {
    if (appLanguage !== "en" || visibleAiResults.length === 0) {
      setAiTranslationLoading(false);
      setAiTranslationError("");
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function translateVisibleResults() {
      setAiTranslationLoading(true);
      setAiTranslationError("");
      try {
        // 2件ずつ処理して翻訳サービスとブラウザへの負荷を抑えます。
        for (let start = 0; start < visibleAiResults.length; start += 2) {
          const group = visibleAiResults.slice(start, start + 2);
          const translatedGroup = await Promise.all(
            group.map(async (item, offset) => {
              const realIndex = start + offset;
              const key = makeAiTranslationItemKey(item, realIndex);
              if (aiResultTranslations[key]) return [key, aiResultTranslations[key]];

              const [title, text] = await Promise.all([
                translateJapaneseLongText(item.title || "", controller.signal, appLanguage),
                translateJapaneseLongText(item.text || "", controller.signal, appLanguage),
              ]);
              return [key, { title, text }];
            })
          );

          if (cancelled) return;
          setAiResultTranslations((current) => ({
            ...current,
            ...Object.fromEntries(translatedGroup),
          }));
        }
      } catch (error) {
        if (error?.name !== "AbortError" && !cancelled) {
          console.error("Long text translation failed:", error);
          setAiTranslationError("Automatic translation could not be loaded. The original Japanese text is being displayed.");
        }
      } finally {
        if (!cancelled) setAiTranslationLoading(false);
      }
    }

    translateVisibleResults();
    return () => {
      cancelled = true;
      controller.abort();
    };
  // aiResultTranslationsは依存配列に入れません。追加のたびに通信を再開始しないためです。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLanguage, visibleAiResults]);

  const globalTotalPages = Math.max(1, Math.ceil(globalResults.length / GLOBAL_RESULTS_PER_PAGE));
  const safeGlobalPage = Math.min(globalPage, globalTotalPages);
  const globalPageStart = (safeGlobalPage - 1) * GLOBAL_RESULTS_PER_PAGE;
  const globalPageEnd = Math.min(globalPageStart + GLOBAL_RESULTS_PER_PAGE, globalResults.length);

  const visibleGlobalResults = useMemo(
    () => globalResults.slice(globalPageStart, globalPageEnd),
    [globalResults, globalPageStart, globalPageEnd]
  );

  useEffect(() => {
    setGlobalPage(1);
  }, [globalSearch]);

  useEffect(() => {
    if (globalPage > globalTotalPages) setGlobalPage(globalTotalPages);
  }, [globalPage, globalTotalPages]);

  useEffect(() => {
    if (appLanguage !== "en" || visibleGlobalResults.length === 0) {
      setGlobalTranslationLoading(false);
      setGlobalTranslationError("");
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function translateGlobalResults() {
      setGlobalTranslationLoading(true);
      setGlobalTranslationError("");
      try {
        for (let start = 0; start < visibleGlobalResults.length; start += 2) {
          const group = visibleGlobalResults.slice(start, start + 2);
          const translatedGroup = await Promise.all(
            group.map(async (item, offset) => {
              const realIndex = start + offset;
              const key = makeAiTranslationItemKey(item, realIndex);
              if (aiResultTranslations[key]) return [key, aiResultTranslations[key]];
              const [title, text] = await Promise.all([
                translateJapaneseLongText(item.title || "", controller.signal, appLanguage),
                translateJapaneseLongText(item.text || "", controller.signal, appLanguage),
              ]);
              return [key, { title, text }];
            })
          );

          if (cancelled) return;
          setAiResultTranslations((current) => ({
            ...current,
            ...Object.fromEntries(translatedGroup),
          }));
        }
      } catch (error) {
        if (error?.name !== "AbortError" && !cancelled) {
          console.error("Global search translation failed:", error);
          setGlobalTranslationError("Automatic translation could not be loaded. Original Japanese is displayed.");
        }
      } finally {
        if (!cancelled) setGlobalTranslationLoading(false);
      }
    }

    translateGlobalResults();
    return () => {
      cancelled = true;
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLanguage, visibleGlobalResults]);

  function makeAiAnswer() {
    if (!aiSearch.trim()) {
      setAiLevel("");
      setAiAnswer("検索したい内容を入力してください。");
      return;
    }

    if (aiResults.length === 0) {
      setAiLevel("🟢 履歴なし");
      setAiAnswer(
        "関連する履歴は見つかりませんでした。\n\n新しいトラブルまたは新しい部品の可能性があります。保全報告書、定期保全、予備品管理に情報を登録してください。"
      );
      return;
    }

    const best = aiResults[0];
    const text = `${aiSearch} ${best.title} ${best.text}`;
    const highWords = ["停止", "ライン停止", "サーボ", "モーター", "安全", "異常停止", "漏れ", "火花", "焼損", "破損", "緊急"];
    const middleWords = ["異常", "交換", "確認", "不具合", "センサー", "ロードセル", "エラー", "調整", "在庫不足"];
    const highHit = highWords.some((word) => text.includes(word));
    const middleHit = middleWords.some((word) => text.includes(word));

    let level = "🟢 軽微";
    let reason = "重大な停止や安全に関わるキーワードは少ないです。";

    if (highHit || aiResults.length >= 4) {
      level = "🔴 緊急確認";
      reason = "停止、安全、重要設備、または複数の関連履歴が見つかりました。";
    } else if (middleHit || aiResults.length >= 1) {
      level = "🟡 注意";
      reason = "異常、交換、確認、センサー系、在庫不足など注意が必要な内容が含まれています。";
    }

    setAiLevel(level);
    setAiAnswer(
      `【Maintenance AI 分析結果】\n\n危険度：${level}\n\n理由：\n・${reason}\n\n関連データ：${aiResults.length}件\n\n一番近い履歴：\n種類：${best.category}\n日付：${best.date}\nタイトル：${best.title}\n\n内容：\n${best.text}\n\n確認ポイント：\n・同じ設備、同じ部品、同じ異常内容がないか確認してください。\n・過去の原因と処置内容を参考にしてください。\n・再発している場合は、再発防止内容の見直しが必要です。\n・在庫不足が関係する場合は、予備品管理を確認してください。`
    );
  }

  function buildAutoReportDraft(inputText = autoReportInput) {
    const input = String(inputText || "").trim();
    if (!input) return null;

    const words = input.split(/\s+/);
    const equipment = words[0] || "";

    let phenomenon = `${input} の不具合が発生。`;
    let troublePoint = words.slice(1).join(" ") || input;
    let why1 = "設備または部品に異常が発生した可能性があるため。";
    let why2 = "原因箇所の点検と発生条件の確認が必要なため。";
    let why3 = "劣化、位置ズレ、汚れ、配線不良などの根本要因を現物確認する必要があるため。";
    let action = "現象確認、原因調査、関係部品の点検を実施。安全を確認した上で、必要に応じて調整・交換・清掃を行う。";
    let recurrencePrevention = "発生条件と処置結果を記録し、定期点検項目へ追加して再発傾向を確認する。";
    let replacedPart = "";
    let note = "MIYAMA AIの下書きです。現物確認後に原因・処置・交換部品を修正してから保存してください。";

    if (input.includes("ロードセル")) {
      phenomenon = "ロードセルの異常が発生し、荷重値の確認が必要な状態。";
      troublePoint = "ロードセル、取付部、配線、コネクタ、アンプ設定";
      why1 = "ロードセル信号または荷重値に異常が発生した可能性があるため。";
      why2 = "配線、コネクタ、取付状態、ゼロ点、またはロードセル本体に異常がある可能性があるため。";
      why3 = "経年劣化、過負荷、振動、接触不良などにより検出値が不安定になった可能性があるため。";
      action = "表示値、ゼロ点、配線、コネクタ、取付状態を順番に確認し、必要に応じて再調整またはロードセル交換を行う。";
      recurrencePrevention = "定期保全に荷重値、ゼロ点、配線固定、コネクタ状態の確認を追加し、傾向値を記録する。";
      replacedPart = "ロードセル（確認後）";
    } else if (input.includes("センサー") || input.includes("光電")) {
      phenomenon = "センサーの検出不良により設備動作が完了しない、または誤判定が発生。";
      troublePoint = "センサー、検出位置、反射板、配線、コネクタ、PLC入力";
      why1 = "センサー信号が正常に入力されていない可能性があるため。";
      why2 = "位置ズレ、汚れ、遮光、断線、コネクタ接触不良などが考えられるため。";
      why3 = "振動、固定不足、経年劣化、周辺環境の変化により検出状態が悪化した可能性があるため。";
      action = "センサー表示、検出物、位置、汚れ、配線、PLC入力を確認し、清掃・位置調整・再学習・交換を判断する。";
      recurrencePrevention = "清掃、固定状態、検出余裕度、配線状態を定期点検へ追加する。";
      replacedPart = "センサーまたはケーブル（確認後）";
    } else if (input.includes("シリンダ") || input.includes("エア")) {
      phenomenon = "シリンダ動作不良、速度低下、またはエア漏れが発生。";
      troublePoint = "シリンダ、電磁弁、スピードコントローラ、配管、継手、圧力";
      why1 = "必要な推力またはストロークが得られていない可能性があるため。";
      why2 = "エア漏れ、圧力不足、電磁弁不良、摺動抵抗の増加などが考えられるため。";
      why3 = "シール劣化、異物混入、給油不足、配管劣化などが進行した可能性があるため。";
      action = "安全停止後、圧力、漏れ、電磁弁出力、速度調整、ロッド状態を確認し、必要に応じて部品交換を行う。";
      recurrencePrevention = "漏れ点検、作動時間、速度、配管状態を定期点検へ追加する。";
      replacedPart = "シリンダ、電磁弁、継手（確認後）";
    }

    const historicalMatches = searchHistory(
      {
        equipment,
        lineName: "",
        phenomenon,
        troublePoint,
        why1,
        why2,
        why3,
        action,
        replacedPart,
      },
      reports,
      { limit: 12, minimumScore: 10 }
    );

    if (historicalMatches[0]) {
      const best = historicalMatches[0];
      note += `\n\n最も近い過去事例：${best.createdAt || best.reportCreatedDate || ""} / ${best.equipment || ""} / ${best.phenomenon || ""}`;
    }

    return {
      ...createBlankReport(),
      maintenanceType: "突発保全",
      functionDownRate: 100,
      equipment,
      phenomenon,
      troublePoint,
      why1,
      why2,
      why3,
      action,
      recurrencePrevention,
      outflowPrevention: "同様の異常が他設備・他工程で発生していないか横展開確認を行う。",
      replacedPart,
      note,
    };
  }

  function createAutoReport() {
    const draft = buildAutoReportDraft();
    if (!draft) {
      alert(
        appLanguage === "es"
          ? "Escriba una descripción breve del problema."
          : appLanguage === "en"
            ? "Enter a short description of the problem."
            : "内容を入力してください。例：78-60 ロードセル異常 荷重確認"
      );
      return;
    }

    setAutoReportAiAnswer("");
    setAutoReportAiError("");
    setHistoryAiQuestion("");
    setHistoryAiAnswer("");
    setHistoryAiError("");
    setNewReport(draft);

    const matches = searchHistory(draft, reports, {
      limit: 12,
      minimumScore: 10,
    });
    setSimilarProblems(matches);
    setAutoReportHistoryMessage(
      appLanguage === "es"
        ? `Se encontraron ${matches.length} casos similares. Revise el borrador abajo.`
        : appLanguage === "en"
          ? `${matches.length} similar cases were found. Review the draft below.`
          : `類似事例が${matches.length}件見つかりました。下の下書きを確認してください。`
    );
  }

  function searchAutoReportProblems() {
    const draft = newReport || buildAutoReportDraft();
    if (!draft) {
      alert(
        appLanguage === "es"
          ? "Escriba primero el problema."
          : appLanguage === "en"
            ? "Enter the problem first."
            : "先に問題内容を入力してください。"
      );
      return;
    }

    if (!newReport) setNewReport(draft);

    const matches = searchHistory(draft, reports, {
      limit: 12,
      minimumScore: 8,
    });

    setSimilarProblems(matches);
    setAutoReportHistoryMessage(
      appLanguage === "es"
        ? `${matches.length} casos similares encontrados en el historial.`
        : appLanguage === "en"
          ? `${matches.length} similar cases found in the history.`
          : `履歴から類似事例を${matches.length}件見つけました。`
    );
  }

  async function askAutoReportAI() {
    const draft = newReport || buildAutoReportDraft();
    const question = String(autoReportInput || "").trim();

    if (!draft || !question) {
      setAutoReportAiError(
        appLanguage === "es"
          ? "Escriba primero el problema."
          : appLanguage === "en"
            ? "Enter the problem first."
            : "先に問題内容を入力してください。"
      );
      return;
    }

    if (!newReport) setNewReport(draft);

    const matches = searchHistory(draft, reports, {
      limit: 8,
      minimumScore: 8,
    });
    setSimilarProblems(matches);

    const historyContext = matches.length
      ? matches.map((item, index) => {
          const calc = calculateReport(item);
          return [
            `Case ${index + 1}`,
            `Similarity: ${item.similarity || 0}%`,
            `Date: ${item.createdAt || item.reportCreatedDate || item.troubleDateTime || ""}`,
            `Equipment: ${item.equipment || ""}`,
            `Symptom: ${item.phenomenon || ""}`,
            `Failure point: ${item.troublePoint || ""}`,
            `Cause: ${item.why3 || item.why2 || item.why1 || ""}`,
            `Action: ${item.action || ""}`,
            `Parts: ${[item.replacedPart, item.partName1, item.partName2, item.partName3].filter(Boolean).join(", ")}`,
            `Downtime: ${calc.stopTimeHours || 0} hours`,
          ].join("\n");
        }).join("\n\n---\n\n")
      : "No sufficiently similar previous report was found.";

    setAutoReportAiLoading(true);
    setAutoReportAiError("");
    setAutoReportAiAnswer("");

    try {
      const responseLanguage =
        appLanguage === "es" ? "Spanish" : appLanguage === "en" ? "English" : "Japanese";

      const result = await askMiyamaAI({
        language: responseLanguage,
        machine: draft.equipment || "",
        context: [
          "CURRENT PROBLEM",
          `Equipment: ${draft.equipment || ""}`,
          `Symptom: ${draft.phenomenon || ""}`,
          `Failure point: ${draft.troublePoint || ""}`,
          "",
          "SIMILAR FACTORY HISTORY",
          historyContext,
        ].join("\n"),
        message: `Analyze this maintenance problem and answer in ${responseLanguage}.

Required structure:
1. Most likely causes ranked.
2. Safe checks in practical order.
3. Corrective actions used in similar previous cases.
4. Parts to inspect or replace.
5. Evidence still required before confirming the cause.
6. Confidence based only on the supplied history.

Do not present a hypothesis as a confirmed cause.
Do not recommend bypassing guards, interlocks, lockout/tagout, or electrical protections.`,
      });

      setAutoReportAiAnswer(String(result.answer || "").trim());
    } catch (error) {
      console.error("Auto report MIYAMA AI error:", error);
      setAutoReportAiError(
        appLanguage === "es"
          ? `No fue posible consultar MIYAMA AI: ${error.message}`
          : appLanguage === "en"
            ? `Could not ask MIYAMA AI: ${error.message}`
            : `MIYAMA AIへ質問できませんでした：${error.message}`
      );
    } finally {
      setAutoReportAiLoading(false);
    }
  }

  function renderGlobalSearchBox() {
    return (
      <div className="tableWrap" style={{ marginBottom: "18px" }}>
        <h2>🔍 AI統合検索</h2>
        <p>保全報告書・定期保全・予備品管理・カレンダー・計画工事をまとめて検索できます。</p>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="例：ロードセル、78-60、センサー、異常停止、在庫不足"
          />
          <button
            className="primaryButton"
            onClick={() => {
              setMiyamaAiQuestion(globalSearch);
              setPage("miyamaAi");
            }}
          >
            <Bot size={16} /> MIYAMA AI
          </button>
        </div>

        {globalSearch && (
          <div style={{ marginTop: "16px" }}>
            <h3>{appLanguage === "en" ? `Search results: ${globalResults.length}` : `検索結果：${globalResults.length}件`}</h3>
            {globalResults.length === 0 && <p>{appLanguage === "en" ? "No related data was found." : "関連データが見つかりません。"}</p>}
            {appLanguage === "en" && globalTranslationLoading && (
              <p style={{ fontWeight: 700 }}>🌐 Translating the displayed reports...</p>
            )}
            {appLanguage === "en" && globalTranslationError && (
              <p style={{ color: "#b45309", fontWeight: 700 }}>{globalTranslationError}</p>
            )}
            {visibleGlobalResults.map((item, index) => {
              const absoluteIndex = globalPageStart + index;
              const translationKey = makeAiTranslationItemKey(item, absoluteIndex);
              const translated = aiResultTranslations[translationKey];
              const displayTitle = appLanguage === "en" && translated?.title ? translated.title : item.title;
              const displayText = appLanguage === "en" && translated?.text ? translated.text : item.text;

              return (
                <div
                  key={translationKey}
                  className="calendarEditCard"
                  style={{ cursor: "pointer" }}
                  onClick={() => setPage(item.page)}
                >
                  <b>{translateMiyamaText(item.category, appLanguage)} / {item.date}</b>
                  <h3>{displayTitle}</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{displayText || "-"}</p>
                  {appLanguage === "en" && translated && (containsJapaneseText(item.title) || containsJapaneseText(item.text)) && (
                    <details onClick={(event) => event.stopPropagation()} style={{ marginTop: "10px" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Show original Japanese</summary>
                      <h4>{item.title}</h4>
                      <p style={{ whiteSpace: "pre-wrap", color: "#64748b" }}>{item.text || "-"}</p>
                    </details>
                  )}
                </div>
              );
            })}
            {globalResults.length > 0 && (
              <div
                style={{
                  marginTop: "18px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div style={{ color: "#64748b", fontWeight: 700 }}>
                  {appLanguage === "en"
                    ? `Showing ${globalPageStart + 1}-${globalPageEnd} of ${globalResults.length} results`
                    : `${globalPageStart + 1}～${globalPageEnd}件 / 全${globalResults.length}件`}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <button
                    type="button"
                    className="primaryButton"
                    disabled={safeGlobalPage === 1}
                    onClick={() => setGlobalPage(1)}
                    style={{ opacity: safeGlobalPage === 1 ? 0.45 : 1 }}
                  >
                    {appLanguage === "en" ? "<< First" : "<< 最初"}
                  </button>

                  <button
                    type="button"
                    className="primaryButton"
                    disabled={safeGlobalPage === 1}
                    onClick={() => setGlobalPage((current) => Math.max(1, current - 1))}
                    style={{ opacity: safeGlobalPage === 1 ? 0.45 : 1 }}
                  >
                    {appLanguage === "en" ? "< Previous" : "< 前へ"}
                  </button>

                  {(() => {
                    const pages = [];
                    const addPage = (pageNumber) => {
                      if (pageNumber >= 1 && pageNumber <= globalTotalPages && !pages.includes(pageNumber)) {
                        pages.push(pageNumber);
                      }
                    };

                    addPage(1);
                    for (let pageNumber = safeGlobalPage - 2; pageNumber <= safeGlobalPage + 2; pageNumber += 1) {
                      addPage(pageNumber);
                    }
                    addPage(globalTotalPages);
                    pages.sort((a, b) => a - b);

                    const controls = [];
                    pages.forEach((pageNumber, index) => {
                      if (index > 0 && pageNumber - pages[index - 1] > 1) {
                        controls.push(
                          <span key={`ellipsis-${pageNumber}`} style={{ padding: "0 2px", fontWeight: 800 }}>
                            ...
                          </span>
                        );
                      }

                      controls.push(
                        <button
                          key={pageNumber}
                          type="button"
                          onClick={() => setGlobalPage(pageNumber)}
                          aria-current={safeGlobalPage === pageNumber ? "page" : undefined}
                          style={{
                            minWidth: "42px",
                            minHeight: "42px",
                            padding: "8px 12px",
                            borderRadius: "12px",
                            border: safeGlobalPage === pageNumber ? "2px solid #1d4ed8" : "1px solid #cbd5e1",
                            background: safeGlobalPage === pageNumber ? "#2563eb" : "#ffffff",
                            color: safeGlobalPage === pageNumber ? "#ffffff" : "#0f172a",
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          {pageNumber}
                        </button>
                      );
                    });

                    return controls;
                  })()}

                  <button
                    type="button"
                    className="primaryButton"
                    disabled={safeGlobalPage === globalTotalPages}
                    onClick={() => setGlobalPage((current) => Math.min(globalTotalPages, current + 1))}
                    style={{ opacity: safeGlobalPage === globalTotalPages ? 0.45 : 1 }}
                  >
                    {appLanguage === "en" ? "Next >" : "次へ >"}
                  </button>

                  <button
                    type="button"
                    className="primaryButton"
                    disabled={safeGlobalPage === globalTotalPages}
                    onClick={() => setGlobalPage(globalTotalPages)}
                    style={{ opacity: safeGlobalPage === globalTotalPages ? 0.45 : 1 }}
                  >
                    {appLanguage === "en" ? "Last >>" : "最後 >>"}
                  </button>
                </div>

                <div style={{ fontWeight: 800 }}>
                  {appLanguage === "en"
                    ? `Page ${safeGlobalPage} of ${globalTotalPages}`
                    : `${safeGlobalPage} / ${globalTotalPages} ページ`}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function SubTabBar({ items, value, onChange }) {
    return (
      <div className="subTabs">
        {items.map((item) => (
          <button key={item.key} type="button" className={value === item.key ? "active" : ""} onClick={() => onChange(item.key)}>
            {item.icon} {item.label}
          </button>
        ))}
      </div>
    );
  }

  function IconMetric({ icon, label, value }) {
    return (
      <div className="reportSummaryItem iconMetric">
        <span className="iconBubble">{icon}</span>
        <div>
          <span>{label}</span>
          <strong>{value || "-"}</strong>
        </div>
      </div>
    );
  }


  function ExecutiveMetric({ icon, label, value, percent, tone = "normal", sub }) {
    const safePercent = clampPercent(percent);
    return (
      <div className="executiveMetricCard">
        <div className="executiveMetricTop">
          <div>
            <span className="executiveMetricLabel">{label}</span>
            <strong className="executiveMetricValue">{value}</strong>
          </div>
          <div className="executiveMetricIcon">{icon}</div>
        </div>
        {sub && <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "13px" }}>{sub}</p>}
        {percent !== undefined && (
          <div className="kpiBarOuter">
            <div className={`kpiBarInner ${tone}`} style={{ width: `${safePercent}%` }} />
          </div>
        )}
      </div>
    );
  }

  function getReportUrl(reportId) {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/?page=report&id=${encodeURIComponent(reportId || "")}`;
  }

  async function copyReportQrLink(reportId) {
    const url = getReportUrl(reportId);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert(`QRリンクをコピーしました。\n\n${url}`);
        return;
      }
    } catch (error) {
      console.warn("clipboard copy failed", error);
    }
    window.prompt("このリンクをコピーしてください。", url);
  }

  function exportReportCsv(row) {
    const calc = calculateReport(row);
    const headers = ["作成日", "設備名", "ライン名", "作業者", "不具合現象", "不具合箇所", "なぜ1", "なぜ2", "なぜ3", "処置内容", "停止時間H", "労務費", "部品費", "合計費用", "承認状態"];
    const values = [row.createdAt, row.equipment, row.lineName, row.worker, row.phenomenon, row.troublePoint, row.why1, row.why2, row.why3, row.action, calc.stopTimeHours, calc.laborCost, calc.partsCost, calc.totalCost, row.approvalStatus];
    const csv = [headers.map(makeCsvSafe).join(","), values.map(makeCsvSafe).join(",")].join("\n");
    downloadTextFile(`MIYAMA_保全報告書_${row.equipment || row.id || todayText()}.csv`, "\ufeff" + csv, "text/csv;charset=utf-8");
  }

  function printReport(row) {
    const calc = calculateReport(row);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>保全作業報告書</title><style>body{font-family:Arial,'Yu Gothic',sans-serif;padding:28px;color:#0f172a}h1{border-bottom:3px solid #2563eb;padding-bottom:12px}.grid{display:grid;grid-template-columns:160px 1fr;border:1px solid #cbd5e1}.grid div{padding:10px;border-bottom:1px solid #e2e8f0}.label{background:#f8fafc;font-weight:bold}.box{white-space:pre-wrap;border:1px solid #cbd5e1;padding:14px;margin:10px 0;border-radius:10px}</style></head><body><h1>MIYAMA 保全作業報告書</h1><div class="grid"><div class="label">作成日</div><div>${row.createdAt || ''}</div><div class="label">設備名</div><div>${row.equipment || ''}</div><div class="label">ライン名</div><div>${row.lineName || ''}</div><div class="label">作業者</div><div>${row.worker || ''}</div><div class="label">停止時間</div><div>${calc.stopTimeHours}H</div><div class="label">合計費用</div><div>${formatYen(calc.totalCost)}</div><div class="label">承認状態</div><div>${row.approvalStatus || ''}</div></div><h2>不具合現象</h2><div class="box">${row.phenomenon || ''}</div><h2>なぜなぜ分析</h2><div class="box">なぜ1：${row.why1 || ''}\n\nなぜ2：${row.why2 || ''}\n\nなぜ3：${row.why3 || ''}</div><h2>処置内容</h2><div class="box">${row.action || ''}</div><h2>再発防止</h2><div class="box">${row.recurrencePrevention || ''}</div></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return alert("ポップアップを許可してください。");
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

const formatExcelDate = (value) => {
  if (!value) return "";

  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return "";
    const yyyy = date.y;
    const mm = String(date.m).padStart(2, "0");
    const dd = String(date.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  try {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return toLocalDateText(date);
    }
  } catch {}

  return String(value).replace(/\//g, "-").split(" ")[0];
};

const excelText = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null || value === "" || value === 0 || value === "0") continue;
    const t = String(value).replace(/\r\n/g, "\n").trim();
    if (t && t !== "0") return t;
  }
  return "";
};

const wsBy = (workbook, names) => names.map((n) => workbook?.Sheets?.[n]).find(Boolean) || null;
const cv = (sheet, addr) => sheet?.[addr]?.v ?? sheet?.[addr]?.w ?? "";
const joinCells = (sheet, cells) => cells.map((c) => excelText(cv(sheet, c))).filter(Boolean).join("\n");
const numberCell = (v, fallback = 0) => (v instanceof Date ? fallback : toNumber(v, fallback));

const dateFromParts = (y, m, d, h = 0, min = 0) => {
  const yy = Number(y), mm = Number(m), dd = Number(d);
  if (!yy || !mm || !dd || yy <= 1900) return "";
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}T${String(Number(h || 0)).padStart(2, "0")}:${String(Number(min || 0)).padStart(2, "0")}`;
};

const extractReportSheetData = (workbook) => {
  const data = {};
  const report = wsBy(workbook, ["報告書"]);
  const old = wsBy(workbook, ["原紙(PC入力)", "原紙", "修理報告書"]);

  if (report) {
    const start = cv(report, "E5");
    const end = cv(report, "E6");
    Object.assign(data, {
      reportType: excelText(cv(report, "A1")),
      worker: excelText(cv(report, "S2"), cv(report, "B2")),
      createdBy: excelText(cv(report, "S2")),
      approvedBy: excelText(cv(report, "Q2")),
      inspectedBy: excelText(cv(report, "R2")),
      maintenanceType: excelText(cv(report, "C3")),
      troubleDateTime: excelDateTime(cv(report, "E4"), start || end),
      workStartDateTime: excelDateTime(start, end),
      workEndDateTime: excelDateTime(end, start),
      productionStartDateTime: excelDateTime(cv(report, "E7"), end || start),
      stopExclusionHours: numberCell(cv(report, "E8"), 0),
      functionDownRate: numberCell(cv(report, "E9"), 100),
      groupName: excelText(cv(report, "D12")),
      lineName: excelText(cv(report, "K12")),
      equipment: excelText(cv(report, "P12")),
      phenomenon: joinCells(report, ["B14", "B15", "B16"]),
      troublePoint: joinCells(report, ["B18", "B19", "B20"]),
      why1: joinCells(report, ["B22", "B23"]),
      why2: joinCells(report, ["B24", "B25"]),
      why3: joinCells(report, ["B26", "B27"]),
      action: joinCells(report, ["B29", "B30", "B31", "B32", "B33", "B34", "B35", "B36", "B37", "B38", "B39", "B40", "B41"]),
      recurrenceCategory: excelText(cv(report, "E43")),
      recurrencePrevention: joinCells(report, ["B44", "B45", "B46"]),
      outflowPrevention: joinCells(report, ["B48", "B49"]),
      changeRank: excelText(cv(report, "C51")),
      fpInspection: excelText(cv(report, "H51")),
      laborHours: numberCell(cv(report, "E60"), 0),
      laborCost: numberCell(cv(report, "E61"), 0),
      partsCost: numberCell(cv(report, "R61"), 0),
      totalCost: numberCell(cv(report, "R62"), 0),
    });
  }

  if (old) {
    const trouble = dateFromParts(cv(old, "D5"), cv(old, "F5"), cv(old, "H5"), cv(old, "J5"), cv(old, "M5"));
    const baseDate = getValidDatePart(trouble) || todayText();
    Object.assign(data, {
      reportType: data.reportType || excelText(cv(old, "A2")),
      troubleDateTime: data.troubleDateTime || trouble,
      createdAt: data.createdAt || normalizeDateOnly(trouble),
      groupName: data.groupName || excelText(cv(old, "D7")),
      lineName: data.lineName || excelText(cv(old, "K7")),
      equipment: data.equipment || excelText(cv(old, "P7")),
      troublePoint: data.troublePoint || joinCells(old, ["B9", "B10", "B11"]),
      phenomenon: data.phenomenon || joinCells(old, ["B14", "B15", "B16", "B17"]),
      why1: data.why1 || joinCells(old, ["B20", "B21", "B22", "B23"]),
      action: data.action || joinCells(old, ["B26", "B27", "B28", "B29", "B30", "B31", "B32", "B33", "B34", "B35", "B36"]),
      recurrencePrevention: data.recurrencePrevention || joinCells(old, ["B40", "B41"]),
      outflowPrevention: data.outflowPrevention || joinCells(old, ["B44", "B45"]),
      changeRank: data.changeRank || excelText(cv(old, "C47"), cv(old, "E47"), cv(old, "I47")),
      workStartDateTime: data.workStartDateTime || (cv(old, "E51") !== "" ? `${baseDate}T${String(Number(cv(old, "E51") || 0)).padStart(2, "0")}:${String(Number(cv(old, "H51") || 0)).padStart(2, "0")}` : ""),
      workEndDateTime: data.workEndDateTime || (cv(old, "E52") !== "" ? `${baseDate}T${String(Number(cv(old, "E52") || 0)).padStart(2, "0")}:${String(Number(cv(old, "H52") || 0)).padStart(2, "0")}` : ""),
      laborHours: data.laborHours || Number((numberCell(cv(old, "E55"), 0) / 60).toFixed(2)),
      laborCost: data.laborCost || numberCell(cv(old, "E56"), 0),
      partsCost: data.partsCost || numberCell(cv(old, "R56"), 0),
      totalCost: data.totalCost || numberCell(cv(old, "R57"), 0),
    });
  }

  return data;
};

const buildReportFromExcelRow = (row = [], fileName = "", workbook = null) => {
  const sheet = extractReportSheetData(workbook);
  const rowStart = excelDateTime(row?.[4], row?.[3] || row?.[5]);
  const rowEnd = excelDateTime(row?.[5], row?.[4] || row?.[6]);
  const rowTrouble = excelDateTime(row?.[3], row?.[4] || row?.[5]);
  const rowProduction = excelDateTime(row?.[6], row?.[5] || row?.[4]);
  const rawRate = sheet.functionDownRate ?? numberCell(row?.[8], 100);

  const report = {
    ...createBlankReport(),
    reportType: excelText(sheet.reportType, row?.[0]) || "保全作業報告書",
    worker: excelText(sheet.worker, row?.[1]),
    createdBy: excelText(sheet.createdBy, row?.[1]),
    approvedBy: excelText(sheet.approvedBy),
    inspectedBy: excelText(sheet.inspectedBy),
    maintenanceType: excelText(sheet.maintenanceType, row?.[2]) || "CM",
    troubleDateTime: pickDateTime(sheet.troubleDateTime || rowTrouble, sheet.workStartDateTime || rowStart),
    workStartDateTime: pickDateTime(sheet.workStartDateTime || rowStart),
    workEndDateTime: pickDateTime(sheet.workEndDateTime || rowEnd),
    productionStartDateTime: pickDateTime(sheet.productionStartDateTime || rowProduction, sheet.workEndDateTime || rowEnd),
    stopExclusionHours: sheet.stopExclusionHours ?? numberCell(row?.[7], 0),
    functionDownRate: rawRate <= 1 ? rawRate * 100 : rawRate,
    createdAt: sheet.createdAt || normalizeDateOnly(sheet.workStartDateTime || rowStart) || normalizeDateOnly(sheet.troubleDateTime || rowTrouble) || todayText(),
    groupName: excelText(sheet.groupName, row?.[10]),
    lineName: excelText(sheet.lineName, row?.[11]),
    equipment: excelText(sheet.equipment, row?.[12]),
    phenomenon: excelText(sheet.phenomenon, row?.[13]),
    troublePoint: excelText(sheet.troublePoint, row?.[14]),
    why1: excelText(sheet.why1, row?.[15]),
    why2: excelText(sheet.why2, row?.[16]),
    why3: excelText(sheet.why3, row?.[17]),
    action: excelText(sheet.action, row?.[18]),
    recurrenceCategory: excelText(sheet.recurrenceCategory, row?.[19]),
    recurrencePrevention: excelText(sheet.recurrencePrevention, row?.[20]),
    outflowPrevention: excelText(sheet.outflowPrevention, row?.[21]),
    changeRank: excelText(sheet.changeRank, row?.[22]),
    fpInspection: excelText(sheet.fpInspection, row?.[23]),
    laborHours: sheet.laborHours ?? numberCell(row?.[24], 0),
    laborCost: sheet.laborCost ?? numberCell(row?.[25], 0),
    partsCost: sheet.partsCost ?? numberCell(row?.[26], 0),
    totalCost: sheet.totalCost ?? numberCell(row?.[27], 0),
    approvalStatus: "Excel取込",
    note: fileName ? `Excel取込ファイル：${fileName}` : "",
  };
  return { ...report, ...calculateReport(report) };
};

const getReportRowFromWorkbook = (workbook) => {
  const sheet = workbook?.Sheets?.["DBコピペ用"] || workbook?.Sheets?.[workbook?.SheetNames?.[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  return rows.find((row, index) => index > 0 && row && row.some((cell) => String(cell || "").trim() !== "")) || [];
};

const handleReportExcelUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (evt) => {
    try {
      const data = evt.target.result;
      const workbook = XLSX.read(data, { type: "binary", cellDates: true });
      const row = getReportRowFromWorkbook(workbook);

      if (!row) {
        alert("Excelデータが見つかりませんでした。");
        return;
      }

      const report = buildReportFromExcelRow(row, file.name, workbook);
      setNewReport((prev) => ({ ...prev, ...report }));

      alert("Excelデータをフォームへ取込みました。");
    } catch (error) {
      console.error("Excel import error:", error);
      alert("Excel取込エラーが発生しました。");
    }
  };

  reader.onerror = () => {
    alert("ファイル読込エラーが発生しました。");
  };

  reader.readAsBinaryString(file);
};

const handleBulkReportExcelUpload = async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  let success = 0;
  let failed = 0;
  let duplicated = 0;
  const existingSnap = await getDocs(collection(db, "maintenanceReports"));
  const existingReportKeys = new Set(existingSnap.docs.map((d) => makeMaintenanceReportDuplicateKey(d.data())));

  for (const file of files) {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true });
      const row = getReportRowFromWorkbook(workbook);

      if (!row) {
        failed += 1;
        continue;
      }

      const report = buildReportFromExcelRow(row, file.name, workbook);
      report.note = `Excel一括取込ファイル：${file.name}`;

      const duplicateKey = makeMaintenanceReportDuplicateKey(report);
      if (existingReportKeys.has(duplicateKey)) {
        duplicated += 1;
        continue;
      }
      await addDoc(collection(db, "maintenanceReports"), { ...report, duplicateKey });
      existingReportKeys.add(duplicateKey);
      success += 1;
    } catch (error) {
      console.error("Import error:", file.name, error);
      failed += 1;
    }
  }

  await loadReports();

  alert(`一括取込完了
成功：${success}件
重複スキップ：${duplicated}件
失敗：${failed}件`);
};

  function ReportDraftForm() {
    if (!newReport) return null;

    const calc = calculateReport(newReport);
    const setReport = (field, value) => setNewReport((current) => ({ ...current, [field]: value }));

    async function generateThreeWhys() {
      const phenomenon = String(newReport.phenomenon || "").trim();
      const troublePoint = String(newReport.troublePoint || "").trim();

      if (!phenomenon && !troublePoint) {
        setWhyAiError(
          appLanguage === "es"
            ? "Escriba primero el síntoma o el punto de la falla."
            : appLanguage === "en"
              ? "Enter the failure symptom or failure point first."
              : "先に不具合現象または不具合箇所を入力してください。"
        );
        return;
      }

      const responseLanguage =
        appLanguage === "es" ? "Spanish" : appLanguage === "en" ? "English" : "Japanese";

      setWhyAiLoading(true);
      setWhyAiError("");

      try {
        const context = [
          `Equipment: ${newReport.equipment || ""}`,
          `Line: ${newReport.lineName || ""}`,
          `Failure symptom: ${phenomenon}`,
          `Failure point: ${troublePoint}`,
          `Current action: ${newReport.action || ""}`,
        ].join("\n");

        const result = await askMiyamaAI({
          language: responseLanguage,
          machine: newReport.equipment || "",
          context,
          message: `Create exactly three connected Why-Why steps for this industrial maintenance failure.

Return ONLY valid JSON. Do not use Markdown and do not add explanations outside the JSON.

Required JSON structure:
{
  "why1": "direct reason the symptom occurred",
  "why2": "reason why Why 1 occurred",
  "why3": "deeper probable root cause behind Why 2",
  "action": "safe corrective action to verify and perform",
  "recurrencePrevention": "practical recurrence-prevention action"
}

Rules:
- Use exactly 3 whys, no Why 4 or Why 5.
- Write in ${responseLanguage}.
- Preserve machine codes, model numbers, alarm numbers, part numbers, and filenames.
- Do not invent a confirmed cause. Use wording such as probable, possible, or requires verification when evidence is insufficient.
- Never recommend bypassing guards, safety circuits, interlocks, lockout/tagout, or electrical protections.`,
        });

        const parsed = extractJsonObject(result.answer);
        const required = ["why1", "why2", "why3"];
        if (required.some((key) => !String(parsed[key] || "").trim())) {
          throw new Error("A resposta da IA não contém os três porquês.");
        }

        setNewReport((current) => ({
          ...current,
          why1: String(parsed.why1 || "").trim(),
          why2: String(parsed.why2 || "").trim(),
          why3: String(parsed.why3 || "").trim(),
          action: String(parsed.action || current.action || "").trim(),
          recurrencePrevention: String(
            parsed.recurrencePrevention || current.recurrencePrevention || ""
          ).trim(),
        }));
      } catch (error) {
        console.error("3 Whys AI error:", error);
        setWhyAiError(
          appLanguage === "es"
            ? `No se pudieron generar los 3 porqués: ${error.message}`
            : appLanguage === "en"
              ? `Could not generate the 3 Whys: ${error.message}`
              : `3つのなぜを生成できませんでした：${error.message}`
        );
      } finally {
        setWhyAiLoading(false);
      }
    }

    async function askHistoryMaintenanceAI() {
      const question = String(historyAiQuestion || "").trim();
      const phenomenon = String(newReport.phenomenon || "").trim();
      const troublePoint = String(newReport.troublePoint || "").trim();

      if (!phenomenon && !troublePoint) {
        setHistoryAiError(
          appLanguage === "es"
            ? "Escriba primero el síntoma o el punto de la falla."
            : appLanguage === "en"
              ? "Enter the failure symptom or failure point first."
              : "先に不具合現象または不具合箇所を入力してください。"
        );
        return;
      }

      const responseLanguage =
        appLanguage === "es" ? "Spanish" : appLanguage === "en" ? "English" : "Japanese";

      const historyRows = similarProblems.slice(0, 8);
      const historyContext = historyRows.length
        ? historyRows
            .map((item, index) => {
              const calc = calculateReport(item);
              const cause = item.why3 || item.why2 || item.why1 || "";
              const parts = [
                item.replacedPart,
                item.partName1,
                item.partName2,
                item.partName3,
              ]
                .filter(Boolean)
                .join(", ");

              return [
                `Case ${index + 1}`,
                `Similarity: ${item.similarity || 0}%`,
                `Date: ${item.createdAt || item.reportCreatedDate || item.troubleDateTime || ""}`,
                `Equipment: ${item.equipment || ""}`,
                `Line: ${item.lineName || ""}`,
                `Symptom: ${item.phenomenon || ""}`,
                `Failure point: ${item.troublePoint || ""}`,
                `Previous cause: ${cause}`,
                `Previous action: ${item.action || ""}`,
                `Recurrence prevention: ${item.recurrencePrevention || ""}`,
                `Replaced parts: ${parts}`,
                `Downtime hours: ${calc.stopTimeHours || 0}`,
              ].join("\n");
            })
            .join("\n\n---\n\n")
        : "No sufficiently similar previous report was found.";

      setHistoryAiLoading(true);
      setHistoryAiError("");
      setHistoryAiAnswer("");

      try {
        const result = await askMiyamaAI({
          language: responseLanguage,
          machine: newReport.equipment || "",
          context: [
            `CURRENT PROBLEM`,
            `Equipment: ${newReport.equipment || ""}`,
            `Line: ${newReport.lineName || ""}`,
            `Failure symptom: ${phenomenon}`,
            `Failure point: ${troublePoint}`,
            "",
            `SIMILAR PREVIOUS CASES FROM THE FACTORY HISTORY`,
            historyContext,
          ].join("\n"),
          message: `Answer this maintenance question using the factory history above:

${question || "How should we diagnose and repair this problem quickly?"}

Required response structure:
1. Most likely previous causes, ranked.
2. What to check first, in a safe practical order.
3. Previous corrective actions that solved similar cases.
4. Parts that may need inspection or replacement.
5. Important differences or missing evidence.
6. Confidence level based only on the supplied history.

Rules:
- Write in ${responseLanguage}.
- Clearly separate confirmed historical facts from hypotheses.
- Do not claim that a cause is confirmed without physical verification.
- Do not recommend bypassing guards, interlocks, lockout/tagout, or electrical protections.
- Keep the answer practical for an industrial maintenance technician.`,
        });

        setHistoryAiAnswer(String(result.answer || "").trim());
      } catch (error) {
        console.error("MIYAMA history AI error:", error);
        setHistoryAiError(
          appLanguage === "es"
            ? `No fue posible consultar MIYAMA AI: ${error.message}`
            : appLanguage === "en"
              ? `Could not ask MIYAMA AI: ${error.message}`
              : `MIYAMA AIへ質問できませんでした：${error.message}`
        );
      } finally {
        setHistoryAiLoading(false);
      }
    }

    function openPreviousReport(problem) {
      if (!problem?.id) return;

      setNewReport(null);
      setSimilarProblems([]);
      setHistoryAiQuestion("");
      setHistoryAiAnswer("");
      setHistoryAiError("");
      setReportSearch(problem.id);
      setPage("report");

      window.setTimeout(() => {
        document
          .getElementById(`maintenance-report-${problem.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }

    return (
      <div className="tableWrap" style={{ border: "2px solid #2563eb" }}>
        <div
          style={{
            border: "2px solid #0f172a",
            borderRadius: "16px",
            overflow: "visible",
            background: "#fff",
          }}
        >
          <div
            className="reportTopCompact"
            style={{
              display: "flex",
              flexWrap: "wrap",
              borderBottom: "2px solid #0f172a",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div className="reportTitleCompact" style={{ padding: "18px", textAlign: "center", flex: "1 1 520px", minWidth: "280px" }}>
              <h1 style={{ margin: 0, fontSize: "30px" }}>保全作業報告書</h1>
              <p style={{ margin: "8px 0 0", color: "#64748b" }}>
                Excel原紙の項目を残し、入力しやすいようにブロック別で管理します。
              </p>
            </div>

            <div className="reportApprovalCompact" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", borderLeft: 0, borderTop: "2px solid #0f172a", flex: "1 1 100%", minWidth: 0, maxWidth: "100%", width: "100%" }}>
              <div style={{ borderRight: "1px solid #94a3b8", padding: "8px", minHeight: "96px" }}>
                <strong>承認</strong>
                <div style={{ marginTop: "8px", fontWeight: 800 }}>{newReport.approvedBy || "—"}</div>
                <small>{newReport.approvedDate || ""}</small>
              </div>
              <div style={{ borderRight: "1px solid #94a3b8", padding: "8px", minHeight: "96px" }}>
                <strong>点検</strong>
                <div style={{ marginTop: "8px", fontWeight: 800 }}>{newReport.inspectedBy || "—"}</div>
                <small>{newReport.inspectedDate || ""}</small>
              </div>
              <div style={{ borderRight: "1px solid #94a3b8", padding: "8px", minHeight: "96px" }}>
                <strong>作成</strong>
                <div style={{ marginTop: "8px", fontWeight: 800 }}>{newReport.createdBy || currentUserName || "—"}</div>
                <small>{newReport.reportCreatedDate || todayText()}</small>
              </div>
            </div>
          </div>

          <div style={{ padding: "14px", background: reportStatusColor(newReport.approvalStatus), display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <strong>承認ステータス</strong>
            <select
              value={newReport.approvalStatus || "下書き"}
              onChange={(e) => {
                const next = e.target.value;
                if (next === "承認済み" && !canApprove) {
                  alert(approvalPermissionMessage("approve"));
                  return;
                }
                if (next === "承認待ち" && !canInspect) {
                  alert(approvalPermissionMessage("inspect"));
                  return;
                }
                setReport("approvalStatus", next);
              }}
              style={{ maxWidth: "180px" }}
            >
              <option value="下書き">下書き</option>
              <option value="点検待ち">点検待ち</option>
              {canInspect && <option value="承認待ち">承認待ち</option>}
              {canApprove && <option value="承認済み">承認済み</option>}
              {(canInspect || canApprove) && <option value="差戻し">差戻し</option>}
              <option value="Excel取込">Excel取込</option>
            </select>

            <span
              style={{
                padding: "8px 12px",
                borderRadius: "10px",
                background: "#eff6ff",
                color: "#1e40af",
                fontWeight: 800,
                fontSize: "12px",
              }}
            >
              🔐 新規報告書は保存後に点検・承認できます。
            </span>

            <button className="primaryButton" onClick={saveNewReport}>
              <Save size={16} /> 保存
            </button>
            <button className="deleteButton" onClick={cancelNewReport}>
              <X size={16} /> キャンセル
            </button>
          </div>
        </div>

        <div style={{ marginTop: "12px" }}>
          <p style={{ margin: "4px 0", fontWeight: "bold" }}>1件Excel取込</p>
          <input type="file" accept=".xlsx,.xls,.xlsm" onChange={handleReportExcelUpload} />

          <p style={{ margin: "12px 0 4px", fontWeight: "bold" }}>複数Excel一括取込</p>
          <input type="file" accept=".xlsx,.xls,.xlsm" multiple onChange={handleBulkReportExcelUpload} />
        </div>

        <Section openSections={openSections} toggleSection={toggleSection} sectionKey="basic" title="📌 基本情報・設備情報">
          <div className="reportGrid">
            <label>📅 作成日<input type="date" value={dateOnlyInputValue(newReport.createdAt)} onChange={(e) => setReport("createdAt", e.target.value)} /></label>
            <label>🗂️ 保全分類
              <select value={newReport.maintenanceType || "CM"} onChange={(e) => setReport("maintenanceType", e.target.value)}>
                <option value="CM">CM</option>
                <option value="BM">BM</option>
                <option value="PM">PM</option>
                <option value="その他">その他</option>
              </select>
            </label>
            <label>👥 グループ名<input value={newReport.groupName || ""} onChange={(e) => setReport("groupName", e.target.value)} /></label>
            <label>🏭 ライン名<input value={newReport.lineName || ""} onChange={(e) => setReport("lineName", e.target.value)} /></label>
            <label>⚙️ 設備名<input value={newReport.equipment || ""} onChange={(e) => setReport("equipment", e.target.value)} /></label>
            <label>👤 作業者<input value={newReport.worker || ""} onChange={(e) => { setReport("worker", e.target.value); setReport("createdBy", newReport.createdBy || e.target.value); }} /></label>
          </div>
        </Section>

        <Section openSections={openSections} toggleSection={toggleSection} sectionKey="time" title="⏱️ 時間・停止時間（自動計算）">
          <div className="reportGrid">
            <label>🚨 ①不具合発生日時<input type="datetime-local" value={dateTimeInputValue(newReport.troubleDateTime)} onChange={(e) => setReport("troubleDateTime", e.target.value)} /></label>
            <label>🛠️ ②保全作業開始日時<input type="datetime-local" value={dateTimeInputValue(newReport.workStartDateTime)} onChange={(e) => setReport("workStartDateTime", e.target.value)} /></label>
            <label>✅ ③保全作業完了日時<input type="datetime-local" value={dateTimeInputValue(newReport.workEndDateTime)} onChange={(e) => setReport("workEndDateTime", e.target.value)} /></label>
            <label>▶️ ④生産開始日時<input type="datetime-local" value={dateTimeInputValue(newReport.productionStartDateTime)} onChange={(e) => setReport("productionStartDateTime", e.target.value)} /></label>
            <label>⏸️ ⑤停止除外時間H<input type="number" step="0.1" value={newReport.stopExclusionHours ?? 0} onChange={(e) => setReport("stopExclusionHours", e.target.value)} /></label>
            <label>📉 ⑥機能低下(%)<input type="number" step="1" value={newReport.functionDownRate ?? 100} onChange={(e) => setReport("functionDownRate", e.target.value)} /></label>
            <label>⏱️ ⑦停止時間H<input className="readOnlyCalc" readOnly value={calc.stopTimeHours} /></label>
          </div>
          <p style={{ color: "#64748b" }}>※⑦停止時間＝（④生産開始日時 - ①不具合発生日時 - ⑤停止除外時間）×⑥機能低下率</p>
        </Section>

        <Section openSections={openSections} toggleSection={toggleSection} sectionKey="trouble" title="📝 不具合内容">
          <h3>🚨 不具合現象</h3>
          <textarea value={newReport.phenomenon || ""} onChange={(e) => setReport("phenomenon", e.target.value)} />
          <h3>📍 不具合箇所</h3>
          <textarea value={newReport.troublePoint || ""} onChange={(e) => setReport("troublePoint", e.target.value)} />
          <h3>🔗 リンク先</h3>
          <input value={newReport.linkUrl || ""} onChange={(e) => setReport("linkUrl", e.target.value)} placeholder="写真・図面・詳細資料リンク" />
        </Section>

        <SimilarProblems
          problems={similarProblems}
          language={appLanguage}
          onOpenReport={openPreviousReport}
        />

        <section
          style={{
            margin: "16px 0",
            padding: "16px",
            border: "1px solid #c4b5fd",
            borderRadius: "16px",
            background: "linear-gradient(135deg, #f5f3ff, #ffffff)",
          }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: "22px" }}>
            🤖 {appLanguage === "es"
              ? "Preguntar a MIYAMA AI"
              : appLanguage === "en"
                ? "Ask MIYAMA AI"
                : "MIYAMA AIへ質問"}
          </h2>

          <p style={{ margin: "0 0 12px", color: "#64748b", fontWeight: 700 }}>
            {appLanguage === "es"
              ? "La respuesta utilizará los casos anteriores mostrados arriba."
              : appLanguage === "en"
                ? "The answer will use the previous cases shown above."
                : "上に表示された過去事例を使って回答します。"}
          </p>

          <textarea
            value={historyAiQuestion}
            onChange={(event) => setHistoryAiQuestion(event.target.value)}
            placeholder={
              appLanguage === "es"
                ? "Ej.: ¿Cómo reparo esto? ¿Qué pieza debo revisar? ¿Ya ocurrió antes?"
                : appLanguage === "en"
                  ? "Example: How do I repair this? Which part should I inspect? Has this happened before?"
                  : "例：どう直せばいい？どの部品を確認する？以前にも発生した？"
            }
            style={{ minHeight: "92px" }}
          />

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
            <button
              type="button"
              className="primaryButton"
              onClick={askHistoryMaintenanceAI}
              disabled={historyAiLoading}
              style={{ opacity: historyAiLoading ? 0.65 : 1 }}
            >
              <Bot size={18} />
              {historyAiLoading
                ? appLanguage === "es"
                  ? "Analizando..."
                  : appLanguage === "en"
                    ? "Analyzing..."
                    : "分析中..."
                : appLanguage === "es"
                  ? "Preguntar a MIYAMA AI"
                  : appLanguage === "en"
                    ? "Ask MIYAMA AI"
                    : "MIYAMA AIへ質問"}
            </button>

            <button
              type="button"
              className="primaryButton"
              onClick={() =>
                setHistoryAiQuestion(
                  appLanguage === "es"
                    ? "¿Cómo puedo diagnosticar y reparar este problema rápidamente?"
                    : appLanguage === "en"
                      ? "How can I diagnose and repair this problem quickly?"
                      : "この問題を早く診断して修理するにはどうすればいいですか？"
                )
              }
            >
              {appLanguage === "es"
                ? "Usar pregunta rápida"
                : appLanguage === "en"
                  ? "Use quick question"
                  : "簡単質問を入力"}
            </button>
          </div>

          {historyAiError && (
            <div
              role="alert"
              style={{
                marginTop: "12px",
                padding: "11px 13px",
                borderRadius: "12px",
                background: "#fee2e2",
                color: "#991b1b",
                fontWeight: 700,
              }}
            >
              {historyAiError}
            </div>
          )}

          {historyAiAnswer && (
            <div
              style={{
                marginTop: "14px",
                padding: "14px",
                border: "1px solid #ddd6fe",
                borderRadius: "14px",
                background: "#ffffff",
                whiteSpace: "pre-wrap",
                lineHeight: 1.65,
              }}
            >
              <strong>
                {appLanguage === "es"
                  ? "Respuesta de MIYAMA AI"
                  : appLanguage === "en"
                    ? "MIYAMA AI Answer"
                    : "MIYAMA AI回答"}
              </strong>
              <div style={{ marginTop: "8px" }}>{historyAiAnswer}</div>
            </div>
          )}
        </section>

        <Section openSections={openSections} toggleSection={toggleSection} sectionKey="why" title="🔍 不具合原因・なぜなぜ分析">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "14px",
              padding: "12px",
              border: "1px solid #bfdbfe",
              borderRadius: "14px",
              background: "#eff6ff",
            }}
          >
            <button
              type="button"
              className="primaryButton"
              onClick={generateThreeWhys}
              disabled={whyAiLoading}
              style={{ opacity: whyAiLoading ? 0.65 : 1 }}
            >
              <Bot size={18} />
              {whyAiLoading
                ? appLanguage === "es"
                  ? "Generando..."
                  : appLanguage === "en"
                    ? "Generating..."
                    : "生成中..."
                : appLanguage === "es"
                  ? "Generar 3 porqués"
                  : appLanguage === "en"
                    ? "Generate 3 Whys"
                    : "3つのなぜを生成"}
            </button>

            <span style={{ color: "#475569", fontSize: "13px", fontWeight: 700 }}>
              {appLanguage === "es"
                ? "La IA completa solo 3 porqués, acción correctiva y prevención. Revise antes de guardar."
                : appLanguage === "en"
                  ? "AI fills only 3 Whys, corrective action, and prevention. Review before saving."
                  : "AIは3つのなぜ・処置内容・再発防止のみを作成します。保存前に確認してください。"}
            </span>
          </div>

          {whyAiError && (
            <div
              role="alert"
              style={{
                marginBottom: "12px",
                padding: "10px 12px",
                borderRadius: "12px",
                background: "#fee2e2",
                color: "#991b1b",
                fontWeight: 700,
              }}
            >
              {whyAiError}
            </div>
          )}

          {[1, 2, 3].map((num) => (
            <label key={num}>
              {appLanguage === "es" ? `Por qué ${num}` : appLanguage === "en" ? `Why ${num}` : `なぜ${num}`}
              <textarea
                value={newReport[`why${num}`] || ""}
                onChange={(e) => setReport(`why${num}`, e.target.value)}
              />
            </label>
          ))}

          <h3>
            🛠️ {appLanguage === "es" ? "Acción correctiva" : appLanguage === "en" ? "Corrective Action" : "処置内容"}
          </h3>
          <textarea value={newReport.action || ""} onChange={(e) => setReport("action", e.target.value)} />
        </Section>

        <Section openSections={openSections} toggleSection={toggleSection} sectionKey="prevention" title="🛠️ 再発防止・流出防止・変化点">
          <div className="reportGrid">
            <label>🛡️ 再発防止区分
              <select value={newReport.recurrenceCategory || "必要"} onChange={(e) => setReport("recurrenceCategory", e.target.value)}>
                <option value="必要">必要</option>
                <option value="不要">不要</option>
                <option value="必要 実施完了">必要 実施完了</option>
                <option value="必要 未実施">必要 未実施</option>
              </select>
            </label>
            <label>🔄 変化点ランク<input value={newReport.changeRank || ""} onChange={(e) => setReport("changeRank", e.target.value)} /></label>
            <label>🔍 FP点検<input value={newReport.fpInspection || ""} onChange={(e) => setReport("fpInspection", e.target.value)} /></label>
          </div>
          <h3>🛡️ 再発防止・残工事</h3>
          <textarea value={newReport.recurrencePrevention || ""} onChange={(e) => setReport("recurrencePrevention", e.target.value)} />
          <h3>🚧 流出防止</h3>
          <textarea value={newReport.outflowPrevention || ""} onChange={(e) => setReport("outflowPrevention", e.target.value)} />
        </Section>

        <Section openSections={openSections} toggleSection={toggleSection} sectionKey="cost" title="💰 参考費用（自動計算）">
          <div className="reportGrid">
            <label>👤 作業者数<input type="number" min="1" value={Math.max(1, toNumber(newReport.workerCount, 1))} onChange={(e) => setReport("workerCount", Math.max(1, toNumber(e.target.value, 1)))} /></label>
            <label>💴 時間単価<input type="number" value={newReport.laborRate || 3000} onChange={(e) => setReport("laborRate", e.target.value)} /></label>
            <label>⏳ 保全工数H<input readOnly value={calc.laborHours} /></label>
            <label>💰 労務費<input readOnly value={calc.laborCost.toLocaleString()} /></label>
          </div>

          <h3>💰 保全交換部品費・外注費</h3>
          {[1, 2, 3].map((num) => (
            <div className="reportGrid" key={num} style={{ marginBottom: "8px" }}>
              <label>🔩 部品名{num}<input value={newReport[`partName${num}`] || ""} onChange={(e) => setReport(`partName${num}`, e.target.value)} /></label>
              <label>🔢 a 個数<input type="number" value={newReport[`partQty${num}`] || ""} onChange={(e) => setReport(`partQty${num}`, e.target.value)} /></label>
              <label>💴 b 単価<input type="number" value={newReport[`partUnitPrice${num}`] || ""} onChange={(e) => setReport(`partUnitPrice${num}`, e.target.value)} /></label>
              <label>🧾 部品費(a×b)<input readOnly value={(calc[`partAmount${num}`] || 0).toLocaleString()} /></label>
            </div>
          ))}

          <div className="cards" style={{ marginTop: "12px" }}>
            <div className="card"><span>⑨部品費合計</span><strong>¥{calc.partsCost.toLocaleString()}</strong></div>
            <div className="card"><span>⑦労務費</span><strong>¥{calc.laborCost.toLocaleString()}</strong></div>
            <div className="card red"><span>⑩参考費用合計</span><strong>¥{calc.totalCost.toLocaleString()}</strong></div>
          </div>

          <h3>📦 在庫・備考</h3>
          <div className="reportGrid">
            <label>🔩 保全交換部品<input value={newReport.replacedPart || ""} onChange={(e) => setReport("replacedPart", e.target.value)} /></label>
            <label>📦 在庫数<input value={newReport.stockQty || ""} onChange={(e) => setReport("stockQty", e.target.value)} /></label>
          </div>
        </Section>

        <Section openSections={openSections} toggleSection={toggleSection} sectionKey="other" title="📷 写真・備考">
          <div className="reportGrid">
            <label>📷 工事前写真<input type="file" accept="image/*" onChange={(e) => handleReportDraftPhotoUpload(e, "beforeImage")} /></label>
            <label>📸 工事後写真<input type="file" accept="image/*" onChange={(e) => handleReportDraftPhotoUpload(e, "afterImage")} /></label>
          </div>
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            {newReport.beforeImage && <img src={newReport.beforeImage} alt="工事前" className="calendarPhoto" />}
            {newReport.afterImage && <img src={newReport.afterImage} alt="工事後" className="calendarPhoto" />}
          </div>
          <h3>📝 備考</h3>
          <textarea value={newReport.note || ""} onChange={(e) => setReport("note", e.target.value)} />
        </Section>

        <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
          <button className="primaryButton" onClick={saveNewReport}><Save size={16} /> 保存</button>
          <button className="deleteButton" onClick={cancelNewReport}><X size={16} /> キャンセル</button>
        </div>
      </div>
    );
  }


function renderHome() {
  const recentReports = [...reports]
    .sort((a, b) => String(b.createdAt || b.troubleDateTime || "").localeCompare(String(a.createdAt || a.troubleDateTime || "")))
    .slice(0, 3);

  const quickMenus = [
    { key: "report", icon: "📄", title: "修理報告", sub: "故障・修理の記録" },
    { key: "maintenance", icon: "🔧", title: "定期保全", sub: "保全計画・実績の管理" },
    { key: "work", icon: "🏗️", title: "工事管理", sub: "工事の計画・進捗管理" },
    { key: "spare", icon: "📦", title: "予備品管理", sub: "在庫・発注の管理" },
    { key: "analytics", icon: "📊", title: "保全分析", sub: "停止・故障データ分析" },
    { key: "dailyProduction", icon: "🗄️", title: "生産数DB", sub: "生産データの管理" },
  ];

  return (
    <>
      <section className="miyamaHomeHero">
        <div className="miyamaHomeHeroText">
          <h1>MIYAMA Maintenance</h1>
          <h2>One Team Maintenance Group</h2>
          <p>設備保全を、もっとスマートに。</p>
        </div>

        <div className="miyamaHomeHeroActions">
          <div className="miyamaHomeSearch">
            <Search size={22} />
            <input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="設備・部品・トラブル内容を検索してください"
            />
          </div>

          <div className="miyamaHomeButtons">
            <button
              type="button"
              onClick={() => {
                setMiyamaAiQuestion(globalSearch);
                setPage("miyamaAi");
              }}
            >
              🤖 MIYAMA AIへ
            </button>

            <button type="button" onClick={() => setPage("analytics")}>
              📊 ダッシュボードへ
            </button>
          </div>
        </div>
      </section>

      {globalSearch && renderGlobalSearchBox()}

      <section className="miyamaQuickGrid">
        {quickMenus.map((item) => (
          <button
            type="button"
            key={item.key}
            className="miyamaQuickCard"
            onClick={() => setPage(item.key)}
          >
            <span className="miyamaQuickIcon">{item.icon}</span>
            <strong>{item.title}</strong>
            <small>{item.sub}</small>
            <span className="miyamaQuickArrow">›</span>
          </button>
        ))}
      </section>

      <section className="miyamaHomeBottom">
        <div className="miyamaHomePanel">
          <div className="miyamaPanelTitle">
            <h3>📢 お知らせ</h3>
          </div>

          <div className="miyamaNoticeRow">
            <span>{todayText()}</span>
            <b className="miyamaBadge blue">システム</b>
            <p>MIYAMA Maintenance テスト運用中</p>
          </div>

          <div className="miyamaNoticeRow">
            <span>現在</span>
            <b className="miyamaBadge green">保全</b>
            <p>現場テストのフィードバックを反映しながら改善しています。</p>
          </div>
        </div>

        <div className="miyamaHomePanel">
          <div className="miyamaPanelTitle">
            <h3>📄 最近の修理報告</h3>
            <button type="button" onClick={() => setPage("report")}>すべて見る ›</button>
          </div>

          <div className="miyamaRecentHeader">
            <span>日付</span>
            <span>設備名</span>
            <span>内容</span>
            <span>状態</span>
          </div>

          {recentReports.length === 0 ? (
            <div className="miyamaEmpty">まだ修理報告がありません。</div>
          ) : recentReports.map((r) => (
            <button
              type="button"
              key={r.id || `${r.createdAt}-${r.equipment}-${r.phenomenon}`}
              className="miyamaRecentRow"
              onClick={() => setPage("report")}
            >
              <span>{normalizeDateOnly(r.createdAt || r.troubleDateTime) || "-"}</span>
              <span>{r.equipment || r.lineName || "設備未設定"}</span>
              <span>{r.phenomenon || r.troublePoint || "内容未入力"}</span>
              <span><b className="miyamaBadge green">{r.approvalStatus || "登録済み"}</b></span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

  function formatMaintenanceDate(value) {
    if (!value) return "";

    if (typeof value === "number") {
      const date = XLSX.SSF.parse_date_code(value);
      if (!date) return "";
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }

    if (value instanceof Date) {
      return toLocalDateText(value);
    }

    const text = String(value).trim();
    if (!text) return "";

    const parsed = new Date(text.replace(/\./g, "/").replace(/-/g, "/"));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return text.replace(/\//g, "-").slice(0, 10);
  }

  function guessMaintenanceTypeFromText(value) {
    const textValue = String(value || "");
    if (textValue.includes("給油") || textValue.includes("グリス")) return "給油";
    if (textValue.includes("交換")) return "交換";
    if (textValue.includes("清掃")) return "清掃";
    if (textValue.includes("調整")) return "調整";
    if (textValue.includes("校正")) return "校正";
    if (textValue.includes("修理")) return "修理";
    return "点検";
  }

  function getMaintenanceCycleDaysFromText(value) {
    if (value === undefined || value === null || value === "") return "";
    const textValue = String(value).trim();
    if (!textValue) return "";

    if (/^\d+$/.test(textValue)) {
      const num = Number(textValue);
      return num > 10000 ? "" : num;
    }

    const year = textValue.match(/(\d+)\s*年/);
    const month = textValue.match(/(\d+)\s*月/);
    const day = textValue.match(/(\d+)\s*日/);

    const total =
      (year ? Number(year[1]) * 365 : 0) +
      (month ? Number(month[1]) * 30 : 0) +
      (day ? Number(day[1]) : 0);

    return total || "";
  }

  function buildMaintenanceFromScheduleRow(row, sheetName, fileName) {
    const machineNo = row?.[1] || "";
    const equipment1 = row?.[2] || "";
    const equipment2 = row?.[3] || "";
    const partName = row?.[4] || "";
    const detail = row?.[5] || "";
    const year = Number(row?.[6] || 0);
    const month = Number(row?.[7] || 0);
    const day = Number(row?.[8] || 0);
    const prepDays = row?.[9] || "";
    const nextDate = formatMaintenanceDate(row?.[10]);
    const lastDate = formatMaintenanceDate(row?.[12] || row?.[13]);
    const result = formatMaintenanceDate(row?.[13]) || String(row?.[13] || "");

    if (!machineNo && !equipment1 && !equipment2 && !partName && !detail) return null;
    if (String(machineNo).includes("生産機番名")) return null;

    const cycle = year * 365 + month * 30 + day;
    const maintenanceType = guessMaintenanceTypeFromText(`${detail} ${partName} ${equipment1} ${equipment2}`);

    return {
      equipment: String(equipment1 || equipment2 || machineNo || "").trim(),
      lineName: String(machineNo || "").trim(),
      equipment2Name: String(equipment2 || "").trim(),
      sectionName: "",
      partName: String(partName || equipment1 || "").trim(),
      partNo: "",
      serialNo: "",
      maker: "",
      price: "",
      supplier: "",
      purchaseUrl: "",
      location: "",
      locationRack: "",
      lot: "",
      shelf: "",
      box: "",
      address: "",
      leadTime: "",
      reorderPoint: "",
      reorderQty: "",
      category: "定期保全",
      maintenanceType,
      maintenanceMode: "定期保全",
      maintenanceDetail: String(detail || `${equipment1 || ""} ${equipment2 || ""}`).trim(),
      method: "",
      standard: "",
      responseAction: "",
      result: String(result || "").trim(),
      prepDays: String(prepDays || "").trim(),
      sourceSheet: sheetName || "",
      sourceFile: fileName || "",
      isMaintenanceTarget: true,
      cycle: cycle || "",
      lastDate,
      nextDate,
      owner: "",
      note: `Excel取込：${fileName || ""} / ${sheetName || ""}`,
      stockQty: 0,
      minStock: 1,
      stockNote: "",
      image: "",
      imageUrl: "",
    };
  }

  function getSheetCellText(rows, rowIndex, colIndex) {
    return String(rows?.[rowIndex]?.[colIndex] || "").trim();
  }

  function buildMaintenanceFromInspectionRow(row, rows, sheetName, fileName) {
    const no = row?.[0];
    const sectionName = row?.[1] || "";
    const item = row?.[2] || "";
    const method = row?.[3] || "";
    const standard = row?.[4] || "";
    const minutes = row?.[5] || "";
    const responseAction = row?.[6] || "";
    const cycleCell = row?.[7] || "";
    const result = row?.[8] || "";

    if (!sectionName && !item && !method && !standard) return null;
    if (String(no).includes("№") || String(sectionName).includes("部位")) return null;

    const equipmentText = [getSheetCellText(rows, 2, 2), getSheetCellText(rows, 3, 0)].join(" ");
    const makerText = getSheetCellText(rows, 3, 2);
    const equipment = equipmentText.replace("設備名：", "").trim() || sheetName;
    const maker = makerText.replace("メーカ：", "").trim();
    const maintenanceType = guessMaintenanceTypeFromText(`${method} ${item} ${standard} ${responseAction}`);
    const cycle = getMaintenanceCycleDaysFromText(cycleCell);

    return {
      equipment,
      lineName: "",
      equipment2Name: sheetName,
      sectionName: String(sectionName || "").trim(),
      partName: String(sectionName || item || "").trim(),
      partNo: "",
      serialNo: "",
      maker,
      price: "",
      supplier: "",
      purchaseUrl: "",
      location: "",
      locationRack: "",
      lot: "",
      shelf: "",
      box: "",
      address: "",
      leadTime: "",
      reorderPoint: "",
      reorderQty: "",
      category: "定期点検",
      maintenanceType,
      maintenanceMode: "定期保全",
      maintenanceDetail: String(item || "").trim(),
      method: String(method || "").trim(),
      standard: String(standard || "").trim(),
      responseAction: String(responseAction || "").trim(),
      result: String(result || "").trim(),
      prepDays: "",
      requiredMinutes: String(minutes || "").trim(),
      cycleCount: String(cycleCell || "").trim(),
      sourceSheet: sheetName || "",
      sourceFile: fileName || "",
      isMaintenanceTarget: true,
      cycle: cycle || "",
      lastDate: "",
      nextDate: "",
      owner: "",
      note: `Excel取込：${fileName || ""} / ${sheetName || ""}`,
      stockQty: 0,
      minStock: 1,
      stockNote: "",
      image: "",
      imageUrl: "",
    };
  }

  const handleMaintenanceExcelUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let success = 0;
    let failed = 0;
    let duplicated = 0;
    const existingSnap = await getDocs(collection(db, "parts"));
    const existingPartKeys = new Set(existingSnap.docs.map((d) => makePartDuplicateKey(d.data())));

    for (const file of files) {
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { cellDates: true });

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
          const sheetText = rows.slice(0, 10).map((row) => (row || []).join(" ")).join(" ");

          if (sheetText.includes("定期保全リスト") || sheetText.includes("生産機番名")) {
            for (let r = 5; r < rows.length; r++) {
              const item = buildMaintenanceFromScheduleRow(rows[r], sheetName, file.name);
              if (!item) continue;
              const duplicateKey = makePartDuplicateKey(item);
              if (existingPartKeys.has(duplicateKey)) {
                duplicated += 1;
                continue;
              }
              await addDoc(collection(db, "parts"), { ...item, duplicateKey });
              existingPartKeys.add(duplicateKey);
              success += 1;
            }
            continue;
          }

          if (sheetText.includes("定期点検") || sheetText.includes("整備基準") || sheetText.includes("部位 項目 方法")) {
            for (let r = 6; r < rows.length; r++) {
              const item = buildMaintenanceFromInspectionRow(rows[r], rows, sheetName, file.name);
              if (!item) continue;
              const duplicateKey = makePartDuplicateKey(item);
              if (existingPartKeys.has(duplicateKey)) {
                duplicated += 1;
                continue;
              }
              await addDoc(collection(db, "parts"), { ...item, duplicateKey });
              existingPartKeys.add(duplicateKey);
              success += 1;
            }
          }
        }
      } catch (error) {
        console.error("Maintenance import error:", file.name, error);
        failed += 1;
      }
    }

    await loadParts();
    alert(`定期保全Excel取込完了\n成功：${success}件\n重複スキップ：${duplicated}件\n失敗：${failed}件`);
    e.target.value = "";
  };

  async function completeMaintenanceRow(row) {
    const todayValue = todayText();
    const mode = normalizeMaintenanceMode(row.maintenanceMode, row);
    let nextDate = "";

    if (mode === "定期保全") {
      nextDate = row.cycle ? addDays(todayValue, row.cycle) : "";
    } else {
      const average = toNumber(row.dailyAverageProduction, 0);
      const cycleCount = toNumber(row.cycleProductionCount, 0);
      nextDate = average > 0 && cycleCount > 0 ? addDays(todayValue, Math.ceil(cycleCount / average)) : "";
    }

    await updateDoc(doc(db, "parts", row.id), {
      maintenanceMode: mode,
      lastDate: todayValue,
      nextDate,
      result: "OK",
    });

    await loadParts();
    alert(mode === "定期保全" ? "実施完了にしました。前回実施日を今日に更新し、保全周期（日）で次回実施日を計算しました。" : "実施完了にしました。前回実施日を今日に更新し、生産数で次回実施日を計算しました。");
  }

  function renderMaintenance() {
    const typeOptions = ["全て", "交換", "点検", "給油", "清掃", "調整", "校正", "修理"];
    const over = maintenanceRows.filter((r) => r.status === "交換超過").length;
    const soon7 = maintenanceRows.filter((r) => r.daysLeft !== "" && r.daysLeft >= 0 && r.daysLeft <= 7).length;
    const soon30 = maintenanceRows.filter((r) => r.daysLeft !== "" && r.daysLeft > 7 && r.daysLeft <= 30).length;

    const typeColor = (type) => {
      if (type === "交換") return "#fee2e2";
      if (type === "点検") return "#dbeafe";
      if (type === "給油") return "#fef3c7";
      if (type === "清掃") return "#dcfce7";
      if (type === "調整") return "#e0e7ff";
      if (type === "校正") return "#f3e8ff";
      if (type === "修理") return "#ffe4e6";
      return "#f1f5f9";
    };

    const typeIcon = (type) => {
      if (type === "交換") return "🔴";
      if (type === "点検") return "🔵";
      if (type === "給油") return "🛢️";
      if (type === "清掃") return "🟢";
      if (type === "調整") return "🛠️";
      if (type === "校正") return "🟣";
      if (type === "修理") return "🔧";
      return "⚙️";
    };

    const urgencyLabel = (row) => {
      if (row.daysLeft === "") return "未入力";
      if (row.daysLeft < 0) return `期限超過 ${Math.abs(row.daysLeft)}日`;
      if (row.daysLeft === 0) return "本日実施";
      return `残り ${row.daysLeft}日`;
    };

    const urgencyStyle = (row) => {
      if (row.daysLeft === "") return { background: "#e5e7eb", color: "#334155" };
      if (row.daysLeft < 0) return { background: "#fee2e2", color: "#b91c1c" };
      if (row.daysLeft <= 7) return { background: "#ffedd5", color: "#c2410c" };
      if (row.daysLeft <= 30) return { background: "#fef3c7", color: "#a16207" };
      return { background: "#dcfce7", color: "#166534" };
    };

    return (
      <>
        <div className="header">
          <div>
            <h2>🔧 定期保全</h2>
            <p>保全方式を選んで管理します。定期保全は日数、定量保全は生産数で次回実施日を自動計算します。</p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <label className="primaryButton" style={{ cursor: "pointer" }}>
              📥 定期保全Excel取込
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm"
                multiple
                onChange={handleMaintenanceExcelUpload}
                style={{ display: "none" }}
              />
            </label>
            <button className="primaryButton" onClick={addMaintenancePart}><Plus size={16} /> 新規追加</button>
            <button className="primaryButton" onClick={() => setPage("spare")}>📦 予備品から追加</button>
            <button
              className="deleteButton"
              onClick={async () => {
                if (!confirm("定期保全リストを空にしますか？予備品データは消えません。")) return;

                for (const row of parts) {
                  if (row.isMaintenanceTarget === true) {
                    await updateField("parts", row.id, "isMaintenanceTarget", false);
                  }
                }

                await loadParts();
                alert("定期保全リストを空にしました。予備品データは残っています。");
              }}
            >
              🧹 定期保全を空にする
            </button>
          </div>
        </div>

        <div className="tableWrap" style={{ marginBottom: "18px" }}>
          <h3>🔧 表示メニュー</h3>
          <SubTabBar items={[{ key: "cards", label: "カード表示", icon: "🧾" }, { key: "urgent", label: "緊急確認", icon: "🚨" }, { key: "stock", label: "部品連携", icon: "🔩" }]} value={maintenanceViewMode} onChange={setMaintenanceViewMode} />
        </div>

        <div className="cards" style={{ marginBottom: "18px" }}>
          <div className="card red"><span>🚨 期限超過</span><strong>{over}</strong></div>
          <div className="card yellow"><span>⚠️ 7日以内</span><strong>{soon7}</strong></div>
          <div className="card yellow"><span>📅 30日以内</span><strong>{soon30}</strong></div>
          <div className="card"><span>📅 定期保全（日数）</span><strong>{maintenanceRows.filter((r) => normalizeMaintenanceMode(r.maintenanceMode, r) === "定期保全").length}</strong></div>
          <div className="card"><span>🏭 定量保全（生産数）</span><strong>{maintenanceRows.filter((r) => normalizeMaintenanceMode(r.maintenanceMode, r) === "定量保全").length}</strong></div>
          <div className="card"><span>🔢 表示件数</span><strong>{filteredMaintenanceRows.length}</strong></div>
        </div>

        <div className="tableWrap" style={{ marginBottom: "18px" }}>
          <h3>🔍 定期保全検索・並び替え</h3>
          <p>設備名・部位・内容・品番・担当者・保全種類で検索できます。</p>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 240px 180px 190px", gap: "10px", alignItems: "center" }}>
            <ImeSafeInput
              value={maintenanceSearch}
              onCommit={setMaintenanceSearch}
              placeholder="例：76-060 給油 ボウルフィーダ 羽根田 SC-N4"
              style={{ fontSize: "18px", minHeight: "52px" }}
            />
            <select
              value={maintenanceEquipmentFilter}
              onChange={(e) => setMaintenanceEquipmentFilter(e.target.value)}
              style={{ minHeight: "52px", fontSize: "16px" }}
              aria-label="設備を選択"
            >
              {maintenanceEquipmentOptions.map((name) => <option key={name} value={name}>{name === "全て" ? "🏭 すべての設備" : name}</option>)}
            </select>
            <select
              value={maintenanceTypeFilter}
              onChange={(e) => setMaintenanceTypeFilter(e.target.value)}
              style={{ minHeight: "52px", fontSize: "16px" }}
            >
              {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select
              value={maintenanceSort}
              onChange={(e) => setMaintenanceSort(e.target.value)}
              style={{ minHeight: "52px", fontSize: "16px" }}
            >
              <option value="urgent">緊急順</option>
              <option value="az">ABC / あいうえお順</option>
              <option value="equipment">設備名順</option>
              <option value="type">保全種類順</option>
              <option value="owner">担当者順</option>
            </select>
          </div>
        </div>

        <div className="tableWrap" style={{ marginBottom: "18px", background: "linear-gradient(135deg,#eff6ff,#ffffff)" }}>
          <h3>🏭 生産数連動の考え方</h3>
          <p>
            保全方式で計算ルールを切り替えます。定期保全は日数、定量保全は生産数で次回実施日を自動計算します。
            <br />
            定期保全：前回実施日 + 保全周期（日） ／ 定量保全：前回実施日 + 保全サイクル ÷ 1日平均生産数
          </p>
        </div>

        {maintenanceRows.length === 0 && (
          <div className="tableWrap">
            <div className="calendarEditCard">
              <h3>定期保全リストは空です。</h3>
              <p>Excel取込、手入力、または予備品管理の「🔧 定期保全へ追加」から登録できます。</p>
            </div>
          </div>
        )}

        <datalist id="maintenance-equipment-list">
          {maintenanceEquipmentOptions.filter((name) => name !== "全て").map((name) => <option key={name} value={name} />)}
        </datalist>

        <div style={{ display: "grid", gap: "18px" }}>
          {filteredMaintenanceRows.map((row) => (
            <div
              key={row.id}
              className="tableWrap"
              style={{
                borderLeft: row.daysLeft !== "" && row.daysLeft < 0 ? "8px solid #ef4444" : row.daysLeft !== "" && row.daysLeft <= 7 ? "8px solid #f97316" : "8px solid #2563eb",
                padding: "22px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 520px" }}>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ padding: "8px 14px", borderRadius: "999px", fontWeight: "900", background: typeColor(row.maintenanceType || "交換") }}>
                      {typeIcon(row.maintenanceType || "交換")} {translateMiyamaText(row.maintenanceType || "交換", appLanguage)}
                    </span>
                    <span style={{ padding: "8px 14px", borderRadius: "999px", fontWeight: "900", ...urgencyStyle(row) }}>
                      {translateMiyamaText(urgencyLabel(row), appLanguage)}
                    </span>
                  </div>

                  <AsyncTranslatedText
                    as="h2"
                    language={appLanguage}
                    text={row.equipment || row.lineName || (appLanguage === "en" ? "Equipment not entered" : "設備名なし")}
                    style={{ fontSize: "30px", margin: "0 0 8px", color: "#0f172a" }}
                  />
                  <AsyncTranslatedText
                    as="p"
                    language={appLanguage}
                    text={row.sectionName || row.equipment2Name || row.partName || (appLanguage === "en" ? "Part not entered" : "部位未入力")}
                    style={{ fontSize: "20px", margin: "0 0 6px", color: "#2563eb", fontWeight: "800" }}
                  />
                  <AsyncTranslatedText
                    as="p"
                    language={appLanguage}
                    text={row.maintenanceDetail || (appLanguage === "en" ? "Details not entered" : "内容未入力")}
                    style={{ fontSize: "18px", margin: 0, color: "#475569", whiteSpace: "pre-wrap" }}
                  />
                </div>

                <div style={{ minWidth: "220px", textAlign: "right" }}>
                  <div style={{ fontSize: "14px", color: "#64748b" }}>{appLanguage === "en" ? "Next Due Date" : "次回実施日"}</div>
                  <div style={{ fontSize: "24px", fontWeight: "900" }}>{row.nextDate || (appLanguage === "en" ? "Not entered" : "未入力")}</div>
                  <div style={{ fontSize: "14px", color: "#64748b", marginTop: "8px" }}>{appLanguage === "en" ? "Last Done Date" : "前回実施日"}</div>
                  <div style={{ fontSize: "18px", fontWeight: "700" }}>{normalizeMaintenanceDateInput(row.lastDate) || (appLanguage === "en" ? "Not entered" : "未入力")}</div>
                </div>
              </div>

              <div className="reportSummaryGrid" style={{ marginTop: "14px" }}>
                <div className="reportSummaryItem"><span>🧭 {appLanguage === "en" ? "Maintenance Mode" : "保全方式"}</span><strong>{normalizeMaintenanceMode(row.maintenanceMode, row) === "定量保全" ? (appLanguage === "en" ? "Production-Based Maintenance" : "定量保全（生産数）") : (appLanguage === "en" ? "Time-Based Maintenance (Days)" : "定期保全（日数）")}</strong></div>
                {normalizeMaintenanceMode(row.maintenanceMode, row) === "定量保全" ? (
                  <>
                    <div className="reportSummaryItem"><span>📦 {appLanguage === "en" ? "Maintenance Cycle" : "保全サイクル"}</span><strong>{row.cycleProductionCount ? `${Number(row.cycleProductionCount || 0).toLocaleString()}${appLanguage === "en" ? " cycles" : "回"}` : (appLanguage === "en" ? "Not entered" : "未入力")}</strong></div>
                    <div className="reportSummaryItem"><span>📊 {appLanguage === "en" ? "Daily Average Production" : "1日平均生産数"}</span><strong>{row.dailyAverageProduction ? `${Number(row.dailyAverageProduction || 0).toLocaleString()} ${appLanguage === "en" ? "pcs/day" : "個/日"}` : (appLanguage === "en" ? "Production DB not registered" : "生産数DB未登録")}</strong></div>
                    <div className="reportSummaryItem"><span>⏳ 残り回数</span><strong>{row.productionRemain === "" ? "未入力" : `${Number(row.productionRemain || 0).toLocaleString()}回`}</strong></div>
                  </>
                ) : (
                  <div className="reportSummaryItem"><span>📅 {appLanguage === "en" ? "Maintenance Interval (Days)" : "保全周期（日）"}</span><strong>{row.cycle ? `${Number(row.cycle || 0).toLocaleString()}${appLanguage === "en" ? " days" : "日"}` : (appLanguage === "en" ? "Not entered" : "未入力")}</strong></div>
                )}
              </div>

              <div className="reportGrid" style={{ marginTop: "18px" }}>
                <label>🧭 {appLanguage === "en" ? "Maintenance Mode" : "保全方式"}
                  <select value={normalizeMaintenanceMode(row.maintenanceMode, row)} onChange={(e) => updateMaintenanceSchedule(row, { maintenanceMode: e.target.value })}>
                    <option value="定期保全">{appLanguage === "en" ? "Time-Based Maintenance (Days)" : "定期保全（日数）"}</option>
                    <option value="定量保全">{appLanguage === "en" ? "Production-Based Maintenance" : "定量保全（生産数）"}</option>
                  </select>
                </label>
                <label>🔧 {appLanguage === "en" ? "Maintenance Type" : "保全種類"}
                  <select value={row.maintenanceType || "交換"} onChange={(e) => updateField("parts", row.id, "maintenanceType", e.target.value)}>
                    {typeOptions.filter((type) => type !== "全て").map((type) => <option key={type} value={type}>{translateMiyamaText(type, appLanguage)}</option>)}
                  </select>
                </label>
                <label>🏭 {appLanguage === "en" ? "Equipment" : "設備名"}
                  {appLanguage === "en" ? (
                    <TranslatedReadOnlyInput
                      language={appLanguage}
                      value={row.equipment || ""}
                      placeholder="Equipment not entered"
                    />
                  ) : (
                    <ImeSafeInput
                      list="maintenance-equipment-list"
                      value={row.equipment || ""}
                      onCommit={(value) => updateField("parts", row.id, "equipment", value)}
                      placeholder="一覧から選択、または日本語で手入力"
                    />
                  )}
                </label>
                <label>📦 {appLanguage === "en" ? "Part Name" : "部品名"}
                  {appLanguage === "en" ? (
                    <TranslatedReadOnlyInput
                      language={appLanguage}
                      value={row.sectionName || row.equipment2Name || row.partName || ""}
                      placeholder="Part not entered"
                    />
                  ) : (
                    <ImeSafeInput
                      value={row.sectionName || row.equipment2Name || row.partName || ""}
                      onCommit={(value) => updateField("parts", row.id, "sectionName", value)}
                      placeholder="例：リベット切出し吸着②"
                    />
                  )}
                </label>

                {normalizeMaintenanceMode(row.maintenanceMode, row) === "定量保全" ? (
                  <>
                    <label>📦 {appLanguage === "en" ? "Maintenance Cycle" : "保全サイクル"}<input type="number" min="1" value={row.cycleProductionCount || ""} onChange={(e) => updateMaintenanceSchedule(row, { cycleProductionCount: e.target.value ? Number(e.target.value) : "" })} placeholder={appLanguage === "en" ? "Example: 100000" : "例：100000"} /><small style={{color:"#64748b",fontWeight:700}}>{appLanguage === "en" ? "How many cycles can this part be used?" : "この部品は何回使用できますか？"}</small></label>
                    <label>📊 {appLanguage === "en" ? "Daily Average Production" : "1日平均生産数"}<input className="readOnlyCalc" value={row.dailyAverageProduction ? `${Number(row.dailyAverageProduction || 0).toLocaleString()} ${appLanguage === "en" ? "pcs/day" : "個/日"}` : (appLanguage === "en" ? "Production DB not registered" : "生産数DB未登録")} readOnly /><small style={{color:"#64748b",fontWeight:700}}>{appLanguage === "en" ? "Automatically calculated from the Production DB" : "生産数DBから自動計算"}</small></label>
                  </>
                ) : (
                  <label>📅 {appLanguage === "en" ? "Maintenance Interval (Days)" : "保全周期（日）"}<input type="number" min="1" value={row.cycle || ""} onChange={(e) => updateMaintenanceSchedule(row, { cycle: e.target.value ? Number(e.target.value) : "" })} placeholder={appLanguage === "en" ? "Example: 30" : "例：30"} /><small style={{color:"#64748b",fontWeight:700}}>{appLanguage === "en" ? "How often should this maintenance be performed?" : "何日ごとに実施しますか？"}</small></label>
                )}

                <label>📆 {appLanguage === "en" ? "Last Done Date" : "前回実施日"}<input type="date" min="2000-01-01" max="2099-12-31" value={normalizeMaintenanceDateInput(row.lastDate)} onChange={(e) => updateMaintenanceSchedule(row, { lastDate: e.target.value })} /></label>
                <label>👤 {appLanguage === "en" ? "Owner" : "担当者"}<ImeSafeInput value={row.owner || ""} onCommit={(value) => updateField("parts", row.id, "owner", value)} placeholder={appLanguage === "en" ? "Enter owner name" : "担当者名を入力"} /></label>
                <label>🧮 {appLanguage === "en" ? "Next Due Date" : "次回実施日"}<input className="readOnlyCalc" value={row.nextDate || ""} readOnly /></label>
                <label>⏳ {appLanguage === "en" ? "Days Left" : "残り日数"}<input className="readOnlyCalc" value={row.daysLeft === "" ? (appLanguage === "en" ? "Not entered" : "未入力") : `${row.daysLeft}${appLanguage === "en" ? " days" : "日"}`} readOnly /></label>
                {normalizeMaintenanceMode(row.maintenanceMode, row) === "定量保全" && <label>📦 残り回数<input className="readOnlyCalc" value={row.productionRemain === "" ? "未入力" : `${Number(row.productionRemain || 0).toLocaleString()}回`} readOnly /></label>}
              </div>

              <div style={{ marginTop: "12px" }}>
                <label style={{ fontWeight: "700" }}>📝 {appLanguage === "en" ? "Memo" : "メモ"}
                  {appLanguage === "en" ? (
                    <TranslatedReadOnlyTextarea
                      language={appLanguage}
                      style={{ minHeight: "90px", fontSize: "16px" }}
                      value={row.note || row.maintenanceDetail || ""}
                      placeholder="Replacement reason, cautions, or shop-floor notes"
                    />
                  ) : (
                    <ImeSafeTextarea
                      style={{ minHeight: "90px", fontSize: "16px" }}
                      value={row.note || row.maintenanceDetail || ""}
                      onCommit={async (value) => {
                        await updateField("parts", row.id, "note", value);
                        await updateField("parts", row.id, "maintenanceDetail", value);
                      }}
                      placeholder="交換理由・注意点・現場メモなど（日本語入力対応）"
                    />
                  )}
                </label>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "16px" }}>
                <button className="primaryButton" onClick={() => completeMaintenanceRow(row)}>✅ {appLanguage === "en" ? "Completed" : "交換完了"}</button>
                <button className="primaryButton" onClick={() => saveMaintenanceSchedule(row)}>💾 {appLanguage === "en" ? "Save / Confirm" : "保存確認"}</button>
                <button className="deleteButton" onClick={() => updateField("parts", row.id, "isMaintenanceTarget", false)}>🗑 {appLanguage === "en" ? "Remove from Maintenance" : "定期保全から外す"}</button>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }


  function cleanPrice(value) {
    if (value === undefined || value === null) return "";
    return String(value)
      .replace(/[￥¥円]/g, "")
      .replace(/\s/g, "")
      .trim();
  }

  function normalizeNumberText(value) {
    if (value === undefined || value === null || value === "") return "";
    let text = String(value)
      .replace(/[￥¥円個]/g, "")
      .replace(/pcs/gi, "")
      .replace(/[^\d.,-]/g, "")
      .trim();

    if (!text) return "";

    // 200.000 / 1.190.801 / 1,190,801 を日本円の桁区切りとして正しく読む
    if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, "");

    // カンマ小数の書き方にも最低限対応
    if (/^-?\d+,\d+$/.test(text) && !text.includes(".")) text = text.replace(",", ".");

    return text;
  }

  function parseYen(value) {
    const text = normalizeNumberText(value);
    const num = Number(text);
    return Number.isFinite(num) ? num : 0;
  }

  function parseQty(value) {
    const text = normalizeNumberText(value);
    const num = Number(text);
    return Number.isFinite(num) ? num : 0;
  }

  function formatYen(value) {
    return `¥${Math.round(Number(value || 0)).toLocaleString()}`;
  }

  function makeSpareQuery(row) {
    return [row.partName, row.partNo || row.serialNo, row.maker, row.supplier]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  function makeSearchUrl(row, type = "image") {
    const query = makeSpareQuery(row) || row.partName || row.partNo || "";
    const encoded = encodeURIComponent(query);

    if (type === "image") return `https://www.google.com/search?tbm=isch&q=${encoded}`;
    if (type === "google") return `https://www.google.com/search?q=${encoded}`;
    if (type === "misumi") return `https://www.google.com/search?q=${encoded}%20site%3Ajp.misumi-ec.com`;
    if (type === "monotaro") return `https://www.monotaro.com/s/?c=&q=${encoded}`;
    if (type === "amazon") return `https://www.amazon.co.jp/s?k=${encoded}`;
    if (type === "yahoo") return `https://shopping.yahoo.co.jp/search?p=${encoded}`;
    if (type === "rakuten") return `https://search.rakuten.co.jp/search/mall/${encoded}/`;
    if (type === "askul") return `https://www.askul.co.jp/ksearch/?searchWord=${encoded}`;
    if (type === "nakanet") return `https://www.google.com/search?q=${encoded}%20site%3Ane-nakanet.co.jp`;
    if (type === "nakanetLogin") return `https://www.ne-nakanet.co.jp/nakanet/login`;

    if (type === "omron") return `https://www.google.com/search?q=${encoded}%20site%3Aomron.com%20OR%20site%3Aia.omron.com`;
    if (type === "smc") return `https://www.google.com/search?q=${encoded}%20site%3Asmcworld.com`;
    if (type === "keyence") return `https://www.google.com/search?q=${encoded}%20site%3Akeyence.co.jp`;
    if (type === "thk") return `https://www.google.com/search?q=${encoded}%20site%3Athk.com`;
    if (type === "ckd") return `https://www.google.com/search?q=${encoded}%20site%3Ackd.co.jp`;
    if (type === "iai") return `https://www.google.com/search?q=${encoded}%20site%3Aiai-robot.co.jp`;
    if (type === "panasonic") return `https://www.google.com/search?q=${encoded}%20site%3Aindustrial.panasonic.com`;

    return `https://www.google.com/search?q=${encoded}`;
  }

  function guessSupplier(row) {
    const maker = String(row.maker || "").toUpperCase();
    if (maker.includes("OMRON") || maker.includes("オムロン")) return "OMRON / MISUMI / MonotaRO";
    if (maker.includes("SMC")) return "SMC / MISUMI / MonotaRO";
    if (maker.includes("KEYENCE") || maker.includes("キーエンス")) return "KEYENCE";
    if (maker.includes("CKD")) return "CKD / MISUMI / MonotaRO";
    if (maker.includes("THK")) return "THK / MISUMI / MonotaRO";
    if (maker.includes("IAI")) return "IAI / MISUMI";
    if (maker.includes("PANASONIC") || maker.includes("パナソニック")) return "Panasonic / MISUMI / MonotaRO";
    if (maker.includes("FUJI") || maker.includes("富士")) return "Fuji Electric / MISUMI / MonotaRO";
    return "MISUMI / MonotaRO / Amazon / Yahoo / NAKANET";
  }

  async function smartFillSpare(row) {
    const query = makeSpareQuery(row);

    if (!query) {
      alert("部品名または型式を入力してください。");
      return;
    }

    const updates = {};

    if (!row.purchaseUrl) {
      updates.purchaseUrl = makeSearchUrl(row, "misumi");
    }

    if (!row.supplier) {
      updates.supplier = guessSupplier(row);
    }

    if (!row.stockNote) {
      updates.stockNote = [
        `AI補完候補：${query}`,
        "",
        "確認リンク候補：",
        `画像検索: ${makeSearchUrl(row, "image")}`,
        `MISUMI: ${makeSearchUrl(row, "misumi")}`,
        `MonotaRO: ${makeSearchUrl(row, "monotaro")}`,
        `Amazon: ${makeSearchUrl(row, "amazon")}`,
        `Yahoo: ${makeSearchUrl(row, "yahoo")}`,
        `楽天: ${makeSearchUrl(row, "rakuten")}`,
        `NAKANET: ${makeSearchUrl(row, "nakanet")}`,
        "",
        "写真は画像検索から画像URLをコピーして貼り付け、または写真ファイルをアップロードしてください。",
      ].join("\n");
    }

    for (const [field, value] of Object.entries(updates)) {
      await updateField("parts", row.id, field, value);
    }

    window.open(makeSearchUrl(row, "image"), "_blank");
    setTimeout(() => window.open(makeSearchUrl(row, "misumi"), "_blank"), 250);
    setTimeout(() => window.open(makeSearchUrl(row, "monotaro"), "_blank"), 500);

    alert("AI補完しました。画像検索・MISUMI・MonotaROを開きました。必要な写真URLや購入URLを確認して貼り付けてください。");
  }

  function findHeaderIndex(rows, names) {
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      const rowText = (rows[r] || []).map((v) => String(v || "")).join(" ");
      if (names.every((name) => rowText.includes(name))) return r;
    }
    return -1;
  }

  function findColumn(rows, headerRowIndex, candidates) {
    const start = Math.max(0, headerRowIndex - 1);
    const end = Math.min(rows.length - 1, headerRowIndex + 1);

    for (let r = start; r <= end; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || "").replace(/\s/g, "");
        if (candidates.some((candidate) => cell.includes(candidate.replace(/\s/g, "")))) {
          return c;
        }
      }
    }
    return -1;
  }

  function getCell(row, index) {
    if (index < 0) return "";
    return row?.[index] ?? "";
  }

  function buildSparePartFromRow(row, col, sheetName) {
    const partName = getCell(row, col.partName);
    const partNo = getCell(row, col.partNo);

    if (!partName || String(partName).includes("品名")) return null;
    if (!partNo && !getCell(row, col.maker)) return null;

    const locationParts = [
      getCell(row, col.location),
      getCell(row, col.locationRack),
      getCell(row, col.lot),
      getCell(row, col.shelf),
      getCell(row, col.box),
      getCell(row, col.address),
    ].filter(Boolean);

    return {
      equipment: "",
      lineName: "",
      partName: String(partName || "").trim(),
      partNo: String(partNo || "").trim(),
      serialNo: String(partNo || "").trim(),
      maker: String(getCell(row, col.maker) || "").trim(),
      price: cleanPrice(getCell(row, col.price)),
      supplier: String(getCell(row, col.supplier) || "").trim(),
      purchaseUrl: "",
      imageUrl: "",
      location: locationParts.join(" / "),
      locationRack: String(getCell(row, col.locationRack) || getCell(row, col.location) || "").trim(),
      lot: String(getCell(row, col.lot) || "").trim(),
      shelf: String(getCell(row, col.shelf) || "").trim(),
      box: String(getCell(row, col.box) || "").trim(),
      address: String(getCell(row, col.address) || "").trim(),
      leadTime: String(getCell(row, col.leadTime) || "").trim(),
      reorderPoint: String(getCell(row, col.reorderPoint) || "").trim(),
      reorderQty: String(getCell(row, col.reorderQty) || "").trim(),
      stockQty: Number(getCell(row, col.stockQty) || 0),
      minStock: Number(getCell(row, col.reorderPoint) || 1),
      cycle: 90,
      lastDate: "",
      owner: "",
      category: sheetName || "予備品",
      isMaintenanceTarget: false,
      note: String(getCell(row, col.note) || "").trim(),
      stockNote: String(getCell(row, col.note) || "").trim(),
      image: "",
    };
  }

  const handleSpareExcelUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let success = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
          const headerRowIndex = findHeaderIndex(rows, ["品名", "型式"]);
          if (headerRowIndex < 0) continue;

          const col = {
            partName: findColumn(rows, headerRowIndex, ["品名"]),
            partNo: findColumn(rows, headerRowIndex, ["型式", "図番", "型式・図番"]),
            maker: findColumn(rows, headerRowIndex, ["メーカ", "メーカー"]),
            leadTime: findColumn(rows, headerRowIndex, ["購入L/T", "購入LT", "LT", "納期"]),
            price: findColumn(rows, headerRowIndex, ["単価", "価格"]),
            reorderPoint: findColumn(rows, headerRowIndex, ["発注点", "最低在庫"]),
            reorderQty: findColumn(rows, headerRowIndex, ["発注数", "発注量"]),
            supplier: findColumn(rows, headerRowIndex, ["発注先", "購入先"]),
            location: findColumn(rows, headerRowIndex, ["所番地", "ロケ"]),
            locationRack: findColumn(rows, headerRowIndex, ["ロケ"]),
            lot: findColumn(rows, headerRowIndex, ["ロット"]),
            shelf: findColumn(rows, headerRowIndex, ["棚段", "棚"]),
            box: findColumn(rows, headerRowIndex, ["箱"]),
            address: findColumn(rows, headerRowIndex, ["番地"]),
            note: findColumn(rows, headerRowIndex, ["備考", "メモ"]),
            stockQty: findColumn(rows, headerRowIndex, ["在庫", "現在在庫"]),
          };

          for (let r = headerRowIndex + 1; r < rows.length; r++) {
            const part = buildSparePartFromRow(rows[r], col, sheetName);
            if (!part) continue;
            await addDoc(collection(db, "parts"), part);
            success += 1;
          }
        }
      } catch (error) {
        console.error("Spare import error:", file.name, error);
        failed += 1;
      }
    }

    await loadParts();
    alert(`予備品Excel取込完了\n成功：${success}件\n失敗：${failed}件`);
  };


  function guessMakerFromText(value) {
    const text = String(value || "").toUpperCase();

    if (text.includes("OMRON") || text.includes("オムロン") || text.includes("E2")) return "OMRON";
    if (text.includes("SMC") || text.includes("CDQ") || text.includes("CDJ") || text.includes("CQ2")) return "SMC";
    if (text.includes("KEYENCE") || text.includes("キーエンス") || text.includes("FU-") || text.includes("PZ-") || text.includes("LV-")) return "KEYENCE";
    if (text.includes("CKD")) return "CKD";
    if (text.includes("IAI") || text.includes("RCP") || text.includes("PCON")) return "IAI";
    if (text.includes("PANASONIC") || text.includes("パナソニック")) return "Panasonic";
    if (text.includes("THK")) return "THK";
    if (text.includes("FUJI") || text.includes("富士") || text.includes("SC-N") || text.includes("SC80")) return "Fuji Electric";

    return "";
  }

  function buildSpareAiPreview(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const tokens = raw.split(/\s+/).filter(Boolean);
    const maker = guessMakerFromText(raw);
    const partNoCandidate = tokens.find((token) => /[A-Za-z0-9]/.test(token) && /[-0-9]/.test(token)) || "";
    const partNameCandidate = tokens.filter((token) => token !== maker && token !== partNoCandidate).join(" ") || raw;

    const previewRow = {
      partName: partNameCandidate,
      partNo: partNoCandidate,
      serialNo: partNoCandidate,
      maker,
      supplier: maker ? guessSupplier({ maker }) : "MISUMI / MonotaRO / Amazon / Yahoo / NAKANET",
    };

    const stockAdvice = "最低在庫はまず1〜2個で開始し、使用頻度が高い部品は3個以上に調整してください。";

    return {
      ...previewRow,
      stockAdvice,
      imageUrl: makeSearchUrl(previewRow, "image"),
      googleUrl: makeSearchUrl(previewRow, "google"),
      misumiUrl: makeSearchUrl(previewRow, "misumi"),
      monotaroUrl: makeSearchUrl(previewRow, "monotaro"),
      amazonUrl: makeSearchUrl(previewRow, "amazon"),
      yahooUrl: makeSearchUrl(previewRow, "yahoo"),
      rakutenUrl: makeSearchUrl(previewRow, "rakuten"),
      nakanetUrl: makeSearchUrl(previewRow, "nakanet"),
      omronUrl: makeSearchUrl(previewRow, "omron"),
      smcUrl: makeSearchUrl(previewRow, "smc"),
      keyenceUrl: makeSearchUrl(previewRow, "keyence"),
    };
  }

  async function createSpareFromAiPreview() {
    const preview = spareAiPreview || buildSpareAiPreview(spareAiInput);

    if (!preview) {
      alert("部品名または型式を入力してください。例：OMRON E2NC-EA21");
      return;
    }

    await addDoc(collection(db, "parts"), {
      equipment: "",
      lineName: "",
      partName: preview.partName || "",
      partNo: preview.partNo || "",
      serialNo: preview.serialNo || preview.partNo || "",
      maker: preview.maker || "",
      price: "",
      supplier: preview.supplier || "",
      purchaseUrl: preview.misumiUrl || preview.googleUrl || "",
      imageUrl: "",
      location: "",
      locationRack: "",
      lot: "",
      shelf: "",
      box: "",
      address: "",
      leadTime: "",
      reorderPoint: "1",
      reorderQty: "1",
      category: "AI補完",
      isMaintenanceTarget: false,
      cycle: 90,
      lastDate: "",
      owner: "",
      note: "",
      stockQty: 0,
      minStock: 1,
      stockNote: [
        "AI部品アシスタントで作成。内容確認後、必要に応じて編集してください。",
        `画像検索: ${preview.imageUrl}`,
        `MISUMI: ${preview.misumiUrl}`,
        `MonotaRO: ${preview.monotaroUrl}`,
        `Amazon: ${preview.amazonUrl}`,
        `Yahoo: ${preview.yahooUrl}`,
        `楽天: ${preview.rakutenUrl}`,
        `NAKANET: ${preview.nakanetUrl}`,
      ].join("\n"),
      image: sparePhotoImage || "",
    });

    setSpareSearch(preview.partNo || preview.partName || spareAiInput);
    setSpareAiInput("");
    setSpareAiPreview(null);
    setSparePhotoImage("");
    setSparePhotoOcrText("");
    setOcrCandidates([]);
    await loadParts();
    alert("AI候補から予備品を追加しました。写真URL・価格・保管場所・使用設備を確認して編集してください。");
  }


  function extractPartCandidates(text) {
    const cleaned = String(text || "")
      .replace(/[｜|]/g, " ")
      .replace(/[‐‑–—]/g, "-")
      .replace(/\s+/g, " ")
      .toUpperCase();

    const patterns = [
      /[A-Z]{1,5}-[A-Z0-9]{1,8}(?:\/[A-Z0-9]{1,8})?(?:\s?\[[0-9A-Z]+\])?/g,
      /[A-Z]{2,}[0-9]{1,}[A-Z0-9-]{1,}/g,
      /[0-9][A-Z]{2}[0-9][A-Z0-9]{2,}/g,
      /[A-Z0-9]{2,}(?:[-\/][A-Z0-9\[\]]+)+/g,
    ];

    const candidates = [];

    patterns.forEach((pattern) => {
      const found = cleaned.match(pattern) || [];
      found.forEach((item) => {
        const value = item
          .replace(/\s+/g, " ")
          .replace(/[^A-Z0-9\-\/\[\] ]/g, "")
          .trim();

        if (value.length >= 4 && value.length <= 30 && /[0-9]/.test(value)) {
          candidates.push(value);
        }
      });
    });

    if (cleaned.includes("FUJI") || cleaned.includes("FUJI ELECTRIC")) candidates.unshift("Fuji Electric");
    if (cleaned.includes("OMRON") || cleaned.includes("オムロン")) candidates.unshift("OMRON");
    if (cleaned.includes("SMC")) candidates.unshift("SMC");
    if (cleaned.includes("KEYENCE") || cleaned.includes("キーエンス")) candidates.unshift("KEYENCE");

    return [...new Set(candidates)].slice(0, 12);
  }

  function applyOcrCandidate(candidate) {
    const candidateText = String(candidate || "").trim();
    if (!candidateText) return;

    const baseText = `${sparePhotoOcrText || ""} ${candidateText}`;
    const maker = guessMakerFromText(baseText) || guessMakerFromText(candidateText);
    const isMakerOnly = !/[0-9]/.test(candidateText);
    const partNo = isMakerOnly ? "" : candidateText;
    const partName = maker
      ? maker.includes("Fuji")
        ? "電磁接触器"
        : `${maker} 部品`
      : "写真AI読取部品";

    const previewRow = {
      partName,
      partNo,
      serialNo: partNo,
      maker,
      supplier: maker ? guessSupplier({ maker }) : "購入先確認",
    };

    const preview = {
      ...previewRow,
      stockAdvice: "AI検出候補から作成しました。内容を確認してから登録してください。",
      imageUrl: makeSearchUrl(previewRow, "image"),
      googleUrl: makeSearchUrl(previewRow, "google"),
      misumiUrl: makeSearchUrl(previewRow, "misumi"),
      monotaroUrl: makeSearchUrl(previewRow, "monotaro"),
      amazonUrl: makeSearchUrl(previewRow, "amazon"),
      yahooUrl: makeSearchUrl(previewRow, "yahoo"),
      rakutenUrl: makeSearchUrl(previewRow, "rakuten"),
      nakanetUrl: makeSearchUrl(previewRow, "nakanet"),
      omronUrl: makeSearchUrl(previewRow, "omron"),
      smcUrl: makeSearchUrl(previewRow, "smc"),
      keyenceUrl: makeSearchUrl(previewRow, "keyence"),
      ocrText: sparePhotoOcrText || "",
    };

    setSpareAiInput(`${maker} ${partNo}`.trim() || candidateText);
    setSpareAiPreview(preview);
  }

  async function handlePhotoPartRegister(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSparePhotoLoading(true);
      setSparePhotoOcrText("");

      const imageBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setSparePhotoImage(imageBase64);

      // OCR é pesado; carregue o Tesseract somente quando o usuário realmente usar OCR.
      const { default: Tesseract } = await import("tesseract.js");
      const result = await Tesseract.recognize(file, "eng+jpn", {
        logger: (message) => console.log("OCR", message),
      });

      const rawText = result?.data?.text || "";

      const cleanedText = rawText
        .replace(/[|｜]/g, " ")
        .replace(/[^\w\-ぁ-んァ-ン一-龥]/g, " ")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!cleanedText) {
        alert("文字を読み取れませんでした。もう少し明るく、ラベルを近くで撮影してください。");
        return;
      }

      const candidates = extractPartCandidates(cleanedText);
      setOcrCandidates(candidates);

      const maker = guessMakerFromText(cleanedText);
      const partNo = candidates.find((item) => /[0-9]/.test(item) && !item.includes("FUJI") && !item.includes("OMRON") && !item.includes("SMC") && !item.includes("KEYENCE")) || "";

      const partName = maker
        ? maker.includes("Fuji")
          ? "電磁接触器"
          : `${maker} 部品`
        : partNo
          ? "写真AI読取部品"
          : "写真AI読取部品";

      const previewRow = {
        partName,
        partNo,
        serialNo: partNo,
        maker,
        supplier: maker ? guessSupplier({ maker }) : "購入先確認",
      };

      const preview = {
        ...previewRow,
        stockAdvice: "OCR読取結果を確認してから登録してください。間違いがあれば編集できます。",
        imageUrl: makeSearchUrl(previewRow, "image"),
        googleUrl: makeSearchUrl(previewRow, "google"),
        misumiUrl: makeSearchUrl(previewRow, "misumi"),
        monotaroUrl: makeSearchUrl(previewRow, "monotaro"),
        amazonUrl: makeSearchUrl(previewRow, "amazon"),
        yahooUrl: makeSearchUrl(previewRow, "yahoo"),
        rakutenUrl: makeSearchUrl(previewRow, "rakuten"),
        nakanetUrl: makeSearchUrl(previewRow, "nakanet"),
        omronUrl: makeSearchUrl(previewRow, "omron"),
        smcUrl: makeSearchUrl(previewRow, "smc"),
        keyenceUrl: makeSearchUrl(previewRow, "keyence"),
        ocrText: cleanedText,
      };

      setSpareAiInput(`${maker} ${partNo}`.trim() || cleanedText);
      setSpareAiPreview(preview);
      setSparePhotoOcrText(cleanedText);

      alert("写真解析完了。内容を確認してから登録してください。");
    } catch (error) {
      console.error("Photo OCR error:", error);
      alert("写真AI解析でエラーが発生しました。写真を変えてもう一度試してください。");
    } finally {
      setSparePhotoLoading(false);
      e.target.value = "";
    }
  }

  function renderSpareAiAssistant() {
    const preview = spareAiPreview || buildSpareAiPreview(spareAiInput);

    return (
      <div className="tableWrap" style={{ marginBottom: "18px", border: "2px solid #2563eb" }}>
        <h3>🤖 AI部品アシスタント</h3>
        <p>
          部品名・型式・メーカーを入力、または部品ラベルを写真で撮影すると、メーカー候補・購入先候補・画像検索・主要サイト検索をまとめて準備します。
        </p>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={spareAiInput}
            onChange={(e) => {
              setSpareAiInput(e.target.value);
              setSpareAiPreview(buildSpareAiPreview(e.target.value));
            }}
            placeholder="例：OMRON E2NC-EA21 / SMC CDQ2B16-20D / KEYENCE FU-35FA"
            style={{ fontSize: "18px", minHeight: "52px", flex: "1 1 420px" }}
          />
          <button
            className="primaryButton"
            onClick={() => setSpareAiPreview(buildSpareAiPreview(spareAiInput))}
          >
            🤖 候補作成
          </button>

          <label className="primaryButton" style={{ cursor: "pointer" }}>
            📷 写真AI登録
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoPartRegister}
              style={{ display: "none" }}
            />
          </label>

          <button className="primaryButton" onClick={createSpareFromAiPreview}>
            <Plus size={16} /> 候補から予備品追加
          </button>

          {(spareAiInput || spareAiPreview || sparePhotoImage || sparePhotoOcrText || ocrCandidates.length > 0) && (
            <button
              type="button"
              className="deleteButton"
              onClick={() => {
                setSpareAiInput("");
                setSpareAiPreview(null);
                setSparePhotoImage("");
                setSparePhotoOcrText("");
                setOcrCandidates([]);
              }}
            >
              キャンセル
            </button>
          )}
        </div>

        {sparePhotoLoading && (
          <div className="calendarEditCard" style={{ marginTop: "14px", border: "1px solid #2563eb" }}>
            <h3>📷 写真AI解析中...</h3>
            <p>ラベル文字を読み取っています。少し待ってください。</p>
          </div>
        )}

        {sparePhotoOcrText && (
          <div className="calendarEditCard" style={{ marginTop: "14px" }}>
            <h3>OCR読取結果</h3>
            <p style={{ color: "#64748b" }}>
              読み取った文字から、メーカー・型式候補だけを上の候補に反映しました。必要なら内容を編集してから登録してください。
            </p>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: "bold" }}>読取テキストを見る</summary>
              <p style={{ whiteSpace: "pre-wrap", marginTop: "10px" }}>{sparePhotoOcrText}</p>
            </details>
          </div>
        )}

        {ocrCandidates.length > 0 && (
          <div className="calendarEditCard" style={{ marginTop: "14px", border: "1px solid #93c5fd" }}>
            <h3>🔍 AI検出候補</h3>
            <p style={{ color: "#64748b" }}>
              写真から読めた候補です。正しい品番・メーカーを押すと、下の登録候補に反映されます。
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
              {ocrCandidates.map((candidate) => (
                <button
                  key={candidate}
                  className="primaryButton"
                  onClick={() => applyOcrCandidate(candidate)}
                >
                  {candidate}
                </button>
              ))}
            </div>
          </div>
        )}

        {preview && (
          <div
            className="calendarEditCard"
            style={{
              marginTop: "14px",
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              gap: "18px",
              alignItems: "start",
            }}
          >
            <div
              style={{
                height: "170px",
                borderRadius: "16px",
                background: "#f8fafc",
                border: "1px solid #dbe3ef",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "48px",
                overflow: "hidden",
              }}
            >
              {sparePhotoImage ? (
                <img
                  src={sparePhotoImage}
                  alt="OCR preview"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                "📷"
              )}
            </div>

            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: "26px" }}>{preview.partName || "部品名候補なし"}</h2>
              <p style={{ margin: "0 0 6px", fontSize: "20px", fontWeight: "bold", color: "#2563eb" }}>
                型式・品番：{preview.partNo || "未検出"}
              </p>
              <p style={{ margin: "0 0 10px", color: "#475569" }}>
                メーカー候補：{preview.maker || "未検出"}　/　購入先候補：{preview.supplier}
              </p>
              <p style={{ color: "#64748b" }}>{preview.stockAdvice}</p>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                <button className="primaryButton" onClick={() => window.open(preview.imageUrl, "_blank")}>画像検索</button>
                <button className="primaryButton" onClick={() => window.open(preview.misumiUrl, "_blank")}>MISUMI</button>
                <button className="primaryButton" onClick={() => window.open(preview.monotaroUrl, "_blank")}>MonotaRO</button>
                <button className="primaryButton" onClick={() => window.open(preview.amazonUrl, "_blank")}>Amazon</button>
                <button className="primaryButton" onClick={() => window.open(preview.yahooUrl, "_blank")}>Yahoo</button>
                <button className="primaryButton" onClick={() => window.open(preview.rakutenUrl, "_blank")}>楽天</button>
                <button className="primaryButton" onClick={() => window.open(preview.nakanetUrl, "_blank")}>NAKANET</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderSpareParts() {
    const stockSummary = spareRows.reduce(
      (sum, row) => {
        const price = parseYen(row.price);
        const qty = parseQty(row.stockQty);
        const minStock = parseQty(row.minStock || row.reorderPoint || 1) || 1;
        const reorderQty = parseQty(row.reorderQty);

        if (price > 0) sum.priceRegistered += 1;
        if (qty <= 0) sum.noStock += 1;
        if (qty > 0 && qty <= minStock) sum.warningStock += 1;

        if (price > 0 && qty > 0) {
          sum.totalStockValue += price * qty;
        }

        if (price > 0 && qty < minStock) {
          const needQty = reorderQty > 0 ? reorderQty : Math.max(0, minStock - qty);
          sum.orderPlanValue += price * needQty;
          sum.orderNeedCount += 1;
        }

        return sum;
      },
      {
        totalStockValue: 0,
        orderPlanValue: 0,
        priceRegistered: 0,
        noStock: 0,
        warningStock: 0,
        orderNeedCount: 0,
      }
    );

    const searched = spareSearch.trim().length > 0;
    const rowsToShow = searched ? filteredSpareRows : filteredSpareRows.slice(0, 30);

    return (
      <>
        <div className="header">
          <div>
            <h2>📦 予備品管理</h2>
            <p>Amazon・MISUMI風に、写真・型式・メーカー・購入先・使用設備・在庫を大きく見やすく表示します。</p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <label className="primaryButton" style={{ cursor: "pointer" }}>
              📥 Excel取込
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm"
                multiple
                onChange={handleSpareExcelUpload}
                style={{ display: "none" }}
              />
            </label>
            <button className="primaryButton" onClick={addPart}><Plus size={16} /> 予備品追加</button>
          </div>
        </div>

        <div className="tableWrap" style={{ marginBottom: "18px" }}>
          <h3>📦 表示メニュー</h3>
          <p>部品・在庫・金額・発注をアイコンで分けて見やすくしました。</p>
          <SubTabBar items={[{ key: "cards", label: "商品カード", icon: "📦" }, { key: "money", label: "金額確認", icon: "💴" }, { key: "order", label: "発注確認", icon: "🛒" }, { key: "photo", label: "写真AI", icon: "📷" }]} value={spareViewMode} onChange={setSpareViewMode} />
        </div>

        <div className="cards" style={{ marginBottom: "18px" }}>
          <div className="card"><span>📦 登録部品</span><strong>{spareRows.length}</strong></div>
          <div className="card red"><span>🚨 在庫なし</span><strong>{stockSummary.noStock}</strong></div>
          <div className="card yellow"><span>⚠️ 在庫注意</span><strong>{stockSummary.warningStock}</strong></div>
          <div className="card"><span>🏷️ 価格登録済み</span><strong>{stockSummary.priceRegistered}</strong></div>
          <div className="card"><span>💴 在庫総額</span><strong className="moneyText">{formatYen(stockSummary.totalStockValue)}</strong></div>
          <div className="card yellow"><span>🛒 発注予定額</span><strong className="moneyText">{formatYen(stockSummary.orderPlanValue)}</strong></div>
        </div>

        {renderSpareAiAssistant()}

        <div className="tableWrap" style={{ marginBottom: "18px" }}>
          <h3>🔍 予備品AI検索</h3>
          <p>部品名・型式・メーカー・購入先・設備名・保管場所から検索できます。検索すると商品カードを大きく表示します。</p>
          <input
            value={spareSearch}
            onChange={(e) => setSpareSearch(e.target.value)}
            placeholder="例：OMRON E2NC センサー 76-060 SS2 中西電機"
            style={{ fontSize: "20px", minHeight: "54px" }}
          />
          <p style={{ color: "#64748b", marginTop: "10px" }}>
            表示：{rowsToShow.length}件 / 検索結果：{filteredSpareRows.length}件
          </p>
        </div>

        {rowsToShow.map((row) => (
          <div
            key={row.id}
            className="tableWrap"
            style={{
              display: "grid",
              gridTemplateColumns: "320px 1fr",
              gap: "24px",
              marginBottom: "22px",
              alignItems: "start",
            }}
          >
            <div style={{ textAlign: "center" }}>
              {row.image || row.imageUrl ? (
                <img
                  src={row.image || row.imageUrl}
                  alt=""
                  style={{
                    width: "300px",
                    height: "300px",
                    objectFit: "contain",
                    borderRadius: "18px",
                    border: "1px solid #dbe3ef",
                    background: "#f8fafc",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "300px",
                    height: "300px",
                    borderRadius: "18px",
                    border: "1px solid #dbe3ef",
                    background: "#f8fafc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#94a3b8",
                    margin: "0 auto",
                  }}
                >
                  写真なし
                </div>
              )}

              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload(e, "parts", row.id)}
                style={{ marginTop: "10px" }}
              />

              <input
                placeholder="画像URLを貼り付け"
                value={row.imageUrl || ""}
                onChange={(e) => updateField("parts", row.id, "imageUrl", e.target.value)}
                style={{ marginTop: "10px" }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ fontSize: "34px", margin: "0 0 10px", color: "#0f172a", lineHeight: 1.25, wordBreak: "break-word" }}>
                    {row.partName || "部品名なし"}
                  </h2>
                  <p style={{ fontSize: "20px", fontWeight: "bold", color: "#2563eb", margin: 0 }}>
                    型式・品番：{row.partNo || row.serialNo || "-"}
                  </p>
                  <p style={{ fontSize: "18px", color: "#475569" }}>
                    メーカー：{row.maker || "-"}　/　カテゴリ：{row.category || "-"}　/　定期保全：{row.isMaintenanceTarget ? "対象" : "未登録"}
                  </p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "16px", color: "#64748b" }}>在庫状態</div>
                  <div style={{ fontSize: "26px", fontWeight: "900" }}>{row.stockStatus}</div>
                  <div style={{ fontSize: "18px" }}>在庫：{row.stockQty || 0} / 最低：{row.minStock || 1}</div>
                </div>
              </div>

              <div className="reportGrid" style={{ marginTop: "16px" }}>
                <label>🔩 部品名<input value={row.partName || ""} onChange={(e) => updateField("parts", row.id, "partName", e.target.value)} /></label>
                <label>🏷️ 型式・品番<input value={row.partNo || row.serialNo || ""} onChange={(e) => { updateField("parts", row.id, "partNo", e.target.value); updateField("parts", row.id, "serialNo", e.target.value); }} /></label>
                <label>🏭 メーカー<input value={row.maker || ""} onChange={(e) => updateField("parts", row.id, "maker", e.target.value)} /></label>
                <label>💴 価格<input value={row.price || ""} onChange={(e) => updateField("parts", row.id, "price", e.target.value)} /></label>
                <label>🛒 購入先<input value={row.supplier || ""} onChange={(e) => updateField("parts", row.id, "supplier", e.target.value)} /></label>
                <label>🔗 購入URL<input value={row.purchaseUrl || ""} onChange={(e) => updateField("parts", row.id, "purchaseUrl", e.target.value)} /></label>
                <label>⚙️ 使用設備<input value={row.equipment || ""} onChange={(e) => updateField("parts", row.id, "equipment", e.target.value)} /></label>
                <label>🏗️ ライン<input value={row.lineName || ""} onChange={(e) => updateField("parts", row.id, "lineName", e.target.value)} /></label>
                <label>📍 保管場所<input value={row.location || row.locationRack || ""} onChange={(e) => { updateField("parts", row.id, "location", e.target.value); updateField("parts", row.id, "locationRack", e.target.value); }} /></label>
                <label>📦 在庫数<input type="number" value={row.stockQty || 0} onChange={(e) => updateField("parts", row.id, "stockQty", e.target.value)} /></label>
                <label>⚠️ 最低在庫<input type="number" value={row.minStock || 1} onChange={(e) => updateField("parts", row.id, "minStock", e.target.value)} /></label>
                <label>🚚 納期<input value={row.leadTime || ""} onChange={(e) => updateField("parts", row.id, "leadTime", e.target.value)} /></label>
              </div>

              <h3>📝 備考</h3>
              <textarea
                value={row.stockNote || row.note || ""}
                onChange={(e) => {
                  updateField("parts", row.id, "stockNote", e.target.value);
                  updateField("parts", row.id, "note", e.target.value);
                }}
              />

              {appLanguage === "en" && (
                <div style={{ marginTop: "10px", color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                  Displayed Japanese database text is translated into English. Switch to Japanese to edit the original stored values.
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
                <button className="primaryButton" onClick={() => smartFillSpare(row)}>🤖 AI補完</button>
                <button
                  className={row.isMaintenanceTarget ? "deleteButton" : "primaryButton"}
                  onClick={() => updateField("parts", row.id, "isMaintenanceTarget", !row.isMaintenanceTarget)}
                >
                  {row.isMaintenanceTarget ? "定期保全から外す" : "🔧 定期保全へ追加"}
                </button>
                <button className="primaryButton" onClick={() => window.open(makeSearchUrl(row, "misumi"), "_blank")}>MISUMI</button>
                <button className="primaryButton" onClick={() => window.open(makeSearchUrl(row, "monotaro"), "_blank")}>MonotaRO</button>
                <button className="primaryButton" onClick={() => window.open(makeSearchUrl(row, "image"), "_blank")}>画像検索</button>
                {row.purchaseUrl && (
                  <button className="primaryButton" onClick={() => window.open(row.purchaseUrl, "_blank")}>購入URL</button>
                )}
                <button className="deleteButton" onClick={() => removeItem("parts", row.id)}><Trash2 size={16} /> 削除</button>
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  function renderCalendarModal() {
    if (!newCalendarEvent) return null;

    return (
      <div className="modalBackdrop">
        <div className="modalCard">
          <div className="header">
            <div>
              <h2>{editingCalendarEventId ? "✏️ 予定編集" : "📅 新しい予定"}</h2>
              <p>{newCalendarEvent.date} の予定を{editingCalendarEventId ? "編集" : "登録"}します。</p>
            </div>
            <button className="deleteButton" onClick={cancelNewCalendarEvent}><X size={16} /> 閉じる</button>
          </div>

          <div className="reportGrid">
            <label>📅 日付<input type="date" value={newCalendarEvent.date || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, date: e.target.value })} /></label>
            <label>⏰ 時間<input type="time" value={newCalendarEvent.time || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, time: e.target.value })} /></label>
            <label>🗂️ 区分
              <select value={newCalendarEvent.category || "定期保全"} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, category: e.target.value })}>
                <option value="定期保全">定期保全</option>
                <option value="計画工事">計画工事</option>
                <option value="会議">会議</option>
                <option value="緊急">緊急</option>
              </select>
            </label>
            <label>🚨 重要度
              <select value={newCalendarEvent.importance || "通常"} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, importance: e.target.value })}>
                <option value="通常">通常</option>
                <option value="重要">重要</option>
              </select>
            </label>
            <label>🏷️ タイトル<input value={newCalendarEvent.title || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, title: e.target.value })} /></label>
            <label>👤 担当者<input value={newCalendarEvent.owner || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, owner: e.target.value })} /></label>
          </div>

          <h3>📋 内容</h3>
          <textarea value={newCalendarEvent.detail || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, detail: e.target.value })} />

          <h3>📷 写真</h3>
          <input type="file" accept="image/*" onChange={(e) => handleDraftImageUpload(e, setNewCalendarEvent)} />
          {newCalendarEvent.image && <img src={newCalendarEvent.image} alt="" className="calendarPhoto" />}

          <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
            <button className="primaryButton" onClick={saveNewCalendarEvent}><Save size={16} /> {editingCalendarEventId ? "更新" : "保存"}</button>
            <button className="deleteButton" onClick={cancelNewCalendarEvent}><X size={16} /> キャンセル</button>
          </div>
        </div>
      </div>
    );
  }

  function renderCalendar() {
    const getCategoryIcon = (category = "") => {
      if (category.includes("計画工事")) return "🏗️";
      if (category.includes("保全報告")) return "📝";
      if (category.includes("定期保全")) return "🔧";
      if (category.includes("緊急")) return "🔴";
      if (category.includes("会議")) return "👥";
      return "📌";
    };

    const summarizeDayEvents = (events = []) => {
      const summary = {};
      events.forEach((event) => {
        const category = event.category || "予定";
        summary[category] = (summary[category] || 0) + 1;
      });
      return Object.entries(summary).slice(0, 3);
    };

    const selectedEvents = unifiedCalendarEvents.filter((event) => event.date === selectedDate);

    return (
      <>
        <div className="header">
          <div>
            <h2>📅 カレンダー</h2>
            <p>月表示は「件数・区分」だけを見やすく表示し、詳細は下の予定一覧で確認できます。</p>
          </div>
          <button className="primaryButton" onClick={() => startNewCalendarEvent(selectedDate)}>
            <Plus size={16} /> 選択日の予定追加
          </button>
        </div>

        <div className="tableWrap">
          <div className="calendarTop">
            <button onClick={() => changeMonth(-1)}>＜ 前月</button>
            <h2>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</h2>
            <button onClick={() => changeMonth(1)}>翌月 ＞</button>
            <button onClick={() => {
              const now = todayText();
              setCalendarMonth(new Date());
              setSelectedDate(now);
            }}>今日</button>
          </div>

          <div className="calendarWeek">
            <div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div>
          </div>

          <div className="calendarGrid">
            {getCalendarDays().map((date, index) => {
              const dayEvents = date ? unifiedCalendarEvents.filter((event) => event.date === date) : [];
              const summaries = summarizeDayEvents(dayEvents);
              const firstImportant = dayEvents.find((event) => event.importance === "重要") || dayEvents[0];

              return (
                <div
                  key={index}
                  className={`calendarDay ${!date ? "emptyDay" : ""} ${date === selectedDate ? "selectedDay" : ""}`}
                  onClick={() => {
                    if (!date) return;
                    setSelectedDate(date);
                  }}
                >
                  {date && (
                    <>
                      <div className="calendarDayHeader">
                        <span className="calendarDayNumber">{Number(date.slice(8, 10))}</span>
                        {dayEvents.length > 0 && <span className="eventCount">{dayEvents.length}件</span>}
                      </div>

                      {dayEvents.length > 0 && (
                        <div className="calendarSummaryPills">
                          {summaries.map(([category, count]) => (
                            <span
                              key={category}
                              className={`calendarSummaryPill ${dayEvents.some((e) => e.category === category && e.importance === "重要") ? "urgentPill" : ""}`}
                              title={`${category}: ${count}件`}
                            >
                              {getCategoryIcon(category)} {count}
                            </span>
                          ))}
                        </div>
                      )}

                      {firstImportant && (
                        <span className="calendarMiniText" title={firstImportant.title || "予定"}>
                          {getCategoryIcon(firstImportant.category)} {firstImportant.time ? `${firstImportant.time} ` : ""}{firstImportant.title || "予定"}
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="selectedEventsHeader">
            <div>
              <h3 style={{ margin: 0 }}>{selectedDate} の予定</h3>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                月カレンダーで選んだ日の詳細です。
              </p>
            </div>
            <button className="primaryButton" onClick={() => startNewCalendarEvent(selectedDate)}>
              <Plus size={16} /> この日に追加
            </button>
          </div>

          {selectedEvents.length === 0 && (
            <div className="calendarEditCard" style={{ marginTop: "12px" }}>
              <p>予定はありません。</p>
            </div>
          )}

          <div className="selectedEventCards">
            {selectedEvents.map((event) => (
              <div key={event.id} className="eventRow">
                <div className="eventRowTitle">
                  <b>{getCategoryIcon(event.category)} {event.importance === "重要" ? "【重要】" : ""}{event.title || "予定"}</b>
                </div>

                <div className="eventMetaLine">
                  {event.time && <span className="eventMetaBadge">⏰ {event.time}</span>}
                  <span className="eventMetaBadge">区分: {event.category || "-"}</span>
                  <span className="eventMetaBadge">担当: {event.owner || "-"}</span>
                </div>

                <div className="eventDetailText">{event.detail || "詳細なし"}</div>

                {event.image && <img src={event.image} alt="" className="calendarPhoto" />}

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                  {event.page && event.page !== "calendar" && (
                    <button className="primaryButton" onClick={() => setPage(event.page)}>
                      関連画面を開く
                    </button>
                  )}
                  {event.deletable ? (
                    <>
                      <button className="primaryButton" onClick={() => startEditCalendarEvent(event)}>✏️ 編集</button>
                      <button className="deleteButton" onClick={() => removeItem("calendar", event.id)}><Trash2 size={16} /> 削除</button>
                    </>
                  ) : (
                    <span style={{ color: "#64748b", fontSize: "12px", alignSelf: "center" }}>自動連携データ</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {renderCalendarModal()}
      </>
    );
  }

  function ReportViewCard({ row: sourceRow, index = 0 }) {
    // 報告書は「入力中＝下書き」「保存ボタンでFirebase反映」に変更しました。
    // これで日本語入力中に文字が消える・戻る不具合を防止します。
    const row = reportDrafts[sourceRow.id] || sourceRow;
    const calc = calculateReport(row);
    const isDirty = !!reportDirty[sourceRow.id];
    const isApprovedLocked = row.approvalStatus === "承認済み";
    const setRow = (field, value) => {
      if (isApprovedLocked) {
        alert("🔒 承認済み報告書はロックされています。修正する場合は、承認権限者が差戻ししてください。");
        return;
      }
      setReportDraftField(sourceRow.id, field, value);
    };

    const setSavedApprovalStatus = (nextStatus) => {
      if (nextStatus === "承認済み" && !canApprove) {
        alert(approvalPermissionMessage("approve"));
        return;
      }

      if (nextStatus === "承認待ち" && !canInspect) {
        alert(approvalPermissionMessage("inspect"));
        return;
      }

      if (
        row.approvalStatus === "承認済み" &&
        nextStatus !== "承認済み" &&
        !canApprove
      ) {
        alert(approvalPermissionMessage("approve"));
        return;
      }

      setRow("approvalStatus", nextStatus);
    };

    const requestInspection = async () => {
      if (row.approvalStatus === "承認済み") {
        alert("承認済み報告書は点検依頼できません。");
        return;
      }
      if (row.approvalStatus === "点検待ち") {
        alert("この報告書はすでに点検待ちです。");
        return;
      }

      const ok = window.confirm("この報告書を点検依頼しますか？\n\n状態：点検待ち");
      if (!ok) return;

      const patch = {
        approvalStatus: "点検待ち",
        inspectionRequestedBy: currentUserName,
        inspectionRequestedByUid: currentUser.uid,
        inspectionRequestedAt: new Date().toISOString(),
        inspectedBy: "",
        inspectedDate: "",
        inspectedAt: "",
        approvedBy: "",
        approvedDate: "",
        approvedAt: "",
      };

      try {
        setReportSavingId(sourceRow.id);
        await updateDoc(doc(db, "maintenanceReports", sourceRow.id), patch);
        setReports((current) =>
          current.map((item) => item.id === sourceRow.id ? { ...item, ...patch } : item)
        );
        setReportDrafts((current) => ({
          ...current,
          [sourceRow.id]: { ...(current[sourceRow.id] || row), ...patch },
        }));
        setReportDirty((current) => ({ ...current, [sourceRow.id]: false }));
        alert("📨 点検依頼を送信しました。");
      } catch (error) {
        console.error("inspection request error:", error);
        alert("点検依頼の保存に失敗しました。");
      } finally {
        setReportSavingId(null);
      }
    };

    const returnApprovedReport = async () => {
      if (!canApprove) {
        alert(approvalPermissionMessage("approve"));
        return;
      }
      if (row.approvalStatus !== "承認済み") return;

      const ok = window.confirm("承認済み報告書を差戻しますか？\n\n差戻し後、報告書を再編集できます。");
      if (!ok) return;

      const patch = {
        approvalStatus: "差戻し",
        returnedBy: currentUserName,
        returnedByUid: currentUser.uid,
        returnedAt: new Date().toISOString(),
      };

      try {
        setReportSavingId(sourceRow.id);
        await updateDoc(doc(db, "maintenanceReports", sourceRow.id), patch);
        setReports((current) =>
          current.map((item) => item.id === sourceRow.id ? { ...item, ...patch } : item)
        );
        setReportDrafts((current) => ({
          ...current,
          [sourceRow.id]: { ...(current[sourceRow.id] || row), ...patch },
        }));
        setReportDirty((current) => ({ ...current, [sourceRow.id]: false }));
        alert("↩️ 報告書を差戻しました。再編集できます。");
      } catch (error) {
        console.error("return report error:", error);
        alert("差戻しの保存に失敗しました。");
      } finally {
        setReportSavingId(null);
      }
    };

    const inspectSavedReport = async () => {
      if (!canInspect) {
        alert(approvalPermissionMessage("inspect"));
        return;
      }

      if (row.approvalStatus === "承認済み") {
        alert("承認済み報告書は点検変更できません。");
        return;
      }

      if (row.approvalStatus !== "点検待ち") {
        alert("先に「📨 点検依頼」を実施してください。");
        return;
      }

      const ok = window.confirm(
        `点検を実施します。\n\n点検者：${currentUserName}\n日付：${todayText()}\n\nよろしいですか？`
      );
      if (!ok) return;

      const nowIso = new Date().toISOString();
      const patch = {
        inspectedBy: currentUserName,
        inspectedByUid: currentUser.uid,
        inspectedByEmail: currentUser.email || "",
        inspectedDate: todayText(),
        inspectedAt: nowIso,
        approvalStatus: "承認待ち",
      };

      try {
        setReportSavingId(sourceRow.id);
        await updateDoc(doc(db, "maintenanceReports", sourceRow.id), patch);

        setReports((current) =>
          current.map((item) =>
            item.id === sourceRow.id ? { ...item, ...patch } : item
          )
        );
        setReportDrafts((current) => ({
          ...current,
          [sourceRow.id]: { ...(current[sourceRow.id] || row), ...patch },
        }));
        setReportDirty((current) => ({ ...current, [sourceRow.id]: false }));

        alert(`点検を記録しました。\n点検者：${currentUserName}`);
      } catch (error) {
        console.error("inspection save error:", error);
        alert("点検の保存に失敗しました。権限またはFirebase接続を確認してください。");
      } finally {
        setReportSavingId(null);
      }
    };

    const approveSavedReport = async () => {
      if (!canApprove) {
        alert(approvalPermissionMessage("approve"));
        return;
      }

      if (!row.inspectedBy || row.approvalStatus !== "承認待ち") {
        alert("先に点検を実施し、状態を「承認待ち」にしてください。");
        return;
      }

      if (row.approvalStatus === "承認済み") {
        alert("この報告書はすでに承認済みです。");
        return;
      }

      const ok = window.confirm(
        `承認を実施します。\n\n承認者：${currentUserName}\n日付：${todayText()}\n\n承認後は承認情報を権限者以外変更できません。\nよろしいですか？`
      );
      if (!ok) return;

      const nowIso = new Date().toISOString();
      const patch = {
        approvedBy: currentUserName,
        approvedByUid: currentUser.uid,
        approvedByEmail: currentUser.email || "",
        approvedDate: todayText(),
        approvedAt: nowIso,
        approvalStatus: "承認済み",
      };

      try {
        setReportSavingId(sourceRow.id);
        await updateDoc(doc(db, "maintenanceReports", sourceRow.id), patch);

        setReports((current) =>
          current.map((item) =>
            item.id === sourceRow.id ? { ...item, ...patch } : item
          )
        );
        setReportDrafts((current) => ({
          ...current,
          [sourceRow.id]: { ...(current[sourceRow.id] || row), ...patch },
        }));
        setReportDirty((current) => ({ ...current, [sourceRow.id]: false }));

        alert(`承認を記録しました。\n承認者：${currentUserName}`);
      } catch (error) {
        console.error("approval save error:", error);
        alert("承認の保存に失敗しました。権限またはFirebase接続を確認してください。");
      } finally {
        setReportSavingId(null);
      }
    };
    const reportAccentColors = ["#2563eb", "#16a34a", "#f97316", "#7c3aed", "#0891b2", "#dc2626"];
    const reportAccent = reportAccentColors[index % reportAccentColors.length];
    const reportTabs = [
      { key: "summary", label: "概要", icon: "📌" },
      { key: "basic", label: "基本", icon: "🏭" },
      { key: "time", label: "時間", icon: "⏱️" },
      { key: "trouble", label: "不具合", icon: "⚠️" },
      { key: "why", label: "原因", icon: "🔍" },
      { key: "prevention", label: "再発防止", icon: "🛠️" },
      { key: "cost", label: "費用", icon: "💴" },
      { key: "approval", label: "承認", icon: "✅" },
      { key: "other", label: "写真", icon: "📷" },
      { key: "all", label: "全部", icon: "📚" },
    ];
    const show = (key) => reportViewMode === "all" || reportViewMode === key;

    return (
      <div
        id={`maintenance-report-${sourceRow.id}`}
        className="tableWrap reportCardShell"
        key={row.id}
        style={{ marginTop: "20px", "--report-accent": reportAccent }}
      >
        <div style={{ border: `2px solid ${reportAccent}`, borderRadius: "16px", overflow: "visible", background: "#fff", marginBottom: "14px" }}>
          <div className="reportTopCompact" style={{ display: "flex", flexWrap: "wrap", borderBottom: "2px solid #0f172a", width: "100%", boxSizing: "border-box" }}>
            <div className="reportTitleCompact" style={{ padding: "16px", textAlign: "center", flex: "1 1 520px", minWidth: "280px" }}>
              <h2 style={{ margin: 0 }}>📝 保全作業報告書</h2>
              <h3 style={{ margin: "8px 0 0" }}>{row.equipment || "設備名未入力"} / {row.lineName || "ライン未入力"}</h3>
              <p style={{ margin: "8px 0 0", color: "#64748b" }}>
                <AsyncTranslatedText
                  text={row.phenomenon || "不具合現象未入力"}
                  language={appLanguage}
                />
              </p>
            </div>
            <div className="reportApprovalCompact" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", borderLeft: 0, borderTop: "2px solid #0f172a", flex: "1 1 100%", minWidth: 0, maxWidth: "100%", width: "100%" }}>
              {[
                ["承認", row.approvedBy, row.approvedDate],
                ["点検", row.inspectedBy, row.inspectedDate],
                ["作成", row.createdBy || row.worker, row.reportCreatedDate || row.createdAt],
              ].map(([label, name, date]) => (
                <div key={label} style={{ borderRight: "1px solid #94a3b8", padding: "8px", minHeight: "78px" }}>
                  <strong>{label}</strong>
                  <div>{name || "—"}</div>
                  <small>{date || ""}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="reportActionBar" style={{ padding: "10px", background: reportStatusColor(row.approvalStatus) }}>
            <strong>✅ 状態：</strong>
            <span
              style={{
                padding: "8px 12px",
                borderRadius: "999px",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                fontWeight: 900,
              }}
            >
              {row.approvalStatus || "下書き"}
            </span>

            {!isApprovedLocked && row.approvalStatus !== "点検待ち" && row.approvalStatus !== "承認待ち" && (
              <button className="primaryButton" type="button" onClick={requestInspection}
                disabled={reportSavingId === sourceRow.id}>
                📨 点検依頼
              </button>
            )}

            {canInspect && row.approvalStatus === "点検待ち" && (
              <button className="primaryButton" type="button" onClick={inspectSavedReport}
                disabled={reportSavingId === sourceRow.id}>
                🔎 点検して承認依頼へ
              </button>
            )}

            {canApprove && row.approvalStatus === "承認待ち" && (
              <button className="primaryButton" type="button" onClick={approveSavedReport}
                disabled={reportSavingId === sourceRow.id || !row.inspectedBy}>
                ✅ 承認してロック
              </button>
            )}

            {canApprove && isApprovedLocked && (
              <button className="deleteButton" type="button" onClick={returnApprovedReport}
                disabled={reportSavingId === sourceRow.id}>
                ↩️ 差戻して再編集
              </button>
            )}
            <button
              className="primaryButton"
              onClick={() => saveReportDraft(sourceRow.id)}
              disabled={reportSavingId === sourceRow.id || isApprovedLocked}
            >
              <Save size={16} /> {isApprovedLocked ? "🔒 承認済み・編集ロック" : reportSavingId === sourceRow.id ? "保存中..." : isDirty ? "変更を保存" : "保存済み"}
            </button>
            {isDirty && (
              <button className="deleteButton" onClick={() => resetReportDraft(sourceRow.id)}>
                <X size={16} /> 変更取消
              </button>
            )}
            <button className="primaryButton" onClick={() => printReport(row)}><Printer size={16} /> PDF/印刷</button>
            <button className="primaryButton" onClick={() => exportReportCsv(row)}><FileSpreadsheet size={16} /> Excel/CSV</button>
            <button className="primaryButton" onClick={() => copyReportQrLink(sourceRow.id)}><QrCode size={16} /> QRリンク</button>
            <button className="deleteButton" onClick={() => removeItem("maintenanceReports", sourceRow.id)}><Trash2 size={16} /> 削除</button>
          </div>
        </div>

        <div className="reportHeaderPanel">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>🗂️ 表示テーマを選択</h3>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>長い報告書を全部出さず、必要なテーマだけ表示できます。</p>
            </div>
            <strong style={{ color: reportAccent }}>No.{index + 1}</strong>
          </div>
          <SubTabBar items={reportTabs} value={reportViewMode} onChange={setReportViewMode} />
        </div>

        {reportViewMode === "summary" && (
          <div className="calendarEditCard" style={{ border: `2px solid ${reportAccent}`, marginTop: "14px" }}>
            <h3>📌 報告書概要</h3>
            <AsyncTranslatedText
              as="p"
              text={row.phenomenon || row.troublePoint || row.action || "概要未入力"}
              language={appLanguage}
              style={{ whiteSpace: "pre-wrap", color: "#475569" }}
            />
            <div className="reportSummaryGrid">
              <IconMetric icon="🏭" label="設備" value={row.equipment || row.lineName || "設備名未入力"} />
              <IconMetric icon="📅" label="作成日" value={row.createdAt || row.reportCreatedDate || "-"} />
              <IconMetric icon="👤" label="作業者" value={row.worker || row.createdBy || "-"} />
              <IconMetric icon="⏱️" label="停止時間" value={`${calc.stopTimeHours}H`} />
              <IconMetric icon="🔩" label="部品費" value={`${calc.partsCost.toLocaleString()}円`} />
              <IconMetric icon="💴" label="合計費用" value={`${calc.totalCost.toLocaleString()}円`} />
              <IconMetric icon="✅" label="承認状態" value={row.approvalStatus || "下書き"} />
              <IconMetric icon="🛠️" label="保全分類" value={row.maintenanceType || "-"} />
            </div>
            <div className="qrPreviewBox">
              <div style={{ fontSize: "34px" }}>🔳</div>
              <div>
                <strong>QRコード用リンク</strong>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>現場でQR化して貼ると、スマホからこの報告書へすぐアクセスできます。</p>
              </div>
              <button className="primaryButton" onClick={() => copyReportQrLink(sourceRow.id)}>リンクコピー</button>
            </div>
          </div>
        )}

        {show("basic") && (
          <Section openSections={openSections} toggleSection={toggleSection} sectionKey="basic" title="🏭 基本情報・設備情報">
            <div className="reportGrid">
              <label>📅 作成日<input type="date" value={dateOnlyInputValue(row.createdAt)} onChange={(e) => setRow("createdAt", e.target.value)} /></label>
              <label>🗂️ 保全分類<input value={row.maintenanceType || ""} onChange={(e) => setRow("maintenanceType", e.target.value)} /></label>
              <label>👥 グループ名<input value={row.groupName || ""} onChange={(e) => setRow("groupName", e.target.value)} /></label>
              <label>🏭 ライン名<input value={row.lineName || ""} onChange={(e) => setRow("lineName", e.target.value)} /></label>
              <label>⚙️ 設備名<input value={row.equipment || ""} onChange={(e) => setRow("equipment", e.target.value)} /></label>
              <label>👤 作業者<input value={row.worker || ""} onChange={(e) => setRow("worker", e.target.value)} /></label>
            </div>
          </Section>
        )}

        {show("time") && (
          <Section openSections={openSections} toggleSection={toggleSection} sectionKey="time" title="⏱️ 時間・停止時間">
            <div className="reportGrid">
              <label>🚨 ①不具合発生日時<input type="datetime-local" value={dateTimeInputValue(row.troubleDateTime)} onChange={(e) => setRow("troubleDateTime", e.target.value)} /></label>
              <label>🛠️ ②保全作業開始日時<input type="datetime-local" value={dateTimeInputValue(row.workStartDateTime)} onChange={(e) => setRow("workStartDateTime", e.target.value)} /></label>
              <label>✅ ③保全作業完了日時<input type="datetime-local" value={dateTimeInputValue(row.workEndDateTime)} onChange={(e) => setRow("workEndDateTime", e.target.value)} /></label>
              <label>▶️ ④生産開始日時<input type="datetime-local" value={dateTimeInputValue(row.productionStartDateTime)} onChange={(e) => setRow("productionStartDateTime", e.target.value)} /></label>
              <label>⏸️ ⑤停止除外時間H<input type="number" min="0" step="0.1" value={Math.max(0, toNumber(row.stopExclusionHours, 0))} onChange={(e) => setRow("stopExclusionHours", e.target.value)} /></label>
              <label>📉 ⑥機能低下(%)<input type="number" min="0" step="1" value={Math.max(0, toNumber(row.functionDownRate, 100))} onChange={(e) => setRow("functionDownRate", e.target.value)} /></label>
              <label>⏱️ ⑦停止時間H<input className="readOnlyCalc" readOnly value={calc.stopTimeHours} /></label>
            </div>
          </Section>
        )}

        {show("trouble") && (
          <Section
            openSections={openSections}
            toggleSection={toggleSection}
            sectionKey="trouble"
            title={
              appLanguage === "es"
                ? "⚠️ Detalles de la falla"
                : appLanguage === "en"
                  ? "⚠️ Failure Details"
                  : "⚠️ 不具合内容"
            }
          >
            <h3>
              {appLanguage === "es"
                ? "🚨 Síntoma de la falla"
                : appLanguage === "en"
                  ? "🚨 Failure Symptom"
                  : "🚨 不具合現象"}
            </h3>
            {appLanguage === "ja" ? (
              <textarea
                value={row.phenomenon || ""}
                onChange={(e) => setRow("phenomenon", e.target.value)}
              />
            ) : (
              <TranslatedReadOnlyTextarea
                value={row.phenomenon || ""}
                language={appLanguage}
              />
            )}

            <h3>
              {appLanguage === "es"
                ? "📍 Punto de la falla"
                : appLanguage === "en"
                  ? "📍 Failure Point"
                  : "📍 不具合箇所"}
            </h3>
            {appLanguage === "ja" ? (
              <textarea
                value={row.troublePoint || ""}
                onChange={(e) => setRow("troublePoint", e.target.value)}
              />
            ) : (
              <TranslatedReadOnlyTextarea
                value={row.troublePoint || ""}
                language={appLanguage}
              />
            )}

            <h3>
              {appLanguage === "es"
                ? "🔗 Enlace"
                : appLanguage === "en"
                  ? "🔗 Link"
                  : "🔗 リンク先"}
            </h3>
            <input
              value={row.linkUrl || ""}
              onChange={(e) => setRow("linkUrl", e.target.value)}
            />
          </Section>
        )}

        {show("why") && (
          <Section
            openSections={openSections}
            toggleSection={toggleSection}
            sectionKey="why"
            title={
              appLanguage === "es"
                ? "🔍 Causa y análisis de los 3 porqués"
                : appLanguage === "en"
                  ? "🔍 Cause and 3 Whys Analysis"
                  : "🔍 不具合原因・なぜなぜ分析"
            }
          >
            {[1, 2, 3].map((num) => (
              <label key={num}>
                {appLanguage === "es"
                  ? `Por qué ${num}`
                  : appLanguage === "en"
                    ? `Why ${num}`
                    : `なぜ${num}`}
                {appLanguage === "ja" ? (
                  <textarea
                    value={row[`why${num}`] || ""}
                    onChange={(e) => setRow(`why${num}`, e.target.value)}
                  />
                ) : (
                  <TranslatedReadOnlyTextarea
                    value={row[`why${num}`] || ""}
                    language={appLanguage}
                  />
                )}
              </label>
            ))}
            <h3>
              {appLanguage === "es"
                ? "🛠️ Acción correctiva"
                : appLanguage === "en"
                  ? "🛠️ Corrective Action"
                  : "🛠️ 処置内容"}
            </h3>
            {appLanguage === "ja" ? (
              <textarea
                value={row.action || ""}
                onChange={(e) => setRow("action", e.target.value)}
              />
            ) : (
              <TranslatedReadOnlyTextarea
                value={row.action || ""}
                language={appLanguage}
              />
            )}
          </Section>
        )}

        {show("prevention") && (
          <Section openSections={openSections} toggleSection={toggleSection} sectionKey="prevention" title="🛠️ 再発防止・流出防止・変化点">
            <div className="reportGrid">
              <label>🛡️ 再発防止区分<input value={row.recurrenceCategory || ""} onChange={(e) => setRow("recurrenceCategory", e.target.value)} /></label>
              <label>🔄 変化点ランク<input value={row.changeRank || ""} onChange={(e) => setRow("changeRank", e.target.value)} /></label>
              <label>🔍 FP点検<input value={row.fpInspection || ""} onChange={(e) => setRow("fpInspection", e.target.value)} /></label>
            </div>
            <h3>
              {appLanguage === "es"
                ? "🛡️ Prevención de recurrencia / trabajo pendiente"
                : appLanguage === "en"
                  ? "🛡️ Recurrence Prevention / Pending Work"
                  : "🛡️ 再発防止・残工事"}
            </h3>
            {appLanguage === "ja" ? (
              <textarea
                value={row.recurrencePrevention || ""}
                onChange={(e) => setRow("recurrencePrevention", e.target.value)}
              />
            ) : (
              <TranslatedReadOnlyTextarea
                value={row.recurrencePrevention || ""}
                language={appLanguage}
              />
            )}
            <h3>
              {appLanguage === "es"
                ? "🚧 Prevención de escape"
                : appLanguage === "en"
                  ? "🚧 Outflow Prevention"
                  : "🚧 流出防止"}
            </h3>
            {appLanguage === "ja" ? (
              <textarea
                value={row.outflowPrevention || ""}
                onChange={(e) => setRow("outflowPrevention", e.target.value)}
              />
            ) : (
              <TranslatedReadOnlyTextarea
                value={row.outflowPrevention || ""}
                language={appLanguage}
              />
            )}
          </Section>
        )}

        {show("cost") && (
          <Section openSections={openSections} toggleSection={toggleSection} sectionKey="cost" title="💴 参考費用">
            <div className="reportGrid">
              <label>👤 作業者数<input type="number" min="1" value={Math.max(1, toNumber(row.workerCount, 1))} onChange={(e) => setRow("workerCount", Math.max(1, toNumber(e.target.value, 1)))} /></label>
              <label>💴 時間単価<input type="number" value={row.laborRate || 3000} onChange={(e) => setRow("laborRate", e.target.value)} /></label>
              <label>⏳ 保全工数H<input readOnly value={calc.laborHours} /></label>
              <label>💰 労務費<input readOnly value={calc.laborCost.toLocaleString()} /></label>
              <label>🧾 部品費合計<input readOnly value={calc.partsCost.toLocaleString()} /></label>
              <label>参考費用合計<input readOnly value={calc.totalCost.toLocaleString()} /></label>
            </div>
            <h3>🔩 保全交換部品</h3>
            {[1, 2, 3].map((num) => (
              <div className="reportGrid" key={num}>
                <label>🔩 部品名{num}<input value={row[`partName${num}`] || ""} onChange={(e) => setRow(`partName${num}`, e.target.value)} /></label>
                <label>🔢 個数<input type="number" value={row[`partQty${num}`] || ""} onChange={(e) => setRow(`partQty${num}`, e.target.value)} /></label>
                <label>💴 単価<input type="number" value={row[`partUnitPrice${num}`] || ""} onChange={(e) => setRow(`partUnitPrice${num}`, e.target.value)} /></label>
                <label>🧾 部品費<input readOnly value={(calc[`partAmount${num}`] || 0).toLocaleString()} /></label>
              </div>
            ))}
          </Section>
        )}

        {show("approval") && (
          <Section openSections={openSections} toggleSection={toggleSection} sectionKey="approval" title="✅ 確認・承認">
            <div className="approvalFlow">
              <div className="approvalStep"><div className="approvalStepIcon">👤</div><span>STEP 1</span><strong>作成</strong><small>{row.createdBy || row.worker || "未入力"}</small></div>
              <div className="approvalStep"><div className="approvalStepIcon">🔎</div><span>STEP 2</span><strong>点検</strong><small>{row.inspectedBy || "未入力"}</small></div>
              <div className="approvalStep"><div className="approvalStepIcon">✅</div><span>STEP 3</span><strong>承認</strong><small>{row.approvedBy || "未入力"}</small></div>
              <div className="approvalStep"><div className="approvalStepIcon">🔒</div><span>STEP 4</span><strong>{row.approvalStatus === "承認済み" ? "ロック対象" : "編集中"}</strong><small>{row.approvalStatus || "下書き"}</small></div>
            </div>
            <div className="reportGrid">
              <label>
                ✅ 承認者
                <input
                  value={row.approvedBy || ""}
                  onChange={(e) => setRow("approvedBy", e.target.value)}
                  readOnly={!canApprove}
                  style={{
                    background: canApprove ? "#ffffff" : "#f1f5f9",
                    cursor: canApprove ? "text" : "not-allowed",
                  }}
                />
              </label>

              <label>
                📅 承認日
                <input
                  type="date"
                  value={dateOnlyInputValue(row.approvedDate)}
                  onChange={(e) => setRow("approvedDate", e.target.value)}
                  disabled={!canApprove}
                  style={{
                    background: canApprove ? "#ffffff" : "#f1f5f9",
                    cursor: canApprove ? "pointer" : "not-allowed",
                  }}
                />
              </label>

              <label>
                🔍 点検者
                <input
                  value={row.inspectedBy || ""}
                  onChange={(e) => setRow("inspectedBy", e.target.value)}
                  readOnly={!canInspect}
                  style={{
                    background: canInspect ? "#ffffff" : "#f1f5f9",
                    cursor: canInspect ? "text" : "not-allowed",
                  }}
                />
              </label>

              <label>
                📅 点検日
                <input
                  type="date"
                  value={dateOnlyInputValue(row.inspectedDate)}
                  onChange={(e) => setRow("inspectedDate", e.target.value)}
                  disabled={!canInspect}
                  style={{
                    background: canInspect ? "#ffffff" : "#f1f5f9",
                    cursor: canInspect ? "pointer" : "not-allowed",
                  }}
                />
              </label>

              <label>
                👤 作成者
                <input
                  value={row.createdBy || row.worker || ""}
                  onChange={(e) => setRow("createdBy", e.target.value)}
                  readOnly={!isAdmin}
                  style={{
                    background: isAdmin ? "#ffffff" : "#f1f5f9",
                    cursor: isAdmin ? "text" : "not-allowed",
                  }}
                />
              </label>

              <label>
                📅 作成日
                <input
                  type="date"
                  value={dateOnlyInputValue(row.reportCreatedDate)}
                  onChange={(e) => setRow("reportCreatedDate", e.target.value)}
                  disabled={!isAdmin}
                  style={{
                    background: isAdmin ? "#ffffff" : "#f1f5f9",
                    cursor: isAdmin ? "pointer" : "not-allowed",
                  }}
                />
              </label>
            </div>
            <div style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius: "12px",
              background: canApprove ? "#ecfdf5" : canInspect ? "#eff6ff" : "#f8fafc",
              border: "1px solid #cbd5e1",
              fontWeight: 800
            }}>
              🔐 ログイン権限：{roleLabel()}
              {!canInspect && <span> — 点検・承認は権限者のみ実施できます。</span>}
              {canInspect && !canApprove && <span> — 点検が可能です。承認は承認者のみです。</span>}
              {canApprove && <span> — 点検・承認が可能です。</span>}
            </div>

            {(row.inspectedAt || row.approvedAt) && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "12px",
                  borderRadius: "12px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  fontSize: "12px",
                  lineHeight: 1.7,
                }}
              >
                <strong>🧾 承認履歴</strong>
                {row.inspectedAt && (
                  <div>
                    🔎 点検：{row.inspectedBy || "—"} / {new Date(row.inspectedAt).toLocaleString()}
                  </div>
                )}
                {row.approvedAt && (
                  <div>
                    ✅ 承認：{row.approvedBy || "—"} / {new Date(row.approvedAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {show("other") && (
          <Section openSections={openSections} toggleSection={toggleSection} sectionKey="other" title="📷 写真・備考">
            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "maintenanceReports", row.id)} />
            {row.image && <img src={row.image} alt="" className="calendarPhoto" />}
            <h3>📝 備考</h3>{appLanguage === "ja" ? (
              <textarea value={row.note || ""} onChange={(e) => setRow("note", e.target.value)} />
            ) : (
              <TranslatedReadOnlyTextarea value={row.note || ""} language={appLanguage} />
            )}
          </Section>
        )}
      </div>
    );
  }

  function renderReports() {
    return (
      <>
        <div className="header">
          <div>
            <h2>📝 保全修理報告書</h2>
            <p>Excel原紙の項目を残し、承認・費用計算・停止時間計算・カレンダー連携まで管理します。</p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="primaryButton" onClick={startNewReport}><Plus size={16} /> 新規作成</button>
            <button className="primaryButton" onClick={() => downloadTextFile(`MIYAMA_保全報告書一覧_${todayText()}.csv`, "\ufeff" + [["作成日","設備名","ライン名","作業者","不具合","停止時間H","合計費用","承認状態"].map(makeCsvSafe).join(","), ...filteredReports.map(r => [r.createdAt, r.equipment, r.lineName, r.worker, r.phenomenon, calculateReport(r).stopTimeHours, calculateReport(r).totalCost, r.approvalStatus].map(makeCsvSafe).join(","))].join("\n"), "text/csv;charset=utf-8")}><Download size={16} /> 一覧CSV</button>
          </div>
        </div>

        {ReportDraftForm()}

        <div className="tableWrap" style={{ marginBottom: "18px" }}>
          <h3>🗂️ 表示テーマ</h3>
          <p>報告書が長い時は、ここで「概要・時間・費用・承認」などを切り替えると見やすくなります。</p>
          <SubTabBar
            items={[
              { key: "summary", label: "概要", icon: "📌" },
              { key: "basic", label: "基本", icon: "🏭" },
              { key: "time", label: "時間", icon: "⏱️" },
              { key: "trouble", label: "不具合", icon: "⚠️" },
              { key: "why", label: "原因", icon: "🔍" },
              { key: "prevention", label: "再発防止", icon: "🛠️" },
              { key: "cost", label: "費用", icon: "💴" },
              { key: "approval", label: "承認", icon: "✅" },
              { key: "other", label: "写真", icon: "📷" },
              { key: "all", label: "全部", icon: "📚" },
            ]}
            value={reportViewMode}
            onChange={setReportViewMode}
          />
        </div>

        <div className="tableWrap">
          <input
            value={reportSearch}
            onChange={(e) => setReportSearch(e.target.value)}
            placeholder="検索：設備名・ライン名・不具合現象・原因・処置内容・担当者・承認状態"
          />
        </div>

        {(() => {
          const totalPages = Math.max(1, Math.ceil(filteredReports.length / REPORTS_PER_PAGE));
          const safePage = Math.min(reportPage, totalPages);
          const startIndex = (safePage - 1) * REPORTS_PER_PAGE;
          const visibleReports = filteredReports.slice(
            startIndex,
            startIndex + REPORTS_PER_PAGE
          );

          return (
            <>
              <div
                className="tableWrap"
                style={{
                  margin: "14px 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <strong>
                  表示：{startIndex + 1}〜
                  {Math.min(startIndex + REPORTS_PER_PAGE, filteredReports.length)}
                  / {filteredReports.length}件
                </strong>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="primaryButton"
                    disabled={safePage <= 1}
                    onClick={() => setReportPage((page) => Math.max(1, page - 1))}
                  >
                    ← 前へ
                  </button>

                  <strong>
                    {safePage} / {totalPages}
                  </strong>

                  <button
                    type="button"
                    className="primaryButton"
                    disabled={safePage >= totalPages}
                    onClick={() =>
                      setReportPage((page) => Math.min(totalPages, page + 1))
                    }
                  >
                    次へ →
                  </button>
                </div>
              </div>

              {visibleReports.map((row, index) =>
                ReportViewCard({ row, index: startIndex + index })
              )}
            </>
          );
        })()}
      </>
    );
  }


  function renderPlannedWorks() {
    const statusOptions = ["計画中", "準備中", "実施中", "完了", "延期"];

    const statusBadgeStyle = (status = "計画中") => {
      if (status === "完了") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
      if (status === "実施中") return { background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" };
      if (status === "準備中") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
      if (status === "延期") return { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" };
      return { background: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0" };
    };

    const progressPercent = (value) => Math.min(100, Math.max(0, Number(value || 0)));

    return (
      <>
        <div className="header">
          <div>
            <h2>🏗️ 計画工事</h2>
            <p>計画工事をカード形式で見やすく管理します。保存すると自動でカレンダーにも登録されます。</p>
          </div>

          <button className="primaryButton" onClick={startNewPlannedWork}>
            <Plus size={16} /> 工事追加
          </button>
        </div>

        <div className="tableWrap" style={{ marginBottom: "18px" }}>
          <h3>🏗️ 表示メニュー</h3>
          <p>工事・進捗・リスク・担当者をアイコンで分けて確認できます。</p>
          <SubTabBar items={[{ key: "cards", label: "工事カード", icon: "🏗️" }, { key: "progress", label: "進捗", icon: "📈" }, { key: "risk", label: "リスク", icon: "⚠️" }, { key: "owner", label: "担当者", icon: "👤" }]} value={workViewMode} onChange={setWorkViewMode} />
        </div>

        {newPlannedWork && (
          <div className="tableWrap" style={{ border: "2px solid #2563eb" }}>
            <div className="header">
              <div>
                <h2>🏗️ 新規 計画工事</h2>
                <p>工事件名・設備・目的・内容を入力してください。</p>
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button className="primaryButton" onClick={saveNewPlannedWork}>
                  <Save size={16} /> 保存
                </button>
                <button className="deleteButton" onClick={cancelNewPlannedWork}>
                  <X size={16} /> キャンセル
                </button>
              </div>
            </div>

            <div className="reportGrid">
              <label>📅 開始日
                <input type="date" value={newPlannedWork.date || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, date: e.target.value })} />
              </label>

              <label>🏁 完了予定日
                <input type="date" value={newPlannedWork.endDate || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, endDate: e.target.value })} />
              </label>

              <label>🏗️ 工事件名
                <input value={newPlannedWork.title || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, title: e.target.value })} />
              </label>

              <label>⚙️ 設備名
                <input value={newPlannedWork.equipment || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, equipment: e.target.value })} />
              </label>

              <label>🎯 目的
                <input value={newPlannedWork.purpose || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, purpose: e.target.value })} />
              </label>

              <label>👤 担当者
                <input value={newPlannedWork.owner || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, owner: e.target.value })} />
              </label>

              <label>📈 進捗 %
                <input type="number" min="0" max="100" value={newPlannedWork.progress || 0} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, progress: e.target.value })} />
              </label>

              <label>📌 状態
                <select value={newPlannedWork.status || "計画中"} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, status: e.target.value })}>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>

            <h3>📋 内容</h3>
            <textarea value={newPlannedWork.detail || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, detail: e.target.value })} />

            <h3>⚠️ リスク</h3>
            <textarea value={newPlannedWork.risk || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, risk: e.target.value })} />

            <h3>📝 備考</h3>
            <textarea value={newPlannedWork.note || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, note: e.target.value })} />
          </div>
        )}

        {plannedWorks.length === 0 && (
          <div className="tableWrap">
            <h3>🏗️ 計画工事はまだ登録されていません。</h3>
            <p>右上の「工事追加」から登録できます。</p>
          </div>
        )}

        <div style={{ display: "grid", gap: "18px" }}>
          {plannedWorks.map((row) => (
            <div key={row.id} className="tableWrap" style={{ padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: "1 1 420px" }}>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ padding: "7px 12px", borderRadius: "999px", fontWeight: "900", ...statusBadgeStyle(row.status) }}>
                      {row.status || "計画中"}
                    </span>
                    <span style={{ padding: "7px 12px", borderRadius: "999px", fontWeight: "800", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                      {row.date || "開始日未入力"} 〜 {row.endDate || "完了予定日未入力"}
                    </span>
                  </div>

                  <h2 style={{ margin: 0, fontSize: "30px", lineHeight: 1.25, wordBreak: "break-word" }}>
                    🏗️ {row.title || "工事件名なし"}
                  </h2>

                  <p style={{ margin: "10px 0 0", color: "#475569", fontSize: "17px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    <b>設備：</b>{row.equipment || "-"}　/　<b>目的：</b>{row.purpose || "-"}　/　<b>担当：</b>{row.owner || "-"}
                  </p>
                </div>

                <div style={{ minWidth: "230px", flex: "0 1 260px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <strong>進捗</strong>
                    <strong style={{ color: "#2563eb" }}>{progressPercent(row.progress)}%</strong>
                  </div>
                  <div style={{ height: "14px", background: "#dbeafe", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{ width: `${progressPercent(row.progress)}%`, height: "100%", background: "#2563eb", borderRadius: "999px" }} />
                  </div>
                </div>
              </div>

              <div className="reportGrid" style={{ marginTop: "20px" }}>
                <label>📅 開始日
                  <input type="date" value={row.date || ""} onChange={(e) => updateField("plannedWorks", row.id, "date", e.target.value)} />
                </label>

                <label>🏁 完了予定日
                  <input type="date" value={row.endDate || ""} onChange={(e) => updateField("plannedWorks", row.id, "endDate", e.target.value)} />
                </label>

                <label>🏗️ 工事件名
                  <input value={row.title || ""} onChange={(e) => updateField("plannedWorks", row.id, "title", e.target.value)} />
                </label>

                <label>⚙️ 設備名
                  <input value={row.equipment || ""} onChange={(e) => updateField("plannedWorks", row.id, "equipment", e.target.value)} />
                </label>

                <label>🎯 目的
                  <input value={row.purpose || ""} onChange={(e) => updateField("plannedWorks", row.id, "purpose", e.target.value)} />
                </label>

                <label>👤 担当者
                  <input value={row.owner || ""} onChange={(e) => updateField("plannedWorks", row.id, "owner", e.target.value)} />
                </label>

                <label>📈 進捗 %
                  <input type="number" min="0" max="100" value={row.progress || 0} onChange={(e) => updateField("plannedWorks", row.id, "progress", e.target.value)} />
                </label>

                <label>📌 状態
                  <select value={row.status || "計画中"} onChange={(e) => updateField("plannedWorks", row.id, "status", e.target.value)}>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "14px" }}>
                <label style={{ fontWeight: "800" }}>内容
                  <textarea style={{ minHeight: "120px" }} value={row.detail || ""} onChange={(e) => updateField("plannedWorks", row.id, "detail", e.target.value)} />
                </label>

                <label style={{ fontWeight: "800" }}>リスク
                  <textarea style={{ minHeight: "120px" }} value={row.risk || ""} onChange={(e) => updateField("plannedWorks", row.id, "risk", e.target.value)} />
                </label>
              </div>

              <h3>📝 備考</h3>
              <textarea value={row.note || ""} onChange={(e) => updateField("plannedWorks", row.id, "note", e.target.value)} />

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "16px" }}>
                <button className="primaryButton" onClick={() => setPage("calendar")}>
                  📅 カレンダー確認
                </button>

                <button className="deleteButton" onClick={() => removeItem("plannedWorks", row.id)}>
                  <Trash2 size={16} /> 削除
                </button>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderAiSearch() {
    return (
      <div className="tableWrap">
        <h2>🔍 AI検索</h2>
        <p>保全報告書・定期保全・予備品管理・カレンダー・計画工事から関連情報をまとめて検索します。</p>

        <input
          value={aiSearch}
          onChange={(e) => {
            setAiSearch(e.target.value);
            setGlobalSearch(e.target.value);
          }}
          placeholder="例：ロードセル 78-60 異常停止 在庫不足"
          style={{ margin: "16px 0" }}
        />

        <button className="primaryButton" onClick={makeAiAnswer}><Bot size={16} /> AI分析</button>

        <div className="calendarEditCard" style={{ marginTop: "20px" }}>
          <h3>🤖 AI保全アシスタント</h3>
          <p>
            短く入力すると、同じ画面で報告書の下書き作成・過去事例検索・MIYAMA AIへの質問ができます。
            自動保存はしません。内容を確認してから保存してください。
          </p>

          <textarea
            value={autoReportInput}
            onChange={(e) => setAutoReportInput(e.target.value)}
            placeholder="例：78-60 箱替え動作が完了しない 光電センサー確認"
            style={{ minHeight: "110px" }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            <button type="button" className="primaryButton" onClick={createAutoReport}>
              📝 報告書の下書きを作成
            </button>

            <button type="button" className="primaryButton" onClick={searchAutoReportProblems}>
              🔎 類似問題を検索
            </button>

            <button
              type="button"
              className="primaryButton"
              onClick={askAutoReportAI}
              disabled={autoReportAiLoading}
              style={{ opacity: autoReportAiLoading ? 0.65 : 1 }}
            >
              <Bot size={17} />
              {autoReportAiLoading ? "分析中..." : "MIYAMA AIへ質問"}
            </button>
          </div>

          {autoReportHistoryMessage && (
            <div
              style={{
                marginTop: "12px",
                padding: "10px 12px",
                borderRadius: "12px",
                background: "#eff6ff",
                color: "#1e40af",
                fontWeight: 800,
              }}
            >
              {autoReportHistoryMessage}
            </div>
          )}

          {autoReportAiError && (
            <div
              role="alert"
              style={{
                marginTop: "12px",
                padding: "10px 12px",
                borderRadius: "12px",
                background: "#fee2e2",
                color: "#991b1b",
                fontWeight: 800,
              }}
            >
              {autoReportAiError}
            </div>
          )}

          {autoReportAiAnswer && (
            <div
              style={{
                marginTop: "14px",
                padding: "14px",
                border: "1px solid #c4b5fd",
                borderRadius: "14px",
                background: "#faf5ff",
                whiteSpace: "pre-wrap",
                lineHeight: 1.65,
              }}
            >
              <strong>🤖 MIYAMA AI回答</strong>
              <div style={{ marginTop: "8px" }}>{autoReportAiAnswer}</div>
            </div>
          )}

          {newReport && (
            <div style={{ marginTop: "18px" }}>
              <ReportDraftForm />
            </div>
          )}
        </div>

        {aiLevel && (
          <div className={`calendarEditCard aiDiagnosisBox ${aiLevel.includes("緊急") ? "aiHigh" : aiLevel.includes("注意") ? "aiMiddle" : "aiLow"}`} style={{ marginTop: "20px" }}>
            <h3><Bot size={18} /> AI診断：{aiLevel}</h3>
            <div className="executiveDashboardGrid">
              <ExecutiveMetric icon="🚨" label="危険度" value={aiLevel} percent={aiLevel.includes("緊急") ? 90 : aiLevel.includes("注意") ? 55 : 20} tone={aiLevel.includes("緊急") ? "danger" : aiLevel.includes("注意") ? "warn" : "normal"} />
              <ExecutiveMetric icon="📚" label="類似履歴" value={`${aiResults.length}件`} percent={Math.min(100, aiResults.length * 20)} />
              <ExecutiveMetric icon="🔍" label="確認ポイント" value={aiResults[0]?.title || "履歴確認"} percent={65} />
            </div>
          </div>
        )}

        {aiAnswer && <div className="calendarEditCard" style={{ marginTop: "20px", whiteSpace: "pre-line" }}>{aiAnswer}</div>}

        <h3 style={{ marginTop: "24px" }}>関連データ一覧：{aiResults.length}件</h3>
        {aiResults.length === 0 && aiSearch && <p>該当する履歴が見つかりません。</p>}

        {appLanguage === "en" && aiTranslationLoading && (
          <p style={{ fontWeight: 700 }}>🌐 Translating the displayed reports...</p>
        )}
        {appLanguage === "en" && aiTranslationError && (
          <p style={{ color: "#b45309", fontWeight: 700 }}>{aiTranslationError}</p>
        )}

        {visibleAiResults.map((item, index) => {
          const translationKey = makeAiTranslationItemKey(item, index);
          const translated = aiResultTranslations[translationKey];
          const displayTitle = appLanguage === "en" && translated?.title ? translated.title : item.title;
          const displayText = appLanguage === "en" && translated?.text ? translated.text : item.text;

          return (
            <div key={translationKey} className="calendarEditCard" style={{ cursor: "pointer" }} onClick={() => setPage(item.page)}>
              <b>{item.category} / {item.date}</b>
              <h3>{displayTitle}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{displayText || "-"}</p>
              {appLanguage === "en" && translated && containsJapaneseText(item.text) && (
                <details onClick={(event) => event.stopPropagation()} style={{ marginTop: "10px" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>Show original Japanese</summary>
                  <p style={{ whiteSpace: "pre-wrap", color: "#64748b" }}>{item.text || "-"}</p>
                </details>
              )}
            </div>
          );
        })}

        {aiResults.length > visibleAiResults.length && (
          <button
            className="primaryButton"
            style={{ marginTop: "16px" }}
            onClick={() => setAiVisibleCount((current) => Math.min(current + 20, aiResults.length))}
          >
            {appLanguage === "en"
              ? `Show 20 more (${visibleAiResults.length}/${aiResults.length})`
              : `さらに20件表示（${visibleAiResults.length}/${aiResults.length}）`}
          </button>
        )}
      </div>
    );
  }


  function renderMaintenanceAnalysis() {
    const formatHours = (value) => `${Number(value || 0).toFixed(1)}H`;
    const formatMoney = (value) => `¥${Number(value || 0).toLocaleString()}`;
    const getReportDate = (row) => normalizeDateOnly(row.createdAt || row.troubleDateTime || row.reportCreatedDate || row.workStartDateTime);
    const getReportMachine = (row) => getEquipmentNameFromRecord(row) || row.equipment || row.lineName || "設備名なし";
    const getReportReason = (row) => String(row.phenomenon || row.troublePoint || row.why1 || row.action || "未入力").trim() || "未入力";

    const periodOptions = [
      { key: "all", label: "全期間" },
      { key: "1m", label: "1ヶ月" },
      { key: "3m", label: "3ヶ月" },
      { key: "6m", label: "6ヶ月" },
      { key: "1y", label: "1年" },
    ];

    const getPeriodStartDate = () => {
      if (analyticsPeriod === "1m") return addDays(todayText(), -30);
      if (analyticsPeriod === "3m") return addDays(todayText(), -90);
      if (analyticsPeriod === "6m") return addDays(todayText(), -180);
      if (analyticsPeriod === "1y") return addDays(todayText(), -365);
      return "";
    };

    const periodStartDate = getPeriodStartDate();

    const filtered = reports.filter((row) => {
      const keyword = productionSearch.toLowerCase().trim();
      const machineKeyword = productionMachineName.toLowerCase().trim();
      const lineKeyword = productionLineName.toLowerCase().trim();
      const reportDate = getReportDate(row);

      if (periodStartDate && (!reportDate || reportDate < periodStartDate || reportDate > todayText())) return false;

      const text = [row.equipment, row.lineName, row.phenomenon, row.troublePoint, row.why1, row.why2, row.why3, row.action, row.replacedPart, row.worker].join(" ").toLowerCase();
      const machineText = [getReportMachine(row), row.equipment, row.lineName].join(" ").toLowerCase();
      const lineText = [row.lineName, row.groupName, row.equipment].join(" ").toLowerCase();

      if (keyword && !keyword.split(/\s+/).every((word) => text.includes(word))) return false;
      if (machineKeyword && !machineKeyword.split(/\s+/).every((word) => machineText.includes(word))) return false;
      if (lineKeyword && !lineKeyword.split(/\s+/).every((word) => lineText.includes(word))) return false;
      return true;
    });

    const totalReports = filtered.length;
    const totalStopHours = filtered.reduce((sum, row) => sum + toNumber(row.stopTimeHours ?? calculateReport(row).stopTimeHours, 0), 0);
    const totalRepairHours = filtered.reduce((sum, row) => sum + toNumber(row.laborHours ?? calculateReport(row).laborHours, 0), 0);
    const totalCost = filtered.reduce((sum, row) => sum + toNumber(row.totalCost ?? calculateReport(row).totalCost, 0), 0);
    const mttr = totalReports > 0 ? totalStopHours / totalReports : 0;
    const emergencyCount = filtered.filter((row) => String(row.maintenanceType || row.reportType || "").includes("CM") || String(row.reportTitle || "").includes("修理")).length;
    const plannedCount = Math.max(0, totalReports - emergencyCount);

    const groupBy = (getter) => Object.values(filtered.reduce((acc, row) => {
      const key = getter(row) || "未入力";
      const calc = calculateReport(row);
      if (!acc[key]) acc[key] = { key, count: 0, stopHours: 0, repairHours: 0, cost: 0, latest: "", samples: [] };
      acc[key].count += 1;
      acc[key].stopHours += toNumber(row.stopTimeHours ?? calc.stopTimeHours, 0);
      acc[key].repairHours += toNumber(row.laborHours ?? calc.laborHours, 0);
      acc[key].cost += toNumber(row.totalCost ?? calc.totalCost, 0);
      const d = getReportDate(row);
      if (d > acc[key].latest) acc[key].latest = d;
      if (acc[key].samples.length < 3) acc[key].samples.push(row.phenomenon || row.action || row.troublePoint || "-");
      return acc;
    }, {})).sort((a, b) => b.stopHours - a.stopHours || b.count - a.count);

    const machineRank = groupBy(getReportMachine);
    const reasonRank = groupBy(getReportReason);
    const partRank = groupBy((row) => row.replacedPart || row.partName1 || row.troublePoint || "部品未入力");
    const monthlyRank = groupBy((row) => (getReportDate(row) || "日付なし").slice(0, 7));
    const maxMachineStop = Math.max(1, ...machineRank.map((x) => x.stopHours));
    const maxReasonStop = Math.max(1, ...reasonRank.map((x) => x.stopHours));

    const Row = ({ item, index, max, mode = "hours" }) => (
      <div className="productionDetailBarRow">
        <div className={`productionRankNo ${index < 3 ? "top" : ""}`}>{index + 1}</div>
        <div className="productionRankName"><b>{item.key}</b><small>件数 {item.count}件 / 最新 {item.latest || "-"}</small></div>
        <div className="productionBarBg detail"><div className="productionBarFill red" style={{ width: `${Math.min(100, ((mode === "cost" ? item.cost : item.stopHours) / max) * 100)}%` }} /></div>
        <div className="productionRankValue">{mode === "cost" ? formatMoney(item.cost) : formatHours(item.stopHours)}<span>{mode === "cost" ? "保全費用" : "停止時間"}</span></div>
      </div>
    );

    return (
      <>
        <div className="tableWrap productionHero">
          <h1>📈 保全分析センター</h1>
          <p>この画面は <b>保全修理報告書だけ</b> を使って、停止時間・MTTR・費用・設備ランキングを計算します。CSVアラームはここでは使いません。</p>
          <div className="productionTrendToolbar" style={{ marginTop: "16px" }}>
            {periodOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={analyticsPeriod === option.key ? "active" : ""}
                onClick={() => setAnalyticsPeriod(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p style={{ marginTop: "-6px" }}>対象期間：{periodStartDate ? `${periodStartDate} ～ ${todayText()}` : "全期間"}</p>
          <div className="productionControlGrid">
            <label>🔍 検索<input value={productionSearch} onChange={(e) => setProductionSearch(e.target.value)} placeholder="例：76-060 センサー リベット 停止" /></label>
            <label>🏭 設備名<input value={productionMachineName} onChange={(e) => setProductionMachineName(e.target.value)} placeholder="必要な場合だけ入力" /></label>
            <label>🏗 ライン<input value={productionLineName} onChange={(e) => setProductionLineName(e.target.value)} placeholder="必要な場合だけ入力" /></label>
            <button className="primaryButton" onClick={loadReports}>🔄 再読込</button>
          </div>
        </div>

        <div className="productionKpiGrid">
          <div className="productionKpi"><span>📝 保全報告書件数</span><strong>{totalReports.toLocaleString()}件</strong><small>保全修理報告書のみ</small></div>
          <div className="productionKpi"><span>⏰ 停止時間合計</span><strong>{formatHours(totalStopHours)}</strong><small>生産停止に直結する時間</small></div>
          <div className="productionKpi"><span>🛠 MTTR</span><strong>{formatHours(mttr)}</strong><small>1件あたり平均停止時間</small></div>
          <div className="productionKpi"><span>💴 保全費用合計</span><strong>{formatMoney(totalCost)}</strong><small>工数費 + 部品費</small></div>
          <div className="productionKpi"><span>🔥 突発保全</span><strong>{emergencyCount.toLocaleString()}件</strong><small>CM/修理系</small></div>
          <div className="productionKpi"><span>📅 計画保全</span><strong>{plannedCount.toLocaleString()}件</strong><small>報告書分類から集計</small></div>
        </div>

        <div className="tableWrap">
          <h2>🏭 設備別 停止時間ランキング</h2>
          <p>どの設備が一番長く止まっているかを、保全修理報告書の停止時間から集計します。</p>
          {machineRank.length === 0 && <p>保全修理報告書データがまだありません。</p>}
          {machineRank.slice(0, 10).map((item, index) => <Row key={item.key} item={item} index={index} max={maxMachineStop} />)}
        </div>

        <div className="tableWrap">
          <h2>⚠️ 保全原因ランキング</h2>
          <p>不具合現象・不具合箇所・なぜ1から、停止時間が大きい原因を整理します。</p>
          {reasonRank.slice(0, 10).map((item, index) => <Row key={item.key} item={item} index={index} max={maxReasonStop} />)}
        </div>

        <div className="machineBreakdownGrid">
          <div className="machineBreakdownCard">
            <h3>🔧 交換・故障部品 TOP</h3>
            {partRank.slice(0, 8).map((item) => <div className="machineMiniRow" key={item.key}><div><b>{item.key}</b><br /><small>停止 {formatHours(item.stopHours)} / 件数 {item.count}件</small></div><strong>{item.count}件</strong></div>)}
          </div>
          <div className="machineBreakdownCard">
            <h3>📅 月別 停止時間</h3>
            {monthlyRank.slice(0, 8).map((item) => <div className="machineMiniRow" key={item.key}><div><b>{item.key}</b><br /><small>費用 {formatMoney(item.cost)} / 件数 {item.count}件</small></div><strong>{formatHours(item.stopHours)}</strong></div>)}
          </div>
        </div>

        <div className="tableWrap aiDiagnosisBox">
          <h2>🤖 保全AIコメント</h2>
          <div className="aiAnswerBox">{machineRank[0]
            ? `最も停止時間が大きい設備は「${machineRank[0].key}」です。停止時間は ${formatHours(machineRank[0].stopHours)}、件数は ${machineRank[0].count}件です。まずこの設備の上位原因を計画工事に展開すると、突発対応を減らしやすくなります。`
            : "保全修理報告書を登録すると、停止時間・費用・設備ランキングを自動分析します。"}</div>
        </div>
      </>
    );
  }

  function renderCsvAnalysis() {
    const formatHours = (value) => `${Number(value || 0).toFixed(1)}H`;
    const cleanMachineName = (value) => cleanEquipmentName(value) || String(value || "NL自動機").trim() || "NL自動機";
    const periodOptions = [
      { key: "all", label: "全期間" },
      { key: "1m", label: "1ヶ月" },
      { key: "3m", label: "3ヶ月" },
      { key: "6m", label: "6ヶ月" },
      { key: "1y", label: "1年" },
    ];

    const getPeriodStartDate = () => {
      if (analyticsPeriod === "1m") return addDays(todayText(), -30);
      if (analyticsPeriod === "3m") return addDays(todayText(), -90);
      if (analyticsPeriod === "6m") return addDays(todayText(), -180);
      if (analyticsPeriod === "1y") return addDays(todayText(), -365);
      return "";
    };

    const periodStartDate = getPeriodStartDate();

    const csvRows = productionLogs.filter((log) => {
      const keyword = productionSearch.toLowerCase().trim();
      const machineKeyword = productionMachineName.toLowerCase().trim();
      const lineKeyword = productionLineName.toLowerCase().trim();
      const logDate = getCsvLogDate(log);

      if (periodStartDate && (!logDate || logDate < periodStartDate || logDate > todayText())) return false;

      const text = [log.machine, log.lineName, log.alarmNo, log.message, log.reason, log.solution, log.sourceFile].join(" ").toLowerCase();
      const machineText = [log.machine, log.equipment, log.equipmentName].join(" ").toLowerCase();
      const lineText = [log.lineName, log.line, log.machine].join(" ").toLowerCase();

      if (keyword && !keyword.split(/\s+/).every((word) => text.includes(word))) return false;
      if (machineKeyword && !machineKeyword.split(/\s+/).every((word) => machineText.includes(word))) return false;
      if (lineKeyword && !lineKeyword.split(/\s+/).every((word) => lineText.includes(word))) return false;
      return true;
    });

    const enriched = csvRows.map((log) => {
      const cls = classifyProductionIssue(log.message || log.reason || "");
      return {
        ...log,
        machine: cleanMachineName(log.machine || productionMachineName || "NL自動機"),
        date: getCsvLogDate(log),
        reason: log.reason || cls.reason,
        solution: log.solution || cls.solution,
        message: log.message || log.alarmMessage || "未入力",
      };
    });

    const by = (getter) => Object.values(enriched.reduce((acc, row) => {
      const key = getter(row) || "未入力";
      if (!acc[key]) acc[key] = { key, count: 0, latest: "", machines: {}, samples: [], solution: row.solution || "" };
      acc[key].count += 1;
      if (row.date > acc[key].latest) acc[key].latest = row.date;
      acc[key].machines[row.machine] = (acc[key].machines[row.machine] || 0) + 1;
      if (acc[key].samples.length < 3) acc[key].samples.push(row.message);
      return acc;
    }, {})).map((x) => ({ ...x, mainMachine: Object.entries(x.machines).sort((a,b)=>b[1]-a[1])[0]?.[0] || "-" })).sort((a, b) => b.count - a.count);

    const alarmRank = by((row) => row.message);
    const reasonRank = by((row) => row.reason);
    const machineRank = by((row) => row.machine);
    const monthlyRank = by((row) => (row.date || "日付なし").slice(0, 7));
    const total = enriched.length;
    const maxAlarm = Math.max(1, ...alarmRank.map((x) => x.count));
    const maxReason = Math.max(1, ...reasonRank.map((x) => x.count));
    const topRate = total > 0 && alarmRank[0] ? Math.round((alarmRank[0].count / total) * 100) : 0;

    const CsvRow = ({ item, index, max, color = "orange" }) => (
      <div className="productionDetailBarRow">
        <div className={`productionRankNo ${index < 3 ? "top" : ""}`}>{index + 1}</div>
        <div className="productionRankName"><b>{item.key}</b><small>主設備 {item.mainMachine} / 最新 {item.latest || "-"}</small></div>
        <div className="productionBarBg detail"><div className={`productionBarFill ${color}`} style={{ width: `${Math.min(100, (item.count / max) * 100)}%` }} /></div>
        <div className="productionRankValue">{Number(item.count || 0).toLocaleString()}<span>発生回数</span></div>
      </div>
    );

    return (
      <>
        <div className="tableWrap productionHero">
          <div className="header">
            <div>
              <h1>📉 CSV分析センター</h1>
              <p>この画面は <b>CSVアラームだけ</b> を使って、機械が止まる原因・アラーム回数・発生傾向を分析します。保全修理報告書の停止時間はここでは使いません。</p>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <label className="primaryButton" style={{ cursor: "pointer" }}>
                📥 CSV取込
                <input type="file" accept=".csv,.tsv,.txt" multiple onChange={handleProductionCsvUpload} style={{ display: "none" }} />
              </label>
              <button type="button" className="deleteButton" onClick={clearAllProductionLogs}>🗑 CSV全削除</button>
              <button type="button" className="primaryButton" onClick={loadProductionLogs}>🔄 再読込</button>
            </div>
          </div>
          <div className="productionTrendToolbar" style={{ marginTop: "16px" }}>
            {periodOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={analyticsPeriod === option.key ? "active" : ""}
                onClick={() => setAnalyticsPeriod(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p style={{ marginTop: "-6px" }}>対象期間：{periodStartDate ? `${periodStartDate} ～ ${todayText()}` : "全期間"}</p>
          <div className="productionControlGrid">
            <label>🏭 対象設備<input value={productionMachineName} onChange={(e) => setProductionMachineName(e.target.value)} placeholder="例：A05自動機 / TPS05 / 76-060" /></label>
            <label>🏗 ライン<input value={productionLineName} onChange={(e) => setProductionLineName(e.target.value)} placeholder="例：NLライン / 76-060" /></label>
            <label>🔍 検索・絞り込み<input value={productionSearch} onChange={(e) => setProductionSearch(e.target.value)} placeholder="例：センサー ピーススライド ロードセル" /></label>
            <button className="primaryButton" onClick={() => downloadTextFile(`MIYAMA_CSV分析_${todayText()}.csv`, "\ufeff" + [["区分","名称","発生回数","主設備","最新日"].map(makeCsvSafe).join(","), ...alarmRank.map((x)=>["アラーム",x.key,x.count,x.mainMachine,x.latest].map(makeCsvSafe).join(","))].join("\n"), "text/csv;charset=utf-8")}>⬇ CSV出力</button>
          </div>
        </div>

        <div className="productionKpiGrid">
          <div className="productionKpi"><span>🚨 CSVアラーム件数</span><strong>{total.toLocaleString()}件</strong><small>CSV取込データのみ</small></div>
          <div className="productionKpi"><span>🏆 最多アラーム</span><strong>{alarmRank[0]?.key || "-"}</strong><small>{alarmRank[0]?.count ? `${alarmRank[0].count}回 / ${topRate}%` : "データなし"}</small></div>
          <div className="productionKpi"><span>⚠️ 最多原因分類</span><strong>{reasonRank[0]?.key || "-"}</strong><small>{reasonRank[0]?.count ? `${reasonRank[0].count}回` : "データなし"}</small></div>
          <div className="productionKpi"><span>🏭 最多設備</span><strong>{machineRank[0]?.key || "-"}</strong><small>{machineRank[0]?.count ? `${machineRank[0].count}回` : "データなし"}</small></div>
        </div>

        <div className="tableWrap">
          <h2>🚨 アラーム別 TOP10</h2>
          <p>CSVに出ているアラームメッセージをそのまま集計します。機械が止まる直接の入口を見る画面です。</p>
          {alarmRank.length === 0 && <p>CSVデータがまだありません。右上のCSV取込からアップロードしてください。</p>}
          {alarmRank.slice(0, 10).map((item, index) => <CsvRow key={item.key} item={item} index={index} max={maxAlarm} color="red" />)}
        </div>

        <div className="tableWrap">
          <h2>⚠️ 停止原因分類 TOP10</h2>
          <p>アラーム文言から、センサー・詰まり・搬送・位置ズレなどに分類します。</p>
          {reasonRank.slice(0, 10).map((item, index) => <CsvRow key={item.key} item={item} index={index} max={maxReason} color="orange" />)}
        </div>

        <div className="machineBreakdownGrid">
          <div className="machineBreakdownCard"><h3>🏭 設備別 CSVアラーム</h3>{machineRank.slice(0, 8).map((item) => <div className="machineMiniRow" key={item.key}><div><b>{item.key}</b><br /><small>最新 {item.latest || "-"}</small></div><strong>{item.count}回</strong></div>)}</div>
          <div className="machineBreakdownCard"><h3>📅 月別 CSVアラーム</h3>{monthlyRank.slice(0, 8).map((item) => <div className="machineMiniRow" key={item.key}><div><b>{item.key}</b><br /><small>CSVアラーム件数</small></div><strong>{item.count}回</strong></div>)}</div>
        </div>

        <div className="tableWrap aiDiagnosisBox">
          <h2>🤖 CSV AIコメント</h2>
          <div className="aiAnswerBox">{alarmRank[0]
            ? `CSVでは「${alarmRank[0].key}」が一番多く、${alarmRank[0].count}回発生しています。全体の約${topRate}%です。まずこのアラームの発生設備「${alarmRank[0].mainMachine}」で、センサー位置・配線・ワーク詰まり・搬送タイミングを確認してください。`
            : "CSVを取込すると、アラーム別・原因別・設備別に停止原因を自動分析します。"}</div>
        </div>
      </>
    );
  }

  function renderAnalytics() {
    return renderMaintenanceAnalysis();
  }




  function normalizeProductionDate(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    // CSVの実データ日付だけを正規化します。アップロード日(createdAt/importedAt)は使いません。
    const monthMap = {
      Jan: "01", January: "01",
      Feb: "02", February: "02",
      Mar: "03", March: "03",
      Apr: "04", April: "04",
      May: "05",
      Jun: "06", June: "06",
      Jul: "07", July: "07",
      Aug: "08", August: "08",
      Sep: "09", Sept: "09", September: "09",
      Oct: "10", October: "10",
      Nov: "11", November: "11",
      Dec: "12", December: "12",
    };

    // 2026-Jun-19 / 2026/Jun/19 / 2026 Jun 19
    const english = text.match(/^(\d{4})[-\/\s]([A-Za-z]{3,9}|\d{1,2})[-\/\s](\d{1,2})/);
    if (english) {
      const mm = monthMap[english[2]] || String(english[2]).padStart(2, "0");
      return `${english[1]}-${mm}-${String(english[3]).padStart(2, "0")}`;
    }

    // 2026年6月19日
    const jp = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?/);
    if (jp) {
      return `${jp[1]}-${String(jp[2]).padStart(2, "0")}-${String(jp[3]).padStart(2, "0")}`;
    }

    // 2026/06/19 など
    return normalizeDateOnly(text);
  }

  function getCsvLogDate(log = {}) {
    // 期間フィルターは、アップロード日ではなくCSV内の実発生日だけで判定します。
    // 旧バージョンで保存された行にも対応するため、複数の候補から実日付を探します。
    return (
      normalizeProductionDate(log.csvRealDate) ||
      normalizeProductionDate(log.alarmDate) ||
      normalizeProductionDate(log.csvDate) ||
      normalizeProductionDate(log.date) ||
      normalizeProductionDate(log.rawDate) ||
      normalizeProductionDate(log.headerDate) ||
      ""
    );
  }

  function parseProductionCsvText(text, meta = {}) {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const headerIndex = lines.findIndex((line) => line.toLowerCase().includes("alarm no") && line.toLowerCase().includes("message"));
    if (headerIndex < 0) return [];

    const splitAlarmLine = (line) => {
      // PLCから出るCSV/TSVの両方に対応します。
      if (line.includes("\t")) return line.split("\t");
      return line.split(",");
    };

    // ファイル上部の DATE 行も読みます。行側の日付が空の場合だけ使います。
    // 例: DATE\t2026-Jun-19\t6:06:05
    const headerDateLine = lines.slice(0, headerIndex).find((line) => /^DATE[\t, ]/i.test(line));
    const headerDate = headerDateLine ? normalizeProductionDate(splitAlarmLine(headerDateLine)[1]) : "";

    return lines.slice(headerIndex + 1).map((line) => {
      const cols = splitAlarmLine(line);
      if (cols.length < 7) return null;
      const no = cols[0]?.trim();
      const rawDate = String(cols[1] || "").trim();
      const csvDate = normalizeProductionDate(rawDate) || headerDate;
      const time = String(cols[2] || "").trim();
      const alarmCountRaw = toNumber(cols[3], 0);
      const status = String(cols[4] || "").trim();
      const alarmNo = String(cols[5] || "").trim().padStart(3, "0");
      const message = cols.slice(6).join(line.includes("\t") ? " " : ",").trim();
      if (!message && !alarmNo) return null;
      if (!csvDate) return null;

      return {
        no,
        date: csvDate,
        alarmDate: csvDate,
        csvDate,
        rawDate: rawDate,
        headerDate,
        csvRealDate: csvDate,
        time,
        // PLCのCOUNTは累積値のため、画面の発生回数として合計しません。
        count: 1,
        alarmCountRaw,
        status,
        alarmNo,
        message,
        machine: meta.machine || productionMachineName || "NL自動機",
        lineName: meta.lineName || productionLineName || "NLライン",
        sourceFile: meta.sourceFile || "CSV取込",
        // importedAt はアップロード日時の記録だけです。期間フィルターには絶対に使いません。
        importedAt: todayText(),
      };
    }).filter((row) => row && row.date);
  }

  async function handleProductionCsvUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const existingSnap = await getDocs(collection(db, "productionLogs"));
    const existingKeys = new Set(existingSnap.docs.map((d) => makeProductionLogDuplicateKey(d.data())));

    let imported = 0;
    let duplicated = 0;
    let processed = 0;

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      let text = "";
      try {
        text = new TextDecoder("shift-jis").decode(buffer);
      } catch (err) {
        text = new TextDecoder("utf-8").decode(buffer);
      }
      const rows = parseProductionCsvText(text, {
        machine: productionMachineName,
        lineName: productionLineName,
        sourceFile: file.name,
      });
      for (const row of rows) {
        processed += 1;
        const duplicateKey = makeProductionLogDuplicateKey(row);
        if (!duplicateKey.replace(/\|/g, "") || existingKeys.has(duplicateKey)) {
          duplicated += 1;
          continue;
        }
        await addDoc(collection(db, "productionLogs"), { ...row, duplicateKey });
        existingKeys.add(duplicateKey);
        imported += 1;
      }
    }
    event.target.value = "";
    await loadProductionLogs();
    alert(`CSV取込完了
新規：${imported}件
重複スキップ：${duplicated}件
処理合計：${processed}件`);
  }

  function classifyProductionIssue(message = "") {
    const text = String(message || "").toLowerCase();

    // 重要：CSVアラームは「ピーススライド」など共通語が多いため、
    // 先に詰まり・センサー・クランプなどの意味で分類します。
    const rules = [
      { reason: "詰まり・供給不良", words: ["詰まり", "詰り", "つま", "未到着", "未到達", "供給", "供給不良", "フィーダ", "シュート", "リベット供給", "シュー未"], solution: "パーツフィーダ、シュート、ワーク通路、異物噛み込み、レール幅、部品姿勢を確認してください。" },
      { reason: "センサー検出異常", words: ["センサ", "センサー", "検出", "確認", "近接", "光電", "色判別", "ワーク判別"], solution: "センサー清掃、位置調整、配線・コネクタ、I/O入力状態、検出タイミングを確認してください。" },
      { reason: "搬送・クランプ異常", words: ["クランプ", "搬送", "ピーススライド搬送", "搬送クランプ", "スライダ搬送"], solution: "クランプ位置、シリンダ速度、センサー検出位置、摺動部の汚れ・摩耗を確認してください。" },
      { reason: "搬送・位置ズレ", words: ["位置", "ズレ", "ずれ", "ストッパ", "ガイド", "通過異常"], solution: "搬送ガイド、ワーク姿勢、ストッパ位置、シリンダ速度、タイミングを確認してください。" },
      { reason: "組立工程異常", words: ["組立", "assy", "ピン", "グリス", "かしめ", "ボルト"], solution: "ワーク姿勢、押し込み位置、ガイド摩耗、工程飛び、搬送タイミングを確認してください。" },
      { reason: "エア・シリンダ異常", words: ["シリンダ", "エア", "空圧", "圧力", "下降", "前進", "後退", "原点"], solution: "エア圧、スピコン、シリンダ動作速度、漏れ、原点復帰状態を確認してください。" },
      { reason: "安全窓・安全装置", words: ["安全窓", "安全", "扉", "カバー"], solution: "安全窓・扉スイッチ・カバー位置・配線・センサー状態を確認してください。" },
    ];
    return rules.find((rule) => rule.words.some((word) => text.includes(word))) || { reason: "その他・未分類", solution: "発生条件を保全報告書で確認し、同一アラームの発生傾向を見て対策を設定してください。" };
  }

  function getProductionAnalysis() {
    const keyword = productionSearch.toLowerCase().trim();
    const keywords = keyword ? keyword.split(/[\s　]+/).filter(Boolean) : [];
    const sourceLogs = productionLogs.filter((log) => {
      if (!keywords.length) return true;
      const text = [log.machine, log.lineName, log.date, log.time, log.alarmNo, log.message, log.status, log.sourceFile].join(" ").toLowerCase();
      return keywords.every((k) => text.includes(k));
    });

    const reportIssues = reports.map((r) => {
      const message = [r.phenomenon, r.troublePoint, r.why1, r.why2, r.why3, r.action].filter(Boolean).join(" ");
      const cls = classifyProductionIssue(message);
      return {
        source: "保全報告書",
        date: normalizeDateOnly(r.createdAt || r.troubleDateTime || r.workStartDateTime),
        machine: r.equipment || r.lineName || "設備名なし",
        alarmNo: "報告書",
        message,
        count: 1,
        status: r.approvalStatus || "報告",
        reason: cls.reason,
        solution: cls.solution,
        reportId: r.id,
      };
    }).filter((r) => r.message);

    const logs = sourceLogs.map((log) => {
      const cls = classifyProductionIssue(log.message);
      return { ...log, source: "CSVアラーム", reason: cls.reason, solution: cls.solution };
    });

    function groupBy(keyGetter) {
      const map = {};
      logs.forEach((item) => {
        const key = keyGetter(item) || "未入力";
        if (!map[key]) map[key] = { key, count: 0, events: 0, latest: "", samples: [], machines: {}, reason: item.reason, solution: item.solution, alarmNo: item.alarmNo };
        map[key].count += Number(item.count || 1);
        map[key].events += 1;
        const machineKey = cleanMachineName(item.machine || "設備未設定");
        map[key].machines[machineKey] = (map[key].machines[machineKey] || 0) + 1;
        if (item.date && item.date > map[key].latest) map[key].latest = item.date;
        if (map[key].samples.length < 3 && item.message) map[key].samples.push(item.message);
      });
      return Object.values(map).map((item) => ({
        ...item,
        mainMachine: Object.entries(item.machines).sort((a, b) => b[1] - a[1])[0]?.[0] || "-",
      }));
    }

    const alarmRanking = groupBy((x) => `${x.alarmNo} ${x.message}`).sort((a, b) => b.count - a.count || b.events - a.events);
    const reasonRanking = groupBy((x) => x.reason).sort((a, b) => b.count - a.count || b.events - a.events);
    const machineRanking = groupBy((x) => x.machine).sort((a, b) => b.count - a.count || b.events - a.events);
    const dayRanking = groupBy((x) => x.date).sort((a, b) => String(a.key).localeCompare(String(b.key)));
    const reportMatches = reportIssues.filter((r) => {
      if (!keywords.length) return true;
      const t = [r.machine, r.message, r.reason].join(" ").toLowerCase();
      return keywords.some((k) => t.includes(k));
    });

    return { logs, alarmRanking, reasonRanking, machineRanking, dayRanking, reportMatches };
  }

  async function createPlannedWorkFromProduction(issue) {
    const title = `生産阻害対策：${String(issue.key || issue.reason || "設備問題").slice(0, 34)}`;
    const detail = [
      `発生件数：${issue.count || issue.events || 0}`,
      `主設備：${cleanMachineName(issue.mainMachine || productionMachineName || "-")}`,
      `分類：${issue.reason || issue.key || "-"}`,
      `内容：${(issue.samples || [issue.message]).filter(Boolean).join(" / ")}`,
      `推奨対策：${issue.solution || "原因確認後、恒久対策を設定"}`,
    ].join("\n");
    const work = {
      ...createBlankPlannedWork(todayText()),
      title,
      equipment: cleanMachineName(issue.mainMachine || productionMachineName || ""),
      purpose: "生産阻害要因の改善",
      detail,
      owner: "",
      status: "計画中",
      progress: 0,
      risk: "同一アラーム再発・停止時間増加",
      note: "生産状況ページから自動作成",
    };
    const docRef = await addDoc(collection(db, "plannedWorks"), work);
    await addDoc(collection(db, "calendar"), {
      date: work.date,
      time: "",
      title: `計画工事：${work.title}`,
      detail: work.detail,
      owner: work.owner,
      importance: "重要",
      category: "計画工事",
      plannedWorkId: docRef.id,
      image: "",
    });
    await Promise.all([loadPlannedWorks(), loadCalendar()]);
    setPage("work");
    alert("計画工事へ展開しました。カレンダーにも登録しました。");
  }

  function renderProductionCondition() {
    const normalizeKey = (value) => String(value || "").trim() || "未入力";
    const cleanMachineName = (value) => {
      const raw = String(value || "").trim();

      // CSVに設備名が入っていない場合でも、画面上で「設備未設定」と出さず、
      // このラインの標準設備名として表示します。
      if (!raw || raw === "設備未設定" || raw === "未設定" || raw === "未入力" || raw === "-") {
        return "NL自動機";
      }

      const parts = raw.split(/[\/／]/).map((x) => x.trim()).filter(Boolean);
      const name = (parts.length ? parts[parts.length - 1] : raw)
        .replace(/自働/g, "自動")
        .replace(/設備未設定/g, "NL自動機")
        .replace(/未設定/g, "NL自動機")
        .replace(/未入力/g, "NL自動機")
        .replace(/\s+/g, " ")
        .trim();

      return name || "NL自動機";
    };
    const normalizeMachineKey = (value) => cleanMachineName(value);
    const formatHours = (value) => `${Number(value || 0).toFixed(1)}H`;
    const formatMoney = (value) => `¥${Number(value || 0).toLocaleString()}`;


    function csvOccurrenceBucket(date = "", time = "") {
      const d = normalizeProductionDate(date);
      const t = String(time || "00:00").trim();
      const m = t.match(/^(\d{1,2}):(\d{1,2})/);
      if (!d || !m) return `${d || "日付なし"}|時刻なし`;
      const hour = String(m[1]).padStart(2, "0");
      const minute = Math.floor(Number(m[2] || 0) / 5) * 5;
      return `${d}|${hour}:${String(minute).padStart(2, "0")}`;
    }

    function makeCsvOccurrenceKey(item) {
      return [
        normalizeProductionDate(item.date),
        cleanMachineName(item.machine || item.lineName || "NL自動機"),
        item.alarmNo || "-",
        item.reason || "未分類",
        csvOccurrenceBucket(item.date, item.time),
      ].join("|");
    }
    const trendTitleMap = {
      hour: "時間別",
      day: "日別",
      month: "月別",
      year: "年別",
    };

    function reportDate(report) {
      return normalizeDateOnly(report.createdAt || report.troubleDateTime || report.workStartDateTime || report.reportCreatedDate);
    }

    function periodKeyFromDate(date = "", time = "", mode = productionTrendMode) {
      const d = normalizeDateOnly(date);
      if (!d) return "日付なし";
      if (mode === "hour") {
        const h = String(time || "00:00").slice(0, 2).padStart(2, "0");
        return `${d} ${h}:00`;
      }
      if (mode === "month") return d.slice(0, 7);
      if (mode === "year") return d.slice(0, 4);
      return d;
    }

    function labelFromPeriod(key) {
      if (!key) return "-";
      if (productionTrendMode === "hour") return key.replace(/^\d{4}-/, "");
      if (productionTrendMode === "day") return key.slice(5);
      return key;
    }

    function classifyMaintenanceLike(text = "") {
      const cls = classifyProductionIssue(text);
      if (cls?.reason && cls.reason !== "その他・未分類") return cls;
      const t = String(text || "").toLowerCase();
      const rules = [
        { reason: "センサー・検出異常", words: ["センサー", "センサ", "検出", "近接", "光電", "リミット"], solution: "センサー清掃、位置調整、I/O確認、配線・コネクタ確認を実施してください。" },
        { reason: "搬送・位置ズレ", words: ["搬送", "ズレ", "ずれ", "位置", "ワーク", "ガイド", "シュート"], solution: "搬送ガイド、ワーク姿勢、シリンダ速度、ストッパ位置、タイミングを確認してください。" },
        { reason: "詰まり・供給不良", words: ["詰まり", "供給", "フィーダ", "パーツフィーダ", "未到着"], solution: "パーツフィーダ、レール幅、シュート、異物噛み込み、ワーク流れを確認してください。" },
        { reason: "摩耗・破損", words: ["摩耗", "破損", "割れ", "欠け", "折れ", "劣化"], solution: "摩耗部品の保全サイクル見直し、定期点検化、予備品登録を実施してください。" },
        { reason: "電気・配線異常", words: ["電気", "配線", "断線", "接触", "電源", "端子", "リレー"], solution: "端子増し締め、配線導通、I/O、リレー・電源電圧を確認してください。" },
      ];
      return rules.find((r) => r.words.some((w) => t.includes(w))) || { reason: "その他・未分類", solution: "発生条件、再現性、過去履歴を確認し、重点監視または計画工事へ展開してください。" };
    }

    const keywordText = productionSearch.toLowerCase().trim();
    const keywords = keywordText ? keywordText.split(/[\s　、。,.]+/).filter(Boolean) : [];
    const matchKeywords = (item) => {
      if (!keywords.length) return true;
      const target = [item.source, item.date, item.time, item.machine, item.lineName, item.alarmNo, item.title, item.message, item.reason, item.solution, item.action, item.status].filter(Boolean).join(" ").toLowerCase();
      return keywords.every((k) => target.includes(k));
    };

    function productionTimeToMinutes(time = "") {
      const m = String(time || "").trim().match(/^(\d{1,2}):(\d{1,2})/);
      if (!m) return null;
      return Number(m[1]) * 60 + Number(m[2]);
    }

    function buildCsvStopSessions(rows = []) {
      // CSVは1回の停止で複数アラームが連続して出るため、
      // 同じ設備・同じ日に10分以内で続くアラームは「1回の停止」としてまとめます。
      const sorted = [...rows].sort((a, b) => {
        const ad = `${a.date || ""} ${a.time || ""}`;
        const bd = `${b.date || ""} ${b.time || ""}`;
        return ad.localeCompare(bd);
      });

      const sessions = [];
      sorted.forEach((item) => {
        const minutes = productionTimeToMinutes(item.time);
        const machine = cleanMachineName(item.machine || item.lineName || "NL自動機");
        const last = sessions[sessions.length - 1];
        const sameSession =
          last &&
          last.date === item.date &&
          last.machine === machine &&
          minutes !== null &&
          last.lastMinutes !== null &&
          minutes - last.lastMinutes >= 0 &&
          minutes - last.lastMinutes <= 10;

        if (!sameSession) {
          sessions.push({
            ...item,
            machine,
            count: 1,
            alarmRows: 1,
            alarmNos: { [item.alarmNo || "-"]: 1 },
            reasons: { [item.reason || "その他・未分類"]: 1 },
            samples: item.message ? [item.message] : [],
            firstTime: item.time || "",
            lastTime: item.time || "",
            latest: item.time || "",
            lastMinutes: minutes,
          });
          return;
        }

        last.alarmRows += 1;
        last.alarmNos[item.alarmNo || "-"] = (last.alarmNos[item.alarmNo || "-"] || 0) + 1;
        last.reasons[item.reason || "その他・未分類"] = (last.reasons[item.reason || "その他・未分類"] || 0) + 1;
        if (item.message && last.samples.length < 5 && !last.samples.includes(item.message)) last.samples.push(item.message);
        last.lastTime = item.time || last.lastTime;
        last.latest = item.time || last.latest;
        last.lastMinutes = minutes;
        last.message = last.samples[0] || last.message;
        last.title = `${Object.entries(last.alarmNos).sort((a, b) => b[1] - a[1])[0]?.[0] || ""} ${last.message || "アラーム"}`.trim();
        last.reason = Object.entries(last.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || last.reason;
      });

      return sessions.map((session, index) => ({
        ...session,
        id: `${session.id || "csv-session"}-${index}`,
        count: 1,
        occurrenceCount: 1,
        alarmRows: Number(session.alarmRows || 1),
        alarmRowsLabel: `${Number(session.alarmRows || 1).toLocaleString()}件アラーム`,
        alarmNo: Object.entries(session.alarmNos || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || session.alarmNo || "-",
        mainAlarm: Object.entries(session.alarmNos || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || session.alarmNo || "-",
        mainReason: Object.entries(session.reasons || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || session.reason || "その他・未分類",
        reason: Object.entries(session.reasons || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || session.reason || "その他・未分類",
        message: session.samples?.[0] || session.message || "",
      }));
    }

    const rawCsvItems = productionLogs.map((log) => {
      const message = log.message || log.MESSAGE || "";
      const cls = classifyProductionIssue(message);
      // 重要：今日/昨日/今週の判定はCSVの「行の日付」を最優先します。
      // 過去バージョンで date/alarmDate/csvDate にアップロード日が入ったデータが残っていても、
      // rawDate / DATE があればそちらを使い、createdAt / importedAt / uploadedAt は絶対に使いません。
      const date = normalizeProductionDate(
        log.rawDate ||
        log.DATE ||
        log["DATE"] ||
        log.alarmDate ||
        log.csvDate ||
        log.date ||
        ""
      );
      const alarmNoRaw = log.alarmNo || log.ALARMNo || log["ALARM No"] || "-";
      const alarmNo = String(alarmNoRaw || "-").trim().padStart(String(alarmNoRaw || "").trim() && /^\d+$/.test(String(alarmNoRaw).trim()) ? 3 : 1, "0");
      return {
        source: "CSVアラーム",
        id: `csv-${log.id || log.no || Math.random()}`,
        date,
        time: log.time || log.TIME || "",
        machine: cleanMachineName(log.machine || productionMachineName || "NL自動機"),
        lineName: log.lineName || productionLineName || "NLライン",
        alarmNo,
        title: `${alarmNo || ""} ${message || "アラーム"}`.trim(),
        message,
        count: 1,
        alarmCountRaw: toNumber(log.alarmCountRaw ?? log.count, 0),
        stopHours: 0,
        repairHours: 0,
        totalCost: 0,
        reason: cls.reason,
        solution: cls.solution,
        action: "保全報告書・過去トラを確認し、再発条件を整理してください。",
        status: log.status || "CSV",
        raw: log,
      };
    }).filter((item) => item.date);

    const csvItems = buildCsvStopSessions(rawCsvItems);

    const reportItems = reports.map((report) => {
      const calc = calculateReport(report);
      const message = [report.phenomenon, report.troublePoint, report.why1, report.why2, report.why3].filter(Boolean).join(" / ");
      const action = [report.action, report.recurrencePrevention, report.outflowPrevention].filter(Boolean).join(" / ");
      const cls = classifyMaintenanceLike(`${message} ${action} ${report.note || ""}`);
      const date = reportDate(report);
      return {
        source: "保全報告書",
        id: `report-${report.id}`,
        reportId: report.id,
        date,
        time: String(report.workStartDateTime || report.troubleDateTime || "").slice(11, 16),
        machine: cleanMachineName(report.equipment || report.lineName || "設備名なし"),
        lineName: report.lineName || report.groupName || "ライン未入力",
        alarmNo: "報告書",
        title: report.phenomenon || report.troublePoint || report.action || "保全報告書",
        message: message || action || report.note || "内容未入力",
        count: 1,
        stopHours: Number(calc.stopTimeHours || report.stopTimeHours || 0),
        repairHours: hoursBetween(report.workStartDateTime, report.workEndDateTime),
        totalCost: Number(calc.totalCost || report.totalCost || 0),
        reason: cls.reason,
        solution: cls.solution,
        action: action || "処置内容未入力",
        status: report.approvalStatus || "報告書",
        raw: report,
      };
    });

    const allItems = [...csvItems, ...reportItems].filter(matchKeywords);
    const csvFiltered = csvItems.filter(matchKeywords);
    const reportFiltered = reportItems.filter(matchKeywords);

    function groupItems(keyGetter) {
      const map = {};
      allItems.forEach((item) => {
        const key = normalizeKey(keyGetter(item));
        if (!map[key]) {
          map[key] = {
            key,
            count: 0,
            events: 0,
            csvCount: 0,
            reportCount: 0,
            stopHours: 0,
            repairHours: 0,
            totalCost: 0,
            machines: {},
            reasons: {},
            alarms: {},
            alarmRows: 0,
            samples: [],
            actions: [],
            solutions: [],
            latest: "",
          };
        }
        const g = map[key];
        if (!g._occurrenceKeys) g._occurrenceKeys = new Set();
        const occurrenceKey = item.source === "CSVアラーム" ? (item.occurrenceKey || item.id) : item.id;
        const isNewOccurrence = !g._occurrenceKeys.has(occurrenceKey);
        if (isNewOccurrence) g._occurrenceKeys.add(occurrenceKey);
        const count = isNewOccurrence ? 1 : 0;
        g.count += count;
        g.events += 1;
        if (item.source === "CSVアラーム") {
          g.csvCount += count;
          g.alarmRows += Number(item.alarmRows || 1);
        }
        if (item.source === "保全報告書") g.reportCount += count;
        g.stopHours += Number(item.stopHours || 0);
        g.repairHours += Number(item.repairHours || 0);
        g.totalCost += Number(item.totalCost || 0);
        const machineKey = cleanMachineName(item.machine || item.lineName || "NL自動機");
        g.machines[machineKey] = (g.machines[machineKey] || 0) + count;
        g.reasons[item.reason] = (g.reasons[item.reason] || 0) + count;
        g.alarms[item.alarmNo || "-"] = (g.alarms[item.alarmNo || "-"] || 0) + count;
        if (item.message && g.samples.length < 5) g.samples.push(item.message);
        if (item.action && item.action !== "処置内容未入力" && g.actions.length < 4) g.actions.push(item.action);
        if (item.solution && g.solutions.length < 3) g.solutions.push(item.solution);
        if (item.date && item.date > g.latest) g.latest = item.date;
      });
      return Object.values(map).map((g) => {
        const { _occurrenceKeys, ...plain } = g;
        return {
        ...plain,
        stopHours: Number(g.stopHours.toFixed(2)),
        repairHours: Number(g.repairHours.toFixed(2)),
        totalCost: Math.round(g.totalCost),
        mainMachine: Object.entries(g.machines).sort((a, b) => b[1] - a[1])[0]?.[0] || "-",
        mainReason: Object.entries(g.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || "-",
        mainAlarm: Object.entries(g.alarms).sort((a, b) => b[1] - a[1])[0]?.[0] || "-",
        solution: [...new Set(g.solutions)].filter(Boolean)[0] || "発生条件を確認し、計画工事または再発防止へ展開してください。",
      };
      });
    }

    const machineRank = groupItems((x) => normalizeMachineKey(x.machine)).sort((a, b) => b.stopHours - a.stopHours || b.count - a.count);
    const reasonRank = groupItems((x) => x.reason).sort((a, b) => b.stopHours - a.stopHours || b.count - a.count);
    const alarmRank = groupItems((x) => `${x.alarmNo} ${x.title || x.message}`).sort((a, b) => b.count - a.count || b.stopHours - a.stopHours);
    const trendRank = groupItems((x) => periodKeyFromDate(x.date, x.time)).sort((a, b) => String(a.key).localeCompare(String(b.key)));
    const problemRank = groupItems((x) => x.title || x.message).sort((a, b) => b.count - a.count || b.stopHours - a.stopHours);
    const actionHistory = reportFiltered.filter((x) => x.action && x.action !== "処置内容未入力").slice(0, 10);

    const totalCount = new Set(csvFiltered.map((x) => x.occurrenceKey || x.id)).size;
    const totalStop = reportFiltered.reduce((sum, x) => sum + Number(x.stopHours || 0), 0);
    const totalRepair = reportFiltered.reduce((sum, x) => sum + Number(x.repairHours || 0), 0);
    const totalCost = reportFiltered.reduce((sum, x) => sum + Number(x.totalCost || 0), 0);
    const mttr = totalRepair / Math.max(1, reportFiltered.length);
    const topMachine = machineRank[0];
    const topReason = reasonRank[0];
    const urgentProblems = reasonRank.filter((x) => x.count >= 5 || x.stopHours >= 1 || x.reportCount >= 2).length;
    const maxTrend = Math.max(1, ...trendRank.map((x) => x.count + x.stopHours * 10));
    const maxMachine = Math.max(1, ...machineRank.map((x) => x.count + x.stopHours * 10));
    const maxReason = Math.max(1, ...reasonRank.map((x) => x.count + x.stopHours * 10));
    const maxAlarm = Math.max(1, ...alarmRank.map((x) => x.count));

    function getProductionDailyRange() {
      const now = parseLocalDate(todayText()) || new Date();
      const makeRange = (start, end) => ({ start: toLocalDateText(start), end: toLocalDateText(end) });

      if (productionDailyPeriod === "yesterday") {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return makeRange(d, d);
      }

      if (productionDailyPeriod === "week") {
        const start = new Date(now);
        const day = start.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        start.setDate(start.getDate() + diffToMonday);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return makeRange(start, end);
      }

      if (productionDailyPeriod === "month") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return makeRange(start, end);
      }

      if (productionDailyPeriod === "year") {
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now.getFullYear(), 11, 31);
        return makeRange(start, end);
      }

      if (productionDailyPeriod === "custom") {
        return {
          start: productionDailyStart || todayText(),
          end: productionDailyEnd || productionDailyStart || todayText(),
        };
      }

      return { start: todayText(), end: todayText() };
    }

    const dailyRange = getProductionDailyRange();
    const dailyPeriodLabelMap = {
      today: "今日",
      yesterday: "昨日",
      week: "今週",
      month: "今月",
      year: "今年",
      custom: "任意期間",
    };
    const dailyPeriodLabel = dailyPeriodLabelMap[productionDailyPeriod] || "今日";
    const dailyMachineOptions = [...new Set(
      allItems
        .map((item) => cleanMachineName(item.machine || item.lineName || "設備未設定"))
        .filter((name) => name && name !== "未入力" && name !== "設備未設定")
    )].sort((a, b) => a.localeCompare(b, "ja"));

    const todayItemsBase = allItems.filter((item) => {
      const d = normalizeProductionDate(item.date);
      return d && d >= dailyRange.start && d <= dailyRange.end;
    });

    const todayItems = todayItemsBase.filter((item) => {
      if (productionDailyMachine === "all") return true;
      return cleanMachineName(item.machine || item.lineName || "設備未設定") === productionDailyMachine;
    });

    const todayMachineMap = {};
    todayItems.forEach((item) => {
      const key = cleanMachineName(item.machine || item.lineName || "設備未設定");
      if (!todayMachineMap[key]) {
        todayMachineMap[key] = { key, count: 0, stopHours: 0, totalCost: 0, alarmRows: 0, reasons: {}, latest: "" };
      }
      const row = todayMachineMap[key];
      if (!row._occurrenceKeys) row._occurrenceKeys = new Set();
      const occurrenceKey = item.source === "CSVアラーム" ? (item.occurrenceKey || item.id) : item.id;
      const isNewOccurrence = !row._occurrenceKeys.has(occurrenceKey);
      if (isNewOccurrence) row._occurrenceKeys.add(occurrenceKey);
      const count = isNewOccurrence ? 1 : 0;
      row.count += count;
      row.alarmRows += Number(item.alarmRows || (item.source === "CSVアラーム" ? 1 : 0));
      row.stopHours += Number(item.stopHours || 0);
      row.totalCost += Number(item.totalCost || 0);
      row.reasons[item.reason || "未分類"] = (row.reasons[item.reason || "未分類"] || 0) + count;
      if (item.time && item.time > row.latest) row.latest = item.time;
    });
    const todayMachineRank = Object.values(todayMachineMap)
      .map((row) => {
        const { _occurrenceKeys, ...plain } = row;
        return {
        ...plain,
        mainReason: Object.entries(row.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || "-",
      };
      })
      .sort((a, b) => b.count - a.count || b.stopHours - a.stopHours)
      .slice(0, 10);
    const todayMaxCount = Math.max(1, ...todayMachineRank.map((x) => Number(x.count || 0)));

    const suddenRepairCount = reportFiltered.filter((report) => {
      const text = `${report.maintenanceType || ""} ${report.reportType || ""} ${report.title || ""} ${report.note || ""}`;
      return !text.includes("計画") && !text.includes("定期");
    }).length;
    const plannedWorkCount = plannedWorks.length;
    const completedPlannedWorkCount = plannedWorks.filter((work) => String(work.status || "").includes("完了")).length;
    const recurringProblemCount = reasonRank.filter((item) => item.reportCount >= 2 || item.count >= 3).length;
    const plannedRate = Math.round((plannedWorkCount / Math.max(1, plannedWorkCount + suddenRepairCount)) * 100);
    const maintenanceMaturity = plannedRate >= 75
      ? "Level 4 AI予知保全"
      : plannedRate >= 50
        ? "Level 3 計画保全"
        : plannedRate >= 25
          ? "Level 2 改善活動"
          : "Level 1 突発対応";
    const chronicThemes = reasonRank
      .filter((item) => item.count >= 2 || item.stopHours >= 1 || item.reportCount >= 1)
      .slice(0, 4);

    function starText(level = 1) {
      const n = Math.max(1, Math.min(5, Number(level || 1)));
      return "★".repeat(n) + "☆".repeat(5 - n);
    }

    function impactLevel(item = {}) {
      const count = Number(item.count || 0);
      const hours = Number(item.stopHours || 0);
      const reports = Number(item.reportCount || 0);
      if (hours >= 10 || count >= 6 || reports >= 6) return 5;
      if (hours >= 5 || count >= 4 || reports >= 4) return 4;
      if (hours >= 2 || count >= 2 || reports >= 2) return 3;
      return 2;
    }

    function priorityLevel(item = {}) {
      const impact = impactLevel(item);
      const repeat = Number(item.count || 0) >= 3 || Number(item.reportCount || 0) >= 2 ? 1 : 0;
      return Math.max(1, Math.min(5, impact + repeat));
    }

    function estimatedRepeatCount(item = {}) {
      const count = Math.max(0, Number(item.count || 0));
      const reports = Math.max(0, Number(item.reportCount || 0));
      if (reports >= 2) return Math.max(0, reports - 1);
      return Math.max(0, Math.min(count - 1, Math.round(count * 0.7)));
    }

    const topStopReasonsByHours = sortByRankMode(reasonRank, "hours").slice(0, 5);
    const maxStopReasonHours = Math.max(1, ...topStopReasonsByHours.map((x) => Number(x.stopHours || 0)));

    const makeScore = (x) => Number((x.count + x.stopHours * 10 + x.reportCount * 3).toFixed(1));

    const rankModeInfo = {
      count: { label: "発生回数", unit: "回", icon: "🔴", help: "CSVアラームと保全報告書の発生件数です。多いほど繰り返し止めている問題です。" },
      hours: { label: "停止時間", unit: "H", icon: "⏰", help: "保全報告書から集計した停止時間です。長いほど生産への影響が大きい問題です。" },
      reports: { label: "報告書件数", unit: "件", icon: "📝", help: "保全修理報告書として残っている件数です。過去処置と再発傾向を確認します。" },
      repeat: { label: "再発回数", unit: "回", icon: "🔁", help: "同じ系統の問題が繰り返し出ている回数です。計画工事へ変えるべきテーマを見つけます。" },
    };

    function getRankValue(x, mode = productionRankMode) {
      if (mode === "hours") return Number(x.stopHours || 0);
      if (mode === "reports") return Number(x.reportCount || 0);
      if (mode === "repeat") return estimatedRepeatCount(x);
      return Number(x.count || 0);
    }

    function formatRankValue(value, mode = productionRankMode) {
      if (mode === "hours") return `${Number(value || 0).toFixed(1)}H`;
      return `${Number(value || 0).toLocaleString()}${rankModeInfo[mode]?.unit || ""}`;
    }

    function sortByRankMode(list, mode = productionRankMode) {
      return [...list].sort((a, b) => getRankValue(b, mode) - getRankValue(a, mode) || b.stopHours - a.stopHours || b.count - a.count);
    }

    function rankDescription(mode = productionRankMode) {
      const info = rankModeInfo[mode] || rankModeInfo.count;
      return `${info.icon} ${info.label}順で表示中。${info.help} 棒グラフ右側の単位は「${info.unit}」です。`;
    }

    const selectedMachineRank = productionSelectedMachine === "all" ? machineRank : machineRank.filter((x) => normalizeMachineKey(x.key) === productionSelectedMachine);
    const machineFilteredItems = productionSelectedMachine === "all" ? allItems : allItems.filter((x) => normalizeMachineKey(x.machine) === productionSelectedMachine);
    const machineReasonRank = groupItems((x) => x.reason).filter((g) => productionSelectedMachine === "all" || machineFilteredItems.some((i) => normalizeKey(i.reason) === g.key)).sort((a, b) => getRankValue(b) - getRankValue(a));
    const sortedMachineRank = sortByRankMode(selectedMachineRank);
    const sortedReasonRank = sortByRankMode(reasonRank);
    const sortedAlarmRank = sortByRankMode(alarmRank, productionRankMode === "hours" || productionRankMode === "reports" || productionRankMode === "repeat" ? productionRankMode : "count");
    const rankSource = productionRankTarget === "reason" ? sortedReasonRank : productionRankTarget === "alarm" ? sortedAlarmRank : sortedMachineRank;
    const maxRankValue = Math.max(1, ...rankSource.map((x) => getRankValue(x)));

    function aiAnswerForProduction(questionText = productionAiQuestion) {
      const q = String(questionText || "").trim();
      if (!q) {
        setProductionAiAnswer("質問を入力してください。例：一番生産を止めている設備は？ / センサー異常の対策は？ / 似ている保全報告書を見せて");
        return;
      }
      const qKeys = q.toLowerCase().split(/[\s　、。,.]+/).filter(Boolean);
      const related = allItems
        .map((item) => {
          const text = [item.machine, item.lineName, item.alarmNo, item.title, item.message, item.reason, item.action, item.solution].join(" ").toLowerCase();
          const hit = qKeys.filter((k) => text.includes(k)).length;
          return { ...item, hit };
        })
        .filter((item) => item.hit > 0)
        .sort((a, b) => b.hit - a.hit || b.stopHours - a.stopHours || b.count - a.count);
      const base = related.length ? related : allItems.slice().sort((a, b) => (b.stopHours + b.count) - (a.stopHours + a.count)).slice(0, 8);
      const relatedReasons = groupItems((x) => x.reason).filter((g) => base.some((i) => i.reason === g.key)).sort((a, b) => makeScore(b) - makeScore(a));
      const r0 = relatedReasons[0] || topReason;
      const similarReports = reportFiltered.filter((r) => !r0 || r.reason === r0.key || qKeys.some((k) => [r.machine, r.message, r.action].join(" ").toLowerCase().includes(k))).slice(0, 5);
      const answer = [
        "🤖 生産・停止要因AI 分析結果",
        "",
        `質問：${q}`,
        "",
        `最優先テーマ：${r0?.key || "-"}`,
        `影響度：COUNT ${r0?.count || 0} / 停止 ${formatHours(r0?.stopHours || 0)} / 報告書 ${r0?.reportCount || 0}件`,
        `主設備：${cleanMachineName(r0?.mainMachine || "-")}`,
        "",
        "推定原因：",
        `・${r0?.samples?.[0] || "CSVアラームと保全報告書の発生傾向を確認してください。"}`,
        "",
        "推奨対策：",
        `・${r0?.solution || "発生条件を確認し、暫定対策と恒久対策を分けて管理してください。"}`,
        "・同じ原因の保全報告書を確認し、処置内容を標準化してください。",
        "・COUNTが多い場合は計画工事へ展開し、完了日と担当者を設定してください。",
        "",
        "似ている過去対応：",
        ...(similarReports.length ? similarReports.map((r, i) => `${i + 1}. ${r.date || "日付なし"} / ${r.machine} / ${r.message} / 処置：${r.action || "未入力"}`) : ["・該当する保全報告書はまだ少ないため、今回の処置を必ず報告書へ残してください。"]),
      ].join("\n");
      setProductionAiAnswer(answer);
    }

    function BarRow({ label, value, max, sub, color = "blue" }) {
      const pct = Math.min(100, Math.round((Number(value || 0) / Math.max(1, Number(max || 1))) * 100));
      const cls = color === "red" ? "red" : color === "orange" ? "orange" : "";
      return (
        <div className="productionBarRow" style={{ gridTemplateColumns: "260px 1fr 130px" }}>
          <div><b>{label}</b><br /><small>{sub}</small></div>
          <div className="productionBarBg"><div className={`productionBarFill ${cls}`} style={{ width: `${pct}%` }} /></div>
          <strong>{value}</strong>
        </div>
      );
    }

    function DetailedRankRow({ item, index, max, color = "red", target = productionRankTarget }) {
      const value = getRankValue(item);
      const pct = Math.min(100, Math.round((Number(value || 0) / Math.max(1, Number(max || 1))) * 100));
      const cls = color === "red" ? "red" : color === "orange" ? "orange" : "";
      const name = item.key || "未分類";
      const targetLabel = target === "reason" ? "停止要因" : target === "alarm" ? "アラーム" : "設備";
      return (
        <div className="productionDetailBarRow">
          <div className={`productionRankNo ${index < 3 ? "top" : ""}`}>No.{index + 1}</div>
          <div className="productionRankName">
            <b>{name}</b>
            <small>{targetLabel}別 / 主設備 {cleanMachineName(item.mainMachine || name)} / 主因 {item.mainReason || "-"}</small>
            <div className="productionRankChips">
              <span className="productionRankChip">🔴 停止回数 {Number(item.count || 0).toLocaleString()}回</span>
              <span className="productionRankChip">⏰ 停止 {formatHours(item.stopHours || 0)}</span>
              <span className="productionRankChip">📝 報告書 {item.reportCount || 0}件</span>
              <span className="productionRankChip">🔁 再発 {estimatedRepeatCount(item)}回</span>
              <span className="productionRankChip">⭐ 優先度 {starText(priorityLevel(item))}</span>
            </div>
          </div>
          <div className="productionBarBg detail"><div className={`productionBarFill ${cls}`} style={{ width: `${pct}%` }} /></div>
          <div className="productionRankValue">{formatRankValue(value)}<span>{rankModeInfo[productionRankMode]?.label || "値"}</span></div>
        </div>
      );
    }

    return (
      <>
        <div className="tableWrap productionHero">
          <div className="header">
            <div>
              <h1>📊 生産分析・改善AIセンター</h1>
              <p>CSVアラーム、保全修理報告書、計画工事を1つに統合し、突発対応を減らすための原因・停止時間・改善優先度を見える化します。</p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <label className="primaryButton" style={{ cursor: "pointer" }}>
                📥 CSV取込
                <input type="file" accept=".csv" multiple onChange={handleProductionCsvUpload} style={{ display: "none" }} />
              </label>
              <button type="button" className="deleteButton" onClick={clearAllProductionLogs}>🗑 CSV全削除</button>
              <button type="button" className="primaryButton" onClick={loadProductionLogs}>🔄 再読込</button>
            </div>
          </div>
          <div className="productionControlGrid">
            <label>🏭 対象設備<input value={productionMachineName} onChange={(e) => setProductionMachineName(e.target.value)} placeholder="例：A05自動機 / TPS05 / プレスかしめ機" /></label>
            <label>🏗 ライン<input value={productionLineName} onChange={(e) => setProductionLineName(e.target.value)} placeholder="例：NLライン / 76-060" /></label>
            <label>🔍 検索・絞り込み<input value={productionSearch} onChange={(e) => setProductionSearch(e.target.value)} placeholder="例：センサー ピーススライド 76-060 停止" /></label>
          </div>
        </div>

        <div className="tableWrap kaizenMissionBox">
          <h2>🎯 保全改革ダッシュボード</h2>
          <p className="kaizenMissionText">突発工事を減らし、計画工事中心の保全体制へ移行する。</p>
          <p>保全は機械を修理する仕事だけではなく、機械を壊さない仕組みを作る仕事です。保全修理報告書とCSVアラームから、繰り返し止めている問題を見つけ、計画工事へ変えていきます。</p>
          <div className="kaizenFlowGrid">
            <div className="kaizenFlowCard">
              <h3>現在：突発対応が多い状態</h3>
              <p>アラーム発生 → 現場停止 → 保全が呼ばれる → 応急処置 → 同じ問題が再発。</p>
            </div>
            <div className="kaizenArrow">→</div>
            <div className="kaizenFlowCard target">
              <h3>目標：計画工事中心の保全</h3>
              <p>問題をランキング化 → 原因を整理 → 計画工事へ登録 → 再発を減らす → 保全時間を取り戻す。</p>
            </div>
          </div>
        </div>

        <div className="maintenanceMaturityHero">
          <div className="maturityPanel current">
            <span>現在</span>
            <strong>Level 1<br />🔥 突発対応中心</strong>
            <small>機械が止まってから保全が呼ばれ、応急処置で復旧する状態です。</small>
          </div>
          <div className="maturityPanel goal">
            <span>目標</span>
            <strong>Level 3<br />📅 計画工事中心</strong>
            <small>慢性問題をランキング化し、計画工事へ登録して再発を減らす状態を目指します。</small>
          </div>
        </div>

        <div className="maintenanceGoalTable">
          <div className="goalMetric"><span>🔥 突発工事</span><strong>{suddenRepairCount}件</strong><small>目標：5件以下</small></div>
          <div className="goalMetric"><span>📅 計画工事</span><strong>{plannedWorkCount}件</strong><small>目標：15件以上</small></div>
          <div className="goalMetric"><span>⏰ 機械停止時間</span><strong>{formatHours(totalStop)}</strong><small>目標：10H以下</small></div>
          <div className="goalMetric"><span>🔁 再発テーマ</span><strong>{recurringProblemCount}件</strong><small>目標：0件</small></div>
        </div>

        <div className="kaizenKpiGrid">
          <div className="kaizenKpiCard danger"><span>🔥 突発対応の量</span><strong>{suddenRepairCount}件</strong><small>保全修理報告書から集計</small></div>
          <div className="kaizenKpiCard warn"><span>🛠 保全が取られた時間</span><strong>{formatHours(totalRepair)}</strong><small>修理・確認に使った工数</small></div>
          <div className="kaizenKpiCard danger"><span>⏱ 機械停止時間</span><strong>{formatHours(totalStop)}</strong><small>止まっている時間を重点対策</small></div>
          <div className="kaizenKpiCard warn"><span>🔁 再発テーマ</span><strong>{recurringProblemCount}件</strong><small>繰り返し発生・停止時間大</small></div>
          <div className="kaizenKpiCard good"><span>📅 計画工事登録</span><strong>{plannedWorkCount}件</strong><small>突発から計画へ移行中</small></div>
          <div className="kaizenKpiCard good"><span>📈 保全成熟度</span><strong className="kaizenMaturity">{maintenanceMaturity}</strong><small>計画工事率 {plannedRate}%</small></div>
        </div>

        <div className="tableWrap">
          <h2>🔥 工場を止めている原因 TOP5</h2>
          <p>停止時間が長い問題を優先して表示します。ここに出る問題を潰すことで、突発対応を減らし、計画保全へ移行できます。</p>
          <div className="stopReasonTop v71">
            {topStopReasonsByHours.length === 0 && <p>保全修理報告書またはCSVデータがまだありません。</p>}
            {topStopReasonsByHours.map((item, index) => (
              <div className="stopReasonRow v71" key={item.key}>
                <div className={`productionRankNo ${index < 3 ? "top" : ""}`}>No.{index + 1}</div>
                <div className="stopReasonName">
                  <b>{item.key}</b>
                  <small>主設備：{cleanMachineName(item.mainMachine)} / 発生 {Number(item.count || 0).toLocaleString()}回 / 報告書 {item.reportCount || 0}件</small>
                </div>
                <div className="productionBarBg detail"><div className="productionBarFill red" style={{ width: `${Math.min(100, (Number(item.stopHours || 0) / maxStopReasonHours) * 100)}%` }} /></div>
                <div className="stopReasonValue"><strong>{formatHours(item.stopHours || 0)}</strong><small>停止時間</small></div>
              </div>
            ))}
          </div>
        </div>

        <div className="tableWrap">
          <h2>🔁 慢性問題・重点改善テーマ</h2>
          <p>保全修理報告書とCSVアラームをまとめ、繰り返し発生している問題を自動で整理します。ここに出るものを計画工事へ変えていくのが一番重要です。</p>
          <div className="chronicThemeGrid">
            {chronicThemes.length === 0 && <p>慢性問題の候補はまだありません。</p>}
            {chronicThemes.map((issue, index) => (
              <div key={issue.key} className={`chronicThemeCard ${index >= 3 ? "low" : index >= 2 ? "medium" : ""}`}>
                <div className="chronicThemeHeader">
                  <div className="chronicThemeTitle">
                    <span className="chronicThemeNo">{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `No.${index + 1}`}</span>
                    <span>No.{index + 1} {issue.key}</span>
                  </div>
                </div>

                <div className="chronicSimpleTable">
                  <span>発生回数</span><strong>{Number(issue.count || 0).toLocaleString()}回</strong>
                  <span>停止時間</span><strong>{formatHours(issue.stopHours || 0)}</strong>
                  <span>再発回数</span><strong>{estimatedRepeatCount(issue).toLocaleString()}回</strong>
                  <span>対象設備</span><strong>{cleanMachineName(issue.mainMachine)}</strong>
                </div>

                <div className="chronicStarBlock">
                  <span>影響度</span><strong className="chronicStars">{starText(impactLevel(issue))}</strong>
                  <span>改善優先度</span><strong className="chronicStars">{starText(priorityLevel(issue))}</strong>
                </div>

                <p className="chronicTextBlock"><b>代表内容：</b>{issue.samples?.[0] || "-"}</p>
                <p className="chronicTextBlock"><b>過去処置：</b>{issue.actions?.[0] || "処置実績を保全報告書へ登録してください。"}</p>
                <p className="chronicTextBlock"><b>対策方向：</b>{issue.solution}</p>

                <div className="chronicActionFooter">
                  <button className="primaryButton" onClick={() => createPlannedWorkFromProduction(issue)}><Hammer size={16} /> 計画工事へ展開</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tableWrap">
          <h2>📅 設備別異常件数</h2>
          <p>選択した期間の問題を設備ごとに分けて表示します。右端は件数、下段は停止時間・費用・主原因です。</p>

          <div className="productionTrendToolbar" style={{ marginTop: "10px" }}>
            {[
              ["today", "📅 今日"],
              ["yesterday", "📅 昨日"],
              ["week", "📅 今週"],
              ["month", "📅 今月"],
              ["year", "📅 今年"],
              ["custom", "📅 任意期間"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={productionDailyPeriod === key ? "active" : ""}
                onClick={() => setProductionDailyPeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {productionDailyPeriod === "custom" && (
            <div className="reportGrid" style={{ marginBottom: "14px" }}>
              <label>開始日<input type="date" value={productionDailyStart} onChange={(e) => setProductionDailyStart(e.target.value)} /></label>
              <label>終了日<input type="date" value={productionDailyEnd} onChange={(e) => setProductionDailyEnd(e.target.value)} /></label>
            </div>
          )}

          <div className="reportGrid" style={{ marginBottom: "14px" }}>
            <label>🏭 設備選択
              <select value={productionDailyMachine} onChange={(e) => setProductionDailyMachine(e.target.value)}>
                <option value="all">全設備</option>
                {dailyMachineOptions.map((machine) => (
                  <option key={machine} value={machine}>{machine}</option>
                ))}
              </select>
            </label>
            <label>📊 表示内容
              <select value={productionRankMode} onChange={(e) => setProductionRankMode(e.target.value)}>
                <option value="count">停止回数・件数</option>
                <option value="hours">停止時間(H)</option>
                <option value="reports">報告書件数</option>
                <option value="repeat">再発回数</option>
              </select>
            </label>
          </div>

          <div className="productionRankExplain">
            <div><b>表示期間</b><br />{dailyPeriodLabel}：{dailyRange.start} ～ {dailyRange.end}</div>
            <div><b>対象設備</b><br />{productionDailyMachine === "all" ? "全設備" : productionDailyMachine}</div>
            <div><b>件数</b><br />CSVは10分以内の連続アラームを1回の停止として集計します。</div>
            <div><b>主原因</b><br />その設備で一番多かった停止要因・不具合内容です。</div>
          </div>

          {todayMachineRank.length === 0 && <p>{dailyPeriodLabel}・{productionDailyMachine === "all" ? "全設備" : productionDailyMachine} のCSVアラームまたは保全報告書データはまだありません。</p>}
          {todayMachineRank.map((machine, index) => (
            <div key={machine.key} className="productionDetailBarRow">
              <div className={`productionRankNo ${index < 3 ? "top" : ""}`}>No.{index + 1}</div>
              <div className="productionRankName">
                <b>{machine.key}</b>
                <small>主原因 {machine.mainReason} / 最新 {machine.latest || "-"}</small>
                <div className="productionRankChips">
                  <span className="productionRankChip">⏰ 停止 {formatHours(machine.stopHours)}</span>
                  <span className="productionRankChip">🔁 再発 {Math.max(0, Number(machine.count || 0) - 1)}回</span>
                  <span className="productionRankChip">🚨 アラーム {Number(machine.alarmRows || machine.count || 0).toLocaleString()}件</span>
                </div>
              </div>
              <div className="productionBarBg detail"><div className="productionBarFill red" style={{ width: `${Math.min(100, (machine.count / todayMaxCount) * 100)}%` }} /></div>
              <div className="productionRankValue">{Number(machine.count || 0).toLocaleString()}<span>発生回数</span></div>
            </div>
          ))}
        </div>

        <div className="productionAiShell" style={{ marginTop: "16px" }}>
          <div className="tableWrap">
            <h2>🤖 AI設備診断・推奨対策</h2>
            <p>保全報告書とCSVアラームを同時に検索し、原因・対策・類似事例・計画工事候補を整理します。</p>
            <textarea value={productionAiQuestion} onChange={(e) => setProductionAiQuestion(e.target.value)} placeholder="例：A05自動機で一番悪い問題は？ / 突発工事を減らすには？ / 計画工事にするべき問題は？" />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
              <button className="primaryButton" onClick={() => aiAnswerForProduction()}><Bot size={16} /> AI分析</button>
              {[
                "一番生産を止めている問題は？",
                "似ている保全報告書を見せて",
                "計画工事にするべき問題は？",
                "対策しても再発する原因は？",
              ].map((q) => <button key={q} type="button" onClick={() => { setProductionAiQuestion(q); aiAnswerForProduction(q); }}>{q}</button>)}
            </div>
          </div>
          <div className="tableWrap"><h2>📌 AI回答・推奨対策</h2><div className="aiAnswerBox">{productionAiAnswer}</div></div>
        </div>

        <div className="tableWrap">
          <h2>🏆 生産阻害ランキング</h2>
          <p>設備・停止要因・アラームを分けて、発生回数・停止時間・再発回数・報告書件数で確認できます。突発工事を減らすため、何を先に計画工事へ変えるべきかを判断します。</p>
          <div className="productionRankToolbar">
            {[
              { key: "machine", label: "🏭 設備別" },
              { key: "reason", label: "⚠️ 停止要因別" },
              { key: "alarm", label: "🚨 アラーム別" },
            ].map((item) => <button key={item.key} type="button" className={productionRankTarget === item.key ? "active" : ""} onClick={() => setProductionRankTarget(item.key)}>{item.label}</button>)}
            {[
              { key: "count", label: "🔴 停止回数" },
              { key: "hours", label: "⏰ 停止時間" },
              { key: "reports", label: "📝 報告書件数" },
              { key: "repeat", label: "🔁 再発回数" },
            ].map((item) => <button key={item.key} type="button" className={productionRankMode === item.key ? "active" : ""} onClick={() => setProductionRankMode(item.key)}>{item.label}</button>)}
            <select value={productionSelectedMachine} onChange={(e) => setProductionSelectedMachine(e.target.value)}>
              <option value="all">全設備を表示</option>
              {machineRank.map((m) => <option key={m.key} value={m.key}>{m.key}</option>)}
            </select>
          </div>
          <div className="productionRankExplain">
            <div>{rankDescription(productionRankMode)}</div>
            <div>🏭 設備別：どの機械が生産を止めているか確認します。</div>
            <div>⚠️ 停止要因別：搬送・センサー・詰まりなど原因別に改善テーマを決めます。</div>
            <div>🚨 アラーム別：CSVから実際に多いアラームを確認します。</div>
          </div>
          <div className="rankHintGrid">
            <div>🔴 発生回数：同じトラブルが何回出ているか。</div>
            <div>⏰ 停止時間：生産を止めた時間。最優先で減らします。</div>
            <div>🔁 再発回数：応急処置で終わっている可能性が高いテーマ。</div>
            <div>📅 計画工事候補：再発を止めるために予定化するテーマ。</div>
          </div>
          <div className="productionGraphCard">
            <h3>{productionRankTarget === "reason" ? "⚠️ 停止要因別" : productionRankTarget === "alarm" ? "🚨 アラーム別" : "🏭 設備別"} TOP10 - {rankModeInfo[productionRankMode]?.label}</h3>
            {rankSource.slice(0, 10).map((x, index) => <DetailedRankRow key={`${productionRankTarget}-${x.key}`} item={x} index={index} max={maxRankValue} color={productionRankTarget === "reason" ? "orange" : productionRankTarget === "alarm" ? "blue" : "red"} target={productionRankTarget} />)}
          </div>
          <div className="machineBreakdownGrid">
            {sortByRankMode(machineRank).slice(0, 6).map((machine) => {
              const itemsForMachine = allItems.filter((item) => normalizeMachineKey(item.machine) === machine.key);
              const reasonsForMachine = Object.values(itemsForMachine.reduce((acc, item) => {
                const key = normalizeKey(item.reason);
                if (!acc[key]) acc[key] = { key, count: 0, stopHours: 0, totalCost: 0 };
                acc[key].count += item.source === "CSVアラーム" ? Math.max(1, Number(item.count || 1)) : 1;
                acc[key].stopHours += Number(item.stopHours || 0);
                acc[key].totalCost += Number(item.totalCost || 0);
                return acc;
              }, {})).sort((a, b) => b.count - a.count).slice(0, 4);
              return (
                <div className="machineBreakdownCard" key={machine.key}>
                  <h3>🏭 {machine.key}</h3>
                  <p><b>停止回数：</b>{Number(machine.count || 0).toLocaleString()}回 / <b>停止時間：</b>{formatHours(machine.stopHours || 0)} / <b>再発：</b>{estimatedRepeatCount(machine)}回</p>
                  <p><b>主原因：</b>{machine.mainReason || "-"} / <b>最新：</b>{machine.latest || "-"}</p>
                  {reasonsForMachine.map((r) => (
                    <div className="machineMiniRow" key={r.key}>
                      <div><b>{r.key}</b><br /><small>停止 {formatHours(r.stopHours)} / 発生 {Number(r.count || 0).toLocaleString()}回</small></div>
                      <strong>{Number(r.count || 0).toLocaleString()}回</strong>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="tableWrap">
          <h2>🛠 改善候補・計画工事連携</h2>
          <p>ここは改善テーマ候補です。件数・停止時間・過去処置から優先順位を決め、必要なものは計画工事へ展開できます。</p>
          <div className="productionIssueGrid">
            {reasonRank.slice(0, 12).map((issue, index) => (
              <div key={issue.key} className={`productionIssueCard ${index < 3 ? "" : index < 7 ? "medium" : "low"}`}>
                <b>No.{index + 1}</b>
                <h3>{issue.key}</h3>
                <p><b>影響：</b>COUNT {issue.count} / 停止 {formatHours(issue.stopHours)} / 報告書 {issue.reportCount}件</p>
                <p><b>主設備：</b>{cleanMachineName(issue.mainMachine)}</p>
                <p><b>代表内容：</b>{issue.samples?.[0] || "-"}</p>
                <p><b>過去処置：</b>{issue.actions?.[0] || "保全報告書へ処置内容を登録してください。"}</p>
                <p><b>推奨対策：</b>{issue.solution}</p>
                <button className="primaryButton" onClick={() => createPlannedWorkFromProduction(issue)}><Hammer size={16} /> 計画工事へ展開</button>
              </div>
            ))}
          </div>
        </div>

        <div className="tableWrap">
          <h2>📚 似ている過去トラ・処置実績</h2>
          <p>保全修理報告書から、実際に何をして直したかを確認できます。</p>
          {actionHistory.length === 0 && <p>検索条件に合う処置実績がまだありません。</p>}
          {actionHistory.map((item, index) => (
            <div key={item.id || index} className="calendarEditCard" style={{ cursor: "pointer" }} onClick={() => setPage("report")}>
              <b>{item.date || "日付なし"} / {item.machine} / {item.reason}</b>
              <h3>{item.title}</h3>
              <p><b>現象：</b>{item.message}</p>
              <p><b>処置：</b>{item.action}</p>
              <p><b>停止：</b>{formatHours(item.stopHours)} / <b>修理：</b>{formatHours(item.repairHours)} / <b>再発防止の参考処置</b></p>
            </div>
          ))}
        </div>
      </>
    );
  }


  function renderMiyamaAi() {
    const totalStop = reports.reduce((sum, r) => sum + toNumber(r.stopTimeHours, 0), 0);
    const totalRepair = reports.reduce((sum, r) => sum + toNumber(r.laborHours, 0), 0);
    const totalCost = reports.reduce((sum, r) => sum + toNumber(r.totalCost, 0), 0);
    const noStock = spareRows.filter((p) => Number(p.stockQty || 0) <= 0).length;
    const lowStock = spareRows.filter((p) => Number(p.stockQty || 0) > 0 && Number(p.stockQty || 0) <= Number(p.minStock || 1)).length;
    const overdue = maintenanceRows.filter((m) => m.status === "交換超過").length;
    const near = maintenanceRows.filter((m) => m.status === "交換間近").length;

    function topByEquipment() {
      const map = {};
      reports.forEach((r) => {
        const key = r.equipment || r.lineName || "設備名なし";
        if (!map[key]) map[key] = { count: 0, stop: 0, cost: 0 };
        map[key].count += 1;
        map[key].stop += toNumber(r.stopTimeHours, 0);
        map[key].cost += toNumber(r.totalCost, 0);
      });
      return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count || b.stop - a.stop).slice(0, 5);
    }

    function searchSite(questionText = miyamaAiQuestion) {
      const q = String(questionText || "").trim().toLowerCase();
      if (!q) {
        setMiyamaAiAnswer("質問を入力してください。例：TPS05の過去トラは？ / 在庫なしは何件？ / 今月の保全費はいくら？");
        return;
      }
      const corpus = [
        ...reports.map((r) => ({ type: "📝 保全報告書", title: r.equipment || r.lineName || "設備名なし", date: r.createdAt || normalizeDateOnly(r.troubleDateTime) || "-", text: [r.equipment, r.lineName, r.phenomenon, r.troublePoint, r.why1, r.why2, r.why3, r.action, r.recurrencePrevention, r.note].filter(Boolean).join(" ") })),
        ...maintenanceRows.map((m) => ({ type: "🔧 定期保全", title: m.equipment || m.partName || "定期保全", date: m.nextDate || "-", text: [m.equipment, m.lineName, m.partName, m.partNo, m.maintenanceDetail, m.status, m.owner, m.note].filter(Boolean).join(" ") })),
        ...spareRows.map((p) => ({ type: "📦 予備品", title: p.partName || p.partNo || "部品名なし", date: p.leadTime || "-", text: [p.equipment, p.lineName, p.partName, p.partNo, p.serialNo, p.maker, p.supplier, p.location, p.stockStatus, p.note].filter(Boolean).join(" ") })),
        ...unifiedCalendarEvents.map((c) => ({ type: "📅 カレンダー", title: c.title || "予定", date: c.date || "-", text: [c.title, c.detail, c.owner, c.category, c.importance].filter(Boolean).join(" ") })),
        ...plannedWorks.map((w) => ({ type: "🏗 計画工事", title: w.title || w.equipment || "計画工事", date: w.date || "-", text: [w.equipment, w.purpose, w.detail, w.owner, w.status, w.risk, w.note].filter(Boolean).join(" ") })),
      ];
      const keywords = q.split(/[\s　、。,.]+/).filter(Boolean);
      const hits = corpus.map((item) => {
        const all = `${item.type} ${item.title} ${item.date} ${item.text}`.toLowerCase();
        const score = keywords.reduce((s, k) => s + (all.includes(k) ? 2 : 0), 0);
        return { ...item, score };
      }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);

      const topEquip = topByEquipment();
      const wantsStock = q.includes("在庫") || q.includes("stock") || q.includes("部品不足") || q.includes("欠品");
      const wantsCost = q.includes("費用") || q.includes("金額") || q.includes("cost") || q.includes("いくら") || q.includes("円");
      const wantsStop = q.includes("停止") || q.includes("stop") || q.includes("mttr") || q.includes("修理") || q.includes("時間");
      const wantsMaintenance = q.includes("定期") || q.includes("交換") || q.includes("期限") || q.includes("予定") || q.includes("来週") || q.includes("7日");
      const wantsTop = q.includes("多い") || q.includes("ランキング") || q.includes("top") || q.includes("一番");

      let answer = "🤖 MIYAMA AI 分析結果\n\n";
      answer += `📊 現在の全体状況\n・保全報告書：${reports.length}件\n・定期保全対象：${maintenanceRows.length}件（期限超過 ${overdue}件 / 7日以内 ${near}件）\n・予備品：${spareRows.length}件（在庫なし ${noStock}件 / 在庫注意 ${lowStock}件）\n・停止時間合計：${totalStop.toFixed(1)}H\n・参考費用合計：${totalCost.toLocaleString()}円\n\n`;
      if (wantsStock) {
        const bad = spareRows.filter((p) => Number(p.stockQty || 0) <= Number(p.minStock || 1)).slice(0, 10);
        answer += `📦 在庫確認\n在庫なし・在庫注意の候補は ${bad.length}件 表示します。\n`;
        answer += bad.length ? bad.map((p, i) => `${i + 1}. ${p.partName || "部品名なし"} / ${p.partNo || "-"} / 在庫:${p.stockQty || 0} / 最低:${p.minStock || 1} / 場所:${p.location || "-"}`).join("\n") : "現在、在庫注意の候補は見つかりません。";
        answer += "\n\n";
      }
      if (wantsCost) answer += `💴 費用確認\n参考費用合計は ${totalCost.toLocaleString()}円 です。\n労務時間合計は ${totalRepair.toFixed(1)}H です。\n\n`;
      if (wantsStop) answer += `⏱ 停止・修理時間確認\n停止時間合計：${totalStop.toFixed(1)}H\n修理工数合計：${totalRepair.toFixed(1)}H\n改善優先は「停止時間が長い設備」と「同じ故障が繰り返す設備」です。\n\n`;
      if (wantsMaintenance) {
        const urgent = maintenanceRows.filter((m) => m.status === "交換超過" || m.status === "交換間近").slice(0, 10);
        answer += `🔧 定期保全確認\n期限超過・7日以内の候補は ${urgent.length}件 です。\n`;
        answer += urgent.length ? urgent.map((m, i) => `${i + 1}. ${m.equipment || "設備名なし"} / ${m.partName || m.maintenanceDetail || "内容なし"} / 次回:${m.nextDate || "-"} / 状態:${m.status}`).join("\n") : "現在、急ぎの定期保全は見つかりません。";
        answer += "\n\n";
      }
      if (wantsTop || topEquip.length) {
        answer += `🏆 故障・報告件数が多い設備TOP\n`;
        answer += topEquip.length ? topEquip.map((e, i) => `${i + 1}. ${e.name}：${e.count}件 / 停止 ${e.stop.toFixed(1)}H / 費用 ${Math.round(e.cost).toLocaleString()}円`).join("\n") : "まだランキングを作成できる報告書がありません。";
        answer += "\n\n";
      }
      answer += `🔍 質問に近いデータ\n`;
      answer += hits.length ? hits.map((h, i) => `${i + 1}. ${h.type} / ${h.date} / ${h.title}\n   ${h.text.slice(0, 120)}${h.text.length > 120 ? "..." : ""}`).join("\n") : "近いデータは見つかりませんでした。キーワードを設備名・部品名・不具合名に変えて検索してください。";
      answer += "\n\n💡 注意：このMIYAMA AIは、現在サイト内に保存されているデータを集計・検索して回答します。外部のChatGPT APIとは別で、社内データ検索専用です。";
      setMiyamaAiAnswer(answer);
    }

    async function askPaidMiyamaAI(questionText = paidAiQuestion) {
      const question = String(questionText || "").trim();

      if (!question) {
        setPaidAiError(
          appLanguage === "es"
            ? "Escriba una pregunta."
            : appLanguage === "en"
              ? "Enter a question."
              : "質問を入力してください。"
        );
        return;
      }

      const recentReports = reports.slice(0, 20).map((report, index) => [
        `Report ${index + 1}`,
        `Equipment: ${report.equipment || ""}`,
        `Line: ${report.lineName || ""}`,
        `Symptom: ${report.phenomenon || ""}`,
        `Failure point: ${report.troublePoint || ""}`,
        `Cause: ${report.why3 || report.why2 || report.why1 || ""}`,
        `Action: ${report.action || ""}`,
        `Part: ${report.replacedPart || report.partName1 || ""}`,
      ].join("\n")).join("\n\n---\n\n");

      const responseLanguage =
        appLanguage === "es" ? "Spanish" : appLanguage === "en" ? "English" : "Japanese";

      setPaidAiLoading(true);
      setPaidAiError("");
      setPaidAiAnswer("");

      try {
        const result = await askMiyamaAI({
          language: responseLanguage,
          machine: "",
          context: [
            "MIYAMA MAINTENANCE SYSTEM SUMMARY",
            `Maintenance reports: ${reports.length}`,
            `Time-based maintenance items: ${maintenanceRows.length}`,
            `Spare parts: ${spareRows.length}`,
            `Planned works: ${plannedWorks.length}`,
            "",
            "RECENT MAINTENANCE REPORTS",
            recentReports || "No recent report available.",
          ].join("\n"),
          message: `Answer the user's maintenance question:

${question}

Requirements:
- Answer in ${responseLanguage}.
- Use the supplied factory information when relevant.
- Separate historical facts from hypotheses.
- Give safe, practical checks in order.
- Do not recommend bypassing guards, interlocks, lockout/tagout, or electrical protections.
- If information is insufficient, say what must be checked physically.`,
        });

        setPaidAiAnswer(String(result.answer || "").trim());
      } catch (error) {
        console.error("Paid MIYAMA AI error:", error);
        setPaidAiError(
          appLanguage === "es"
            ? `No fue posible consultar la IA de OpenAI: ${error.message}`
            : appLanguage === "en"
              ? `Could not query OpenAI: ${error.message}`
              : `OpenAIへ質問できませんでした：${error.message}`
        );
      } finally {
        setPaidAiLoading(false);
      }
    }

    const aiUi = {
      ja: {
        heroSubtitle: "社内履歴を無料で検索するMIYAMA AIと、より深い分析を行うOpenAIを1つの画面で使えます。",
        reports: "報告書",
        maintenanceItems: "保全項目",
        registeredParts: "登録部品",
        plannedWorks: "計画工事",
        localTitle: "MIYAMA AI ローカル",
        localSubtitle: "無料 — システム内に保存されたデータだけを検索します。",
        localPlaceholder: "例：この問題は以前発生した？最も停止時間が長い設備は？在庫切れの部品は？",
        localSearch: "履歴を検索",
        clear: "クリア",
        localResult: "ローカル検索結果",
        localEmpty: "社内履歴を検索する質問を入力してください。",
        openAiTitle: "OpenAI — 高度分析",
        openAiSubtitle: "有料 — OpenAI APIキーと利用枠を使用します。",
        openAiPlaceholder: "例：この不具合を早く診断する方法は？最初に確認すべき部品は？",
        askOpenAi: "OpenAIへ質問",
        analyzing: "分析中...",
        openAiResult: "OpenAI回答",
        openAiEmpty: "高度分析の回答がここに表示されます。",
        quickTitle: "ローカルAIへのクイック質問",
        assistantTitle: "報告書アシスタント",
        assistantSubtitle: "この画面のまま、報告書の下書き作成・類似事例検索・履歴を使った質問ができます。",
        assistantPlaceholder: "例：78-60 箱替え動作が完了しない。光電センサーを確認",
        createDraft: "下書きを作成",
        findSimilar: "類似事例を検索",
        askHistory: "履歴を使って質問",
      },
      en: {
        heroSubtitle: "Use MIYAMA AI to search your internal history for free, or OpenAI for deeper analysis.",
        reports: "Reports",
        maintenanceItems: "Maintenance Items",
        registeredParts: "Registered Parts",
        plannedWorks: "Planned Work",
        localTitle: "MIYAMA AI Local",
        localSubtitle: "Free — searches only the data saved in your system.",
        localPlaceholder: "Example: Has this problem happened before? Which machine has the most downtime? Which parts are out of stock?",
        localSearch: "Search History",
        clear: "Clear",
        localResult: "Local Result",
        localEmpty: "Enter a question to search the internal history.",
        openAiTitle: "OpenAI — Advanced Analysis",
        openAiSubtitle: "Paid — uses your OpenAI API key and quota.",
        openAiPlaceholder: "Example: How can I diagnose this failure quickly? Which part should I inspect first?",
        askOpenAi: "Ask OpenAI",
        analyzing: "Analyzing...",
        openAiResult: "OpenAI Answer",
        openAiEmpty: "The advanced answer will appear here.",
        quickTitle: "Quick Questions for Local AI",
        assistantTitle: "Report Assistant",
        assistantSubtitle: "Create a draft, search similar cases, and ask using history without leaving this page.",
        assistantPlaceholder: "Example: 78-60 box change does not complete; check the photoelectric sensor",
        createDraft: "Create Draft",
        findSimilar: "Find Similar Cases",
        askHistory: "Ask Using History",
      },
      es: {
        heroSubtitle: "Use MIYAMA AI para buscar gratuitamente en el historial interno u OpenAI para análisis más profundos.",
        reports: "Informes",
        maintenanceItems: "Elementos de mantenimiento",
        registeredParts: "Piezas registradas",
        plannedWorks: "Trabajos planificados",
        localTitle: "MIYAMA AI Local",
        localSubtitle: "Gratis — busca solamente los datos guardados en su sistema.",
        localPlaceholder: "Ej.: ¿Este problema ya ocurrió? ¿Qué máquina tiene más tiempo de parada? ¿Qué piezas están sin stock?",
        localSearch: "Buscar en el historial",
        clear: "Limpiar",
        localResult: "{aiUi.localResult}",
        localEmpty: "Escriba una pregunta para buscar en el historial interno.",
        openAiTitle: "OpenAI — Análisis avanzado",
        openAiSubtitle: "De pago — usa su clave y cuota de OpenAI.",
        openAiPlaceholder: "Ej.: ¿Cómo diagnosticar rápidamente esta falla? ¿Qué pieza debo revisar primero?",
        askOpenAi: "Preguntar a OpenAI",
        analyzing: "Analizando...",
        openAiResult: "Respuesta de OpenAI",
        openAiEmpty: "La respuesta avanzada aparecerá aquí.",
        quickTitle: "Preguntas rápidas para la IA local",
        assistantTitle: "Asistente de informe",
        assistantSubtitle: "Cree un borrador, busque casos similares y consulte usando el historial sin salir de esta página.",
        assistantPlaceholder: "Ej.: 78-60 el cambio de caja no termina; revisar el sensor fotoeléctrico",
        createDraft: "Crear borrador",
        findSimilar: "Buscar casos similares",
        askHistory: "Preguntar usando el historial",
      },
    }[appLanguage] || {
      heroSubtitle: "",
      reports: "",
      maintenanceItems: "",
      registeredParts: "",
      plannedWorks: "",
      localTitle: "",
      localSubtitle: "",
      localPlaceholder: "",
      localSearch: "",
      clear: "",
      localResult: "",
      localEmpty: "",
      openAiTitle: "",
      openAiSubtitle: "",
      openAiPlaceholder: "",
      askOpenAi: "",
      analyzing: "",
      openAiResult: "",
      openAiEmpty: "",
      quickTitle: "",
      assistantTitle: "",
      assistantSubtitle: "",
      assistantPlaceholder: "",
      createDraft: "",
      findSimilar: "",
      askHistory: "",
    };

    const quickQuestions = ["一番生産を止めている問題は？", "突発工事を減らすには？", "計画工事にするべき問題は？", "対策しても再発する原因は？", "停止時間が多い設備ランキング", "在庫なしは何件？", "期限超過の定期保全を教えて", "来週交換予定の部品は？"];
    return (
      <>
        <div
          className="miyamaAiPremiumHero"
          style={{
            padding: "28px",
            borderRadius: "26px",
            background:
              "radial-gradient(circle at top left, rgba(59,130,246,.28), transparent 34%), linear-gradient(135deg,#0f172a,#172554 52%,#1d4ed8)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,.16)",
            boxShadow: "0 24px 60px rgba(15,23,42,.25)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "18px",
                display: "grid",
                placeItems: "center",
                background: "rgba(255,255,255,.14)",
                border: "1px solid rgba(255,255,255,.22)",
                fontSize: "30px",
              }}
            >
              🤖
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: "clamp(30px,4vw,48px)", color: "#fff" }}>
                MIYAMA AI
              </h1>
              <p style={{ margin: "7px 0 0", color: "#dbeafe", maxWidth: "900px", lineHeight: 1.65 }}>
                {aiUi.heroSubtitle}
              </p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              gap: "10px",
              marginTop: "22px",
            }}
          >
            {[
              ["📚", `${reports.length}`, aiUi.reports],
              ["🔧", `${maintenanceRows.length}`, aiUi.maintenanceItems],
              ["📦", `${spareRows.length}`, aiUi.registeredParts],
              ["🏗️", `${plannedWorks.length}`, aiUi.plannedWorks],
            ].map(([icon, value, label]) => (
              <div
                key={label}
                style={{
                  padding: "14px",
                  borderRadius: "16px",
                  background: "rgba(255,255,255,.1)",
                  border: "1px solid rgba(255,255,255,.14)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div style={{ fontSize: "20px" }}>{icon}</div>
                <strong style={{ display: "block", fontSize: "24px", marginTop: "4px" }}>
                  {value}
                </strong>
                <span style={{ color: "#bfdbfe", fontSize: "13px" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))",
            gap: "18px",
            marginTop: "18px",
          }}
        >
          <section
            className="tableWrap"
            style={{
              borderRadius: "24px",
              padding: "22px",
              background: "linear-gradient(180deg,#ffffff,#f8fafc)",
              border: "1px solid #dbeafe",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "14px",
                  display: "grid",
                  placeItems: "center",
                  background: "#dbeafe",
                  fontSize: "22px",
                }}
              >
                📚
              </div>
              <div>
                <h2 style={{ margin: 0 }}>{aiUi.localTitle}</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  {aiUi.localSubtitle}
                </p>
              </div>
            </div>

            <textarea
              value={miyamaAiQuestion}
              onChange={(event) => setMiyamaAiQuestion(event.target.value)}
              placeholder={aiUi.localPlaceholder}
              style={{
                minHeight: "150px",
                marginTop: "18px",
                padding: "16px",
                borderRadius: "18px",
                background: "#fff",
              }}
            />

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
              <button className="primaryButton" onClick={() => searchSite()}>
                <Search size={17} /> {aiUi.localSearch}
              </button>
              <button
                className="deleteButton"
                onClick={() => {
                  setMiyamaAiQuestion("");
                  setMiyamaAiAnswer(aiUi.localEmpty);
                }}
              >
                <X size={16} /> {aiUi.clear}
              </button>
            </div>

            <div
              style={{
                marginTop: "16px",
                padding: "16px",
                borderRadius: "18px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                whiteSpace: "pre-wrap",
                lineHeight: 1.65,
                minHeight: "150px",
              }}
            >
              <strong style={{ display: "block", marginBottom: "8px", color: "#1d4ed8" }}>
                Resultado local
              </strong>
              {miyamaAiAnswer}
            </div>
          </section>

          <section
            className="tableWrap"
            style={{
              borderRadius: "24px",
              padding: "22px",
              background: "linear-gradient(180deg,#ffffff,#faf5ff)",
              border: "1px solid #ddd6fe",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "14px",
                  display: "grid",
                  placeItems: "center",
                  background: "#ede9fe",
                  fontSize: "22px",
                }}
              >
                ✨
              </div>
              <div>
                <h2 style={{ margin: 0 }}>{aiUi.openAiTitle}</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  {aiUi.openAiSubtitle}
                </p>
              </div>
            </div>

            <textarea
              value={paidAiQuestion}
              onChange={(event) => setPaidAiQuestion(event.target.value)}
              placeholder={aiUi.openAiPlaceholder}
              style={{
                minHeight: "150px",
                marginTop: "18px",
                padding: "16px",
                borderRadius: "18px",
                background: "#fff",
              }}
            />

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
              <button
                className="primaryButton"
                onClick={() => askPaidMiyamaAI()}
                disabled={paidAiLoading}
                style={{
                  opacity: paidAiLoading ? 0.65 : 1,
                  background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                }}
              >
                <Bot size={17} />
                {paidAiLoading ? aiUi.analyzing : aiUi.askOpenAi}
              </button>
              <button
                className="deleteButton"
                onClick={() => {
                  setPaidAiQuestion("");
                  setPaidAiAnswer("");
                  setPaidAiError("");
                }}
              >
                <X size={16} /> Limpar
              </button>
            </div>

            {paidAiError && (
              <div
                role="alert"
                style={{
                  marginTop: "14px",
                  padding: "13px",
                  borderRadius: "14px",
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontWeight: 700,
                }}
              >
                {paidAiError}
              </div>
            )}

            <div
              style={{
                marginTop: "16px",
                padding: "16px",
                borderRadius: "18px",
                background: "#f5f3ff",
                border: "1px solid #ddd6fe",
                whiteSpace: "pre-wrap",
                lineHeight: 1.65,
                minHeight: "150px",
              }}
            >
              <strong style={{ display: "block", marginBottom: "8px", color: "#6d28d9" }}>
                {aiUi.openAiResult}
              </strong>
              {paidAiAnswer || aiUi.openAiEmpty}
            </div>
          </section>
        </div>

        <section className="tableWrap" style={{ marginTop: "18px", borderRadius: "24px" }}>
          <h2 style={{ marginTop: 0 }}>⚡ {aiUi.quickTitle}</h2>
          <div className="quickQuestionGrid">
            {quickQuestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => {
                  setMiyamaAiQuestion(question);
                  searchSite(question);
                }}
              >
                {question}
              </button>
            ))}
          </div>
        </section>

        <section className="tableWrap" style={{ marginTop: "18px", borderRadius: "24px" }}>
          <h2 style={{ marginTop: 0 }}>🛠️ {aiUi.assistantTitle}</h2>
          <p style={{ color: "#64748b", lineHeight: 1.6 }}>
            {aiUi.assistantSubtitle}
          </p>

          <textarea
            value={autoReportInput}
            onChange={(event) => setAutoReportInput(event.target.value)}
            placeholder={aiUi.assistantPlaceholder}
            style={{ minHeight: "110px", marginTop: "10px" }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
              gap: "10px",
              marginTop: "12px",
            }}
          >
            <button type="button" className="primaryButton" onClick={createAutoReport}>
              📝 {aiUi.createDraft}
            </button>
            <button type="button" className="primaryButton" onClick={searchAutoReportProblems}>
              🔎 {aiUi.findSimilar}
            </button>
            <button
              type="button"
              className="primaryButton"
              onClick={askAutoReportAI}
              disabled={autoReportAiLoading}
              style={{ opacity: autoReportAiLoading ? 0.65 : 1 }}
            >
              <Bot size={17} />
              {autoReportAiLoading ? aiUi.analyzing : aiUi.askHistory}
            </button>
          </div>

          {autoReportHistoryMessage && (
            <div
              style={{
                marginTop: "12px",
                padding: "11px 13px",
                borderRadius: "14px",
                background: "#eff6ff",
                color: "#1e40af",
                fontWeight: 700,
              }}
            >
              {autoReportHistoryMessage}
            </div>
          )}

          {autoReportAiError && (
            <div
              style={{
                marginTop: "12px",
                padding: "11px 13px",
                borderRadius: "14px",
                background: "#fee2e2",
                color: "#991b1b",
                fontWeight: 700,
              }}
            >
              {autoReportAiError}
            </div>
          )}

          {autoReportAiAnswer && (
            <div
              style={{
                marginTop: "14px",
                padding: "14px",
                borderRadius: "16px",
                background: "#faf5ff",
                border: "1px solid #ddd6fe",
                whiteSpace: "pre-wrap",
                lineHeight: 1.65,
              }}
            >
              {autoReportAiAnswer}
            </div>
          )}

          {newReport && (
            <div style={{ marginTop: "18px" }}>
              <ReportDraftForm />
            </div>
          )}
        </section>
      </>
    );
  }

  function renderDailyProductionManagement() {
    const machines = [...new Set([
      ...dailyProductions.map((row) => getEquipmentNameFromRecord(row)),
      ...parts.filter((p) => p.isMaintenanceTarget === true).map((p) => getEquipmentNameFromRecord(p)),
      ...reports.map((r) => getEquipmentNameFromRecord(r)),
      ...plannedWorks.map((w) => getEquipmentNameFromRecord(w)),
    ]
      .filter(Boolean)
      .filter((name) => !String(name).includes("型式"))
      .filter((name) => name !== "設備未設定" && name !== "未設定")
    )].sort();

    const filteredRows = dailyProductions.filter((row) => {
      const keyword = dailyProductionSearch.trim().toLowerCase();
      if (!keyword) return true;
      return [row.date, row.equipment, row.quantity, row.note].join(" ").toLowerCase().includes(keyword);
    });

    const machineSummary = machines.map((machine) => {
      const rows = dailyProductions
        .filter((row) => normalizeMachineKey(getEquipmentNameFromRecord(row)) === normalizeMachineKey(machine))
        .map((row) => ({ ...row, quantity: toNumber(row.quantity ?? row.productionCount ?? row.count, 0), date: normalizeDateOnly(row.date) }))
        .filter((row) => row.date && row.quantity > 0);
      const last30 = rows.filter((row) => row.date >= addDays(todayText(), -30) && row.date <= todayText());
      const total30 = last30.reduce((sum, row) => sum + row.quantity, 0);
      const avg30 = last30.length ? Math.round(total30 / last30.length) : 0;
      const latest = rows.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      return { machine, rows: rows.length, avg30, total30, latestDate: latest?.date || "-", latestQty: latest?.quantity || 0 };
    }).sort((a, b) => b.avg30 - a.avg30);

    const previewMaintenance = maintenanceRows
      .filter((row) => toNumber(row.cycleProductionCount, 0) > 0)
      .slice(0, 12);

    return (
      <>
        <div className="tableWrap productionDbHero">
          <h1>🏭 生産数DB・定期保全自動計算</h1>
          <p>
            ここに設備ごとの1日生産数を登録します。<b>定量保全（生産数）</b> を選んだ項目だけ、このDBを使って次回実施日を自動計算します。
          </p>
          <div className="productionDbExample">
            例：部品保全サイクルが <b>1,000回</b>、設備の1日生産数が <b>100個/日</b> の場合、<b>10日後</b> が実施目安です。<br />
            計算式：実施目安日数 = 保全サイクル ÷ 1日平均生産数
          </div>
        </div>

        <div className="tableWrap">
          <h2>➕ 1日の生産数を登録</h2>
          <div className="reportGrid">
            <label>📅 日付
              <input type="date" value={dailyProductionDraft.date || ""} onChange={(e) => setDailyProductionDraft({ ...dailyProductionDraft, date: e.target.value })} />
            </label>
            <label>🏭 設備名
              <input list="dailyProductionMachines" value={dailyProductionDraft.equipment || ""} onChange={(e) => setDailyProductionDraft({ ...dailyProductionDraft, equipment: e.target.value })} placeholder="設備名を入力または選択" />
              <datalist id="dailyProductionMachines">
                {machines.map((machine) => <option key={machine} value={machine} />)}
              </datalist>
            </label>
            <label>🔢 生産数
              <input type="number" value={dailyProductionDraft.quantity || ""} onChange={(e) => setDailyProductionDraft({ ...dailyProductionDraft, quantity: e.target.value })} placeholder="例：100" />
            </label>
            <label>📝 メモ
              <input value={dailyProductionDraft.note || ""} onChange={(e) => setDailyProductionDraft({ ...dailyProductionDraft, note: e.target.value })} placeholder="昼勤/夜勤、異常など" />
            </label>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
            <button className="primaryButton" onClick={saveDailyProduction}>💾 生産数を保存</button>
            <button className="primaryButton" onClick={loadDailyProductions}>🔄 再読込</button>
            <button className="deleteButton" onClick={deleteDailyProductionBySelectedDate}>🗑️ 選択日削除</button>
            <button className="deleteButton" onClick={clearAllDailyProductions}>🧹 全データ初期化</button>
            <button className="primaryButton" onClick={() => setPage("maintenance")}>🔧 定期保全を見る</button>
          </div>
        </div>

        <div className="productionDbGrid">
          <div className="productionDbCard"><span>登録件数</span><strong>{dailyProductions.length}</strong></div>
          <div className="productionDbCard"><span>登録設備</span><strong>{machines.length}</strong></div>
          <div className="productionDbCard"><span>生産数連動保全</span><strong>{maintenanceRows.filter((r) => normalizeMaintenanceMode(r.maintenanceMode, r) === "定量保全").length}</strong></div>
          <div className="productionDbCard"><span>本日登録</span><strong>{dailyProductions.filter((r) => normalizeDateOnly(r.date) === todayText()).length}</strong></div>
        </div>

        <div className="tableWrap" style={{ marginTop: "18px" }}>
          <h2>📊 設備別 1日平均生産数</h2>
          <p>直近30日の登録データから平均生産数を出します。定期保全の交換日計算に使います。</p>
          <div style={{ overflowX: "auto" }}>
            <table className="productionDbTable">
              <thead>
                <tr>
                  <th>設備名</th>
                  <th>直近30日平均</th>
                  <th>直近30日合計</th>
                  <th>最新日付</th>
                  <th>最新生産数</th>
                  <th>登録日数</th>
                </tr>
              </thead>
              <tbody>
                {machineSummary.map((row) => (
                  <tr key={row.machine}>
                    <td><b>{row.machine}</b></td>
                    <td>{row.avg30.toLocaleString()} 個/日</td>
                    <td>{row.total30.toLocaleString()} 個</td>
                    <td>{row.latestDate}</td>
                    <td>{Number(row.latestQty || 0).toLocaleString()} 個</td>
                    <td>{row.rows}日</td>
                  </tr>
                ))}
                {machineSummary.length === 0 && <tr><td colSpan="6">まだ生産数データがありません。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="tableWrap" style={{ marginTop: "18px" }}>
          <h2>🔧 生産数で計算された定量保全</h2>
          <p>保全サイクルが入っている保全項目だけを表示します。生産数DBから次回実施日を計算します。</p>
          <div style={{ overflowX: "auto" }}>
            <table className="productionDbTable">
              <thead>
                <tr>
                  <th>設備名</th>
                  <th>項目</th>
                  <th>保全サイクル</th>
                  <th>残り回数</th>
                  <th>1日平均</th>
                  <th>次回実施日</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {previewMaintenance.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.equipment || row.lineName || "設備名なし"}</b></td>
                    <td>{row.sectionName || row.partName || row.maintenanceDetail || "-"}</td>
                    <td>{Number(row.cycleProductionCount || 0).toLocaleString()} 回</td>
                    <td>{row.productionRemain === "" ? "未入力" : `${Number(row.productionRemain || 0).toLocaleString()} 回`}</td>
                    <td>{Number(row.dailyAverageProduction || 0).toLocaleString()} 個/日</td>
                    <td>{row.productionNextDate || row.nextDate || "未入力"}</td>
                    <td>{row.urgentReason || "-"}</td>
                  </tr>
                ))}
                {previewMaintenance.length === 0 && <tr><td colSpan="7">保全サイクルが入っている定期保全はまだありません。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="tableWrap" style={{ marginTop: "18px" }}>
          <h2>📋 生産数DB一覧</h2>
          <input value={dailyProductionSearch} onChange={(e) => setDailyProductionSearch(e.target.value)} placeholder="設備名・日付で検索" style={{ marginBottom: "12px" }} />
          <div style={{ overflowX: "auto" }}>
            <table className="productionDbTable">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>設備名</th>
                  <th>生産数</th>
                  <th>メモ</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 300).map((row) => (
                  <tr key={row.id}>
                    <td>{normalizeDateOnly(row.date)}</td>
                    <td>{normalizeMachineKey(row.equipment || row.machine || row.lineName)}</td>
                    <td>{Number(toNumber(row.quantity ?? row.productionCount ?? row.count, 0)).toLocaleString()} 個</td>
                    <td>{row.note || ""}</td>
                    <td><button className="deleteButton" onClick={() => deleteDailyProduction(row.id)}>削除</button></td>
                  </tr>
                ))}
                {filteredRows.length === 0 && <tr><td colSpan="5">データがありません。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  function renderUserManagement() {
    if (!isAdmin) {
      return (
        <div className="tableWrap">
          <h2>👥 ユーザー管理</h2>
          <p>この画面は管理者のみ使用できます。</p>
        </div>
      );
    }

    return (
      <div className="miyamaUserAdminPage">
        <div className="miyamaUserAdminHeader">
          <div>
            <h2>👥 ユーザー管理</h2>
            <p>MIYAMA Maintenanceのアカウント作成、権限変更、有効／無効を管理します。</p>
          </div>
          <button type="button" className="primaryButton" onClick={loadSystemUsers} disabled={systemUsersLoading}>
            <RefreshCw size={16} /> {systemUsersLoading ? "読込中..." : "再読込"}
          </button>
        </div>

        {userAdminMessage && <div className="miyamaUserAdminMessage">{userAdminMessage}</div>}

        <div className="miyamaUserCreateCard">
          <div className="miyamaUserCreateTitle">
            <UserPlus size={20} />
            <h3>新規ユーザー作成</h3>
          </div>

          <div className="miyamaUserCreateGrid">
            <label>
              <span>名前</span>
              <input
                value={newSystemUser.name}
                onChange={(e) => setNewSystemUser((p) => ({ ...p, name: e.target.value }))}
                placeholder="例：鈴木 太郎"
              />
            </label>

            <label>
              <span>メールアドレス</span>
              <input
                type="email"
                value={newSystemUser.email}
                onChange={(e) => setNewSystemUser((p) => ({ ...p, email: e.target.value }))}
                placeholder="example@miyama.co.jp"
              />
            </label>

            <label>
              <span>初期パスワード</span>
              <input
                type="password"
                value={newSystemUser.password}
                onChange={(e) => setNewSystemUser((p) => ({ ...p, password: e.target.value }))}
                placeholder="6文字以上"
              />
            </label>

            <label>
              <span>権限</span>
              <select
                value={newSystemUser.role}
                onChange={(e) => setNewSystemUser((p) => ({ ...p, role: e.target.value }))}
              >
                <option value="operator">一般ユーザー</option>
                <option value="inspector">点検者</option>
                <option value="approver">承認者 / 管理者候補</option>
                <option value="viewer">閲覧のみ</option>
                <option value="admin">管理者 / Admin</option>
              </select>
            </label>
          </div>

          <div className="miyamaUserPermissionHelp">
            <b>{userRoleJapanese(newSystemUser.role)}</b>
            {newSystemUser.role === "admin" && <span>：全機能・ユーザー管理・承認・点検</span>}
            {newSystemUser.role === "approver" && <span>：通常操作＋点検＋承認</span>}
            {newSystemUser.role === "inspector" && <span>：通常操作＋点検</span>}
            {newSystemUser.role === "operator" && <span>：通常の保全入力・閲覧</span>}
            {newSystemUser.role === "viewer" && <span>：閲覧専用として使用するアカウント</span>}
          </div>

          <button
            type="button"
            className="primaryButton miyamaCreateUserButton"
            onClick={createSystemUserAccount}
            disabled={creatingSystemUser}
          >
            <UserPlus size={16} />
            {creatingSystemUser ? "作成中..." : "アカウントを作成"}
          </button>
        </div>

        <div className="miyamaUserListCard">
          <div className="miyamaUserListTop">
            <h3>登録ユーザー</h3>
            <span>{systemUsers.length}件</span>
          </div>

          <div className="miyamaUserTableHeader">
            <span>ユーザー</span>
            <span>メール</span>
            <span>権限</span>
            <span>状態</span>
            <span>操作</span>
          </div>

          {systemUsersLoading ? (
            <div className="miyamaUserEmpty">ユーザーを読み込んでいます...</div>
          ) : systemUsers.length === 0 ? (
            <div className="miyamaUserEmpty">ユーザーがありません。</div>
          ) : (
            systemUsers.map((u) => (
              <div className="miyamaUserTableRow" key={u.id}>
                <div className="miyamaUserIdentity">
                  <div className="miyamaUserMiniAvatar">👤</div>
                  <div>
                    <strong>{u.name || "名前未設定"}</strong>
                    {u.id === currentUser?.uid && <small>現在ログイン中</small>}
                  </div>
                </div>

                <span className="miyamaUserEmail">{u.email || "-"}</span>

                <select
                  value={String(u.role || "operator").toLowerCase()}
                  onChange={(e) => updateSystemUserProfile(u.id, { role: e.target.value })}
                  disabled={u.id === currentUser?.uid}
                >
                  <option value="operator">一般ユーザー</option>
                  <option value="inspector">点検者</option>
                  <option value="approver">承認者</option>
                  <option value="viewer">閲覧のみ</option>
                  <option value="admin">管理者</option>
                </select>

                <span className={`miyamaAccountState ${u.active === false ? "off" : "on"}`}>
                  {u.active === false ? "無効" : "有効"}
                </span>

                <button
                  type="button"
                  className={u.active === false ? "miyamaEnableButton" : "miyamaDisableButton"}
                  disabled={u.id === currentUser?.uid}
                  onClick={() => updateSystemUserProfile(u.id, { active: u.active === false })}
                >
                  {u.active === false ? "有効にする" : "無効にする"}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="miyamaUserSecurityNote">
          <b>🔒 セキュリティについて</b>
          <p>
            アカウント作成はFirebase AuthenticationとFirestoreのusers設定を同時に作成します。
            「閲覧のみ」を完全に保護するには、Firestore Security Rules側でもreadOnly/roleを使って書き込みを拒否する設定が必要です。
          </p>
        </div>
      </div>
    );
  }

  function renderCurrentPage() {
    if (page === "home") return renderHome();
    if (page === "ai") return renderMiyamaAi();
    if (page === "report") return renderReports();
    if (page === "maintenance") return renderMaintenance();
    if (page === "dailyProduction") return renderDailyProductionManagement();
    if (page === "spare") return renderSpareParts();
    if (page === "calendar") return renderCalendar();
    if (page === "analytics") return renderMaintenanceAnalysis();
    if (page === "csvAnalytics") return renderCsvAnalysis();
    if (page === "production") return renderCsvAnalysis();
    if (page === "work") return renderPlannedWorks();
    if (page === "miyamaAi") return renderMiyamaAi();
    if (page === "users") return isAdmin ? renderUserManagement() : renderHome();
    return renderHome();
  }

  const menuItems = [
    { key: "home", label: "ホーム", icon: <Home size={16} /> },
    { key: "miyamaAi", label: "MIYAMA AI", icon: <Bot size={16} /> },
    { key: "calendar", label: "カレンダー", icon: <CalendarDays size={16} /> },
    { key: "report", label: "修理報告", icon: <FileText size={16} /> },
    { key: "maintenance", label: "定期保全", icon: <Wrench size={16} /> },
    { key: "work", label: "工事管理", icon: <Hammer size={16} /> },
    { key: "spare", label: "予備品管理", icon: <Package size={16} /> },
    { key: "analytics", label: "保全分析", icon: <BarChart3 size={16} /> },
    { key: "dailyProduction", label: "生産数DB", icon: <BarChart3 size={16} /> },
    { key: "csvAnalytics", label: "CSV分析", icon: <FileSpreadsheet size={16} /> },
    ...(isAdmin ? [{ key: "users", label: "ユーザー管理", icon: <Users size={16} /> }] : []),
  ];

return (
  <div className="page">
    <style>{PROFESSIONAL_RESPONSIVE_CSS}</style>
    <div className="container">

      <div className="tabs miyamaTopNav">
        <button
          type="button"
          className="miyamaNavArrow"
          onClick={() => topMenuRef.current?.scrollBy({ left: -420, behavior: "smooth" })}
          aria-label="前のメニュー"
          title="前のメニュー"
        >
          ‹
        </button>

        <div className="miyamaFixedControls">
          <select
            data-no-translate="true"
            value={appLanguage}
            onChange={(e) => setAppLanguage(e.target.value)}
            title="言語"
            className="miyamaLanguageSelect"
          >
            {Object.entries(MIYAMA_LANGUAGES).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <div
            data-no-translate="true"
            className="miyamaUserBox"
            title={currentUser?.email || ""}
          >
            <div className="miyamaUserAvatar">👤</div>

            <div className="miyamaUserText">
              <strong>{currentUserName}</strong>
              <small>{roleLabel()}</small>
            </div>

            <button
              type="button"
              onClick={logoutCurrentUser}
              className="miyamaLogout"
            >
              Logout
            </button>
          </div>
        </div>

        <div ref={topMenuRef} className="miyamaTopMenuViewport">
          {menuItems.map((item) => (
            <button
              type="button"
              key={item.key}
              className={`miyamaTopMenuButton ${page === item.key ? "active" : ""}`}
              onClick={() => setPage(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="miyamaNavArrow"
          onClick={() => topMenuRef.current?.scrollBy({ left: 420, behavior: "smooth" })}
          aria-label="次のメニュー"
          title="次のメニュー"
        >
          ›
        </button>
      </div>

      {page !== "home" && page !== "miyamaAi" && renderGlobalSearchBox()}

      {renderCurrentPage()}

    </div>
  </div>
);
}