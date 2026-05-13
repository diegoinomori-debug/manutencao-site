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
  const [page, setPage] = useState("maintenance");

  useEffect(() => {
    loadParts();
    loadInspections();
  }, []);

  async function loadParts() {
    const querySnapshot = await getDocs(collection(db, "parts"));
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
    const querySnapshot = await getDocs(collection(db, "inspections"));
    const items = [];

    querySnapshot.forEach((docItem) => {
      items.push({
        id: docItem.id,
        ...docItem.data(),
      });
    });

    setInspections(items);
  }

  async function addPart() {
    const newPart = {
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
    };

    await addDoc(collection(db, "parts"), newPart);
    loadParts();
  }

  async function removePart(id) {
    await deleteDoc(doc(db, "parts", id));
    loadParts();
  }

  async function updatePartField(id, field, value) {
    setParts((current) =>
      current.map((part) =>
        part.id === id ? { ...part, [field]: value } : part
      )
    );

    await updateDoc(doc(db, "parts", id), {
      [field]: value,
    });
  }

  async function addInspection() {
    const newInspection = {
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
    };

    await addDoc(collection(db, "inspections"), newInspection);
    loadInspections();
  }

  async function removeInspection(id) {
    await deleteDoc(doc(db, "inspections", id));
    loadInspections();
  }

  async function updateInspectionField(id, field, value) {
    setInspections((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );

    await updateDoc(doc(db, "inspections", id), {
      [field]: value,
    });
  }

  const rows = useMemo(() => {
    return parts
      .map((part) => {
        const nextDate = addDays(part.lastDate, part.cycle);
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
        if (a.daysLeft === "") return 1;
        if (b.daysLeft === "") return -1;
        return a.daysLeft - b.daysLeft;
      });
  }, [parts]);

  const inspectionRows = useMemo(() => {
    return [...inspections].sort((a, b) => {
      if (!a.nextCheckDate) return 1;
      if (!b.nextCheckDate) return -1;
      return a.nextCheckDate.localeCompare(b.nextCheckDate);
    });
  }, [inspections]);

  const overCount = rows.filter((row) => row.status === "交換超過").length;
  const nearCount = rows.filter((row) => row.status === "交換間近").length;
  const normalCount = rows.filter((row) => row.status === "正常").length;
  const abnormalCount = inspectionRows.filter((row) => row.result === "NG").length;

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
          <button
            className={page === "maintenance" ? "active" : ""}
            onClick={() => setPage("maintenance")}
          >
            定期・定量保全
          </button>

          <button
            className={page === "purchase" ? "active" : ""}
            onClick={() => setPage("purchase")}
          >
            部品購入管理
          </button>

          <button
            className={page === "inspection" ? "active" : ""}
            onClick={() => setPage("inspection")}
          >
            設備点検
          </button>

          <button
            className={page === "dashboard" ? "active" : ""}
            onClick={() => setPage("dashboard")}
          >
            ダッシュボード
          </button>

          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => setPage("settings")}
          >
            設定
          </button>
        </div>

        {page === "maintenance" && (
          <>
            <div className="header">
              <div>
                <h2>定期・定量保全管理表</h2>
                <p>交換超過・交換間近の部品が上に表示されます。</p>
              </div>

              <button className="primaryButton" onClick={addPart}>
                <Plus size={16} />
                部品追加
              </button>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>設備名</th>
                    <th>部品名</th>
                    <th>部品番号</th>
                    <th>部品値段</th>
                    <th>購入先</th>
                    <th>予備品ロケーション</th>
                    <th>部品納期</th>
                    <th>交換周期</th>
                    <th>前回交換日</th>
                    <th>次回交換日</th>
                    <th>残日数</th>
                    <th>状態</th>
                    <th>担当者</th>
                    <th>備考</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          value={row.equipment || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "equipment", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.partName || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "partName", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.partNo || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "partNo", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.price || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "price", e.target.value)
                          }
                          placeholder="例: 200,000円"
                        />
                      </td>

                      <td>
                        <input
                          value={row.supplier || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "supplier", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.location || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "location", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.leadTime || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "leadTime", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          value={row.cycle || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "cycle", Number(e.target.value))
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="date"
                          value={row.lastDate || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "lastDate", e.target.value)
                          }
                        />
                      </td>

                      <td>{row.nextDate || "-"}</td>
                      <td>{row.daysLeft === "" ? "-" : row.daysLeft}</td>

                      <td>
                        <span className={`status ${row.status}`}>
                          {row.status}
                        </span>
                      </td>

                      <td>
                        <input
                          value={row.owner || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "owner", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.note || ""}
                          onChange={(e) =>
                            updatePartField(row.id, "note", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <button
                          className="deleteButton"
                          onClick={() => removePart(row.id)}
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

        {page === "purchase" && (
          <div className="tableWrap">
            <div className="header">
              <div>
                <h2>部品購入管理</h2>
                <p>購入先・納期・発注状況・入荷予定を管理できます。</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>部品名</th>
                  <th>部品番号</th>
                  <th>部品値段</th>
                  <th>購入先</th>
                  <th>部品納期</th>
                  <th>発注状況</th>
                  <th>発注日</th>
                  <th>入荷予定日</th>
                  <th>担当者</th>
                  <th>購入メモ</th>
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
                      <select
                        value={row.purchaseStatus || "未発注"}
                        onChange={(e) =>
                          updatePartField(row.id, "purchaseStatus", e.target.value)
                        }
                      >
                        <option value="未発注">未発注</option>
                        <option value="見積依頼中">見積依頼中</option>
                        <option value="発注済み">発注済み</option>
                        <option value="入荷済み">入荷済み</option>
                      </select>
                    </td>

                    <td>
                      <input
                        type="date"
                        value={row.orderDate || ""}
                        onChange={(e) =>
                          updatePartField(row.id, "orderDate", e.target.value)
                        }
                      />
                    </td>

                    <td>
                      <input
                        type="date"
                        value={row.arrivalDate || ""}
                        onChange={(e) =>
                          updatePartField(row.id, "arrivalDate", e.target.value)
                        }
                      />
                    </td>

                    <td>{row.owner || "-"}</td>

                    <td>
                      <input
                        value={row.purchaseNote || ""}
                        onChange={(e) =>
                          updatePartField(row.id, "purchaseNote", e.target.value)
                        }
                      />
                    </td>
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
                <Plus size={16} />
                点検追加
              </button>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>点検日</th>
                    <th>設備名</th>
                    <th>点検区分</th>
                    <th>点検項目</th>
                    <th>結果</th>
                    <th>異常内容</th>
                    <th>処置内容</th>
                    <th>担当者</th>
                    <th>次回点検日</th>
                    <th>備考</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {inspectionRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="date"
                          value={row.date || ""}
                          onChange={(e) =>
                            updateInspectionField(row.id, "date", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.equipment || ""}
                          onChange={(e) =>
                            updateInspectionField(row.id, "equipment", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <select
                          value={row.inspectionType || "日常点検"}
                          onChange={(e) =>
                            updateInspectionField(
                              row.id,
                              "inspectionType",
                              e.target.value
                            )
                          }
                        >
                          <option value="日常点検">日常点検</option>
                          <option value="週次点検">週次点検</option>
                          <option value="月次点検">月次点検</option>
                          <option value="年次点検">年次点検</option>
                          <option value="異常記録">異常記録</option>
                        </select>
                      </td>

                      <td>
                        <input
                          value={row.checkItem || ""}
                          onChange={(e) =>
                            updateInspectionField(row.id, "checkItem", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <select
                          value={row.result || "OK"}
                          onChange={(e) =>
                            updateInspectionField(row.id, "result", e.target.value)
                          }
                        >
                          <option value="OK">OK</option>
                          <option value="NG">NG</option>
                          <option value="要確認">要確認</option>
                        </select>
                      </td>

                      <td>
                        <input
                          value={row.abnormalDetail || ""}
                          onChange={(e) =>
                            updateInspectionField(
                              row.id,
                              "abnormalDetail",
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.action || ""}
                          onChange={(e) =>
                            updateInspectionField(row.id, "action", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.owner || ""}
                          onChange={(e) =>
                            updateInspectionField(row.id, "owner", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="date"
                          value={row.nextCheckDate || ""}
                          onChange={(e) =>
                            updateInspectionField(
                              row.id,
                              "nextCheckDate",
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.note || ""}
                          onChange={(e) =>
                            updateInspectionField(row.id, "note", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <button
                          className="deleteButton"
                          onClick={() => removeInspection(row.id)}
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

        {page === "dashboard" && (
          <div className="tableWrap">
            <h2>ダッシュボード</h2>

            <div className="cards">
              <div className="card red">
                <span>交換超過</span>
                <strong>{overCount}</strong>
              </div>

              <div className="card yellow">
                <span>交換間近</span>
                <strong>{nearCount}</strong>
              </div>

              <div className="card green">
                <span>正常</span>
                <strong>{normalCount}</strong>
              </div>

              <div className="card red">
                <span>点検NG</span>
                <strong>{abnormalCount}</strong>
              </div>

              <div className="card">
                <span>登録部品数</span>
                <strong>{rows.length}</strong>
              </div>

              <div className="card">
                <span>点検記録数</span>
                <strong>{inspectionRows.length}</strong>
              </div>
            </div>
          </div>
        )}

        {page === "settings" && (
          <div className="tableWrap">
            <h2>設定</h2>

            <table>
              <tbody>
                <tr>
                  <th>メール送信</th>
                  <td>Vercel + Resend で自動送信</td>
                </tr>

                <tr>
                  <th>交換通知</th>
                  <td>交換予定日の7日前にメール送信</td>
                </tr>

                <tr>
                  <th>購入通知</th>
                  <td>部品納期の日数に合わせて購入通知</td>
                </tr>

                <tr>
                  <th>保存先</th>
                  <td>Firebase Firestore</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}