// ======================================================
// MIYAMA AI
// similarity.js
// Versão 2.0
// ======================================================

// Normaliza texto
function normalize(text = "") {
    return String(text ?? "")
        .toLowerCase()
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
            String.fromCharCode(c.charCodeAt(0) - 65248)
        )
        .replace(/[^\w\u3040-\u30ff\u3400-\u9fff]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Separa palavras
function words(text = "") {
    return normalize(text)
        .split(" ")
        .filter(Boolean);
}

// Similaridade Jaccard
function jaccard(a = "", b = "") {

    const A = new Set(words(a));
    const B = new Set(words(b));

    if (A.size === 0 && B.size === 0)
        return 1;

    if (A.size === 0 || B.size === 0)
        return 0;

    let intersection = 0;

    for (const word of A) {
        if (B.has(word))
            intersection++;
    }

    const union = new Set([...A, ...B]).size;

    return union === 0 ? 0 : intersection / union;
}

// Obtém valor de forma segura
function value(obj, field) {
    return obj?.[field] ?? "";
}

// Calcula a similaridade entre dois problemas
export function calculateSimilarity(problem = {}, report = {}) {

    const weights = {
        equipment: 25,
        lineName: 10,
        machineName: 10,
        phenomenon: 20,
        troublePoint: 10,
        why1: 5,
        why2: 5,
        why3: 5,
        action: 10
    };

    let score = 0;

    Object.entries(weights).forEach(([field, weight]) => {

        score +=
            jaccard(
                value(problem, field),
                value(report, field)
            ) * weight;

    });

    return Math.round(score);
}

// Ordena pela similaridade
export function sortBySimilarity(problem = {}, reports = []) {

    if (!Array.isArray(reports))
        return [];

    return reports
        .map(report => ({
            ...report,
            similarity: calculateSimilarity(problem, report)
        }))
        .sort((a, b) => b.similarity - a.similarity);

}

// Retorna somente os melhores
export function getTopMatches(problem = {}, reports = [], limit = 10) {

    return sortBySimilarity(problem, reports)
        .filter(item => item.similarity >= 20)
        .slice(0, limit);

}