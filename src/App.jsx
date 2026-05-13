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
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [page, setPage] = useState("calendar");

  const [calendarMonth, setCalendarMonth] =
    useState(new Date());

  const [selectedDate, setSelectedDate] =
    useState(
      new Date().toISOString().slice(0, 10)
    );

  useEffect(() => {
    loadParts();
    loadCalendar();
  }, []);

  async function loadParts() {

    const snap = await getDocs(
      collection(db, "parts")
    );

    setParts(
      snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }))
    );
  }

  async function loadCalendar() {

    const snap = await getDocs(
      collection(db, "calendar")
    );

    setCalendarEvents(
      snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }))
    );
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

    if (collectionName === "calendar")
      loadCalendar();
  }

  async function removeItem(
    collectionName,
    id
  ) {

    await deleteDoc(
      doc(db, collectionName, id)
    );

    if (collectionName === "calendar")
      loadCalendar();
  }

  async function addCalendarEvent() {

    await addDoc(
      collection(db, "calendar"),
      {
        date: selectedDate,
        title: "",
        detail: "",
        owner: "",
        image: "",
      }
    );

    loadCalendar();
  }

  function getCalendarDays() {

    const year =
      calendarMonth.getFullYear();

    const month =
      calendarMonth.getMonth();

    const firstDay = new Date(
      year,
      month,
      1
    );

    const startDay =
      firstDay.getDay();

    const days = [];

    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    const lastDate = new Date(
      year,
      month + 1,
      0
    ).getDate();

    for (
      let day = 1;
      day <= lastDate;
      day++
    ) {

      const date = new Date(
        year,
        month,
        day
      );

      days.push(
        date
          .toISOString()
          .slice(0, 10)
      );
    }

    return days;
  }

  function changeMonth(value) {

    const newDate =
      new Date(calendarMonth);

    newDate.setMonth(
      newDate.getMonth() + value
    );

    setCalendarMonth(newDate);
  }

  function handleImageUpload(
    event,
    rowId
  ) {

    const file =
      event.target.files[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onloadend = () => {

      updateField(
        "calendar",
        rowId,
        "image",
        reader.result
      );
    };

    reader.readAsDataURL(file);
  }

  const rows = useMemo(() => {

    return parts
      .map((part) => {

        const nextDate =
          addDays(
            part.lastDate,
            part.cycle
          );

        const daysLeft =
          diffDays(nextDate);

        const status =
          getStatus(daysLeft);

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

        return (
          a.daysLeft - b.daysLeft
        );
      });

  }, [parts]);

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
              交換期限が近い部品から
              自動で上に表示されます。
            </p>

          </div>

        </div>

        <div className="tabs">

          <button
            className={
              page === "calendar"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage("calendar")
            }
          >
            予定カレンダー
          </button>

        </div>

        {page === "calendar" && (

          <>

            <div className="header">

              <div>

                <h2>
                  予定カレンダー
                </h2>

                <p>
                  日常予定・会議・
                  保全予定・工事予定を
                  カレンダーで
                  管理できます。
                </p>

              </div>

              <button
                className="primaryButton"
                onClick={
                  addCalendarEvent
                }
              >
                <Plus size={16} />
                新しい予定を追加
              </button>

            </div>

            <div className="calendarLayout">

              <div className="calendarMain">

                <div className="calendarTop">

                  <button
                    onClick={() =>
                      changeMonth(-1)
                    }
                  >
                    ＜
                  </button>

                  <h2>
                    {
                      calendarMonth.getFullYear()
                    }
                    年{" "}
                    {
                      calendarMonth.getMonth() + 1
                    }
                    月
                  </h2>

                  <button
                    onClick={() =>
                      changeMonth(1)
                    }
                  >
                    ＞
                  </button>

                  <button
                    onClick={() => {

                      const todayText =
                        new Date()
                          .toISOString()
                          .slice(0, 10);

                      setCalendarMonth(
                        new Date()
                      );

                      setSelectedDate(
                        todayText
                      );
                    }}
                  >
                    今日に戻る
                  </button>

                </div>

                <div className="calendarWeek">

                  <div>日</div>
                  <div>月</div>
                  <div>火</div>
                  <div>水</div>
                  <div>木</div>
                  <div>金</div>
                  <div>土</div>

                </div>

                <div className="calendarGrid">

                  {getCalendarDays().map(
                    (date, index) => {

                      const dayEvents =
                        calendarEvents.filter(
                          (event) =>
                            event.date ===
                            date
                        );

                      return (

                        <div
                          key={index}
                          className={`calendarDay ${
                            date ===
                            selectedDate
                              ? "selectedDay"
                              : ""
                          }`}
                          onClick={() =>
                            date &&
                            setSelectedDate(
                              date
                            )
                          }
                        >

                          {date && (

                            <>

                              <strong>
                                {Number(
                                  date.slice(
                                    8,
                                    10
                                  )
                                )}
                              </strong>

                              <div className="calendarEventList">

                                {dayEvents
                                  .slice(0, 3)
                                  .map(
                                    (
                                      event
                                    ) => (

                                      <span
                                        key={
                                          event.id
                                        }
                                        className="calendarEventTag"
                                      >
                                        {
                                          event.title
                                        }
                                      </span>

                                    )
                                  )}

                              </div>

                            </>

                          )}

                        </div>

                      );
                    }
                  )}

                </div>

                <div className="selectedEvents">

                  <h3>
                    {selectedDate}
                    の予定一覧
                  </h3>

                  {calendarEvents

                    .filter(
                      (event) =>
                        event.date ===
                        selectedDate
                    )

                    .map((event) => (

                      <div
                        key={event.id}
                        className="eventRow"
                      >

                        <b>
                          {
                            event.title ||
                            "無題"
                          }
                        </b>

                        <span>
                          {
                            event.owner ||
                            "-"
                          }
                        </span>

                        <span>
                          {
                            event.detail ||
                            "-"
                          }
                        </span>

                      </div>

                    ))}

                </div>

              </div>

              <div className="calendarSide">

                <h3>
                  予定の詳細
                </h3>

                {calendarEvents.map(
                  (row) => (

                    <div
                      key={row.id}
                      className="calendarEditCard"
                    >

                      <input
                        type="date"
                        value={
                          row.date || ""
                        }
                        onChange={(e) =>
                          updateField(
                            "calendar",
                            row.id,
                            "date",
                            e.target
                              .value
                          )
                        }
                      />

                      <input
                        value={
                          row.title ||
                          ""
                        }
                        onChange={(e) =>
                          updateField(
                            "calendar",
                            row.id,
                            "title",
                            e.target
                              .value
                          )
                        }
                        placeholder="タイトル"
                      />

                      <textarea
                        value={
                          row.detail ||
                          ""
                        }
                        onChange={(e) =>
                          updateField(
                            "calendar",
                            row.id,
                            "detail",
                            e.target
                              .value
                          )
                        }
                        placeholder="内容"
                      />

                      <input
                        value={
                          row.owner ||
                          ""
                        }
                        onChange={(e) =>
                          updateField(
                            "calendar",
                            row.id,
                            "owner",
                            e.target
                              .value
                          )
                        }
                        placeholder="担当者"
                      />

                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          handleImageUpload(
                            e,
                            row.id
                          )
                        }
                      />

                      {row.image && (

                        <img
                          src={row.image}
                          alt=""
                          className="calendarPhoto"
                        />

                      )}

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
                        削除
                      </button>

                    </div>

                  )
                )}

              </div>

            </div>

          </>

        )}

      </div>

    </div>
  );
}