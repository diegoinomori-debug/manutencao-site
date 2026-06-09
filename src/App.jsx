import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Search,
  Home,
  Wrench,
  CalendarDays,
  FileText,
  Package,
  Hammer,
  Bot,
  Save,
  X,
} from "lucide-react";
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

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function createBlankReport() {
  return {
    createdAt: todayText(),
    maintenanceType: "突発保全",
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
    recurrencePrevention: "",
    outflowPrevention: "",
    worker: "",
    laborCost: "",
    partsCost: "",
    totalCost: "",
    replacedPart: "",
    stockQty: "",
    note: "",
    image: "",
  };
}

function createBlankPlannedWork(date = "") {
  return {
    date: date || todayText(),
    endDate: "",
    title: "",
    equipment: "",
    purpose: "",
    detail: "",
    owner: "",
    status: "計画中",
    progress: 0,
    risk: "",
    note: "",
    image: "",
  };
}

function createBlankCalendarEvent(date = "") {
  return {
    date: date || todayText(),
    time: "",
    title: "",
    detail: "",
    owner: "",
    importance: "通常",
    category: "定期保全",
    image: "",
  };
}

function containsAll(text, keywords) {
  const target = String(text || "").toLowerCase();
  return keywords.every((keyword) => target.includes(keyword));
}

