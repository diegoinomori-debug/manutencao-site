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

  return Math.ceil(
    (target - today) / (1000 * 60 * 60 * 24)
  );
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

  useEffect(() => {
    loadParts();
    loadInspections();
    loadCalendar();
    loadFactoryLogs();
  }, []);

  async function loadParts() {

    const querySnapshot = await getDocs(
      collection(db, "parts")
    );

    const items = [];

    querySnapshot.forEach((docItem) => {

      items.push({
        id: docItem.id,
        ...docItem.data(),
      });

    });

    setParts(items);
  }

  async function loadInspections() {

    const querySnapshot = await getDocs(
      collection(db, "inspections")
    );

    const items = [];

    querySnapshot.forEach((docItem) => {

      items.push({
        id: docItem.id,
        ...docItem.data(),
      });

    });

    setInspections(items);
  }

  async function loadCalendar() {

    const querySnapshot = await getDocs(
      collection(db, "calendar")
    );

    const items = [];

    querySnapshot.forEach((docItem) => {

      items.push({
        id: docItem.id,
        ...docItem.data(),
      });

    });

    setCalendarEvents(items);
  }

  async function loadFactoryLogs() {

    const querySnapshot = await getDocs(
      collection(db, "factoryLogs")
    );

    const items = [];

    querySnapshot.forEach((docItem) => {

      items.push({
        id: docItem.id,
        ...docItem.data(),
      });

    });

    setFactoryLogs(items);
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

      date: "",
      title: "",
      detail: "",
      owner: "",
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

  async function removeItem(collectionName, id) {

    await deleteDoc(doc(db, collectionName, id));

    if (collectionName === "parts")
      loadParts();

    if (collectionName === "inspections")
      loadInspections();

    if (collectionName === "calendar")
      loadCalendar();

    if (collectionName === "factoryLogs")
      loadFactoryLogs();
  }

  async function updateField(
    collectionName,
    id,
    field,
    value
  ) {

    await updateDoc(
      doc(db, collectionName, id),
      {
        [field]: value,
      }
    );

    if (collectionName === "parts")
      loadParts();

    if (collectionName === "inspections")
      loadInspections();

    if (collectionName === "calendar")
      loadCalendar();

    if (collectionName === "factoryLogs")
      loadFactoryLogs();
  }

  const rows = useMemo(() => {

    return parts
      .map((part) => {

        const nextDate = addDays(
          part.lastDate,
          part.cycle
        );

        const daysLeft = diffDays(nextDate);

        const status = getStatus(daysLeft);

        return {
          ...part,
          nextDate,
          daysLeft,
          status,
        };
      })

      .sort((a, b) => {

        if (a.daysLeft === "")
          return 1;

        if (b.daysLeft === "")
          return -1;

        return a.daysLeft - b.daysLeft;
      });

  }, [parts]);

  const overCount = rows.filter(
    (row) => row.status === "交換超過"
  ).length;

  const nearCount = rows.filter(
    (row) => row.status === "交換間近"
  ).length;

  const abnormalCount = inspections.filter(
    (row) => row.result === "NG"
  ).length;

  return (

    <div className="page">

      <div className="container">

        <div className="header">

          <div>

            <div className="badge">
              設備管理システム
            </div>

            <h1>
              保全管理サイト
            </h1>

            <p>
              交換期限が近い部品から自動で上に表示されます。
            </p>

          </div>

        </div>

        <div className="tabs">

          <button
            onClick={() =>
              setPage("maintenance")
            }
          >
            定期・定量保全
          </button>

          <button
            onClick={() =>
              setPage("purchase")
            }
          >
            部品購入管理
          </button>

          <button
            onClick={() =>
              setPage("inspection")
            }
          >
            設備点検
          </button>

          <button
            onClick={() =>
              setPage("calendar")
            }
          >
            予定カレンダー
          </button>

          <button
            onClick={() =>
              setPage("factory")
            }
          >
            工場記録
          </button>

          <button
            onClick={() =>
              setPage("dashboard")
            }
          >
            ダッシュボード
          </button>

          <button
            onClick={() =>
              setPage("settings")
            }
          >
            設定
          </button>

        </div>

        {page === "calendar" && (

          <>

            <div className="header">

              <h2>
                予定カレンダー
              </h2>

              <button
                className="primaryButton"
                onClick={addCalendarEvent}
              >
                <Plus size={16} />
                予定追加
              </button>

            </div>

            <div className="tableWrap">

              <table>

                <thead>

                  <tr>
                    <th>日付</th>
                    <th>タイトル</th>
                    <th>内容</th>
                    <th>担当</th>
                    <th>画像URL</th>
                    <th></th>
                  </tr>

                </thead>

                <tbody>

                  {calendarEvents.map((row) => (

                    <tr key={row.id}>

                      <td>

                        <input
                          type="date"
                          value={row.date || ""}
                          onChange={(e) =>
                            updateField(
                              "calendar",
                              row.id,
                              "date",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={row.title || ""}
                          onChange={(e) =>
                            updateField(
                              "calendar",
                              row.id,
                              "title",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <textarea
                          value={row.detail || ""}
                          onChange={(e) =>
                            updateField(
                              "calendar",
                              row.id,
                              "detail",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={row.owner || ""}
                          onChange={(e) =>
                            updateField(
                              "calendar",
                              row.id,
                              "owner",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={row.image || ""}
                          onChange={(e) =>
                            updateField(
                              "calendar",
                              row.id,
                              "image",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <button
                          className="deleteButton"
                          onClick={() =>
                            removeItem(
                              "calendar",
                              row.id
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </>

        )}

        {page === "factory" && (

          <>

            <div className="header">

              <h2>
                工場記録
              </h2>

              <button
                className="primaryButton"
                onClick={addFactoryLog}
              >
                <Plus size={16} />
                記録追加
              </button>

            </div>

            <div className="tableWrap">

              <table>

                <thead>

                  <tr>
                    <th>日付</th>
                    <th>時間</th>
                    <th>工程</th>
                    <th>設備</th>
                    <th>異常内容</th>
                    <th>原因</th>
                    <th>処置</th>
                    <th>復旧時間</th>
                    <th>担当</th>
                    <th>画像URL</th>
                    <th>備考</th>
                    <th></th>
                  </tr>

                </thead>

                <tbody>

                  {factoryLogs.map((row) => (

                    <tr key={row.id}>

                      <td>

                        <input
                          type="date"
                          value={row.date || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "date",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          type="time"
                          value={row.time || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "time",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={row.sector || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "sector",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={row.machine || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "machine",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <textarea
                          value={row.problem || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "problem",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <textarea
                          value={row.cause || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "cause",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <textarea
                          value={row.action || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "action",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={row.repairTime || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "repairTime",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={row.owner || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "owner",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <input
                          value={row.image || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "image",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <textarea
                          value={row.note || ""}
                          onChange={(e) =>
                            updateField(
                              "factoryLogs",
                              row.id,
                              "note",
                              e.target.value
                            )
                          }
                        />

                      </td>

                      <td>

                        <button
                          className="deleteButton"
                          onClick={() =>
                            removeItem(
                              "factoryLogs",
                              row.id
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </>

        )}

      </div>

    </div>
  );
}