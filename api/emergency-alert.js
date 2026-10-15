import { authorize, bodyObject, endpoint, escapeHtml, hash, HttpError, rateLimit, sendEmail, text } from "../lib/miyama-server.js";
export default endpoint(["POST"], async (req, res) => {
  const access = await authorize(req, { write: true });
  const body = bodyObject(req, 30000);
  const data = Object.fromEntries(["equipment", "phenomenon", "action", "level", "createdAt"].map(key => [key, text(body[key], 5000)]));
  if (!data.equipment || !data.phenomenon) throw new HttpError(400, "Equipment and failure symptom are required.");
  await rateLimit(access, "emergency-alert", 5);
  const key = hash(`${access.decoded.uid}|${JSON.stringify(data)}|${new Date().toISOString().slice(0,10)}`);
  const labels = { equipment: "設備名", phenomenon: "不具合現象", action: "処置内容", level: "危険度", createdAt: "日付" };
  const id = await sendEmail({
    subject: `【緊急保全通知】${data.equipment.replace(/[\r\n]/g, " ").slice(0,200)}`,
    html: `<h2>【緊急保全通知】</h2>${Object.entries(data).map(([key,value]) => `<p><b>${escapeHtml(labels[key])}:</b> ${escapeHtml(value || "-")}</p>`).join("")}`,
    idempotencyKey: `emergency-${key}`,
  });
  return res.status(200).json({ ok: true, id });
});
