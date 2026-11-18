import { endpoint, HttpError, services } from "../lib/miyama-server.js";
import { EQUIPMENT_CATALOG, equipmentKey, equipmentLabel, equipmentNamesFromRecord, parseEquipmentKey } from "../src/utils/equipmentIdentity.js";
import { calculateReport } from "../src/utils/reportCalculations.js";
import { nextPreventiveDate, preventiveCollection, preventiveDate } from "../src/utils/machinePreventive.js";
import { normalizeDateOnly, parseLocalDate, toLocalDateText } from "../src/utils/reportDates.js";

const catalogKeys = new Set(EQUIPMENT_CATALOG.flatMap(({ group, line, equipment }) =>
  [equipmentKey(group, line), equipmentKey(group, line, equipment)]));
const partFields = ["groupName", "lineName", "equipment", "machine", "machineName", "equipmentName",
  "partName", "partNo", "plannedReplacementQty", "cycle", "cycleProductionCount", "maintenanceType",
  "maintenanceMode", "category", "lastDate", "nextDate"];
const states = new Map([["未対応", "Aguardando reparo"], ["対応中", "Reparo em andamento"], ["完了", "Reparo concluído"]]);

function requestedMachine(key) {
  if (typeof key !== "string" || !key || key.length > 500 || /[\u0000-\u001f\u007f]/.test(key)) return "";
  if (key.startsWith("asset:")) {
    const { group, line, equipment } = parseEquipmentKey(key);
    if ([group, line, equipment].every(value => typeof value === "string" && value === value.trim()) &&
        (line || equipment) && key === equipmentKey(group, line, equipment)) return key;
    return "";
  }
  const labels = [...catalogKeys].filter(machine => equipmentLabel(machine) === key ||
    [parseEquipmentKey(machine).equipment, parseEquipmentKey(machine).equipment ? "" : parseEquipmentKey(machine).line]
      .includes(key));
  return labels.length === 1 ? labels[0] : "";
}

function label(value) {
  return typeof value === "string" ? value.trim().slice(0, 160) || null : null;
}

function quantity(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(typeof value === "string" ? value.replace(/,/g, "").trim() : value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function scheduleStatus(due, today) {
  if (!due) return null;
  if (due < today) return "overdue";
  return due === today ? "due" : "scheduled";
}

function replacement({ name, code, planned, days, units, lastDate, nextDate }, today) {
  return {
    name: label(name), code: label(code), plannedQuantity: quantity(planned),
    frequency: days ? { unit: "days", value: days } : units ? { unit: "units", value: units } : null,
    lastDate: lastDate || null, nextDate: nextDate || null, status: scheduleStatus(nextDate, today),
  };
}

function partReplacement(part, today) {
  const lastDate = normalizeDateOnly(part.lastDate);
  const units = quantity(part.cycleProductionCount);
  const dayCycle = quantity(part.cycle);
  const mode = String(part.maintenanceMode || "");
  const basedOnUnits = /定量|生産数/.test(mode) || (!/定期|日数|時間/.test(mode) && !dayCycle && units);
  const days = basedOnUnits ? null : dayCycle;
  const base = days && parseLocalDate(lastDate);
  if (base) base.setDate(base.getDate() + days);
  const nextDate = base ? toLocalDateText(base) : normalizeDateOnly(part.nextDate);
  return replacement({
    name: part.partName, code: part.partNo, planned: part.plannedReplacementQty, days, units: basedOnUnits ? units : null, lastDate, nextDate,
  }, today);
}

function timestampText(timestamp) {
  return timestamp?.toDate().toISOString() || null;
}

function sameLine(left, right) {
  return left.group === right.group && left.line === right.line;
}

function matchesMachine(key, machine, identity) {
  return identity.equipment ? key === machine : sameLine(parseEquipmentKey(key), identity);
}

function preventiveTasks(db, machine, identity) {
  const tasks = db.collection(preventiveCollection);
  if (identity.equipment) return tasks.where("machine", "==", machine);
  const prefix = "asset:" + JSON.stringify([identity.group, identity.line]).slice(0, -1) + ",";
  return tasks.where("machine", ">=", prefix).where("machine", "<", prefix.slice(0, -1) + "-");
}

function actionSummary(action) {
  if (typeof action !== "string" || !action.trim()) return null;
  const clauses = action.split(/[。\r\n]+/).filter(item => !/未交換|交換できな|交換予定|交換検討|交換が必要|交換なし|未実施|実施せず|予定/.test(item));
  const completed = clauses.join(" ");
  const actions = [
    [/交換|取替|取り替|replaced/i, "部品交換"],
    [/調整|再設定|増し締め|adjusted/i, "調整・設定"],
    [/清掃|クリーニング|洗浄|cleaned/i, "清掃"],
    [/給油|給脂|グリス塗布|lubricated/i, "給油・給脂"],
    [/修理|補修|研磨|repaired/i, "修理・補修"],
    [/確認|点検|試運転|tested|inspected/i, "点検・動作確認"],
  ].filter(([pattern]) => pattern.test(completed)).map(([, label]) => label);
  return actions.length ? actions.join("、") : "対応記録あり（詳細はログイン後に確認）";
}

function lineEquipment(keys, identity) {
  const key = keys.find(key => parseEquipmentKey(key).equipment && sameLine(parseEquipmentKey(key), identity));
  return key ? equipmentLabel(key) : null;
}

function incidentSummary(row, identity) {
  const date = normalizeDateOnly(row.equipmentHistoryDate);
  const downtime = calculateReport(row).stopTimeHours;
  const hours = downtime > 0 ? downtime : null;
  const failure = [row.phenomenon, row.troublePoint].some(value => typeof value === "string" && value.trim());
  if (!date || (!hours && !failure && !states.has(row.repairStatus))) return null;
  return { date, downtimeHours: hours, type: hours ? "stop" : "failure",
    equipment: lineEquipment(row.equipmentHistoryKeys || [], identity),
    action: actionSummary(row.action), state: states.get(row.repairStatus) || null };
}

async function machineParts(db, machine, identity) {
  const ref = db.collection("parts").where("isMaintenanceTarget", "==", true).select(...partFields);
  const values = [identity.line, identity.equipment].filter(Boolean);
  const possible = [...new Set(values.flatMap(value => /^(78|76)-060$/.test(value) ? [value, value.replace("-060", "-60")] : [value]))];
  const queries = [ref.where("lineName", "in", possible), ...["equipment", "machine", "machineName", "equipmentName"]
    .map(field => ref.where(field, "in", possible))];
  const snapshots = await Promise.all(queries.map(query => query.get()));
  const matches = new Map();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      if (!matches.has(doc.id) && equipmentNamesFromRecord(doc.data()).some(key => matchesMachine(key, machine, identity))) matches.set(doc.id, doc);
    }
  }
  return [...matches.values()];
}

