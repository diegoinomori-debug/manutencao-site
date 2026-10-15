import { authorizeMaintenanceJob, endpoint, escapeHtml, hash, rateLimit, sendEmail } from "../lib/miyama-server.js";

function civilDay(value) {
  const match = String(value || "").match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month-1 && date.getUTCDate() === day ? date.getTime()/86400000 : null;
}
export default endpoint(["GET", "POST"], async (req, res) => {
  const access = await authorizeMaintenanceJob(req);
  await rateLimit(access, "check-parts", 3, 300);
  const dateParts = new Intl.DateTimeFormat("en-US", { timeZone: process.env.MAINTENANCE_TIMEZONE || "Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const dateValue = type => dateParts.find(part => part.type === type).value;
  const today = `${dateValue("year")}-${dateValue("month")}-${dateValue("day")}`;
  const todayDay = civilDay(today);
  const snapshot = await access.adminDb.collection("parts").get();
  let sent = 0;
  for (const item of snapshot.docs) {
    const data = item.data();
    if (data.isMaintenanceTarget === false) continue;
    const start = civilDay(data.lastDate);
    const cycle = Number(data.cycle);
    const productionBased = data.maintenanceMode && data.maintenanceMode !== "定期保全";
    const due = productionBased ? civilDay(data.nextDate) : start !== null && Number.isInteger(cycle) && cycle > 0 ? start + cycle : null;
    if (due === null || todayDay === null) continue;
    const daysLeft = due - todayDay;
    const lead = parseInt(data.leadTime, 10);
    const titles = [];
    if (daysLeft === 7) titles.push("【設備保全】部品交換予定通知");
    if (Number.isFinite(lead) && lead >= 0 && daysLeft === lead) titles.push("【設備保全】部品購入通知");
    if (!titles.length) continue;
    const dueDate = new Date(due * 86400000).toISOString().slice(0,10);
    await sendEmail({ subject: titles.join(" / "),
      html: `<h2>${escapeHtml(titles.join(" / "))}</h2>${[["設備名",data.equipment],["部品名",data.partName],["部品番号",data.partNo],["部品値段",data.price],["購入先",data.supplier],["予備品ロケーション",data.location],["部品納期",data.leadTime],["担当者",data.owner],["次回交換日",dueDate]].map(([label,value]) => `<p><b>${label}:</b> ${escapeHtml(value ?? "-")}</p>`).join("")}`,
      idempotencyKey: `maintenance-${hash(`${item.id}|${dueDate}|${titles.join("|")}`)}`,
    });
    sent += 1;
  }
  return res.status(200).json({ ok: true, sent });
});
