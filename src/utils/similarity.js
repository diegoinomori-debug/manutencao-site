// ======================================================
// MIYAMA AI - similarity.js
// Busca local por similaridade para português técnico, inglês e japonês.
// ======================================================

function normalizeText(value = "") {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—―ー]/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeTokens(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) return new Set();

  const tokens = new Set(normalized.split(" ").filter(Boolean));

  // Japonês geralmente não possui espaços. Bigramas permitem encontrar
  // frases parecidas como リベット詰まり / リベットつまり.
  const compact = normalized.replace(/\s+/g, "");
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(compact)) {
    for (let index = 0; index < compact.length - 1; index += 1) {
      tokens.add(compact.slice(index, index + 2));
    }
  }

  return tokens;
}

function jaccardSimilarity(left = "", right = "") {
  const setA = makeTokens(left);
  const setB = makeTokens(right);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }

  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize ? intersection / unionSize : 0;
}

function containsBonus(left = "", right = "") {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.65;
  return 0;
}

function fieldSimilarity(left = "", right = "") {
  return Math.max(jaccardSimilarity(left, right), containsBonus(left, right));
}

export function calculateSimilarity(problem = {}, report = {}) {
  const fields = [
    ["equipment", 28],
    ["lineName", 10],
    ["machineName", 5],
    ["phenomenon", 25],
    ["troublePoint", 15],
    ["why1", 4],
    ["why2", 3],
    ["why3", 3],
    ["action", 4],
    ["replacedPart", 3],
  ];

  let weightedScore = 0;
  let activeWeight = 0;

  for (const [field, weight] of fields) {
    const queryValue = problem?.[field] ?? "";
    if (!normalizeText(queryValue)) continue;

    activeWeight += weight;
    weightedScore += fieldSimilarity(queryValue, report?.[field] ?? "") * weight;
  }

  if (!activeWeight) return 0;

  return Math.max(0, Math.min(100, Math.round((weightedScore / activeWeight) * 100)));
}

export function sortBySimilarity(problem = {}, reports = []) {
  if (!Array.isArray(reports)) return [];

  return reports
    .filter(Boolean)
    .map((report) => ({
      ...report,
      similarity: calculateSimilarity(problem, report),
    }))
    .sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
}

export function getTopMatches(problem = {}, reports = [], limit = 10, minimumScore = 18) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));

  return sortBySimilarity(problem, reports)
    .filter((item) => item.similarity >= minimumScore)
    .slice(0, safeLimit);
}