export async function loadPublicMachine(db, key, today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date())) {
  const machine = requestedMachine(key);
  if (!machine) throw new HttpError(404, "Machine not found.");
  const identity = parseEquipmentKey(machine);
  const [reports, taskSnapshot, parts] = await Promise.all([
    db.collection("maintenanceReports").where("equipmentHistoryKeys", "array-contains", machine)
      .orderBy("equipmentHistoryDate", "desc").limit(identity.equipment ? 1 : 12)
      .select("equipmentHistoryKeys", "equipmentHistoryDate", "approvalStatus", "repairStatus", "repairCompletedAt", "phenomenon", "troublePoint",
        "action", "troubleDateTime", "workStartDateTime", "workEndDateTime", "productionStartDateTime",
        "stopExclusionHours", "stopExclusionTime", "functionDownRate").get(),
    preventiveTasks(db, machine, identity)
      .select("machine", "firstDue", "intervalDays", "lastCompletedAt", "replacementPartName", "replacementPartCode", "plannedReplacementQty").get(),
    machineParts(db, machine, identity),
  ]);
  if (!catalogKeys.has(machine) && reports.empty && taskSnapshot.empty && parts.length === 0)
    throw new HttpError(404, "Machine not found.");

  const report = reports.docs[0]?.data();
  const scheduled = [];
  const maintenance = [];
  for (const doc of parts) {
    const part = doc.data();
    const type = part.maintenanceType || (["点検", "給油", "清掃", "調整", "校正", "修理"].includes(part.category) ? part.category : "交換");
    const lastDate = normalizeDateOnly(part.lastDate);
    if (lastDate) maintenance.push({ date: lastDate, summary: type === "交換" ? "Troca programada registrada" : "Manutenção preventiva registrada" });
    if (type === "交換") scheduled.push({ ...partReplacement(part, today),
      ...(!identity.equipment && { equipment: lineEquipment(equipmentNamesFromRecord(part), identity) }) });
  }
  for (const doc of taskSnapshot.docs) {
    const task = doc.data();
    const lastDate = preventiveDate(task.lastCompletedAt);
    const isReplacement = Boolean(label(task.replacementPartName) || label(task.replacementPartCode));
    if (lastDate) maintenance.push({ date: lastDate, summary: isReplacement ? "Troca programada concluída" : "Manutenção preventiva concluída" });
    if (isReplacement) scheduled.push({ ...replacement({
      name: task.replacementPartName, code: task.replacementPartCode, planned: task.plannedReplacementQty,
      days: quantity(task.intervalDays), lastDate, nextDate: nextPreventiveDate(task),
    }, today), ...(!identity.equipment && { equipment: lineEquipment([task.machine], identity) }) });
  }
  if (report?.repairStatus === "完了" || report?.approvalStatus === "承認済み") {
    const date = normalizeDateOnly(report.repairCompletedAt || report.equipmentHistoryDate);
    if (date) maintenance.push({ date, summary: "Manutenção corretiva registrada" });
  }
  const updatedAt = [...reports.docs, ...taskSnapshot.docs, ...parts].map(doc => timestampText(doc.updateTime))
    .filter(Boolean).sort().at(-1) || null;

  return {
    name: equipmentLabel(machine), code: identity.equipment ? null : label(identity.line),
    state: states.get(report?.repairStatus) || null, updatedAt,
    replacements: scheduled.sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999") ||
      (a.name || "").localeCompare(b.name || "")),
    lastMaintenance: maintenance.sort((a, b) => b.date.localeCompare(a.date))[0] || null,
    ...(!identity.equipment && { recentIncidents: reports.docs.map(doc => incidentSummary(doc.data(), identity)).filter(Boolean).slice(0, 5) }),
  };
}

export default endpoint(["GET"], async (req, res) => {
  const key = req.query?.machine;
  if (typeof key !== "string" || !requestedMachine(key)) throw new HttpError(404, "Machine not found.");
  return res.status(200).json(await loadPublicMachine(services().adminDb, key));
});
