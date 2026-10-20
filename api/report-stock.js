import { authorize, bodyObject, endpoint, hash, HttpError, rateLimit, text } from "../lib/miyama-server.js";

function documentId(value) {
  const id = text(value, 200);
  if (!id || id.includes("/") || id === "." || id === "..") throw new HttpError(400, "Invalid document ID.");
  return id;
}

export async function withdrawReportStock(access, input) {
  const reportId = documentId(input.reportId);
  const partId = documentId(input.partId);
  const operationId = text(input.operationId, 80);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(operationId)) throw new HttpError(400, "Invalid operation ID.");
  const quantity = input.quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new HttpError(400, "Quantity must be a positive whole number.");
  const reportRef = access.adminDb.collection("maintenanceReports").doc(reportId);
  const partRef = access.adminDb.collection("parts").doc(partId);
  const entryRef = reportRef.collection("stockWithdrawals").doc(hash(operationId));
  return access.adminDb.runTransaction(async (tx) => {
    const [entrySnap, reportSnap, partSnap] = await Promise.all([tx.get(entryRef), tx.get(reportRef), tx.get(partRef)]);
    if (entrySnap.exists) {
      const entry = entrySnap.data();
      if (entry.partId !== partId || entry.quantity !== quantity || entry.actorUid !== access.decoded.uid)
        throw new HttpError(409, "Operation ID already used for another withdrawal.");
      return { entry, duplicate: true, partId, stockQty: partSnap.exists ? partSnap.data().stockQty : null };
    }
    if (!reportSnap.exists || !partSnap.exists) throw new HttpError(404, "Report or part not found.");
    if (reportSnap.data().approvalStatus === "承認済み") throw new HttpError(409, "Approved report is locked. Return it for revision first.");
    const rawStock = partSnap.data().stockQty;
    const before = rawStock === "" || rawStock == null ? 0 : Number(rawStock);
    if (!Number.isFinite(before) || before < quantity) throw new HttpError(409, "Insufficient or invalid stock. Check the stock balance.");
    const stockQty = before - quantity;
    const part = partSnap.data();
    const entry = { id: entryRef.id, reportId, partId, quantity, before, after: stockQty,
      partName: String(part.partName || ""), partNo: String(part.partNo || part.serialNo || ""),
      actorUid: access.decoded.uid, actorName: String(access.profile.name || access.decoded.email || access.decoded.uid),
      createdAt: new Date().toISOString() };
    tx.update(partRef, { stockQty });
    tx.create(entryRef, entry);
    return { entry, duplicate: false, partId, stockQty };
  });
}

export default endpoint(["POST"], async (req, res) => {
  const input = bodyObject(req, 6000);
  const access = await authorize(req, { write: input.action !== "history" });
  const reportId = documentId(input.reportId);
  await rateLimit(access, "report-stock", 60);
  if (input.action === "history") {
    const report = access.adminDb.collection("maintenanceReports").doc(reportId);
    if (!(await report.get()).exists) throw new HttpError(404, "Report not found.");
    const rows = await report.collection("stockWithdrawals").orderBy("createdAt", "desc").limit(100).get();
    return res.status(200).json({ entries: rows.docs.map(doc => doc.data()) });
  }
  if (input.action !== "withdraw") throw new HttpError(400, "Invalid action.");
  return res.status(200).json(await withdrawReportStock(access, input));
});
