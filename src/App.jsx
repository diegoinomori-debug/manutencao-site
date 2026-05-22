import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import "./index.css";
import { db } from "./firebase";

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";

const today = new Date();
today.setHours(0, 0, 0, 0);

function addDays(dateString, days) {
  if (!dateString || !days) return "";
  const date = new Date(dateString);
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function diffDays(dateString) {
  if (!dateString) return "";
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function getStatus(daysLeft) {
  if (daysLeft === "") return "未入力";
  if (daysLeft < 0) return "交換超過";
  if (daysLeft <= 7) return "交換間近";
  return "正常";
}

export default function App() {
  const [parts, setParts] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [factoryLogs, setFactoryLogs] = useState([]);
  const [reports, setReports] = useState([]);

  const [page, setPage] = useState("maintenance");
  const [reportSearch, setReportSearch] = useState("");
  const [aiSearch, setAiSearch] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLevel, setAiLevel] = useState("");
  const [autoReportInput, setAutoReportInput] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    await Promise.all([
      loadParts(),
      loadInspections(),
      loadCalendar(),
      loadFactoryLogs(),
      loadReports(),
    ]);
  }

  async function loadParts() {
    const snap = await getDocs(collection(db, "parts"));
    setParts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadInspections() {
    const snap = await getDocs(collection(db, "inspections"));
    setInspections(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadCalendar() {
    const snap = await getDocs(collection(db, "calendar"));
    setCalendarEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadFactoryLogs() {
    const snap = await getDocs(collection(db, "factoryLogs"));
    setFactoryLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadReports() {
    const snap = await getDocs(collection(db, "maintenanceReports"));
    setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function updateField(collectionName, id, field, value) {
    const setterMap = {
      parts: setParts,
      inspections: setInspections,
      calendar: setCalendarEvents,
      factoryLogs: setFactoryLogs,
      maintenanceReports: setReports,
    };

    const setter = setterMap[collectionName];

    if (setter) {
      setter((current) =>
        current.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        )
      );
    }

    await updateDoc(doc(db, collectionName, id), { [field]: value });
  }

  async function removeItem(collectionName, id) {
    await deleteDoc(doc(db, collectionName, id));

    if (collectionName === "parts") loadParts();
    if (collectionName === "inspections") loadInspections();
    if (collectionName === "calendar") loadCalendar();
    if (collectionName === "factoryLogs") loadFactoryLogs();
    if (collectionName === "maintenanceReports") loadReports();
  }

  async function addPart() {
    await addDoc(collection(db, "parts"), {
      equipment: "",
      partName: "",
      partNo: "",
      price: "",
      supplier: "",
      location: "",
      leadTime: "",
      cycle: 90,
      lastDate: "",
      owner: "",
      note: "",
      purchaseStatus: "未発注",
      orderDate: "",
      arrivalDate: "",
      purchaseNote: "",
      stockQty: 0,
      minStock: 1,
      stockNote: "",
    });
    loadParts();
  }

  async function addInspection() {
    await addDoc(collection(db, "inspections"), {
      date: "",
      equipment: "",
      inspectionType: "日常点検",
      checkItem: "",
      result: "OK",
      abnormalDetail: "",
      action: "",
      owner: "",
      nextCheckDate: "",
      note: "",
    });
    loadInspections();
  }

  async function addCalendarEvent() {
    await addDoc(collection(db, "calendar"), {
      date: selectedDate,
      time: "",
      title: "",
      detail: "",
      owner: "",
      importance: "通常",
      image: "",
    });
    loadCalendar();
  }

  async function addFactoryLog() {
    await addDoc(collection(db, "factoryLogs"), {
      date: "",
      time: "",
      sector: "",
      machine: "",
      problem: "",
      cause: "",
      action: "",
      repairTime: "",
      owner: "",
      image: "",
      note: "",
    });
    loadFactoryLogs();
  }

  function createBlankReport() {
    return {
      createdAt: new Date().toISOString().slice(0, 10),
      maintenanceType: "",
      troubleDateTime: "",
      workStartDateTime: "",
      workEndDateTime: "",
      productionStartDateTime: "",
      stopExclusionTime: "",
      functionDownRate: "",
      groupName: "",
      lineName: "",
      equipment: "",
      phenomenon: "",
      troublePoint: "",
      why1: "",
      why2: "",
      why3: "",
      action: "",
      link: "",
      recurrenceCategory: "",
      recurrencePrevention: "",
      outflowPrevention: "",
      changeRank: "",
      fpCheck: "",
      worker: "",
      laborCost: "",
      partsCost: "",
      totalCost: "",
      replacedPart: "",
      stockQty: "",
      stockCheck: false,
      note: "",
    };
  }

  async function addReport() {
    await addDoc(collection(db, "maintenanceReports"), createBlankReport());
    loadReports();
  }

  function handleImageUpload(event, collectionName, rowId) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => updateField(collectionName, rowId, "image", reader.result);
    reader.readAsDataURL(file);
  }

  function getCalendarDays() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const days = [];

    for (let i = 0; i < startDay; i++) days.push(null);

    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= lastDate; day++) {
      const date = new Date(year, month, day);
      days.push(date.toISOString().slice(0, 10));
    }

    return days;
  }

  function changeMonth(value) {
    const newDate = new Date(calendarMonth);
    newDate.setMonth(newDate.getMonth() + value);
    setCalendarMonth(newDate);
  }

  const rows = useMemo(() => {
    return parts
      .map((part) => {
        const nextDate = addDays(part.lastDate, part.cycle);
        const daysLeft = diffDays(nextDate);
        const status = getStatus(daysLeft);
        return { ...part, nextDate, daysLeft, status };
      })
      .sort((a, b) => {
        if (a.daysLeft === "") return 1;
        if (b.daysLeft === "") return -1;
        return a.daysLeft - b.daysLeft;
      });
  }, [parts]);

  const filteredReports = useMemo(() => {
    const keyword = reportSearch.toLowerCase();

    return reports
      .filter((r) =>
        [
          r.createdAt,
          r.maintenanceType,
          r.groupName,
          r.lineName,
          r.equipment,
          r.phenomenon,
          r.troublePoint,
          r.why1,
          r.why2,
          r.why3,
          r.action,
          r.worker,
          r.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      )
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [reports, reportSearch]);

  const aiResults = useMemo(() => {
    const keyword = aiSearch.toLowerCase().trim();
    if (!keyword) return [];

    const keywords = keyword.split(/\s+/);

    const reportResults = reports.map((r) => ({
      type: "保全作業報告書",
      title: r.equipment || "設備名なし",
      date: r.createdAt || "-",
      text: `${r.lineName || ""} ${r.phenomenon || ""} ${r.troublePoint || ""} ${r.why1 || ""} ${r.why2 || ""} ${r.why3 || ""} ${r.action || ""} ${r.note || ""}`,
    }));

    const factoryResults = factoryLogs.map((r) => ({
      type: "工場記録",
      title: r.machine || "設備名なし",
      date: r.date || "-",
      text: `${r.sector || ""} ${r.problem || ""} ${r.cause || ""} ${r.action || ""} ${r.note || ""}`,
    }));

    const inspectionResults = inspections.map((r) => ({
      type: "設備点検",
      title: r.equipment || "設備名なし",
      date: r.date || "-",
      text: `${r.inspectionType || ""} ${r.checkItem || ""} ${r.abnormalDetail || ""} ${r.action || ""}`,
    }));

    return [...reportResults, ...factoryResults, ...inspectionResults]
      .map((item) => {
        const allText = `${item.title} ${item.text}`.toLowerCase();
        const score = keywords.filter((k) => allText.includes(k)).length;
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [aiSearch, reports, factoryLogs, inspections]);

  function makeAiAnswer() {
    if (!aiSearch.trim()) {
      setAiLevel("");
      setAiAnswer("検索したい内容を入力してください。");
      return;
    }

    if (aiResults.length === 0) {
      setAiLevel("🟢 軽微");
      setAiAnswer(
        "過去の履歴から似ている内容は見つかりませんでした。\n\n新しいトラブルの可能性があります。設備名・現象・原因・処置内容を保全作業報告書に登録してください。"
      );
      return;
    }

    const best = aiResults[0];
    const text = `${aiSearch} ${best.title} ${best.text}`;
    const highWords = ["停止", "ライン停止", "サーボ", "モーター", "安全", "異常停止", "漏れ", "火花", "焼損", "破損", "緊急"];
    const middleWords = ["異常", "交換", "確認", "不具合", "センサー", "ロードセル", "エラー", "調整"];
    const highHit = highWords.some((word) => text.includes(word));
    const middleHit = middleWords.some((word) => text.includes(word));

    let level = "🟢 軽微";
    let reason = "・重大な停止や安全に関わるキーワードは少ないです。";

    if (highHit || aiResults.length >= 3) {
      level = "🔴 緊急";
      reason = "・停止、安全、重要設備、または複数の類似履歴が見つかりました。";
    } else if (middleHit || aiResults.length >= 1) {
      level = "🟡 注意";
      reason = "・異常、交換、確認、センサー系など注意が必要な内容が含まれています。";
    }

    setAiLevel(level);
    setAiAnswer(
      `【AI分析結果】\n\n危険度：${level}\n\n理由：\n${reason}\n\n似ている過去履歴が見つかりました。\n\n種類：${best.type}\n日付：${best.date}\n設備：${best.title}\n\n過去内容：\n${best.text}\n\n確認ポイント：\n・同じ設備、同じ部品、同じ異常内容がないか確認してください。\n・前回の原因と処置内容を参考にしてください。\n・再発している場合は、再発防止内容の見直しが必要です。\n・危険度が高い場合は、すぐに上司・保全担当へ連絡してください。`
    );
  }

  async function createAutoReport() {
    const input = autoReportInput.trim();
    if (!input) {
      alert("内容を入力してください。例：78-60 ロードセル異常 荷重確認");
      return;
    }

    const text = input;
    const similar = aiResults[0];
    const words = text.split(/\s+/);
    const equipment = words[0] || "";

    let phenomenon = `${text} の不具合が発生。`;
    let why1 = "設備または部品に異常が発生したため。";
    let why2 = "原因箇所の確認が必要なため。";
    let why3 = "再発防止のため、発生条件と処置内容の記録が必要なため。";
    let action = "現象確認、原因調査、関係部品の確認を実施。必要に応じて調整・交換・清掃を行う。";
    let recurrencePrevention = "同様の異常が再発しないよう、点検項目追加と発生条件の記録を行う。";
    let note = "AI自動作成のため、内容を確認して必要に応じて修正してください。";

    if (text.includes("ロードセル")) {
      phenomenon = "ロードセルの異常が発生し、荷重値の確認が必要な状態。";
      why1 = "ロードセル信号または荷重値に異常が発生したため。";
      why2 = "配線、コネクタ、取付状態、またはロードセル本体の不具合が考えられるため。";
      why3 = "経年劣化、過負荷、振動、接触不良により検出値が不安定になった可能性があるため。";
      action = "ロードセルの表示値確認、配線・コネクタ確認、取付状態確認を実施。必要に応じてロードセル交換または再調整を行う。";
      recurrencePrevention = "定期点検時にロードセル値の確認、配線固定状態の確認、異常傾向の記録を行う。";
    } else if (text.includes("センサー")) {
      phenomenon = "センサー異常により設備動作が不安定、または検出不良が発生。";
      why1 = "センサー信号が正常に入っていないため。";
      why2 = "センサー位置ズレ、汚れ、断線、コネクタ接触不良が考えられるため。";
      why3 = "振動や経年劣化により検出状態が悪化した可能性があるため。";
      action = "センサー清掃、位置調整、配線確認、I/O確認を実施。必要に応じてセンサー交換を行う。";
      recurrencePrevention = "点検項目にセンサー清掃・位置確認を追加し、固定状態を定期確認する。";
    } else if (text.includes("モーター") || text.includes("サーボ")) {
      phenomenon = "モーターまたはサーボ系の異常により設備停止または動作不良が発生。";
      why1 = "駆動系に異常信号または過負荷が発生したため。";
      why2 = "モーター、アンプ、配線、機械負荷、原点位置に問題がある可能性があるため。";
      why3 = "負荷増加、劣化、接触不良、設定値ズレにより異常が発生した可能性があるため。";
      action = "アラーム内容確認、電源再投入、配線確認、負荷確認、原点確認を実施。必要に応じてメーカーへ確認する。";
      recurrencePrevention = "アラーム履歴を記録し、負荷状態・配線状態・冷却状態を定期確認する。";
    }

    if (similar) {
      note += `\n\n類似履歴あり：${similar.type} / ${similar.date} / ${similar.title}`;
    }

    await addDoc(collection(db, "maintenanceReports"), {
      ...createBlankReport(),
      maintenanceType: "突発保全",
      functionDownRate: "100",
      equipment,
      phenomenon,
      why1,
      why2,
      why3,
      action,
      recurrenceCategory: "再発防止",
      recurrencePrevention,
      outflowPrevention: "同様の異常が他設備で発生していないか確認する。",
      note,
    });

    const emergencyWords = ["緊急", "異常停止", "ライン停止", "破損", "停止", "焼損"];
    const checkText = `${input} ${phenomenon} ${action} ${note}`;
    const isEmergency = emergencyWords.some((word) => checkText.includes(word));

    if (isEmergency) {
      try {
        await fetch("/api/emergency-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipment,
            phenomenon,
            action,
            level: "🔴 緊急",
            createdAt: new Date().toISOString().slice(0, 10),
          }),
        });
      } catch (err) {
        console.error("Emergency email error:", err);
      }
    }

    setAutoReportInput("");
    await loadReports();
    setPage("report");
  }

  const overCount = rows.filter((r) => r.status === "交換超過").length;
  const nearCount = rows.filter((r) => r.status === "交換間近").length;
  const normalCount = rows.filter((r) => r.status === "正常").length;
  const ngCount = inspections.filter((r) => r.result === "NG").length;

  const equipmentRanking = useMemo(() => {
    const countMap = {};

    reports.forEach((report) => {
      const name = report.equipment || "設備名なし";
      countMap[name] = (countMap[name] || 0) + 1;
    });

    factoryLogs.forEach((log) => {
      const name = log.machine || "設備名なし";
      countMap[name] = (countMap[name] || 0) + 1;
    });

    return Object.entries(countMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [reports, factoryLogs]);

  const seriousReports = reports.filter((r) => {
    const text = `${r.phenomenon || ""} ${r.action || ""} ${r.note || ""}`;
    return text.includes("停止") || text.includes("緊急") || text.includes("異常停止") || text.includes("破損");
  }).length;

  const monthlyTroubleRanking = useMemo(() => {
    const countMap = {};

    reports.forEach((report) => {
      const month = (report.createdAt || "日付なし").slice(0, 7);
      countMap[month] = (countMap[month] || 0) + 1;
    });

    factoryLogs.forEach((log) => {
      const month = (log.date || "日付なし").slice(0, 7);
      countMap[month] = (countMap[month] || 0) + 1;
    });

    return Object.entries(countMap)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
  }, [reports, factoryLogs]);

  const maxEquipmentCount = Math.max(...equipmentRanking.map((item) => item.count), 1);
  const maxMonthlyCount = Math.max(...monthlyTroubleRanking.map((item) => item.count), 1);

  const stockRows = useMemo(() => {
    return rows.map((part) => {
      const stockQty = Number(part.stockQty || 0);
      const minStock = Number(part.minStock || 1);
      let stockStatus = "🟢 在庫OK";

      if (stockQty <= 0) {
        stockStatus = "🔴 在庫不足";
      } else if (stockQty <= minStock) {
        stockStatus = "🟡 在庫注意";
      }

      return { ...part, stockQty, minStock, stockStatus };
    });
  }, [rows]);

  const lowStockCount = stockRows.filter((item) => item.stockStatus.includes("不足")).length;
  const cautionStockCount = stockRows.filter((item) => item.stockStatus.includes("注意")).length;

  const orderNeededParts = useMemo(() => {
    return stockRows
      .filter((item) => item.stockStatus.includes("不足") || item.stockStatus.includes("注意"))
      .map((item) => {
        const recommendedQty = Math.max(Number(item.minStock || 1) * 2 - Number(item.stockQty || 0), 1);
        const priority = item.stockStatus.includes("不足") ? "🔴 緊急発注" : "🟡 早めに発注";
        return { ...item, recommendedQty, priority };
      });
  }, [stockRows]);

  function printOrderPdf() {
    const todayText = new Date().toISOString().slice(0, 10);
    const rowsHtml = orderNeededParts
      .map(
        (item) => `
          <tr>
            <td>${item.priority}</td>
            <td>${item.equipment || "-"}</td>
            <td>${item.partName || "-"}</td>
            <td>${item.partNo || "-"}</td>
            <td>${item.supplier || "-"}</td>
            <td>${item.stockQty}</td>
            <td>${item.minStock}</td>
            <td>${item.recommendedQty}</td>
            <td>${item.stockStatus.includes("不足") ? "在庫がありません。すぐに発注が必要です。" : "最低在庫に近いです。早めに発注してください。"}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>発注リストPDF</title>
          <style>
            body { font-family: Arial, "Yu Gothic", "Meiryo", sans-serif; padding: 30px; color: #111827; }
            h1 { text-align: center; margin-bottom: 10px; }
            .date { text-align: right; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #eaf2ff; color: #003b8f; }
            th, td { border: 1px solid #999; padding: 8px; text-align: left; }
            .sign { margin-top: 40px; display: flex; justify-content: flex-end; gap: 30px; }
            .box { border: 1px solid #333; width: 120px; height: 60px; text-align: center; padding-top: 8px; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h1>発注必要部品リスト</h1>
          <div class="date">作成日：${todayText}</div>
          <table>
            <thead>
              <tr>
                <th>優先度</th><th>設備名</th><th>部品名</th><th>部品番号</th><th>購入先</th><th>現在在庫</th><th>最低在庫</th><th>推奨発注数</th><th>AIコメント</th>
              </tr>
            </thead>
            <tbody>${rowsHtml || `<tr><td colspan="9">現在、発注が必要な部品はありません。</td></tr>`}</tbody>
          </table>
          <div class="sign"><div class="box">作成</div><div class="box">確認</div><div class="box">承認</div></div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  async function sendOrderMail() {
    try {
      const response = await fetch("/api/order-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts: orderNeededParts }),
      });

      const data = await response.json();

      if (data.ok) {
        alert("発注リストをメール送信しました。");
      } else {
        alert("メール送信エラー");
      }
    } catch (err) {
      console.error(err);
      alert("メール送信失敗");
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="header">
          <div>
            <div className="badge">設備管理システム</div>
            <h1>🔧 保全管理サイト</h1>
            <p>交換期限が近い部品から自動で上に表示されます。</p>
          </div>
        </div>

        <div className="tabs">
          <button className={page === "maintenance" ? "active" : ""} onClick={() => setPage("maintenance")}>🔧 定期・定量保全</button>
          <button className={page === "purchase" ? "active" : ""} onClick={() => setPage("purchase")}>📦 部品購入管理</button>
          <button className={page === "inspection" ? "active" : ""} onClick={() => setPage("inspection")}>✅ 設備点検</button>
          <button className={page === "calendar" ? "active" : ""} onClick={() => setPage("calendar")}>📅 予定カレンダー</button>
          <button className={page === "factory" ? "active" : ""} onClick={() => setPage("factory")}>🏭 工場記録</button>
          <button className={page === "report" ? "active" : ""} onClick={() => setPage("report")}>📝 保全作業報告書</button>
          <button className={page === "ai" ? "active" : ""} onClick={() => setPage("ai")}>🤖 AI検索</button>
          <button className={page === "stock" ? "active" : ""} onClick={() => setPage("stock")}>🔩 在庫管理</button>
          <button className={page === "order" ? "active" : ""} onClick={() => setPage("order")}>🛒 発注管理AI</button>
          <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>📊 ダッシュボード</button>
          <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>⚙️ 設定</button>
        </div>

        {page === "maintenance" && (
          <>
            <div className="header">
              <div>
                <h2>定期・定量保全管理表</h2>
                <p>交換超過・交換間近の部品が上に表示されます。</p>
              </div>
              <button className="primaryButton" onClick={addPart}><Plus size={16} /> 部品追加</button>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>設備名</th><th>部品名</th><th>部品番号</th><th>部品値段</th><th>購入先</th><th>予備品ロケーション</th><th>部品納期</th><th>交換周期</th><th>前回交換日</th><th>次回交換日</th><th>残日数</th><th>状態</th><th>担当者</th><th>備考</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td><input value={row.equipment || ""} onChange={(e) => updateField("parts", row.id, "equipment", e.target.value)} /></td>
                      <td><input value={row.partName || ""} onChange={(e) => updateField("parts", row.id, "partName", e.target.value)} /></td>
                      <td><input value={row.partNo || ""} onChange={(e) => updateField("parts", row.id, "partNo", e.target.value)} /></td>
                      <td><input value={row.price || ""} onChange={(e) => updateField("parts", row.id, "price", e.target.value)} /></td>
                      <td><input value={row.supplier || ""} onChange={(e) => updateField("parts", row.id, "supplier", e.target.value)} /></td>
                      <td><input value={row.location || ""} onChange={(e) => updateField("parts", row.id, "location", e.target.value)} /></td>
                      <td><input value={row.leadTime || ""} onChange={(e) => updateField("parts", row.id, "leadTime", e.target.value)} /></td>
                      <td><input type="number" value={row.cycle || ""} onChange={(e) => updateField("parts", row.id, "cycle", Number(e.target.value))} /></td>
                      <td><input type="date" value={row.lastDate || ""} onChange={(e) => updateField("parts", row.id, "lastDate", e.target.value)} /></td>
                      <td>{row.nextDate || "-"}</td>
                      <td>{row.daysLeft === "" ? "-" : row.daysLeft}</td>
                      <td><span className={`status ${row.status}`}>{row.status}</span></td>
                      <td><input value={row.owner || ""} onChange={(e) => updateField("parts", row.id, "owner", e.target.value)} /></td>
                      <td><input value={row.note || ""} onChange={(e) => updateField("parts", row.id, "note", e.target.value)} /></td>
                      <td><button className="deleteButton" onClick={() => removeItem("parts", row.id)}><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {page === "purchase" && (
          <div className="tableWrap">
            <h2>部品購入管理</h2>
            <table>
              <thead><tr><th>部品名</th><th>部品番号</th><th>購入先</th><th>発注状況</th><th>発注日</th><th>入荷予定日</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.partName}</td><td>{row.partNo}</td><td>{row.supplier}</td>
                    <td><select value={row.purchaseStatus || "未発注"} onChange={(e) => updateField("parts", row.id, "purchaseStatus", e.target.value)}><option value="未発注">未発注</option><option value="見積依頼中">見積依頼中</option><option value="発注済み">発注済み</option><option value="入荷済み">入荷済み</option></select></td>
                    <td><input type="date" value={row.orderDate || ""} onChange={(e) => updateField("parts", row.id, "orderDate", e.target.value)} /></td>
                    <td><input type="date" value={row.arrivalDate || ""} onChange={(e) => updateField("parts", row.id, "arrivalDate", e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {page === "inspection" && (
          <>
            <div className="header"><h2>設備点検</h2><button className="primaryButton" onClick={addInspection}><Plus size={16} /> 点検追加</button></div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>点検日</th><th>設備名</th><th>点検区分</th><th>点検項目</th><th>結果</th><th>異常内容</th><th>処置内容</th><th></th></tr></thead>
                <tbody>
                  {inspections.map((row) => (
                    <tr key={row.id}>
                      <td><input type="date" value={row.date || ""} onChange={(e) => updateField("inspections", row.id, "date", e.target.value)} /></td>
                      <td><input value={row.equipment || ""} onChange={(e) => updateField("inspections", row.id, "equipment", e.target.value)} /></td>
                      <td><select value={row.inspectionType || "日常点検"} onChange={(e) => updateField("inspections", row.id, "inspectionType", e.target.value)}><option value="日常点検">日常点検</option><option value="週次点検">週次点検</option><option value="月次点検">月次点検</option><option value="異常記録">異常記録</option></select></td>
                      <td><input value={row.checkItem || ""} onChange={(e) => updateField("inspections", row.id, "checkItem", e.target.value)} /></td>
                      <td><select value={row.result || "OK"} onChange={(e) => updateField("inspections", row.id, "result", e.target.value)}><option value="OK">OK</option><option value="NG">NG</option></select></td>
                      <td><textarea value={row.abnormalDetail || ""} onChange={(e) => updateField("inspections", row.id, "abnormalDetail", e.target.value)} /></td>
                      <td><textarea value={row.action || ""} onChange={(e) => updateField("inspections", row.id, "action", e.target.value)} /></td>
                      <td><button className="deleteButton" onClick={() => removeItem("inspections", row.id)}><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {page === "calendar" && (
          <>
            <div className="header"><div><h2>予定カレンダー</h2><p>日常予定・会議・保全予定・工事予定を管理できます。</p></div><button className="primaryButton" onClick={addCalendarEvent}><Plus size={16} /> 新しい予定</button></div>
            <div className="calendarLayout">
              <div className="calendarMain">
                <div className="calendarTop"><button onClick={() => changeMonth(-1)}>＜</button><h2>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</h2><button onClick={() => changeMonth(1)}>＞</button><button onClick={() => { const todayText = new Date().toISOString().slice(0, 10); setCalendarMonth(new Date()); setSelectedDate(todayText); }}>今日に戻る</button></div>
                <div className="calendarWeek"><div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div></div>
                <div className="calendarGrid">
                  {getCalendarDays().map((date, index) => {
                    const dayEvents = calendarEvents.filter((event) => event.date === date);
                    return <div key={index} className={`calendarDay ${date === selectedDate ? "selectedDay" : ""}`} onClick={() => date && setSelectedDate(date)}>{date && <><strong>{Number(date.slice(8, 10))}</strong><div className="calendarEventList">{dayEvents.slice(0, 3).map((event) => <span key={event.id} className={`calendarEventTag ${event.importance === "重要" ? "importantTag" : ""}`}>{event.time ? `${event.time} ` : ""}{event.title || "予定"}</span>)}</div></>}</div>;
                  })}
                </div>
                <div className="selectedEvents"><h3>{selectedDate} の予定一覧</h3>{calendarEvents.filter((event) => event.date === selectedDate).map((event) => <div key={event.id} className="eventRow"><b>{event.importance === "重要" ? "【重要】" : ""}{event.time ? `${event.time} ` : ""}{event.title || "予定"}</b><span>担当: {event.owner || "-"}</span><span>{event.detail || "-"}</span></div>)}</div>
              </div>
              <div className="calendarSide"><h3>予定の詳細</h3>{calendarEvents.map((row) => <div key={row.id} className="calendarEditCard"><input type="date" value={row.date || ""} onChange={(e) => updateField("calendar", row.id, "date", e.target.value)} /><input type="time" value={row.time || ""} onChange={(e) => updateField("calendar", row.id, "time", e.target.value)} /><input value={row.title || ""} placeholder="タイトル" onChange={(e) => updateField("calendar", row.id, "title", e.target.value)} /><select value={row.importance || "通常"} onChange={(e) => updateField("calendar", row.id, "importance", e.target.value)}><option value="通常">通常</option><option value="重要">重要</option></select><textarea placeholder="内容" value={row.detail || ""} onChange={(e) => updateField("calendar", row.id, "detail", e.target.value)} /><input placeholder="担当者" value={row.owner || ""} onChange={(e) => updateField("calendar", row.id, "owner", e.target.value)} /><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "calendar", row.id)} />{row.image && <img src={row.image} alt="" className="calendarPhoto" />}<button className="deleteButton" onClick={() => removeItem("calendar", row.id)}><Trash2 size={16} /> 削除</button></div>)}</div>
            </div>
          </>
        )}

        {page === "factory" && (
          <>
            <div className="header"><div><h2>工場記録</h2><p>故障・設備異常・停止内容を記録できます。</p></div><button className="primaryButton" onClick={addFactoryLog}><Plus size={16} /> 記録追加</button></div>
            <div className="tableWrap"><table><thead><tr><th>発生日</th><th>時間</th><th>工程</th><th>設備名</th><th>異常内容</th><th>原因</th><th>処置内容</th><th>復旧時間</th><th>担当者</th><th>写真</th><th>備考</th><th></th></tr></thead><tbody>{factoryLogs.map((row) => <tr key={row.id}><td><input type="date" value={row.date || ""} onChange={(e) => updateField("factoryLogs", row.id, "date", e.target.value)} /></td><td><input type="time" value={row.time || ""} onChange={(e) => updateField("factoryLogs", row.id, "time", e.target.value)} /></td><td><input value={row.sector || ""} onChange={(e) => updateField("factoryLogs", row.id, "sector", e.target.value)} /></td><td><input value={row.machine || ""} onChange={(e) => updateField("factoryLogs", row.id, "machine", e.target.value)} /></td><td><textarea value={row.problem || ""} onChange={(e) => updateField("factoryLogs", row.id, "problem", e.target.value)} /></td><td><textarea value={row.cause || ""} onChange={(e) => updateField("factoryLogs", row.id, "cause", e.target.value)} /></td><td><textarea value={row.action || ""} onChange={(e) => updateField("factoryLogs", row.id, "action", e.target.value)} /></td><td><input value={row.repairTime || ""} onChange={(e) => updateField("factoryLogs", row.id, "repairTime", e.target.value)} /></td><td><input value={row.owner || ""} onChange={(e) => updateField("factoryLogs", row.id, "owner", e.target.value)} /></td><td><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "factoryLogs", row.id)} />{row.image && <img src={row.image} alt="" className="calendarPhoto" />}</td><td><textarea value={row.note || ""} onChange={(e) => updateField("factoryLogs", row.id, "note", e.target.value)} /></td><td><button className="deleteButton" onClick={() => removeItem("factoryLogs", row.id)}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>
          </>
        )}

        {page === "report" && (
          <>
            <div className="header"><div><h2>保全作業報告書</h2><p>複数の報告書を保存して、過去トラブルを検索・確認できます。</p></div><button className="primaryButton" onClick={addReport}><Plus size={16} /> 報告書追加</button></div>
            <div className="tableWrap"><input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="検索：設備名・ライン名・不具合現象・原因・処置内容・担当者" /></div>
            {filteredReports.map((row) => (
              <div className="tableWrap" key={row.id} style={{ marginTop: "20px" }}>
                <div className="header"><div><h3>報告書：{row.equipment || "設備名未入力"} / {row.createdAt || "-"}</h3><p>{row.phenomenon || "不具合現象未入力"}</p></div><button className="deleteButton" onClick={() => removeItem("maintenanceReports", row.id)}><Trash2 size={16} /> 削除</button></div>
                <div className="reportGrid"><label>作成日<input type="date" value={row.createdAt || ""} onChange={(e) => updateField("maintenanceReports", row.id, "createdAt", e.target.value)} /></label><label>保全分類<input value={row.maintenanceType || ""} onChange={(e) => updateField("maintenanceReports", row.id, "maintenanceType", e.target.value)} /></label><label>①不具合発生日時<input type="datetime-local" value={row.troubleDateTime || ""} onChange={(e) => updateField("maintenanceReports", row.id, "troubleDateTime", e.target.value)} /></label><label>②保全作業開始日時<input type="datetime-local" value={row.workStartDateTime || ""} onChange={(e) => updateField("maintenanceReports", row.id, "workStartDateTime", e.target.value)} /></label><label>③保全作業完了日時<input type="datetime-local" value={row.workEndDateTime || ""} onChange={(e) => updateField("maintenanceReports", row.id, "workEndDateTime", e.target.value)} /></label><label>④生産開始日時<input type="datetime-local" value={row.productionStartDateTime || ""} onChange={(e) => updateField("maintenanceReports", row.id, "productionStartDateTime", e.target.value)} /></label><label>⑤停止除外時間<input value={row.stopExclusionTime || ""} onChange={(e) => updateField("maintenanceReports", row.id, "stopExclusionTime", e.target.value)} /></label><label>⑥機能低下(%)<input type="number" value={row.functionDownRate || ""} onChange={(e) => updateField("maintenanceReports", row.id, "functionDownRate", e.target.value)} /></label><label>グループ名<input value={row.groupName || ""} onChange={(e) => updateField("maintenanceReports", row.id, "groupName", e.target.value)} /></label><label>ライン名<input value={row.lineName || ""} onChange={(e) => updateField("maintenanceReports", row.id, "lineName", e.target.value)} /></label><label>設備名<input value={row.equipment || ""} onChange={(e) => updateField("maintenanceReports", row.id, "equipment", e.target.value)} /></label></div>
                <h3>不具合現象</h3><textarea value={row.phenomenon || ""} onChange={(e) => updateField("maintenanceReports", row.id, "phenomenon", e.target.value)} />
                <h3>不具合箇所</h3><textarea value={row.troublePoint || ""} onChange={(e) => updateField("maintenanceReports", row.id, "troublePoint", e.target.value)} />
                <h3>不具合原因</h3><label>なぜ1<textarea value={row.why1 || ""} onChange={(e) => updateField("maintenanceReports", row.id, "why1", e.target.value)} /></label><label>なぜ2<textarea value={row.why2 || ""} onChange={(e) => updateField("maintenanceReports", row.id, "why2", e.target.value)} /></label><label>なぜ3<textarea value={row.why3 || ""} onChange={(e) => updateField("maintenanceReports", row.id, "why3", e.target.value)} /></label>
                <h3>処置内容</h3><textarea value={row.action || ""} onChange={(e) => updateField("maintenanceReports", row.id, "action", e.target.value)} />
                <h3>リンク先</h3><textarea value={row.link || ""} onChange={(e) => updateField("maintenanceReports", row.id, "link", e.target.value)} />
                <h3>再発防止</h3><div className="reportGrid"><label>再発防止区分<input value={row.recurrenceCategory || ""} onChange={(e) => updateField("maintenanceReports", row.id, "recurrenceCategory", e.target.value)} /></label></div><textarea value={row.recurrencePrevention || ""} onChange={(e) => updateField("maintenanceReports", row.id, "recurrencePrevention", e.target.value)} />
                <h3>流出防止</h3><textarea value={row.outflowPrevention || ""} onChange={(e) => updateField("maintenanceReports", row.id, "outflowPrevention", e.target.value)} />
                <h3>変化点ランク / FP点検</h3><div className="reportGrid"><label>変化点ランク<input value={row.changeRank || ""} onChange={(e) => updateField("maintenanceReports", row.id, "changeRank", e.target.value)} /></label><label>FP点検<input value={row.fpCheck || ""} onChange={(e) => updateField("maintenanceReports", row.id, "fpCheck", e.target.value)} /></label></div>
                <h3>保全費用</h3><div className="reportGrid"><label>作業者<input value={row.worker || ""} onChange={(e) => updateField("maintenanceReports", row.id, "worker", e.target.value)} /></label><label>労務費<input value={row.laborCost || ""} onChange={(e) => updateField("maintenanceReports", row.id, "laborCost", e.target.value)} /></label><label>保全交換部品費・外注費<input value={row.partsCost || ""} onChange={(e) => updateField("maintenanceReports", row.id, "partsCost", e.target.value)} /></label><label>保全費用合計<input value={row.totalCost || ""} onChange={(e) => updateField("maintenanceReports", row.id, "totalCost", e.target.value)} /></label></div>
                <h3>在庫</h3><div className="reportGrid"><label>保全交換部品<input value={row.replacedPart || ""} onChange={(e) => updateField("maintenanceReports", row.id, "replacedPart", e.target.value)} /></label><label>在庫数<input value={row.stockQty || ""} onChange={(e) => updateField("maintenanceReports", row.id, "stockQty", e.target.value)} /></label><label>リスト更新チェック<input type="checkbox" checked={!!row.stockCheck} onChange={(e) => updateField("maintenanceReports", row.id, "stockCheck", e.target.checked)} /></label></div>
                <h3>備考</h3><textarea value={row.note || ""} onChange={(e) => updateField("maintenanceReports", row.id, "note", e.target.value)} />
              </div>
            ))}
          </>
        )}

        {page === "ai" && (
          <div className="tableWrap">
            <h2>AI検索</h2>
            <p>過去の保全作業報告書・工場記録・設備点検から似ている内容を探して、AI風にまとめます。</p>
            <input value={aiSearch} onChange={(e) => setAiSearch(e.target.value)} placeholder="例: ロードセル 78-60 異常" style={{ margin: "16px 0" }} />
            <button className="primaryButton" onClick={makeAiAnswer}>AI分析</button>

            <div className="calendarEditCard" style={{ marginTop: "20px" }}>
              <h3>AI自動報告書作成</h3>
              <p>短く入力すると、保全作業報告書を自動で作成します。</p>
              <textarea value={autoReportInput} onChange={(e) => setAutoReportInput(e.target.value)} placeholder="例：78-60 ロードセル異常 荷重確認 配線確認" />
              <button className="primaryButton" onClick={createAutoReport}>報告書を自動作成</button>
            </div>

            {aiLevel && <div className={`calendarEditCard ${aiLevel.includes("緊急") ? "aiHigh" : aiLevel.includes("注意") ? "aiMiddle" : "aiLow"}`} style={{ marginTop: "20px" }}><h3>{aiLevel}</h3></div>}
            {aiAnswer && <div className="calendarEditCard" style={{ marginTop: "20px", whiteSpace: "pre-line" }}>{aiAnswer}</div>}
            {aiResults.length === 0 && aiSearch && <p>該当する履歴が見つかりません。</p>}
            {aiResults.map((item, index) => <div key={index} className="calendarEditCard"><b>{item.type} / {item.date}</b><h3>{item.title}</h3><p>{item.text}</p></div>)}
          </div>
        )}

        {page === "stock" && (
          <div className="tableWrap">
            <h2>在庫管理</h2>
            <p>保全部品の在庫数を管理し、不足・注意・OKを自動判定します。</p>
            <table>
              <thead><tr><th>設備名</th><th>部品名</th><th>部品番号</th><th>購入先</th><th>予備品ロケーション</th><th>現在在庫</th><th>最低在庫</th><th>状態</th><th>メモ</th></tr></thead>
              <tbody>
                {stockRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.equipment || "-"}</td><td>{row.partName || "-"}</td><td>{row.partNo || "-"}</td><td>{row.supplier || "-"}</td><td>{row.location || "-"}</td>
                    <td><input type="number" value={row.stockQty || 0} onChange={(e) => updateField("parts", row.id, "stockQty", e.target.value)} /></td>
                    <td><input type="number" value={row.minStock || 1} onChange={(e) => updateField("parts", row.id, "minStock", e.target.value)} /></td>
                    <td><span className={`stockStatus ${row.stockStatus.includes("不足") ? "stockBad" : row.stockStatus.includes("注意") ? "stockWarn" : "stockOk"}`}>{row.stockStatus}</span></td>
                    <td><input value={row.stockNote || ""} onChange={(e) => updateField("parts", row.id, "stockNote", e.target.value)} placeholder="例：発注必要" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {page === "order" && (
          <div className="tableWrap">
            <h2>発注管理AI</h2>
            <p>在庫不足・在庫注意の部品を自動で発注候補として表示します。</p>
            <button className="primaryButton" onClick={printOrderPdf} style={{ marginBottom: "16px" }}>発注リストPDF作成</button>
            <button className="primaryButton" onClick={sendOrderMail} style={{ marginLeft: "12px", marginBottom: "16px" }}>発注リストメール送信</button>
            <table>
              <thead><tr><th>優先度</th><th>設備名</th><th>部品名</th><th>部品番号</th><th>購入先</th><th>現在在庫</th><th>最低在庫</th><th>推奨発注数</th><th>AIコメント</th></tr></thead>
              <tbody>
                {orderNeededParts.map((item) => (
                  <tr key={item.id}>
                    <td>{item.priority}</td><td>{item.equipment || "-"}</td><td>{item.partName || "-"}</td><td>{item.partNo || "-"}</td><td>{item.supplier || "-"}</td><td>{item.stockQty}</td><td>{item.minStock}</td><td>{item.recommendedQty}</td>
                    <td>{item.stockStatus.includes("不足") ? "在庫がありません。すぐに発注が必要です。" : "最低在庫に近いです。早めに発注してください。"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orderNeededParts.length === 0 && <p style={{ marginTop: "20px" }}>現在、発注が必要な部品はありません。</p>}
          </div>
        )}

        {page === "dashboard" && (
          <div className="tableWrap">
            <h2>ダッシュボード</h2>
            <p>保全データから設備の状態を自動で見える化します。</p>
            <div className="cards">
              <div className="card red"><span>交換超過</span><strong>{overCount}</strong></div><div className="card yellow"><span>交換間近</span><strong>{nearCount}</strong></div><div className="card green"><span>正常</span><strong>{normalCount}</strong></div><div className="card red"><span>点検NG</span><strong>{ngCount}</strong></div><div className="card"><span>登録部品数</span><strong>{rows.length}</strong></div><div className="card"><span>予定件数</span><strong>{calendarEvents.length}</strong></div><div className="card"><span>工場記録数</span><strong>{factoryLogs.length}</strong></div><div className="card"><span>報告書数</span><strong>{reports.length}</strong></div><div className="card red"><span>重大トラブル候補</span><strong>{seriousReports}</strong></div><div className="card red"><span>在庫不足</span><strong>{lowStockCount}</strong></div><div className="card yellow"><span>在庫注意</span><strong>{cautionStockCount}</strong></div><div className="card red"><span>発注必要</span><strong>{orderNeededParts.length}</strong></div>
            </div>
            <div className="tableWrap" style={{ marginTop: "24px" }}>
              <h2>AI設備ランキング</h2><p>工場記録と保全作業報告書から、トラブルが多い設備を自動集計します。</p>
              <table><thead><tr><th>順位</th><th>設備名</th><th>記録件数</th><th>グラフ</th><th>AIコメント</th></tr></thead><tbody>{equipmentRanking.map((item, index) => <tr key={item.name}><td>{index + 1}</td><td>{item.name}</td><td>{item.count}</td><td><div className="simpleBarWrap"><div className="simpleBar" style={{ width: `${(item.count / maxEquipmentCount) * 100}%` }} /></div></td><td>{item.count >= 3 ? "再発傾向あり。原因分析と再発防止の見直しが必要です。" : item.count === 2 ? "注意。今後も同じ異常が出るか確認してください。" : "記録あり。様子を確認してください。"}</td></tr>)}</tbody></table>
            </div>
            <div className="tableWrap" style={{ marginTop: "24px" }}>
              <h2>月別トラブル推移</h2><p>保全作業報告書と工場記録から、月ごとのトラブル件数を表示します。</p>
              <table><thead><tr><th>月</th><th>件数</th><th>グラフ</th></tr></thead><tbody>{monthlyTroubleRanking.map((item) => <tr key={item.month}><td>{item.month}</td><td>{item.count}</td><td><div className="simpleBarWrap"><div className="simpleBar" style={{ width: `${(item.count / maxMonthlyCount) * 100}%` }} /></div></td></tr>)}</tbody></table>
            </div>
          </div>
        )}

        {page === "settings" && (
          <div className="tableWrap"><h2>設定</h2><table><tbody><tr><th>保存先</th><td>Firebase Firestore</td></tr><tr><th>メール送信</th><td>Vercel + Resend</td></tr><tr><th>交換通知</th><td>交換予定日の7日前</td></tr><tr><th>購入通知</th><td>部品納期に合わせて通知</td></tr></tbody></table></div>
        )}
      </div>
    </div>
  );
}
