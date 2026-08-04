// ==========================================================
// MIYAMA AI - historySearch.js
// Pesquisa os relatórios que já estão carregados no App.jsx.
// ==========================================================

import { getTopMatches } from "../utils/similarity";

function safeText(value = "") {
  return String(value ?? "").normalize("NFKC").toLowerCase().trim();
}

function reportSearchText(report = {}) {
  return [
    report.createdAt,
    report.reportCreatedDate,
    report.equipment,
    report.machineName,
    report.lineName,
    report.phenomenon,
    report.troublePoint,
    report.why1,
    report.why2,
    report.why3,
    report.action,
    report.recurrencePrevention,
    report.note,
    report.replacedPart,
    report.partName1,
    report.partName2,
    report.partName3,
    report.worker,
    report.owner,
  ]
    .map(safeText)
    .join(" ");
}

export function searchHistory(currentProblem = {}, reports = [], options = {}) {
  if (!Array.isArray(reports)) return [];

  const limit = options.limit ?? 10;
  const minimumScore = options.minimumScore ?? 18;

  return getTopMatches(currentProblem, reports, limit, minimumScore);
}

export function searchByText(text = "", reports = [], limit = 50) {
  const keywords = safeText(text).split(/\s+/).filter(Boolean);
  if (!keywords.length || !Array.isArray(reports)) return [];

  return reports
    .filter((report) => {
      const content = reportSearchText(report);
      return keywords.every((keyword) => content.includes(keyword));
    })
    .slice(0, Math.max(1, Number(limit) || 50));
}

export function searchEquipment(equipment = "", reports = []) {
  const keyword = safeText(equipment);
  if (!keyword || !Array.isArray(reports)) return [];
  return reports.filter((report) => safeText(report?.equipment).includes(keyword));
}

export function searchPhenomenon(phenomenon = "", reports = []) {
  const keyword = safeText(phenomenon);
  if (!keyword || !Array.isArray(reports)) return [];
  return reports.filter((report) => safeText(report?.phenomenon).includes(keyword));
}

export function searchPart(part = "", reports = []) {
  const keyword = safeText(part);
  if (!keyword || !Array.isArray(reports)) return [];

  return reports.filter((report) =>
    [
      report?.replacedPart,
      report?.partName1,
      report?.partName2,
      report?.partName3,
      report?.failurePart,
    ]
      .map(safeText)
      .join(" ")
      .includes(keyword)
  );
}

export function getHistoryStatistics(reports = []) {
  const rows = Array.isArray(reports) ? reports : [];
  const uniqueCount = (field) =>
    new Set(rows.map((row) => safeText(row?.[field])).filter(Boolean)).size;

  return {
    totalReports: rows.length,
    equipments: uniqueCount("equipment"),
    machines: uniqueCount("machineName"),
    lines: uniqueCount("lineName"),
  };
}
