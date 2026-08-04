// ==========================================================
// MIYAMA AI
// Busca Inteligente no Histórico
// Desenvolvido para MIYAMA Maintenance
// ==========================================================

import { getTopMatches } from "../utils/similarity";

/**
 * Procura os problemas mais parecidos
 * @param {Object} currentProblem Problema atual
 * @param {Array} reports Lista completa de relatórios
 * @returns {Array}
 */
export function searchHistory(currentProblem, reports = []) {

    if (!Array.isArray(reports))
        return [];

    return getTopMatches(currentProblem, reports, 10);

}

/**
 * Pesquisa por texto livre
 */
export function searchByText(text = "", reports = []) {

    const keyword = text.toLowerCase().trim();

    if (!keyword)
        return [];

    return reports.filter(report => {

        return [

            report.equipment,
            report.machineName,
            report.lineName,
            report.phenomenon,
            report.troublePoint,
            report.action,
            report.why1,
            report.why2,
            report.why3,
            report.memo,
            report.partName,
            report.failurePart

        ]
            .join(" ")
            .toLowerCase()
            .includes(keyword);

    });

}

/**
 * Pesquisa por equipamento
 */
export function searchEquipment(equipment, reports = []) {

    return reports.filter(r =>

        (r.equipment || "")
            .toLowerCase()
            .includes(equipment.toLowerCase())

    );

}

/**
 * Pesquisa por fenômeno
 */
export function searchPhenomenon(text, reports = []) {

    return reports.filter(r =>

        (r.phenomenon || "")
            .toLowerCase()
            .includes(text.toLowerCase())

    );

}

/**
 * Pesquisa por peça
 */
export function searchPart(text, reports = []) {

    return reports.filter(r =>

        (
            (r.partName || "") +
            " " +
            (r.failurePart || "")
        )
            .toLowerCase()
            .includes(text.toLowerCase())

    );

}

/**
 * Estatísticas do histórico
 */
export function getHistoryStatistics(reports = []) {

    return {

        totalReports: reports.length,

        equipments: new Set(
            reports.map(r => r.equipment)
        ).size,

        machines: new Set(
            reports.map(r => r.machineName)
        ).size,

        lines: new Set(
            reports.map(r => r.lineName)
        ).size

    };

}