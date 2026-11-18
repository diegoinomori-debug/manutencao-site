import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { completePreventiveTask, createPreventiveTask, nextPreventiveDate, preventiveCollection, preventiveDate } from "../utils/machinePreventive";
import { normalizeDateOnly } from "../utils/reportDates";
import "./MachineCard.css";

function TaskHistory({ id, en }) {
  const [entries, setEntries] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => onSnapshot(
    query(collection(doc(db, preventiveCollection, id), "completions"), orderBy("at", "desc"), limit(20)),
    snapshot => setEntries(snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() }))),
    () => setFailed(true),
  ), [id]);
  if (failed) return <p role="alert">{en ? "Could not load completions." : "実施履歴を読み込めませんでした。"}</p>;
  if (!entries) return <p>{en ? "Loading…" : "読み込み中…"}</p>;
  if (!entries.length) return <p>{en ? "No completions recorded." : "実施履歴はありません。"}</p>;
  return <ul>{entries.map(entry => <li key={entry.id}>{preventiveDate(entry.at)} · {entry.actorName}</li>)}</ul>;
}

export default function MachineCard({ machine, label, en, legacy, latest, latestState, formatReportDate,
  openReport, openHistory, canCreate, canComplete, actor }) {
  const [tasks, setTasks] = useState(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [showHistory, setShowHistory] = useState({});
  useEffect(() => onSnapshot(query(collection(db, preventiveCollection), where("machine", "==", machine)),
    snapshot => setTasks(snapshot.docs.map(item => ({ id: item.id, ...item.data({ serverTimestamps: "estimate" }) }))),
    () => setFailed(true),
  ), [machine]);

  const recurring = (tasks || []).map(task => ({ ...task, due: nextPreventiveDate(task) }))
    .sort((left, right) => left.due.localeCompare(right.due));
  const next = [...recurring, ...legacy.filter(item => item.nextDate).map(item => ({
    due: item.nextDate, title: item.maintenanceDetail || item.partName,
  }))].sort((left, right) => left.due.localeCompare(right.due))[0];
  const last = [
    ...recurring.filter(task => task.lastCompletedAt).map(task => ({
      date: preventiveDate(task.lastCompletedAt), title: task.title, actor: task.lastActorName,
    })),
    ...legacy.filter(item => item.lastDate).map(item => ({
      date: normalizeDateOnly(item.lastDate), title: item.maintenanceDetail || item.partName,
    })),
    ...(latest ? [{ date: formatReportDate(latest), title: latest.action || latest.phenomenon || latest.troublePoint }] : []),
  ].filter(item => item.date).sort((left, right) => right.date.localeCompare(left.date))[0];

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setMessage("");
    try {
      await createPreventiveTask(db, { machine, title: String(values.get("title")), firstDue: String(values.get("firstDue")),
        intervalDays: Number(values.get("intervalDays")),
        replacementPartName: String(values.get("partName")), replacementPartCode: String(values.get("partCode")),
        plannedReplacementQty: values.get("plannedQuantity") ? Number(values.get("plannedQuantity")) : null,
      });
      form.reset();
      setMessage(en ? "Preventive task created." : "定期保全タスクを登録しました。");
    } catch {
      setMessage(en ? "Could not create the task. Check the values and your permissions." : "登録できませんでした。入力内容と権限を確認してください。");
    } finally {
      setPending(false);
    }
  }

  async function complete(task) {
    setPending(true);
    setMessage("");
    try {
      const changed = await completePreventiveTask(db, task, actor);
      setMessage(changed
        ? (en ? "Completion recorded." : "実施完了を記録しました。")
        : (en ? "This occurrence was already completed." : "この回は既に実施済みです。"));
    } catch {
      setMessage(en ? "Could not record completion." : "実施完了を記録できませんでした。");
    } finally {
      setPending(false);
    }
  }

  return <section className="miyamaMachineCard" aria-label={en ? "Machine card" : "設備の概要"} data-no-translate="true">
    <h2>{label}</h2>
    <div className="miyamaMachineSummary">
      <div>
        <h3>{en ? "Next preventive task" : "次回の定期保全"}</h3>
        <p>{next ? [next.due, next.title].filter(Boolean).join(" · ")
          : tasks === null && !failed ? (en ? "Loading…" : "読み込み中…")
            : failed ? (en ? "Schedule unavailable." : "予定を読み込めませんでした。")
              : (en ? "No preventive task scheduled." : "定期保全の予定はありません。")}</p>
      </div>
      <div>
        <h3>{en ? "Last maintenance" : "前回の保全"}</h3>
        <p>{last ? [last.date, last.title, last.actor].filter(Boolean).join(" · ")
          : latestState === "loading" || (tasks === null && !failed) ? (en ? "Loading…" : "読み込み中…")
            : latestState === "error" || failed ? (en ? "History unavailable." : "履歴を読み込めませんでした。")
              : (en ? "No maintenance recorded." : "保全の記録はありません。")}</p>
      </div>
    </div>
    <nav className="miyamaMachineActions" aria-label={en ? "Machine shortcuts" : "設備のショートカット"}>
      <button type="button" className="primaryButton" onClick={openHistory}>{en ? "Repair history" : "修理履歴へ"}</button>
      {latest && <button type="button" className="primaryButton" onClick={() => openReport(latest)}>
        {en ? "Open latest repair report" : "最新の修理報告書を開く"}
      </button>}
    </nav>
    <details className="miyamaMachineTasks">
      <summary>{en ? "Recurring preventive tasks" : "定期保全タスク"}{tasks && ` (${tasks.length})`}</summary>
      {failed && <p role="alert">{en ? "Could not load recurring tasks." : "定期保全タスクを読み込めませんでした。"}</p>}
      {tasks?.length === 0 && <p>{en ? "No recurring task registered." : "定期保全タスクは未登録です。"}</p>}
      {canCreate && <form className="miyamaMachineForm" onSubmit={save}>
        <fieldset disabled={pending}>
          <legend>{en ? "Add a recurring task" : "定期保全タスクを登録"}</legend>
          <label>{en ? "Task" : "作業内容"}<input name="title" required maxLength={120} /></label>
          <label>{en ? "First due date" : "初回期限"}<input name="firstDue" type="date" required min="2000-01-01" max="2099-12-31" /></label>
          <label>{en ? "Repeat every (days)" : "周期（日）"}<input name="intervalDays" type="number" required min={1} max={3650} /></label>
          <label>{en ? "Public replacement part name (optional)" : "公開用の交換部品名（任意）"}<input name="partName" maxLength={120} /></label>
          <label>{en ? "Public replacement part code (optional)" : "公開用の交換部品コード（任意）"}<input name="partCode" maxLength={80} /></label>
          <label>{en ? "Planned replacement quantity (optional)" : "交換予定数量（任意）"}
            <input name="plannedQuantity" type="number" min={1} step={1} />
          </label>
          <button type="submit" className="primaryButton">{en ? "Add task" : "タスクを登録"}</button>
        </fieldset>
      </form>}
      <p role="status">{message}</p>
      {recurring.map(task => <article className="miyamaMachineTask" key={task.id}>
        <h4>{task.title}</h4>
        <p>{en ? "Next due" : "次回期限"}: {task.due} · {task.intervalDays} {en ? "days" : "日周期"}</p>
        {canComplete && <button type="button" className="primaryButton" disabled={pending}
          onClick={() => complete(task)}>{en ? "Record completion" : "実施完了を記録"}</button>}
        <details onToggle={event => {
          const opened = event.currentTarget.open;
          setShowHistory(current => ({ ...current, [task.id]: opened }));
        }}>
          <summary>{en ? "Completion history" : "実施履歴"}</summary>
          {showHistory[task.id] && <TaskHistory id={task.id} en={en} />}
        </details>
      </article>)}
    </details>
  </section>;
}
