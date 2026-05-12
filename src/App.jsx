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
    return parts.map((part) => {
      const nextDate = addDays(part.lastDate, part.cycle);

      const daysLeft = diffDays(nextDate);

      const status = getStatus(daysLeft);

      return {
        ...part,
        nextDate,
        daysLeft,
        status,
      };
    });
  }, [parts]);

  return (
    <div className="page">
      <div className="container">

        <div className="header">
          <div>
            <div className="badge">設備部品管理</div>

            <h1>定量保全管理表</h1>

            <p>Firebase自動保存</p>
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

      </div>
    </div>
  );
}