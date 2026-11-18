import { useEffect, useState } from "react";
import "./PublicMachineCard.css";

const empty = "未登録";
const situation = { overdue: "期限超過", due: "本日期限", scheduled: "予定" };
const states = {
  "Aguardando reparo": "未対応", "Reparo em andamento": "対応中", "Reparo concluído": "対応完了",
  "Troca programada registrada": "定期交換の記録あり", "Manutenção preventiva registrada": "定期保全の記録あり",
  "Troca programada concluída": "定期交換完了", "Manutenção preventiva concluída": "定期保全完了",
  "Manutenção corretiva registrada": "修理の記録あり",
};
const formatUpdatedAt = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" });

function Field({ label, value }) {
  return <div><dt>{label}</dt><dd>{value ?? empty}</dd></div>;
}

export default function PublicMachineCard({ machine, onLogin }) {
  const [result, setResult] = useState({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public-machine?" + new URLSearchParams({ machine }), { signal: controller.signal, credentials: "omit" })
      .then(async response => {
        if (response.status === 404) return setResult({ missing: true });
        if (!response.ok) throw new Error("machine-unavailable");
        setResult({ card: await response.json() });
      })
      .catch(error => { if (error.name !== "AbortError") setResult({ error: true }); });
    return () => controller.abort();
  }, [machine]);

  const { card, loading, missing, error } = result;
  return <main className="miyamaPublicPage" lang="ja">
    <header className="miyamaPublicHeader">
      <span>MIYAMA Maintenance</span>
      <button type="button" onClick={onLogin}>ログイン</button>
    </header>
    {loading && <p role="status">設備カルテを読み込み中…</p>}
    {missing && <h1>設備が登録されていません</h1>}
    {error && <p role="alert">設備カルテを読み込めませんでした。ページを再読み込みしてください。</p>}
    {card && <>
      <h1>{card.name}</h1>
      <dl className="miyamaPublicFields">
        <Field label="設備コード" value={card.code} />
        <Field label="登録状態" value={states[card.state]} />
        <Field label="最終更新日時（日本時間）" value={card.updatedAt ? formatUpdatedAt.format(new Date(card.updatedAt)) : null} />
      </dl>
      <section aria-labelledby="public-preventive">
        <h2 id="public-preventive" lang="ja">定期保全</h2>
        <p>交換予定部品</p>
        {card.replacements.length === 0 && <p>交換計画： {empty}</p>}
        {card.replacements.map((part, index) => <article key={index} className="miyamaPublicPart" data-overdue={part.status === "overdue"}>
          <h3>{part.name ?? empty}</h3>
          {part.equipment && <p>{part.equipment}</p>}
          {part.status && <strong className="miyamaPublicBadge">{situation[part.status]}</strong>}
          <dl className="miyamaPublicFields">
            <Field label="部品コード" value={part.code} />
            <Field label="交換予定数量" value={part.plannedQuantity} />
            <Field label="交換周期" value={part.frequency ? `${part.frequency.value.toLocaleString("ja-JP")} ${part.frequency.unit === "days" ? "日" : "個"}` : null} />
            <Field label="前回交換日" value={part.lastDate} />
            <Field label="次回期限" value={part.nextDate} />
            <Field label="状況" value={situation[part.status]} />
          </dl>
        </article>)}
      </section>
      {Array.isArray(card.recentIncidents) && <section aria-labelledby="public-incidents">
        <h2 id="public-incidents">直近の停止・故障</h2>
        {!card.recentIncidents.length && <p>停止・故障の記録はありません。</p>}
        {card.recentIncidents.map((event, index) => <article key={index} className="miyamaPublicPart">
          <h3>{event.date} · {event.type === "stop" ? "設備停止" : "不具合"}</h3>
          {event.equipment && <p>{event.equipment}</p>}
          <dl className="miyamaPublicFields">
            <Field label="停止時間" value={event.downtimeHours ? `${event.downtimeHours} 時間` : null} />
            <Field label="対応内容" value={event.action} />
            <Field label="対応状況" value={states[event.state]} />
          </dl>
        </article>)}
      </section>}
      <section aria-labelledby="public-last">
        <h2 id="public-last">前回の保全</h2>
        <dl className="miyamaPublicFields">
          <Field label="日付" value={card.lastMaintenance?.date} />
          <Field label="概要" value={states[card.lastMaintenance?.summary]} />
        </dl>
      </section>
    </>}
  </main>;
}
