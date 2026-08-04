import React, { useMemo } from "react";

const LABELS = {
  ja: {
    title: "過去の類似トラブル",
    found: "件の類似事例が見つかりました",
    none: "類似する過去事例は見つかりませんでした。",
    similarity: "類似",
    date: "日付",
    equipment: "設備",
    line: "ライン",
    symptom: "不具合現象",
    point: "不具合箇所",
    cause: "過去の原因",
    action: "過去の処置",
    prevention: "再発防止",
    part: "交換部品",
    downtime: "停止時間",
    average: "平均停止時間",
    commonCause: "最多原因",
    commonPart: "最多交換部品",
    open: "報告書全文を表示",
    cases: "類似件数",
  },
  en: {
    title: "Similar Previous Problems",
    found: "similar cases found",
    none: "No sufficiently similar previous case was found.",
    similarity: "similar",
    date: "Date",
    equipment: "Equipment",
    line: "Line",
    symptom: "Failure symptom",
    point: "Failure point",
    cause: "Previous cause",
    action: "Previous action",
    prevention: "Recurrence prevention",
    part: "Replaced part",
    downtime: "Downtime",
    average: "Average downtime",
    commonCause: "Most common cause",
    commonPart: "Most common replaced part",
    open: "Show full report",
    cases: "Similar cases",
  },
  es: {
    title: "Problemas anteriores similares",
    found: "casos similares encontrados",
    none: "No se encontró ningún caso anterior suficientemente similar.",
    similarity: "similar",
    date: "Fecha",
    equipment: "Equipo",
    line: "Línea",
    symptom: "Síntoma de la falla",
    point: "Punto de la falla",
    cause: "Causa anterior",
    action: "Acción utilizada",
    prevention: "Prevención de recurrencia",
    part: "Pieza reemplazada",
    downtime: "Tiempo de parada",
    average: "Tiempo promedio de parada",
    commonCause: "Causa más frecuente",
    commonPart: "Pieza reemplazada más frecuente",
    open: "Mostrar informe completo",
    cases: "Casos similares",
  },
};

function firstText(...values) {
  return values.find((value) => String(value ?? "").trim()) || "";
}

