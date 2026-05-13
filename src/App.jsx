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
  const [page, setPage] = useState("maintenance");

  useEffect(() => {
    loadParts();
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

  async function updateField(id, field, value) {
    setParts((current) =>
      current.map((part) =>
        part.id === id ? { ...part, [field]: value } : part
      )
    );

    await updateDoc(doc(db, "parts", id), {
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

  const overCount = rows.filter((row) => row.status === "交換超過").length;
  const nearCount = rows.filter((row) => row.status === "交換間近").length;
  const normalCount = rows.filter((row) => row.status === "正常").length;

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
                            updateField(row.id, "equipment", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.partName || ""}
                          onChange={(e) =>
                            updateField(row.id, "partName", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.partNo || ""}
                          onChange={(e) =>
                            updateField(row.id, "partNo", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.price || ""}
                          onChange={(e) =>
                            updateField(row.id, "price", e.target.value)
                          }
                          placeholder="例: 200,000円"
                        />
                      </td>

                      <td>
                        <input
                          value={row.supplier || ""}
                          onChange={(e) =>
                            updateField(row.id, "supplier", e.target.value)
                          }
                          placeholder="例: モノタロウ"
                        />
                      </td>

                      <td>
                        <input
                          value={row.location || ""}
                          onChange={(e) =>
                            updateField(row.id, "location", e.target.value)
                          }
                          placeholder="例: A-01"
                        />
                      </td>

                      <td>
                        <input
                          value={row.leadTime || ""}
                          onChange={(e) =>
                            updateField(row.id, "leadTime", e.target.value)
                          }
                          placeholder="例: 30日"
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          value={row.cycle || ""}
                          onChange={(e) =>
                            updateField(row.id, "cycle", Number(e.target.value))
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="date"
                          value={row.lastDate || ""}
                          onChange={(e) =>
                            updateField(row.id, "lastDate", e.target.value)
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
                            updateField(row.id, "owner", e.target.value)
                          }
                        />
                      </td>

                      <td>
                        <input
                          value={row.note || ""}
                          onChange={(e) =>
                            updateField(row.id, "note", e.target.value)
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
                  <th>備考</th>
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
                          updateField(row.id, "purchaseStatus", e.target.value)
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
                          updateField(row.id, "orderDate", e.target.value)
                        }
                      />
                    </td>

                    <td>
                      <input
                        type="date"
                        value={row.arrivalDate || ""}
                        onChange={(e) =>
                          updateField(row.id, "arrivalDate", e.target.value)
                        }
                      />
                    </td>

                    <td>{row.owner || "-"}</td>

                    <td>
                      <input
                        value={row.purchaseNote || ""}
                        onChange={(e) =>
                          updateField(row.id, "purchaseNote", e.target.value)
                        }
                        placeholder="購入メモ"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {page === "inspection" && (
          <div className="tableWrap">
            <h2>設備点検</h2>
            <p>ここに日常点検・月次点検・異常記録を追加できます。</p>
          </div>
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

              <div className="card">
                <span>登録部品数</span>
                <strong>{rows.length}</strong>
              </div>
            </div>
          </div>
        )}

        {page === "settings" && (
          <div className="tableWrap">
            <h2>設定</h2>
            <p>ここにメール設定・担当者設定・管理者設定を追加できます。</p>
          </div>
        )}
      </div>
    </div>
  );
}