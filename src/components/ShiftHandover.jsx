import { useEffect, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { equipmentLabel } from "../utils/equipmentIdentity";
import { addHandover, closeHandover, handoverCollection, ongoingIncidents, pendingRepairStatuses } from "../utils/shiftHandover";
import "./ShiftHandover.css";

const dateTime = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" });
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());

export default function ShiftHandover({ reports, machines, writable, actor, openMachine }) {
  const [open, setOpen] = useState(null);
  const [history, setHistory] = useState(null);
  const [trackedReports, setTrackedReports] = useState(null);
  const [reportError, setReportError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [machine, setMachine] = useState("");
  const [situation, setSituation] = useState("");
  const formRef = useRef(null);
  const lock = useRef(false);

  useEffect(() => {
    const ref = collection(db, handoverCollection);
    const fail = () => setReadError(true);
    const subscribe = (source, update) => onSnapshot(source,
      snapshot => update(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))), fail);
    const stopOpen = subscribe(query(ref, where("status", "==", "open")), setOpen);
    const stopHistory = subscribe(query(ref, orderBy("closedAt", "desc"), limit(30)), setHistory);
    const reportsRef = collection(db, "maintenanceReports");
    const stopTracked = onSnapshot(query(reportsRef, where("repairStatus", "in", pendingRepairStatuses)),
      snapshot => setTrackedReports(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))),
      () => setReportError(true));
    return () => { stopOpen(); stopHistory(); stopTracked(); };
  }, []);

  async function save(action, success) {
    if (!writable || lock.current) return;
    setMessage("");
    lock.current = true;
    setBusy(true);
    try {
      const result = await action();
      setMessage(result === false ? "この項目はすでに完了しています。" : success);
    } catch (error) {
      setMessage(error.message === "invalid-handover" ? "入力内容を確認してください。" : "保存できませんでした。権限と接続を確認してください。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    void save(async () => {
      if (!machines.includes(values.machine)) throw new Error("invalid-handover");
      await addHandover(db, values, actor);
      form.reset();
      setMachine("");
      setSituation("");
    }, "引継ぎ事項を登録しました。");
  }

  const machineButton = key => <button type="button" onClick={() => openMachine(key)}>設備カルテを開く</button>;
  const reportRows = new Map(reports.map(row => [row.id, row]));
  for (const row of trackedReports || []) reportRows.set(row.id, row);
  const incidents = ongoingIncidents([...reportRows.values()]).sort((a, b) => b.date.localeCompare(a.date));
  const items = (open || []).slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  function entry(item, closed) {
    const closedDate = item.closedAt?.toDate();
    return <article key={item.id}>
      <h3>{equipmentLabel(item.machine)}</h3>
      <dl>
        <div><dt>状況</dt><dd>{item.situation}</dd></div>
        <div><dt>次の対応</dt><dd>{item.nextAction}</dd></div>
        <div><dt>担当者</dt><dd>{item.assignee}</dd></div>
        <div><dt>対応予定日</dt><dd>{item.dueDate}</dd></div>
        {closed && <div><dt>完了者・日時</dt><dd>{item.closedByName} · {closedDate ? dateTime.format(closedDate) : "保存中…"}</dd></div>}
      </dl>
      <div className="shiftHandoverActions">
        {machineButton(item.machine)}
        {!closed && writable && <button type="button" disabled={busy} onClick={() => {
          if (window.confirm("この引継ぎ事項を完了にしますか？")) void save(() => closeHandover(db, item.id, actor), "引継ぎ事項を完了しました。");
        }}>完了にする</button>}
      </div>
    </article>;
  }

  return <main className="shiftHandover" data-no-translate="true">
    <h2>交替勤務の引継ぎ</h2>
    {readError && <p role="alert">引継ぎ事項を読み込めませんでした。権限と接続を確認してください。</p>}
    <p role="status">{busy ? "保存中…" : message}</p>
    <section aria-labelledby="shift-open">
      <h3 id="shift-open">未完了の引継ぎ事項{open && `（${open.length}件）`}</h3>
      {!open && !readError && <p>読込中…</p>}
      {open && !open.length && <p>未完了の引継ぎ事項はありません。</p>}
      <div className="shiftHandoverGrid">{items.map(item => entry(item, false))}</div>
    </section>
    {writable && <section aria-labelledby="shift-new">
      <h3 id="shift-new">引継ぎ事項を登録</h3>
      <form ref={formRef} onSubmit={submit}>
        <label>設備<select name="machine" required value={machine} onChange={e => setMachine(e.target.value)}>
          <option value="">設備を選択</option>
          {machines.map(key => <option value={key} key={key}>{equipmentLabel(key)}</option>)}
        </select></label>
        <label>状況<textarea name="situation" maxLength={500} required value={situation} onChange={e => setSituation(e.target.value)} /></label>
        <label>次の対応<textarea name="nextAction" maxLength={500} required /></label>
        <label>担当者<input name="assignee" maxLength={120} required /></label>
        <label>対応予定日<input name="dueDate" type="date" min="2000-01-01" max="2099-12-31" defaultValue={today()} required /></label>
        <button className="primaryButton" disabled={busy}>登録する</button>
      </form>
    </section>}
    <section aria-labelledby="shift-incidents">
      <h3 id="shift-incidents">停止・修理対応中の報告</h3>
      <p>対応中・未対応の修理と、読み込み済みの報告にある未復帰の停止を表示しています。</p>
      {reportError && <p role="alert">修理対応の一覧を更新できませんでした。読み込み済みの報告を表示しています。</p>}
      {!trackedReports && !reportError && <p>修理対応を確認中…</p>}
      {trackedReports && !incidents.length && <p>該当する報告はありません。</p>}
      <div className="shiftHandoverGrid">{incidents.map(report => <article key={report.id}>
        <h3>{equipmentLabel(report.machine)}</h3>
        <p>{[report.date, report.stopped && "設備停止", report.repairStatus, report.owner].filter(Boolean).join(" · ")}</p>
        {report.situation && <p>{report.situation}</p>}
        <div className="shiftHandoverActions">{machineButton(report.machine)}
          {writable && <button type="button" onClick={() => {
            setMachine(report.machine);
            setSituation(report.situation.slice(0, 500));
            formRef.current?.elements.machine.focus();
          }}>引継ぎに使う</button>}
        </div>
      </article>)}</div>
    </section>
    <section aria-labelledby="shift-history">
      <h3 id="shift-history">完了履歴（最新30件）</h3>
      {history && !history.length && <p>完了した引継ぎ事項はありません。</p>}
      <div className="shiftHandoverGrid">{(history || []).map(item => entry(item, true))}</div>
    </section>
  </main>;
}