function toNumber(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateDowntime(report = {}) {
  const direct = toNumber(report.stopTimeHours);
  if (direct > 0) return direct;

  const startValue = report.troubleDateTime || report.workStartDateTime;
  const endValue = report.productionStartDateTime || report.workEndDateTime;
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const excluded = Math.max(
    0,
    toNumber(report.stopExclusionHours ?? report.stopExclusionTime)
  );

  return Math.max(0, (end - start) / 3600000 - excluded);
}

function mostFrequent(values = []) {
  const frequency = new Map();

  values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .forEach((value) => frequency.set(value, (frequency.get(value) || 0) + 1));

  return [...frequency.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function stars(score = 0) {
  const filled = Math.max(0, Math.min(10, Math.round(Number(score || 0) / 10)));
  return `${"★".repeat(filled)}${"☆".repeat(10 - filled)}`;
}

export default function SimilarProblems({
  problems = [],
  onOpenReport,
  language = "ja",
}) {
  const t = LABELS[language] || LABELS.ja;
  const rows = Array.isArray(problems) ? problems : [];

  const statistics = useMemo(() => {
    const downtimes = rows.map(calculateDowntime).filter((value) => value > 0);
    const averageDowntime = downtimes.length
      ? downtimes.reduce((sum, value) => sum + value, 0) / downtimes.length
      : 0;

    const causes = rows.map((row) => firstText(row.why3, row.why2, row.why1));
    const parts = rows.map((row) =>
      firstText(row.replacedPart, row.partName1, row.partName2, row.partName3)
    );

    return {
      averageDowntime,
      commonCause: mostFrequent(causes),
      commonPart: mostFrequent(parts),
    };
  }, [rows]);

  return (
    <section
      style={{
        margin: "16px 0",
        padding: "16px",
        border: "1px solid #bfdbfe",
        borderRadius: "16px",
        background: "linear-gradient(135deg, #eff6ff, #ffffff)",
      }}
    >
      <h2 style={{ margin: "0 0 6px", fontSize: "22px" }}>
        🤖 MIYAMA AI — {t.title}
      </h2>

      {rows.length === 0 ? (
        <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>{t.none}</p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "10px",
              margin: "12px 0",
            }}
          >
            <div style={metricStyle}>
              <span>{t.cases}</span>
              <strong>{rows.length}</strong>
            </div>
            <div style={metricStyle}>
              <span>{t.average}</span>
              <strong>
                {statistics.averageDowntime
                  ? `${statistics.averageDowntime.toFixed(2)} h`
                  : "-"}
              </strong>
            </div>
            <div style={metricStyle}>
              <span>{t.commonCause}</span>
              <strong style={{ fontSize: "15px" }}>{statistics.commonCause || "-"}</strong>
            </div>
            <div style={metricStyle}>
              <span>{t.commonPart}</span>
              <strong style={{ fontSize: "15px" }}>{statistics.commonPart || "-"}</strong>
            </div>
          </div>

          <p style={{ margin: "0 0 12px", color: "#475569", fontWeight: 700 }}>
            {rows.length} {t.found}
          </p>

          <div style={{ display: "grid", gap: "12px" }}>
            {rows.map((problem, index) => {
              const date = firstText(
                problem.createdAt,
                problem.reportCreatedDate,
                problem.troubleDateTime
              );
              const cause = firstText(problem.why3, problem.why2, problem.why1);
              const part = firstText(
                problem.replacedPart,
                problem.partName1,
                problem.partName2,
                problem.partName3
              );
              const downtime = calculateDowntime(problem);

              return (
                <article
                  key={problem.id || `${date}-${index}`}
                  style={{
                    padding: "14px",
                    border: "1px solid #dbeafe",
                    borderRadius: "14px",
                    background: "#fff",
                    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginBottom: "8px",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "19px", color: "#1d4ed8" }}>
                        {problem.similarity || 0}% {t.similarity}
                      </strong>
                      <div
                        aria-label={`${problem.similarity || 0}%`}
                        style={{ color: "#f59e0b", letterSpacing: "1px", marginTop: "3px" }}
                      >
                        {stars(problem.similarity)}
                      </div>
                    </div>
                    <span style={{ color: "#64748b", fontWeight: 700 }}>
                      {t.date}: {date || "-"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gap: "5px", lineHeight: 1.5 }}>
                    <div><strong>{t.equipment}:</strong> {problem.equipment || "-"}</div>
                    {problem.lineName && <div><strong>{t.line}:</strong> {problem.lineName}</div>}
                    <div><strong>{t.symptom}:</strong> {problem.phenomenon || "-"}</div>
                    {problem.troublePoint && (
                      <div><strong>{t.point}:</strong> {problem.troublePoint}</div>
                    )}
                    {cause && <div><strong>{t.cause}:</strong> {cause}</div>}
                    {problem.action && <div><strong>{t.action}:</strong> {problem.action}</div>}
                    {problem.recurrencePrevention && (
                      <div><strong>{t.prevention}:</strong> {problem.recurrencePrevention}</div>
                    )}
                    {part && <div><strong>{t.part}:</strong> {part}</div>}
                    <div>
                      <strong>{t.downtime}:</strong>{" "}
                      {downtime > 0 ? `${downtime.toFixed(2)} h` : "-"}
                    </div>
                  </div>

                  {typeof onOpenReport === "function" && (
                    <button
                      type="button"
                      className="primaryButton"
                      onClick={() => onOpenReport(problem)}
                      style={{ marginTop: "12px" }}
                    >
                      ▶ {t.open}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

const metricStyle = {
  padding: "12px",
  border: "1px solid #dbeafe",
  borderRadius: "12px",
  background: "#ffffff",
  display: "grid",
  gap: "4px",
};

