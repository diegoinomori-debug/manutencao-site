// ==========================================================
// MIYAMA AI
// History Search V2
// Desenvolvido para MIYAMA Maintenance
// ==========================================================

import { getTopMatches } from "../utils/similarity";

/**
 * Pesquisa inteligente
 */
export function searchHistory(currentProblem = {}, reports = []) {

    if (!Array.isArray(reports))
        return [];

    return getTopMatches(currentProblem, reports, 10);

}

/**
 * Valor seguro
 */
function safe(value) {
    return String(value ?? "").toLowerCase();
}

/**
 * Pesquisa texto livre
 */
export function searchByText(text = "", reports = []) {

    const keyword = safe(text).trim();

    if (!keyword)
        return [];

    return reports.filter(report => {

        const content = [

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
            report.failurePart,
            report.owner,
            report.worker

        ]
            .map(safe)
            .join(" ");

        return content.includes(keyword);

    });

}

/**
 * Pesquisa equipamento
 */
export function searchEquipment(equipment = "", reports = []) {

    const keyword = safe(equipment);

    return reports.filter(r =>
        safe(r.equipment).includes(keyword)
    );

}

/**
 * Pesquisa máquina
 */
export function searchMachine(machine = "", reports = []) {

    const keyword = safe(machine);

    return reports.filter(r =>
        safe(r.machineName).includes(keyword)
    );

}

/**
 * Pesquisa linha
 */
export function searchLine(line = "", reports = []) {

    const keyword = safe(line);

    return reports.filter(r =>
        safe(r.lineName).includes(keyword)
    );

}

/**
 * Pesquisa fenômeno
 */
export function searchPhenomenon(text = "", reports = []) {

    const keyword = safe(text);

    return reports.filter(r =>
        safe(r.phenomenon).includes(keyword)
    );

}

/**
 * Pesquisa peça
 */
export function searchPart(text = "", reports = []) {

    const keyword = safe(text);

    return reports.filter(r =>

        (
            safe(r.partName) +
            " " +
            safe(r.failurePart)
        )

        .includes(keyword)

    );

}

/**
 * Estatísticas
 */
export function getHistoryStatistics(reports = []) {

    if (!Array.isArray(reports)) {

        return {

            totalReports: 0,
            equipments: 0,
            machines: 0,
            lines: 0

        };

    }

    return {

        totalReports: reports.length,

        equipments: new Set(
            reports.map(r => safe(r.equipment))
        ).size,

        machines: new Set(
            reports.map(r => safe(r.machineName))
        ).size,

        lines: new Set(
            reports.map(r => safe(r.lineName))
        ).size

    };

}