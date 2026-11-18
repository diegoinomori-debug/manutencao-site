import { useRef, useState } from "react";
import { db } from "../firebase";
import { equipmentLabel } from "../utils/equipmentIdentity";
import { parseReplacementWorkbook, registerReplacementImport, replacementImportPreview } from "../utils/machinePlanImport";
import "./MachinePlanImport.css";

const labels = { new: "新規", existing: "登録済み", invalid: "要修正", created: "登録完了" };

export default function MachinePlanImport({ knownMachines, hashKey }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const counts = Object.fromEntries(Object.keys(labels).map(key => [key, rows.filter(row => row.status === key).length]));
  const shown = filter === "all" ? rows : rows.filter(row => row.status === filter);

  async function preview(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setRows([]);
    setFilter("all");
    setMessage("");
    try {
      const parsed = parseReplacementWorkbook(await file.arrayBuffer());
      if (!parsed.length) { setMessage("取込対象の行がありません。"); return; }
      setRows(await replacementImportPreview(db, parsed, knownMachines));
      setMessage("プレビューを表示しました。新規の行だけを登録できます。");
    } catch (error) {
      setMessage(error.message === "invalid-header" || error.message === "empty-sheet"
        ? "確認用Excelの列見出しが見つかりません。定期交換計画一覧の書式を使用してください。"
        : "プレビューを作成できませんでした。Excelファイルと接続を確認してください。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function register() {
    if (lock.current || !counts.new) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const updates = await registerReplacementImport(db, rows.filter(row => row.status === "new"), knownMachines, hashKey);
      const byRow = new Map(updates.map(row => [row.row, row]));
      setRows(current => current.map(row => byRow.get(row.row) || row));
      setFilter("all");
      setMessage(`${updates.filter(row => row.status === "created").length}件を登録しました。登録済みの計画は変更していません。`);
    } catch {
      setMessage("登録前の再確認に失敗しました。既存計画を確認してから再度実行してください。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <section className="miyamaPlanImport miyamaUserCreateCard" aria-labelledby="plan-import-title" data-no-translate="true">
    <h3 id="plan-import-title">定期交換計画のExcel取込</h3>
    <p>確認用の定期交換計画一覧（.xlsx）を選択してください。設備カルテIDと部品コードで既存の計画を照合します。</p>
    <label>Excelファイル<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      disabled={busy} onChange={preview} /></label>
    <p role="status">{busy ? "処理中…" : message}</p>
    {!!rows.length && <>
      <div className="miyamaPlanImportActions">
        <label>表示項目
          <select value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">すべて（{rows.length}件）</option>
            {Object.entries(labels).map(([key, title]) => <option key={key} value={key}>{title}（{counts[key]}件）</option>)}
          </select>
        </label>
        <button type="button" className="primaryButton" disabled={busy || !counts.new} onClick={register}>
          新規 {counts.new} 件を登録
        </button>
      </div>
      <div className="miyamaPlanImportTable">
        <table>
          <thead><tr><th>Excel行</th><th>設備カルテID</th><th>交換部品・コード</th><th>交換数量</th><th>交換周期</th><th>前回交換日</th><th>次回交換予定日</th><th>状況・修正箇所</th></tr></thead>
          <tbody>{shown.map(row => <tr key={row.row} data-result={row.status}>
            <td>{row.row}</td>
            <td>{row.machine ? <>{equipmentLabel(row.machine)}<br /><small>{row.machine}</small></> : row.machineInput || "—"}</td>
            <td>{[row.partName, row.partCode].filter(Boolean).join(" / ") || "—"}</td>
            <td>{row.quantity ?? "—"}</td><td>{row.intervalDays ? row.intervalDays + "日" : "—"}</td>
            <td>{row.referenceDate || "—"}</td><td>{row.firstDue || "—"}</td>
            <td><strong>{labels[row.status]}</strong>{row.errors.length > 0 &&
              <ul>{row.errors.map(({field,message})=><li key={field + message}>{field}：{message}</li>)}</ul>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
