import { useEffect, useState } from "react";
import "./PublicMachineCard.css";

const empty = "Não cadastrado";
const situation = { overdue: "Vencida", due: "Vence hoje", scheduled: "Programada" };
const formatUpdatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" });

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
  return <main className="miyamaPublicPage" lang="pt-BR">
    <header className="miyamaPublicHeader">
      <span>MIYAMA Maintenance</span>
      <button type="button" onClick={onLogin}>Entrar</button>
    </header>
    {loading && <p role="status">Carregando ficha…</p>}
    {missing && <h1>Máquina não cadastrada</h1>}
    {error && <p role="alert">Não foi possível carregar a ficha. Recarregue a página para tentar novamente.</p>}
    {card && <>
      <h1>{card.name}</h1>
      <dl className="miyamaPublicFields">
        <Field label="Código da máquina" value={card.code} />
        <Field label="Estado registrado" value={card.state} />
        <Field label="Última atualização (Japão)" value={card.updatedAt ? formatUpdatedAt.format(new Date(card.updatedAt)) : null} />
      </dl>
      <section aria-labelledby="public-preventive">
        <h2 id="public-preventive" lang="ja">定期保全</h2>
        <p>Trocas programadas</p>
        {card.replacements.length === 0 && <p>Plano de troca: {empty}</p>}
        {card.replacements.map((part, index) => <article key={index} className="miyamaPublicPart" data-overdue={part.status === "overdue"}>
          <h3>{part.name ?? empty}</h3>
          {part.status && <strong className="miyamaPublicBadge">{situation[part.status]}</strong>}
          <dl className="miyamaPublicFields">
            <Field label="Código da peça" value={part.code} />
            <Field label="Quantidade prevista" value={part.plannedQuantity} />
            <Field label="Frequência de troca" value={part.frequency ? `${part.frequency.value.toLocaleString("pt-BR")} ${part.frequency.unit === "days" ? "dias" : "unidades"}` : null} />
            <Field label="Última troca" value={part.lastDate} />
            <Field label="Próximo vencimento" value={part.nextDate} />
            <Field label="Situação" value={situation[part.status]} />
          </dl>
        </article>)}
      </section>
      <section aria-labelledby="public-last">
        <h2 id="public-last">Última manutenção</h2>
        <dl className="miyamaPublicFields">
          <Field label="Data" value={card.lastMaintenance?.date} />
          <Field label="Resumo" value={card.lastMaintenance?.summary} />
        </dl>
      </section>
    </>}
  </main>;
}
