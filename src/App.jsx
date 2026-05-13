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
  const [page, setPage] = useState("maintenance");

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  useEffect(() => {
    loadParts();
    loadInspections();
    loadCalendar();
    loadFactoryLogs();
  }, []);

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

  async function updateField(collectionName, id, field, value) {
    if (collectionName === "parts") {
      setParts((current) =>
        current.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        )
      );
    }

    if (collectionName === "inspections") {
      setInspections((current) =>
        current.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        )
      );
    }

    if (collectionName === "calendar") {
      setCalendarEvents((current) =>
        current.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        )
      );
    }

    if (collectionName === "factoryLogs") {
      setFactoryLogs((current) =>
        current.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        )
      );
    }

    await updateDoc(doc(db, collectionName, id), {
      [field]: value,
    });
  }

  async function removeItem(collectionName, id) {
    await deleteDoc(doc(db, collectionName, id));

    if (collectionName === "parts") loadParts();
    if (collectionName === "inspections") loadInspections();
    if (collectionName === "calendar") loadCalendar();
    if (collectionName === "factoryLogs") loadFactoryLogs();
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

  function handleImageUpload(event, collectionName, rowId) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      updateField(collectionName, rowId, "image", reader.result);
    };

    reader.readAsDataURL(file);
  }

  function getCalendarDays() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const days = [];

    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

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

  const overCount = rows.filter((r) => r.status === "交換超過").length;
  const nearCount = rows.filter((r) => r.status === "交換間近").length;
  const normalCount = rows.filter((r) => r.status === "正常").length;
  const ngCount = inspections.filter((r) => r.result === "NG").length;

  return (
    <div className="page">
      <div className="container">
        <div className="header">
          <div>
            <div className="badge">設備管理システム</div>
            <h1>保全管理サイト</h1>
            <p>交換期限が近い部品から自動で上に表示されます。</p>
          </div>
        </div>

        <div className="tabs">
          <button className={page === "maintenance" ? "active" : ""} onClick={() => setPage("maintenance")}>定期・定量保全</button>
          <button className={page === "purchase" ? "active" : ""} onClick={() => setPage("purchase")}>部品購入管理</button>
          <button className={page === "inspection" ? "active" : ""} onClick={() => setPage("inspection")}>設備点検</button>
          <button className={page === "calendar" ? "active" : ""} onClick={() => setPage("calendar")}>予定カレンダー</button>
          <button className={page === "factory" ? "active" : ""} onClick={() => setPage("factory")}>工場記録</button>
          <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>ダッシュボード</button>
          <button className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>設定</button>
        </div>

        {page === "maintenance" && (
          <>
            <div className="header">
              <div>
                <h2>定期・定量保全管理表</h2>
                <p>交換超過・交換間近の部品が上に表示されます。</p>
              </div>
              <button className="primaryButton" onClick={addPart}>
                <Plus size={16} /> 部品追加
              </button>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>設備名</th><th>部品名</th><th>部品番号</th><th>部品値段</th><th>購入先</th>
                    <th>予備品ロケーション</th><th>部品納期</th><th>交換周期</th><th>前回交換日</th>
                    <th>次回交換日</th><th>残日数</th><th>状態</th><th>担当者</th><th>備考</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td><input value={row.equipment || ""} onChange={(e) => updateField("parts", row.id, "equipment", e.target.value)} /></td>
                      <td><input value={row.partName || ""} onChange={(e) => updateField("parts", row.id, "partName", e.target.value)} /></td>
                      <td><input value={row.partNo || ""} onChange={(e) => updateField("parts", row.id, "partNo", e.target.value)} /></td>
                      <td><input value={row.price || ""} onChange={(e) => updateField("parts", row.id, "price", e.target.value)} placeholder="例: 200,000円" /></td>
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
            <p>購入先・納期・発注状況・入荷予定を管理できます。</p>
            <table>
              <thead>
                <tr>
                  <th>部品名</th><th>部品番号</th><th>部品値段</th><th>購入先</th><th>部品納期</th>
                  <th>発注状況</th><th>発注日</th><th>入荷予定日</th><th>担当者</th><th>購入メモ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.partName || "-"}</td>
                    <td>{row.partNo || "-"}</td>
                    <td>{row.price || "-"}</td>
                    <td>{row.supplier || "-"}</td>
                    <td>{row.leadTime || "-"}</td>
                    <td>
                      <select value={row.purchaseStatus || "未発注"} onChange={(e) => updateField("parts", row.id, "purchaseStatus", e.target.value)}>
                        <option value="未発注">未発注</option>
                        <option value="見積依頼中">見積依頼中</option>
                        <option value="発注済み">発注済み</option>
                        <option value="入荷済み">入荷済み</option>
                      </select>
                    </td>
                    <td><input type="date" value={row.orderDate || ""} onChange={(e) => updateField("parts", row.id, "orderDate", e.target.value)} /></td>
                    <td><input type="date" value={row.arrivalDate || ""} onChange={(e) => updateField("parts", row.id, "arrivalDate", e.target.value)} /></td>
                    <td>{row.owner || "-"}</td>
                    <td><input value={row.purchaseNote || ""} onChange={(e) => updateField("parts", row.id, "purchaseNote", e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {page === "inspection" && (
          <>
            <div className="header">
              <div>
                <h2>設備点検</h2>
                <p>日常点検・月次点検・異常記録を管理できます。</p>
              </div>
              <button className="primaryButton" onClick={addInspection}>
                <Plus size={16} /> 点検追加
              </button>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>点検日</th><th>設備名</th><th>点検区分</th><th>点検項目</th><th>結果</th>
                    <th>異常内容</th><th>処置内容</th><th>担当者</th><th>次回点検日</th><th>備考</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((row) => (
                    <tr key={row.id}>
                      <td><input type="date" value={row.date || ""} onChange={(e) => updateField("inspections", row.id, "date", e.target.value)} /></td>
                      <td><input value={row.equipment || ""} onChange={(e) => updateField("inspections", row.id, "equipment", e.target.value)} /></td>
                      <td>
                        <select value={row.inspectionType || "日常点検"} onChange={(e) => updateField("inspections", row.id, "inspectionType", e.target.value)}>
                          <option value="日常点検">日常点検</option>
                          <option value="週次点検">週次点検</option>
                          <option value="月次点検">月次点検</option>
                          <option value="年次点検">年次点検</option>
                          <option value="異常記録">異常記録</option>
                        </select>
                      </td>
                      <td><input value={row.checkItem || ""} onChange={(e) => updateField("inspections", row.id, "checkItem", e.target.value)} /></td>
                      <td>
                        <select value={row.result || "OK"} onChange={(e) => updateField("inspections", row.id, "result", e.target.value)}>
                          <option value="OK">OK</option>
                          <option value="NG">NG</option>
                          <option value="要確認">要確認</option>
                        </select>
                      </td>
                      <td><input value={row.abnormalDetail || ""} onChange={(e) => updateField("inspections", row.id, "abnormalDetail", e.target.value)} /></td>
                      <td><input value={row.action || ""} onChange={(e) => updateField("inspections", row.id, "action", e.target.value)} /></td>
                      <td><input value={row.owner || ""} onChange={(e) => updateField("inspections", row.id, "owner", e.target.value)} /></td>
                      <td><input type="date" value={row.nextCheckDate || ""} onChange={(e) => updateField("inspections", row.id, "nextCheckDate", e.target.value)} /></td>
                      <td><input value={row.note || ""} onChange={(e) => updateField("inspections", row.id, "note", e.target.value)} /></td>
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
            <div className="header">
              <div>
                <h2>予定カレンダー</h2>
                <p>日常予定・会議・保全予定・工事予定をカレンダーで管理できます。</p>
              </div>
              <button className="primaryButton" onClick={addCalendarEvent}>
                <Plus size={16} /> 新しい予定を追加
              </button>
            </div>

            <div className="calendarLayout">
              <div className="calendarMain">
                <div className="calendarTop">
                  <button onClick={() => changeMonth(-1)}>＜</button>
                  <h2>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</h2>
                  <button onClick={() => changeMonth(1)}>＞</button>
                  <button
                    onClick={() => {
                      const todayText = new Date().toISOString().slice(0, 10);
                      setCalendarMonth(new Date());
                      setSelectedDate(todayText);
                    }}
                  >
                    今日に戻る
                  </button>
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
                        onClick={() => date && setSelectedDate(date)}
                      >
                        {date && (
                          <>
                            <strong>{Number(date.slice(8, 10))}</strong>
                            <div className="calendarEventList">
                              {dayEvents.slice(0, 3).map((event) => (
                                <span
                                  key={event.id}
                                  className={`calendarEventTag ${
                                    event.importance === "重要" ? "importantTag" : ""
                                  }`}
                                >
                                  {event.time ? `${event.time} ` : ""}
                                  {event.title || "予定"}
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
                  {calendarEvents
                    .filter((event) => event.date === selectedDate)
                    .map((event) => (
                      <div key={event.id} className="eventRow">
                        <b>
                          {event.importance === "重要" ? "【重要】" : ""}
                          {event.time ? `${event.time} ` : ""}
                          {event.title || "予定"}
                        </b>
                        <span>担当: {event.owner || "-"}</span>
                        <span>{event.detail || "-"}</span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="calendarSide">
                <h3>予定の詳細</h3>
                {calendarEvents.map((row) => (
                  <div key={row.id} className="calendarEditCard">
                    <input type="date" value={row.date || ""} onChange={(e) => updateField("calendar", row.id, "date", e.target.value)} />
                    <input type="time" value={row.time || ""} onChange={(e) => updateField("calendar", row.id, "time", e.target.value)} />
                    <input value={row.title || ""} onChange={(e) => updateField("calendar", row.id, "title", e.target.value)} placeholder="タイトル" />

                    <select value={row.importance || "通常"} onChange={(e) => updateField("calendar", row.id, "importance", e.target.value)}>
                      <option value="通常">通常</option>
                      <option value="重要">重要</option>
                    </select>

                    <textarea value={row.detail || ""} onChange={(e) => updateField("calendar", row.id, "detail", e.target.value)} placeholder="内容" />
                    <input value={row.owner || ""} onChange={(e) => updateField("calendar", row.id, "owner", e.target.value)} placeholder="担当者" />
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "calendar", row.id)} />
                    {row.image && <img src={row.image} alt="" className="calendarPhoto" />}
                    <button className="deleteButton" onClick={() => removeItem("calendar", row.id)}>
                      <Trash2 size={16} /> 削除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {page === "factory" && (
          <>
            <div className="header">
              <div>
                <h2>工場記録</h2>
                <p>設備異常・故障・修理内容・原因を記録できます。</p>
              </div>
              <button className="primaryButton" onClick={addFactoryLog}>
                <Plus size={16} /> 記録追加
              </button>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>発生日</th><th>時間</th><th>工程</th><th>設備名</th><th>異常内容</th><th>原因</th>
                    <th>処置内容</th><th>復旧時間</th><th>担当者</th><th>写真</th><th>備考</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {factoryLogs.map((row) => (
                    <tr key={row.id}>
                      <td><input type="date" value={row.date || ""} onChange={(e) => updateField("factoryLogs", row.id, "date", e.target.value)} /></td>
                      <td><input type="time" value={row.time || ""} onChange={(e) => updateField("factoryLogs", row.id, "time", e.target.value)} /></td>
                      <td><input value={row.sector || ""} onChange={(e) => updateField("factoryLogs", row.id, "sector", e.target.value)} /></td>
                      <td><input value={row.machine || ""} onChange={(e) => updateField("factoryLogs", row.id, "machine", e.target.value)} /></td>
                      <td><textarea value={row.problem || ""} onChange={(e) => updateField("factoryLogs", row.id, "problem", e.target.value)} /></td>
                      <td><textarea value={row.cause || ""} onChange={(e) => updateField("factoryLogs", row.id, "cause", e.target.value)} /></td>
                      <td><textarea value={row.action || ""} onChange={(e) => updateField("factoryLogs", row.id, "action", e.target.value)} /></td>
                      <td><input value={row.repairTime || ""} onChange={(e) => updateField("factoryLogs", row.id, "repairTime", e.target.value)} placeholder="例: 2時間" /></td>
                      <td><input value={row.owner || ""} onChange={(e) => updateField("factoryLogs", row.id, "owner", e.target.value)} /></td>
                      <td>
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "factoryLogs", row.id)} />
                        {row.image && <img src={row.image} alt="" className="calendarPhoto" />}
                      </td>
                      <td><textarea value={row.note || ""} onChange={(e) => updateField("factoryLogs", row.id, "note", e.target.value)} /></td>
                      <td><button className="deleteButton" onClick={() => removeItem("factoryLogs", row.id)}><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {page === "dashboard" && (
          <div className="tableWrap">
            <h2>ダッシュボード</h2>
            <div className="cards">
              <div className="card red"><span>交換超過</span><strong>{overCount}</strong></div>
              <div className="card yellow"><span>交換間近</span><strong>{nearCount}</strong></div>
              <div className="card green"><span>正常</span><strong>{normalCount}</strong></div>
              <div className="card red"><span>点検NG</span><strong>{ngCount}</strong></div>
              <div className="card"><span>登録部品数</span><strong>{rows.length}</strong></div>
              <div className="card"><span>予定件数</span><strong>{calendarEvents.length}</strong></div>
              <div className="card"><span>工場記録数</span><strong>{factoryLogs.length}</strong></div>
            </div>
          </div>
        )}

        {page === "settings" && (
          <div className="tableWrap">
            <h2>設定</h2>
            <table>
              <tbody>
                <tr><th>保存先</th><td>Firebase Firestore</td></tr>
                <tr><th>メール送信</th><td>Vercel + Resend</td></tr>
                <tr><th>交換通知</th><td>交換予定日の7日前</td></tr>
                <tr><th>購入通知</th><td>部品納期に合わせて通知</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}