export default function App() {
  const [parts, setParts] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [reports, setReports] = useState([]);
  const [plannedWorks, setPlannedWorks] = useState([]);

  const [page, setPage] = useState("home");
  const [globalSearch, setGlobalSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [aiSearch, setAiSearch] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLevel, setAiLevel] = useState("");
  const [autoReportInput, setAutoReportInput] = useState("");

  const [newReport, setNewReport] = useState(null);
  const [newCalendarEvent, setNewCalendarEvent] = useState(null);
  const [newPlannedWork, setNewPlannedWork] = useState(null);

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(todayText());

  const [openSections, setOpenSections] = useState({
    basic: true,
    trouble: true,
    why: false,
    cost: false,
    other: false,
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    await Promise.all([
      loadParts(),
      loadCalendar(),
      loadReports(),
      loadPlannedWorks(),
    ]);
  }

  async function loadParts() {
    const snap = await getDocs(collection(db, "parts"));
    setParts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadCalendar() {
    const snap = await getDocs(collection(db, "calendar"));
    setCalendarEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadReports() {
    const snap = await getDocs(collection(db, "maintenanceReports"));
    setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }

  async function loadPlannedWorks() {
    try {
      const snap = await getDocs(collection(db, "plannedWorks"));
      setPlannedWorks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("plannedWorks load error:", err);
      setPlannedWorks([]);
    }
  }

  async function updateField(collectionName, id, field, value) {
    const setterMap = {
      parts: setParts,
      calendar: setCalendarEvents,
      maintenanceReports: setReports,
      plannedWorks: setPlannedWorks,
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
    if (collectionName === "calendar") loadCalendar();
    if (collectionName === "maintenanceReports") loadReports();
    if (collectionName === "plannedWorks") loadPlannedWorks();
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
      stockQty: 0,
      minStock: 1,
      stockNote: "",
      image: "",
    });
    loadParts();
  }

  function startNewReport() {
    setNewReport(createBlankReport());
  }

  function cancelNewReport() {
    setNewReport(null);
  }

  async function saveNewReport() {
    if (!newReport) return;
    if (!newReport.equipment && !newReport.phenomenon) {
      alert("設備名または不具合現象を入力してください。");
      return;
    }
    await addDoc(collection(db, "maintenanceReports"), newReport);
    setNewReport(null);
    await loadReports();
    alert("保存しました。AI検索に反映されます。");
  }

  function startNewCalendarEvent(date = selectedDate) {
    setNewCalendarEvent(createBlankCalendarEvent(date));
  }

  function cancelNewCalendarEvent() {
    setNewCalendarEvent(null);
  }

  async function saveNewCalendarEvent() {
    if (!newCalendarEvent) return;
    if (!newCalendarEvent.title) {
      alert("予定タイトルを入力してください。");
      return;
    }
    await addDoc(collection(db, "calendar"), newCalendarEvent);
    setNewCalendarEvent(null);
    await loadCalendar();
    alert("予定を保存しました。");
  }

  function startNewPlannedWork() {
    setNewPlannedWork(createBlankPlannedWork());
  }

  function cancelNewPlannedWork() {
    setNewPlannedWork(null);
  }

  async function saveNewPlannedWork() {
    if (!newPlannedWork) return;
    if (!newPlannedWork.title) {
      alert("工事件名を入力してください。");
      return;
    }

    const docRef = await addDoc(collection(db, "plannedWorks"), newPlannedWork);

    await addDoc(collection(db, "calendar"), {
      date: newPlannedWork.date || todayText(),
      time: "",
      title: `計画工事：${newPlannedWork.title}`,
      detail: `${newPlannedWork.equipment || ""} ${newPlannedWork.purpose || ""} ${newPlannedWork.detail || ""}`,
      owner: newPlannedWork.owner || "",
      importance: "重要",
      category: "計画工事",
      plannedWorkId: docRef.id,
      image: newPlannedWork.image || "",
    });

    setNewPlannedWork(null);
    await Promise.all([loadPlannedWorks(), loadCalendar()]);
    alert("計画工事を保存しました。カレンダーにも追加されました。");
  }

  function handleImageUpload(event, collectionName, rowId) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => updateField(collectionName, rowId, "image", reader.result);
    reader.readAsDataURL(file);
  }

  function handleDraftImageUpload(event, setter) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setter((current) => ({ ...current, image: reader.result }));
    };
    reader.readAsDataURL(file);
  }

  function toggleSection(key) {
    setOpenSections((current) => ({ ...current, [key]: !current[key] }));
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

  const maintenanceRows = useMemo(() => {
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

  const spareRows = useMemo(() => {
    return maintenanceRows.map((part) => {
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
  }, [maintenanceRows]);

  const overCount = maintenanceRows.filter((r) => r.status === "交換超過").length;
  const nearCount = maintenanceRows.filter((r) => r.status === "交換間近").length;
  const lowStockCount = spareRows.filter((r) => r.stockStatus.includes("不足")).length;
  const monthReportCount = reports.filter((report) =>
    (report.createdAt || "").startsWith(new Date().toISOString().slice(0, 7))
  ).length;

  const filteredReports = useMemo(() => {
    const keyword = reportSearch.toLowerCase().trim();
    const sorted = [...reports].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (!keyword) return sorted;

    const keywords = keyword.split(/\s+/);

    return sorted.filter((r) =>
      containsAll(
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
        ].join(" "),
        keywords
      )
    );
  }, [reports, reportSearch]);

  const globalResults = useMemo(() => {
    const keyword = globalSearch.toLowerCase().trim();
    if (!keyword) return [];

    const keywords = keyword.split(/\s+/);

    const allItems = [
      ...reports.map((r) => ({
        category: "📝 保全報告書",
        page: "report",
        title: r.equipment || "設備名なし",
        date: r.createdAt || "-",
        text: `${r.lineName || ""} ${r.phenomenon || ""} ${r.troublePoint || ""} ${r.why1 || ""} ${r.why2 || ""} ${r.why3 || ""} ${r.action || ""} ${r.note || ""}`,
      })),

      ...maintenanceRows.map((p) => ({
        category: "🔧 定期保全",
        page: "maintenance",
        title: p.equipment || "設備名なし",
        date: p.nextDate || "-",
        text: `${p.partName || ""} ${p.partNo || ""} ${p.supplier || ""} ${p.location || ""} ${p.status || ""} ${p.note || ""}`,
      })),

      ...spareRows.map((p) => ({
        category: "📦 予備品管理",
        page: "spare",
        title: p.partName || "部品名なし",
        date: p.leadTime || "-",
        text: `${p.equipment || ""} ${p.partNo || ""} ${p.supplier || ""} ${p.location || ""} ${p.stockStatus || ""} ${p.stockNote || ""}`,
      })),

      ...calendarEvents.map((c) => ({
        category: "📅 カレンダー",
        page: "calendar",
        title: c.title || "予定",
        date: c.date || "-",
        text: `${c.category || ""} ${c.detail || ""} ${c.owner || ""} ${c.importance || ""}`,
      })),

      ...plannedWorks.map((w) => ({
        category: "🏗️ 計画工事",
        page: "work",
        title: w.title || "計画工事",
        date: w.date || "-",
        text: `${w.equipment || ""} ${w.purpose || ""} ${w.detail || ""} ${w.owner || ""} ${w.status || ""} ${w.note || ""}`,
      })),
    ];

    return allItems
      .map((item) => {
        const allText = `${item.category} ${item.title} ${item.date} ${item.text}`.toLowerCase();
        const score = keywords.filter((k) => allText.includes(k)).length;
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [globalSearch, reports, maintenanceRows, spareRows, calendarEvents, plannedWorks]);

  const aiResults = useMemo(() => {
    const keyword = aiSearch.toLowerCase().trim();
    if (!keyword) return [];

    const keywords = keyword.split(/\s+/);

    const allItems = [
      ...reports.map((r) => ({
        category: "📝 保全報告書",
        page: "report",
        title: r.equipment || "設備名なし",
        date: r.createdAt || "-",
        text: `${r.lineName || ""} ${r.phenomenon || ""} ${r.troublePoint || ""} ${r.why1 || ""} ${r.why2 || ""} ${r.why3 || ""} ${r.action || ""} ${r.note || ""}`,
      })),
      ...maintenanceRows.map((p) => ({
        category: "🔧 定期保全",
        page: "maintenance",
        title: p.equipment || "設備名なし",
        date: p.nextDate || "-",
        text: `${p.partName || ""} ${p.partNo || ""} ${p.status || ""} ${p.note || ""}`,
      })),
      ...spareRows.map((p) => ({
        category: "📦 予備品管理",
        page: "spare",
        title: p.partName || "部品名なし",
        date: p.leadTime || "-",
        text: `${p.equipment || ""} ${p.partNo || ""} ${p.supplier || ""} ${p.location || ""} ${p.stockStatus || ""}`,
      })),
      ...calendarEvents.map((c) => ({
        category: "📅 カレンダー",
        page: "calendar",
        title: c.title || "予定",
        date: c.date || "-",
        text: `${c.category || ""} ${c.detail || ""} ${c.owner || ""}`,
      })),
      ...plannedWorks.map((w) => ({
        category: "🏗️ 計画工事",
        page: "work",
        title: w.title || "計画工事",
        date: w.date || "-",
        text: `${w.equipment || ""} ${w.purpose || ""} ${w.detail || ""} ${w.status || ""} ${w.note || ""}`,
      })),
    ];

    return allItems
      .map((item) => {
        const allText = `${item.category} ${item.title} ${item.date} ${item.text}`.toLowerCase();
        const score = keywords.filter((k) => allText.includes(k)).length;
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [aiSearch, reports, maintenanceRows, spareRows, calendarEvents, plannedWorks]);

  function makeAiAnswer() {
    if (!aiSearch.trim()) {
      setAiLevel("");
      setAiAnswer("検索したい内容を入力してください。");
      return;
    }

    if (aiResults.length === 0) {
      setAiLevel("🟢 履歴なし");
      setAiAnswer(
        "関連する履歴は見つかりませんでした。\n\n新しいトラブルまたは新しい部品の可能性があります。保全報告書、定期保全、予備品管理に情報を登録してください。"
      );
      return;
    }

    const best = aiResults[0];
    const text = `${aiSearch} ${best.title} ${best.text}`;
    const highWords = ["停止", "ライン停止", "サーボ", "モーター", "安全", "異常停止", "漏れ", "火花", "焼損", "破損", "緊急"];
    const middleWords = ["異常", "交換", "確認", "不具合", "センサー", "ロードセル", "エラー", "調整", "在庫不足"];
    const highHit = highWords.some((word) => text.includes(word));
    const middleHit = middleWords.some((word) => text.includes(word));

    let level = "🟢 軽微";
    let reason = "重大な停止や安全に関わるキーワードは少ないです。";

    if (highHit || aiResults.length >= 4) {
      level = "🔴 緊急確認";
      reason = "停止、安全、重要設備、または複数の関連履歴が見つかりました。";
    } else if (middleHit || aiResults.length >= 1) {
      level = "🟡 注意";
      reason = "異常、交換、確認、センサー系、在庫不足など注意が必要な内容が含まれています。";
    }

    setAiLevel(level);
    setAiAnswer(
      `【Maintenance AI 分析結果】\n\n危険度：${level}\n\n理由：\n・${reason}\n\n関連データ：${aiResults.length}件\n\n一番近い履歴：\n種類：${best.category}\n日付：${best.date}\nタイトル：${best.title}\n\n内容：\n${best.text}\n\n確認ポイント：\n・同じ設備、同じ部品、同じ異常内容がないか確認してください。\n・過去の原因と処置内容を参考にしてください。\n・再発している場合は、再発防止内容の見直しが必要です。\n・在庫不足が関係する場合は、予備品管理を確認してください。`
    );
  }

  async function createAutoReport() {
    const input = autoReportInput.trim();
    if (!input) {
      alert("内容を入力してください。例：78-60 ロードセル異常 荷重確認");
      return;
    }

    const words = input.split(/\s+/);
    const equipment = words[0] || "";

    let phenomenon = `${input} の不具合が発生。`;
    let why1 = "設備または部品に異常が発生したため。";
    let why2 = "原因箇所の確認が必要なため。";
    let why3 = "再発防止のため、発生条件と処置内容の記録が必要なため。";
    let action = "現象確認、原因調査、関係部品の確認を実施。必要に応じて調整・交換・清掃を行う。";
    let recurrencePrevention = "同様の異常が再発しないよう、点検項目追加と発生条件の記録を行う。";
    let note = "Maintenance AI 自動作成のため、内容を確認して必要に応じて修正してください。";

    if (input.includes("ロードセル")) {
      phenomenon = "ロードセルの異常が発生し、荷重値の確認が必要な状態。";
      why1 = "ロードセル信号または荷重値に異常が発生したため。";
      why2 = "配線、コネクタ、取付状態、またはロードセル本体の不具合が考えられるため。";
      why3 = "経年劣化、過負荷、振動、接触不良により検出値が不安定になった可能性があるため。";
      action = "ロードセルの表示値確認、配線・コネクタ確認、取付状態確認を実施。必要に応じてロードセル交換または再調整を行う。";
      recurrencePrevention = "定期保全時にロードセル値の確認、配線固定状態の確認、異常傾向の記録を行う。";
    } else if (input.includes("センサー")) {
      phenomenon = "センサー異常により設備動作が不安定、または検出不良が発生。";
      why1 = "センサー信号が正常に入っていないため。";
      why2 = "センサー位置ズレ、汚れ、断線、コネクタ接触不良が考えられるため。";
      why3 = "振動や経年劣化により検出状態が悪化した可能性があるため。";
      action = "センサー清掃、位置調整、配線確認、I/O確認を実施。必要に応じてセンサー交換を行う。";
      recurrencePrevention = "定期保全にセンサー清掃・位置確認を追加し、固定状態を定期確認する。";
    }

    if (aiResults[0]) {
      note += `\n\n関連履歴あり：${aiResults[0].category} / ${aiResults[0].date} / ${aiResults[0].title}`;
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
      recurrencePrevention,
      outflowPrevention: "同様の異常が他設備で発生していないか確認する。",
      note,
    });

    setAutoReportInput("");
    await loadReports();
    setPage("report");
  }

  function renderGlobalSearchBox() {
    return (
      <div className="tableWrap" style={{ marginBottom: "18px" }}>
        <h2>🔍 AI統合検索</h2>
        <p>保全報告書・定期保全・予備品管理・カレンダー・計画工事をまとめて検索できます。</p>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="例：ロードセル、78-60、センサー、異常停止、在庫不足"
          />
          <button
            className="primaryButton"
            onClick={() => {
              setAiSearch(globalSearch);
              setPage("ai");
            }}
          >
            <Search size={16} /> AI分析
          </button>
        </div>

        {globalSearch && (
          <div style={{ marginTop: "16px" }}>
            <h3>検索結果：{globalResults.length}件</h3>
            {globalResults.length === 0 && <p>関連データが見つかりません。</p>}
            {globalResults.slice(0, 8).map((item, index) => (
              <div
                key={index}
                className="calendarEditCard"
                style={{ cursor: "pointer" }}
                onClick={() => setPage(item.page)}
              >
                <b>{item.category} / {item.date}</b>
                <h3>{item.title}</h3>
                <p>{item.text || "-"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function Section({ sectionKey, title, children }) {
    const open = openSections[sectionKey];
    return (
      <div className="calendarEditCard" style={{ marginTop: "14px" }}>
        <div
          onClick={() => toggleSection(sectionKey)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <h3>{title}</h3>
          <strong>{open ? "▲" : "▼"}</strong>
        </div>
        {open && <div style={{ marginTop: "10px" }}>{children}</div>}
      </div>
    );
  }

  function ReportDraftForm() {
    if (!newReport) return null;

    return (
      <div className="tableWrap" style={{ border: "2px solid #2563eb" }}>
        <div className="header">
          <div>
            <h2>📝 新規 保全報告書</h2>
            <p>保存するまではFirebaseに登録されません。</p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="primaryButton" onClick={saveNewReport}>
              <Save size={16} /> 保存
            </button>
            <button className="deleteButton" onClick={cancelNewReport}>
              <X size={16} /> キャンセル
            </button>
          </div>
        </div>

        <Section sectionKey="basic" title="📌 基本情報">
          <div className="reportGrid">
            <label>作成日<input type="date" value={newReport.createdAt || ""} onChange={(e) => setNewReport({ ...newReport, createdAt: e.target.value })} /></label>
            <label>保全分類<input value={newReport.maintenanceType || ""} onChange={(e) => setNewReport({ ...newReport, maintenanceType: e.target.value })} /></label>
            <label>グループ名<input value={newReport.groupName || ""} onChange={(e) => setNewReport({ ...newReport, groupName: e.target.value })} /></label>
            <label>ライン名<input value={newReport.lineName || ""} onChange={(e) => setNewReport({ ...newReport, lineName: e.target.value })} /></label>
            <label>設備名<input value={newReport.equipment || ""} onChange={(e) => setNewReport({ ...newReport, equipment: e.target.value })} /></label>
            <label>担当者<input value={newReport.worker || ""} onChange={(e) => setNewReport({ ...newReport, worker: e.target.value })} /></label>
          </div>
        </Section>

        <Section sectionKey="trouble" title="📝 異常内容・処置">
          <h3>不具合現象</h3>
          <textarea value={newReport.phenomenon || ""} onChange={(e) => setNewReport({ ...newReport, phenomenon: e.target.value })} />
          <h3>不具合箇所</h3>
          <textarea value={newReport.troublePoint || ""} onChange={(e) => setNewReport({ ...newReport, troublePoint: e.target.value })} />
          <h3>処置内容</h3>
          <textarea value={newReport.action || ""} onChange={(e) => setNewReport({ ...newReport, action: e.target.value })} />
        </Section>

        <Section sectionKey="why" title="🔍 なぜなぜ分析">
          <label>なぜ1<textarea value={newReport.why1 || ""} onChange={(e) => setNewReport({ ...newReport, why1: e.target.value })} /></label>
          <label>なぜ2<textarea value={newReport.why2 || ""} onChange={(e) => setNewReport({ ...newReport, why2: e.target.value })} /></label>
          <label>なぜ3<textarea value={newReport.why3 || ""} onChange={(e) => setNewReport({ ...newReport, why3: e.target.value })} /></label>
          <h3>再発防止</h3>
          <textarea value={newReport.recurrencePrevention || ""} onChange={(e) => setNewReport({ ...newReport, recurrencePrevention: e.target.value })} />
          <h3>流出防止</h3>
          <textarea value={newReport.outflowPrevention || ""} onChange={(e) => setNewReport({ ...newReport, outflowPrevention: e.target.value })} />
        </Section>

        <Section sectionKey="cost" title="💰 費用・交換部品">
          <div className="reportGrid">
            <label>交換部品<input value={newReport.replacedPart || ""} onChange={(e) => setNewReport({ ...newReport, replacedPart: e.target.value })} /></label>
            <label>在庫数<input value={newReport.stockQty || ""} onChange={(e) => setNewReport({ ...newReport, stockQty: e.target.value })} /></label>
            <label>労務費<input value={newReport.laborCost || ""} onChange={(e) => setNewReport({ ...newReport, laborCost: e.target.value })} /></label>
            <label>部品費<input value={newReport.partsCost || ""} onChange={(e) => setNewReport({ ...newReport, partsCost: e.target.value })} /></label>
            <label>合計<input value={newReport.totalCost || ""} onChange={(e) => setNewReport({ ...newReport, totalCost: e.target.value })} /></label>
          </div>
        </Section>

        <Section sectionKey="other" title="⚙️ その他">
          <h3>写真</h3>
          <input type="file" accept="image/*" onChange={(e) => handleDraftImageUpload(e, setNewReport)} />
          {newReport.image && <img src={newReport.image} alt="" className="calendarPhoto" />}
          <h3>備考</h3>
          <textarea value={newReport.note || ""} onChange={(e) => setNewReport({ ...newReport, note: e.target.value })} />
        </Section>

        <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
          <button className="primaryButton" onClick={saveNewReport}>
            <Save size={16} /> 保存
          </button>
          <button className="deleteButton" onClick={cancelNewReport}>
            <X size={16} /> キャンセル
          </button>
        </div>
      </div>
    );
  }

  function renderHome() {
    return (
      <>
        <div className="tableWrap" style={{ textAlign: "center", padding: "42px 24px" }}>
          <img
            src="/miyama-logo.png"
            alt="MIYAMA ONE TEAM"
            className="homeLogo"
          />
          <h1 style={{ fontSize: "42px", margin: "10px 0" }}>Maintenance AI</h1>
          <h2>AI保全管理システム</h2>
          <p className="oneTeamSlogan">One Team Maintenance Group</p>
          <p>設備保全を、もっとスマートに。</p>

          <div style={{ maxWidth: "760px", margin: "24px auto 0" }}>
            <input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="設備・部品・トラブル内容を検索してください"
              style={{ textAlign: "center", fontSize: "18px", minHeight: "52px" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "20px", flexWrap: "wrap" }}>
            <button
              className="primaryButton"
              onClick={() => {
                setAiSearch(globalSearch);
                setPage("ai");
              }}
            >
              <Search size={16} /> AI検索へ
            </button>
            <button className="primaryButton" onClick={() => setPage("report")}>
              システムへ入る
            </button>
          </div>
        </div>

        {globalSearch && renderGlobalSearchBox()}

        <div className="cards">
          <div className="card red"><span>交換超過</span><strong>{overCount}</strong></div>
          <div className="card yellow"><span>交換間近</span><strong>{nearCount}</strong></div>
          <div className="card red"><span>在庫不足</span><strong>{lowStockCount}</strong></div>
          <div className="card"><span>今月報告書</span><strong>{monthReportCount}</strong></div>
        </div>

        <div className="cards" style={{ marginTop: "20px" }}>
          <div className="card" onClick={() => setPage("ai")} style={{ cursor: "pointer" }}><span>🔍 AI検索</span><strong>検索</strong></div>
          <div className="card" onClick={() => setPage("report")} style={{ cursor: "pointer" }}><span>📝 保全報告書</span><strong>{reports.length}</strong></div>
          <div className="card" onClick={() => setPage("maintenance")} style={{ cursor: "pointer" }}><span>🔧 定期保全</span><strong>{maintenanceRows.length}</strong></div>
          <div className="card" onClick={() => setPage("spare")} style={{ cursor: "pointer" }}><span>📦 予備品管理</span><strong>{spareRows.length}</strong></div>
          <div className="card" onClick={() => setPage("calendar")} style={{ cursor: "pointer" }}><span>📅 カレンダー</span><strong>{calendarEvents.length}</strong></div>
          <div className="card" onClick={() => setPage("work")} style={{ cursor: "pointer" }}><span>🏗️ 計画工事</span><strong>{plannedWorks.length}</strong></div>
        </div>
      </>
    );
  }

  function renderMaintenance() {
    return (
      <>
        <div className="header">
          <div>
            <h2>🔧 定期保全</h2>
            <p>交換周期、前回交換日、次回交換日、残日数を管理します。</p>
          </div>
          <button className="primaryButton" onClick={addPart}><Plus size={16} /> 部品追加</button>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>設備名</th><th>部品名</th><th>部品番号</th><th>交換周期（日）</th><th>前回交換日</th><th>次回交換日</th><th>残日数</th><th>状態</th><th>担当者</th><th>備考</th><th></th>
              </tr>
            </thead>
            <tbody>
              {maintenanceRows.map((row) => (
                <tr key={row.id}>
                  <td><input value={row.equipment || ""} onChange={(e) => updateField("parts", row.id, "equipment", e.target.value)} /></td>
                  <td><input value={row.partName || ""} onChange={(e) => updateField("parts", row.id, "partName", e.target.value)} /></td>
                  <td><input value={row.partNo || ""} onChange={(e) => updateField("parts", row.id, "partNo", e.target.value)} /></td>
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
    );
  }

  function renderSpareParts() {
    return (
      <>
        <div className="header">
          <div>
            <h2>📦 予備品管理</h2>
            <p>予備品の在庫数、購入先、保管場所、納期を管理します。</p>
          </div>
          <button className="primaryButton" onClick={addPart}><Plus size={16} /> 予備品追加</button>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>設備名</th><th>部品名</th><th>部品番号</th><th>購入先</th><th>価格</th><th>保管場所</th><th>納期</th><th>現在在庫</th><th>最低在庫</th><th>状態</th><th>写真</th><th>メモ</th><th></th>
              </tr>
            </thead>
            <tbody>
              {spareRows.map((row) => (
                <tr key={row.id}>
                  <td><input value={row.equipment || ""} onChange={(e) => updateField("parts", row.id, "equipment", e.target.value)} /></td>
                  <td><input value={row.partName || ""} onChange={(e) => updateField("parts", row.id, "partName", e.target.value)} /></td>
                  <td><input value={row.partNo || ""} onChange={(e) => updateField("parts", row.id, "partNo", e.target.value)} /></td>
                  <td><input value={row.supplier || ""} onChange={(e) => updateField("parts", row.id, "supplier", e.target.value)} /></td>
                  <td><input value={row.price || ""} onChange={(e) => updateField("parts", row.id, "price", e.target.value)} /></td>
                  <td><input value={row.location || ""} onChange={(e) => updateField("parts", row.id, "location", e.target.value)} /></td>
                  <td><input value={row.leadTime || ""} onChange={(e) => updateField("parts", row.id, "leadTime", e.target.value)} /></td>
                  <td><input type="number" value={row.stockQty || 0} onChange={(e) => updateField("parts", row.id, "stockQty", e.target.value)} /></td>
                  <td><input type="number" value={row.minStock || 1} onChange={(e) => updateField("parts", row.id, "minStock", e.target.value)} /></td>
                  <td><span className={`stockStatus ${row.stockStatus.includes("不足") ? "stockBad" : row.stockStatus.includes("注意") ? "stockWarn" : "stockOk"}`}>{row.stockStatus}</span></td>
                  <td>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "parts", row.id)} />
                    {row.image && <img src={row.image} alt="" className="calendarPhoto" />}
                  </td>
                  <td><input value={row.stockNote || ""} onChange={(e) => updateField("parts", row.id, "stockNote", e.target.value)} /></td>
                  <td><button className="deleteButton" onClick={() => removeItem("parts", row.id)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  function renderCalendarModal() {
    if (!newCalendarEvent) return null;

    return (
      <div className="modalBackdrop">
        <div className="modalCard">
          <div className="header">
            <div>
              <h2>📅 新しい予定</h2>
              <p>{newCalendarEvent.date} の予定を登録します。</p>
            </div>
            <button className="deleteButton" onClick={cancelNewCalendarEvent}><X size={16} /> 閉じる</button>
          </div>

          <div className="reportGrid">
            <label>日付<input type="date" value={newCalendarEvent.date || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, date: e.target.value })} /></label>
            <label>時間<input type="time" value={newCalendarEvent.time || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, time: e.target.value })} /></label>
            <label>区分
              <select value={newCalendarEvent.category || "定期保全"} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, category: e.target.value })}>
                <option value="定期保全">定期保全</option>
                <option value="計画工事">計画工事</option>
                <option value="会議">会議</option>
                <option value="緊急">緊急</option>
              </select>
            </label>
            <label>重要度
              <select value={newCalendarEvent.importance || "通常"} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, importance: e.target.value })}>
                <option value="通常">通常</option>
                <option value="重要">重要</option>
              </select>
            </label>
            <label>タイトル<input value={newCalendarEvent.title || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, title: e.target.value })} /></label>
            <label>担当者<input value={newCalendarEvent.owner || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, owner: e.target.value })} /></label>
          </div>

          <h3>内容</h3>
          <textarea value={newCalendarEvent.detail || ""} onChange={(e) => setNewCalendarEvent({ ...newCalendarEvent, detail: e.target.value })} />

          <h3>写真</h3>
          <input type="file" accept="image/*" onChange={(e) => handleDraftImageUpload(e, setNewCalendarEvent)} />
          {newCalendarEvent.image && <img src={newCalendarEvent.image} alt="" className="calendarPhoto" />}

          <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
            <button className="primaryButton" onClick={saveNewCalendarEvent}><Save size={16} /> 保存</button>
            <button className="deleteButton" onClick={cancelNewCalendarEvent}><X size={16} /> キャンセル</button>
          </div>
        </div>
      </div>
    );
  }

  function renderCalendar() {
    return (
      <>
        <div className="header">
          <div>
            <h2>📅 カレンダー</h2>
            <p>日付をクリックすると、予定登録画面が開きます。</p>
          </div>
          <button className="primaryButton" onClick={() => startNewCalendarEvent(selectedDate)}>
            <Plus size={16} /> 新しい予定
          </button>
        </div>

        <div className="tableWrap">
          <div className="calendarTop">
            <button onClick={() => changeMonth(-1)}>＜</button>
            <h2>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</h2>
            <button onClick={() => changeMonth(1)}>＞</button>
            <button onClick={() => {
              const now = todayText();
              setCalendarMonth(new Date());
              setSelectedDate(now);
            }}>今日に戻る</button>
          </div>

          <div className="calendarWeek">
            <div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div>
          </div>

          <div className="calendarGrid">
            {getCalendarDays().map((date, index) => {
              const dayEvents = calendarEvents.filter((event) => event.date === date);
              return (
                <div
                  key={index}
                  className={`calendarDay ${date === selectedDate ? "selectedDay" : ""}`}
                  onClick={() => {
                    if (!date) return;
                    setSelectedDate(date);
                    startNewCalendarEvent(date);
                  }}
                >
                  {date && (
                    <>
                      <strong>{Number(date.slice(8, 10))}</strong>
                      {dayEvents.length > 0 && <span className="eventCount">{dayEvents.length}件</span>}
                      <div className="calendarEventList">
                        {dayEvents.slice(0, 4).map((event) => (
                          <span key={event.id} className={`calendarEventTag ${event.importance === "重要" ? "importantTag" : ""}`}>
                            {event.category === "計画工事" ? "🏗️ " : event.category === "緊急" ? "🔴 " : ""}
                            {event.time ? `${event.time} ` : ""}{event.title || "予定"}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="selectedEvents">
            <h3>{selectedDate} の予定一覧</h3>
            {calendarEvents.filter((event) => event.date === selectedDate).length === 0 && <p>予定はありません。</p>}
            {calendarEvents
              .filter((event) => event.date === selectedDate)
              .map((event) => (
                <div key={event.id} className="eventRow">
                  <b>{event.importance === "重要" ? "【重要】" : ""}{event.time ? `${event.time} ` : ""}{event.title || "予定"}</b>
                  <span>区分: {event.category || "-"}</span>
                  <span>担当: {event.owner || "-"}</span>
                  <span>{event.detail || "-"}</span>
                  <button className="deleteButton" onClick={() => removeItem("calendar", event.id)}><Trash2 size={16} /> 削除</button>
                </div>
              ))}
          </div>
        </div>

        {renderCalendarModal()}
      </>
    );
  }

  function renderReports() {
    return (
      <>
        <div className="header">
          <div>
            <h2>📝 保全報告書</h2>
            <p>新規作成後、保存するとFirebaseに登録され、AI検索に反映されます。</p>
          </div>
          <button className="primaryButton" onClick={startNewReport}><Plus size={16} /> 新規作成</button>
        </div>

        <ReportDraftForm />

        <div className="tableWrap">
          <input
            value={reportSearch}
            onChange={(e) => setReportSearch(e.target.value)}
            placeholder="検索：設備名・ライン名・不具合現象・原因・処置内容・担当者"
          />
        </div>

        {filteredReports.map((row) => (
          <div className="tableWrap" key={row.id} style={{ marginTop: "20px" }}>
            <div className="header">
              <div>
                <h3>報告書：{row.equipment || "設備名未入力"} / {row.createdAt || "-"}</h3>
                <p>{row.phenomenon || "不具合現象未入力"}</p>
              </div>
              <button className="deleteButton" onClick={() => removeItem("maintenanceReports", row.id)}>
                <Trash2 size={16} /> 削除
              </button>
            </div>

            <Section sectionKey="basic" title="📌 基本情報">
              <div className="reportGrid">
                <label>作成日<input type="date" value={row.createdAt || ""} onChange={(e) => updateField("maintenanceReports", row.id, "createdAt", e.target.value)} /></label>
                <label>保全分類<input value={row.maintenanceType || ""} onChange={(e) => updateField("maintenanceReports", row.id, "maintenanceType", e.target.value)} /></label>
                <label>ライン名<input value={row.lineName || ""} onChange={(e) => updateField("maintenanceReports", row.id, "lineName", e.target.value)} /></label>
                <label>設備名<input value={row.equipment || ""} onChange={(e) => updateField("maintenanceReports", row.id, "equipment", e.target.value)} /></label>
                <label>作業者<input value={row.worker || ""} onChange={(e) => updateField("maintenanceReports", row.id, "worker", e.target.value)} /></label>
              </div>
            </Section>

            <Section sectionKey="trouble" title="📝 異常内容・処置">
              <h3>不具合現象</h3>
              <textarea value={row.phenomenon || ""} onChange={(e) => updateField("maintenanceReports", row.id, "phenomenon", e.target.value)} />
              <h3>不具合箇所</h3>
              <textarea value={row.troublePoint || ""} onChange={(e) => updateField("maintenanceReports", row.id, "troublePoint", e.target.value)} />
              <h3>処置内容</h3>
              <textarea value={row.action || ""} onChange={(e) => updateField("maintenanceReports", row.id, "action", e.target.value)} />
            </Section>

            <Section sectionKey="why" title="🔍 なぜなぜ分析">
              <label>なぜ1<textarea value={row.why1 || ""} onChange={(e) => updateField("maintenanceReports", row.id, "why1", e.target.value)} /></label>
              <label>なぜ2<textarea value={row.why2 || ""} onChange={(e) => updateField("maintenanceReports", row.id, "why2", e.target.value)} /></label>
              <label>なぜ3<textarea value={row.why3 || ""} onChange={(e) => updateField("maintenanceReports", row.id, "why3", e.target.value)} /></label>
              <h3>再発防止</h3>
              <textarea value={row.recurrencePrevention || ""} onChange={(e) => updateField("maintenanceReports", row.id, "recurrencePrevention", e.target.value)} />
            </Section>

            <Section sectionKey="cost" title="💰 費用・交換部品">
              <div className="reportGrid">
                <label>交換部品<input value={row.replacedPart || ""} onChange={(e) => updateField("maintenanceReports", row.id, "replacedPart", e.target.value)} /></label>
                <label>労務費<input value={row.laborCost || ""} onChange={(e) => updateField("maintenanceReports", row.id, "laborCost", e.target.value)} /></label>
                <label>部品費<input value={row.partsCost || ""} onChange={(e) => updateField("maintenanceReports", row.id, "partsCost", e.target.value)} /></label>
                <label>合計<input value={row.totalCost || ""} onChange={(e) => updateField("maintenanceReports", row.id, "totalCost", e.target.value)} /></label>
              </div>
            </Section>

            <Section sectionKey="other" title="⚙️ その他">
              <h3>写真</h3>
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "maintenanceReports", row.id)} />
              {row.image && <img src={row.image} alt="" className="calendarPhoto" />}
              <h3>備考</h3>
              <textarea value={row.note || ""} onChange={(e) => updateField("maintenanceReports", row.id, "note", e.target.value)} />
            </Section>
          </div>
        ))}
      </>
    );
  }

  function renderPlannedWorks() {
    return (
      <>
        <div className="header">
          <div>
            <h2>🏗️ 計画工事</h2>
            <p>保存すると自動でカレンダーにも登録されます。</p>
          </div>
          <button className="primaryButton" onClick={startNewPlannedWork}><Plus size={16} /> 工事追加</button>
        </div>

        {newPlannedWork && (
          <div className="tableWrap" style={{ border: "2px solid #2563eb" }}>
            <div className="header">
              <h2>🏗️ 新規 計画工事</h2>
              <div style={{ display: "flex", gap: "10px" }}>
                <button className="primaryButton" onClick={saveNewPlannedWork}><Save size={16} /> 保存</button>
                <button className="deleteButton" onClick={cancelNewPlannedWork}><X size={16} /> キャンセル</button>
              </div>
            </div>

            <div className="reportGrid">
              <label>開始日<input type="date" value={newPlannedWork.date || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, date: e.target.value })} /></label>
              <label>完了予定日<input type="date" value={newPlannedWork.endDate || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, endDate: e.target.value })} /></label>
              <label>工事件名<input value={newPlannedWork.title || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, title: e.target.value })} /></label>
              <label>設備名<input value={newPlannedWork.equipment || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, equipment: e.target.value })} /></label>
              <label>目的<input value={newPlannedWork.purpose || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, purpose: e.target.value })} /></label>
              <label>担当者<input value={newPlannedWork.owner || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, owner: e.target.value })} /></label>
              <label>状態
                <select value={newPlannedWork.status || "計画中"} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, status: e.target.value })}>
                  <option value="計画中">計画中</option>
                  <option value="準備中">準備中</option>
                  <option value="実施中">実施中</option>
                  <option value="完了">完了</option>
                  <option value="延期">延期</option>
                </select>
              </label>
              <label>進捗<input type="number" value={newPlannedWork.progress || 0} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, progress: e.target.value })} /></label>
            </div>

            <h3>内容</h3>
            <textarea value={newPlannedWork.detail || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, detail: e.target.value })} />

            <h3>リスク</h3>
            <textarea value={newPlannedWork.risk || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, risk: e.target.value })} />

            <h3>備考</h3>
            <textarea value={newPlannedWork.note || ""} onChange={(e) => setNewPlannedWork({ ...newPlannedWork, note: e.target.value })} />

            <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <button className="primaryButton" onClick={saveNewPlannedWork}><Save size={16} /> 保存</button>
              <button className="deleteButton" onClick={cancelNewPlannedWork}><X size={16} /> キャンセル</button>
            </div>
          </div>
        )}

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>開始日</th><th>完了予定日</th><th>工事件名</th><th>設備名</th><th>目的</th><th>内容</th><th>担当者</th><th>進捗</th><th>状態</th><th>リスク</th><th></th>
              </tr>
            </thead>
            <tbody>
              {plannedWorks.map((row) => (
                <tr key={row.id}>
                  <td><input type="date" value={row.date || ""} onChange={(e) => updateField("plannedWorks", row.id, "date", e.target.value)} /></td>
                  <td><input type="date" value={row.endDate || ""} onChange={(e) => updateField("plannedWorks", row.id, "endDate", e.target.value)} /></td>
                  <td><input value={row.title || ""} onChange={(e) => updateField("plannedWorks", row.id, "title", e.target.value)} /></td>
                  <td><input value={row.equipment || ""} onChange={(e) => updateField("plannedWorks", row.id, "equipment", e.target.value)} /></td>
                  <td><input value={row.purpose || ""} onChange={(e) => updateField("plannedWorks", row.id, "purpose", e.target.value)} /></td>
                  <td><textarea value={row.detail || ""} onChange={(e) => updateField("plannedWorks", row.id, "detail", e.target.value)} /></td>
                  <td><input value={row.owner || ""} onChange={(e) => updateField("plannedWorks", row.id, "owner", e.target.value)} /></td>
                  <td><input type="number" value={row.progress || 0} onChange={(e) => updateField("plannedWorks", row.id, "progress", e.target.value)} /></td>
                  <td>
                    <select value={row.status || "計画中"} onChange={(e) => updateField("plannedWorks", row.id, "status", e.target.value)}>
                      <option value="計画中">計画中</option>
                      <option value="準備中">準備中</option>
                      <option value="実施中">実施中</option>
                      <option value="完了">完了</option>
                      <option value="延期">延期</option>
                    </select>
                  </td>
                  <td><textarea value={row.risk || ""} onChange={(e) => updateField("plannedWorks", row.id, "risk", e.target.value)} /></td>
                  <td><button className="deleteButton" onClick={() => removeItem("plannedWorks", row.id)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  function renderAiSearch() {
    return (
      <div className="tableWrap">
        <h2>🔍 AI検索</h2>
        <p>保全報告書・定期保全・予備品管理・カレンダー・計画工事から関連情報をまとめて検索します。</p>

        <input
          value={aiSearch}
          onChange={(e) => {
            setAiSearch(e.target.value);
            setGlobalSearch(e.target.value);
          }}
          placeholder="例：ロードセル 78-60 異常停止 在庫不足"
          style={{ margin: "16px 0" }}
        />

        <button className="primaryButton" onClick={makeAiAnswer}><Bot size={16} /> AI分析</button>

        <div className="calendarEditCard" style={{ marginTop: "20px" }}>
          <h3>AI自動報告書作成</h3>
          <p>短く入力すると、保全作業報告書を自動で作成します。</p>
          <textarea value={autoReportInput} onChange={(e) => setAutoReportInput(e.target.value)} placeholder="例：78-60 ロードセル異常 荷重確認 配線確認" />
          <button className="primaryButton" onClick={createAutoReport}>報告書を自動作成</button>
        </div>

        {aiLevel && (
          <div className={`calendarEditCard ${aiLevel.includes("緊急") ? "aiHigh" : aiLevel.includes("注意") ? "aiMiddle" : "aiLow"}`} style={{ marginTop: "20px" }}>
            <h3>{aiLevel}</h3>
          </div>
        )}

        {aiAnswer && <div className="calendarEditCard" style={{ marginTop: "20px", whiteSpace: "pre-line" }}>{aiAnswer}</div>}

        <h3 style={{ marginTop: "24px" }}>関連データ一覧：{aiResults.length}件</h3>
        {aiResults.length === 0 && aiSearch && <p>該当する履歴が見つかりません。</p>}

        {aiResults.map((item, index) => (
          <div key={index} className="calendarEditCard" style={{ cursor: "pointer" }} onClick={() => setPage(item.page)}>
            <b>{item.category} / {item.date}</b>
            <h3>{item.title}</h3>
            <p>{item.text || "-"}</p>
          </div>
        ))}
      </div>
    );
  }

  function renderCurrentPage() {
    if (page === "home") return renderHome();
    if (page === "ai") return renderAiSearch();
    if (page === "report") return renderReports();
    if (page === "maintenance") return renderMaintenance();
    if (page === "spare") return renderSpareParts();
    if (page === "calendar") return renderCalendar();
    if (page === "work") return renderPlannedWorks();
    return renderHome();
  }

  const menuItems = [
    { key: "home", label: "ホーム", icon: <Home size={16} /> },
    { key: "ai", label: "AI検索", icon: <Search size={16} /> },
    { key: "report", label: "保全報告書", icon: <FileText size={16} /> },
    { key: "maintenance", label: "定期保全", icon: <Wrench size={16} /> },
    { key: "spare", label: "予備品管理", icon: <Package size={16} /> },
    { key: "calendar", label: "カレンダー", icon: <CalendarDays size={16} /> },
    { key: "work", label: "計画工事", icon: <Hammer size={16} /> },
  ];

  return (
    <div className="page">
      <div className="container">
        <div className="header">
          <div className="headerLogo">
            <img
              src="/miyama-logo.png"
              alt="MIYAMA ONE TEAM"
              className="miyamaLogo"
            />
            <div>
              <div className="badge">AI保全管理システム</div>
              <h1>Maintenance AI</h1>
              <p className="oneTeamSlogan">One Team Maintenance Group</p>
              <p>設備保全を、もっとスマートに。</p>
            </div>
          </div>
        </div>

        <div className="tabs">
          {menuItems.map((item) => (
            <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {page !== "home" && renderGlobalSearchBox()}

        {renderCurrentPage()}
      </div>
    </div>
  );
}
