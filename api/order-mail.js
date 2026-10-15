import { authorize, bodyObject, endpoint, escapeHtml, hash, HttpError, rateLimit, sendEmail } from "../lib/miyama-server.js";
const FIELDS = ["priority", "equipment", "partName", "partNo", "supplier", "stockQty", "minStock", "recommendedQty"];
export default endpoint(["POST"], async (req, res) => {
  const access = await authorize(req, { write: true });
  const { parts } = bodyObject(req, 150000);
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 100) throw new HttpError(400, "Provide 1 to 100 parts.");
  const rows = parts.map(part => {
    if (!part || typeof part !== "object" || Array.isArray(part)) throw new HttpError(400, "Invalid part.");
    return FIELDS.map(field => {
      const value = part[field] ?? "";
      if (!["string", "number"].includes(typeof value) || String(value).length > 500) throw new HttpError(400, "Invalid part field.");
      return value;
    });
  });
  await rateLimit(access, "order-mail", 5);
  const id = await sendEmail({ subject: "発注必要部品リスト",
    html: `<h2>発注必要部品リスト</h2><table border="1"><tr>${["優先度","設備名","部品名","部品番号","購入先","現在在庫","最低在庫","推奨発注数"].map(value => `<th>${value}</th>`).join("")}</tr>${rows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</table>`,
    idempotencyKey: `order-${hash(`${access.decoded.uid}|${JSON.stringify(rows)}|${new Date().toISOString().slice(0,10)}`)}`,
  });
  return res.status(200).json({ ok: true, id });
});
