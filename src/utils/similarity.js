// ======================================================
// MIYAMA AI
// similarity.js
// Desenvolvido para o Sistema MIYAMA Maintenance
// ======================================================

// Normaliza texto
function normalize(text = "") {
    return String(text)
        .toLowerCase()
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
            String.fromCharCode(c.charCodeAt(0) - 65248)
        )
        .replace(/[^\w\u3040-\u30ff\u3400-\u9fff]+/g, " ")
        .trim();
}

// Divide palavras
function words(text = "") {
    return normalize(text)
        .split(/\s+/)
        .filter(Boolean);
}

// Similaridade Jaccard
function jaccard(a = "", b = "") {

    const A = new Set(words(a));
    const B = new Set(words(b));

    if (A.size === 0 || B.size === 0)
        return 0;

    let same = 0;

    A.forEach(w => {
        if (B.has(w))
            same++;
    });

    const total = new Set([...A, ...B]).size;

    return same / total;
}

// Similaridade entre dois relatórios
export function calculateSimilarity(problem, report){

    let score = 0;

    score += jaccard(problem.equipment, report.equipment) * 25;

    score += jaccard(problem.lineName, report.lineName) * 10;

    score += jaccard(problem.machineName, report.machineName) * 10;

    score += jaccard(problem.phenomenon, report.phenomenon) * 20;

    score += jaccard(problem.troublePoint, report.troublePoint) * 10;

    score += jaccard(problem.why1, report.why1) * 5;

    score += jaccard(problem.why2, report.why2) * 5;

    score += jaccard(problem.why3, report.why3) * 5;

    score += jaccard(problem.action, report.action) * 10;

    return Math.round(score);

}

// Ordena pela similaridade
export function sortBySimilarity(problem, reports){

    return reports
        .map(report=>({

            ...report,

            similarity: calculateSimilarity(problem, report)

        }))
        .sort((a,b)=>b.similarity-a.similarity);

}

// Retorna somente os melhores casos
export function getTopMatches(problem, reports, limit = 10){

    return sortBySimilarity(problem, reports)

        .filter(r=>r.similarity>20)

        .slice(0,limit);

}