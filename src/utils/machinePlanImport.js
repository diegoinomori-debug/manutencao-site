import * as XLSX from "xlsx/xlsx.mjs";
import { collection, doc, getDocsFromServer, limit, query, runTransaction, where } from "firebase/firestore";
import { equipmentKey, equipmentNamesFromRecord, parseEquipmentKey } from "./equipmentIdentity.js";
import { parseLocalDate, toLocalDateText } from "./reportDates.js";
import { preventiveCollection, preventiveTaskData } from "./machinePreventive.js";

const headers = {
  machine: "設備カルテID", partName: "交換部品", partCode: "部品コード",
  quantity: "交換数量", days: "交換周期", referenceDate: "前回交換日",
};
const fields = Object.keys(headers);
const clean = value => String(value ?? "").normalize("NFKC").trim();
const pending = value => /^(要確認|a\s+confirmar)$/i.test(clean(value));
const planKey = (machine, code) => JSON.stringify([machine, clean(code).toUpperCase()]);
const issue = (field, message) => ({ field: headers[field], message });

function calendarDate(value, date1904) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!parsed) return "";
    value = [parsed.y, parsed.m, parsed.d].map(number => String(number).padStart(2, "0")).join("-");
  }
  const match = clean(value).replace(/年|月/g, "-").replace(/日$/, "").match(/^(20\d\d)[/-](\d\d?)[/-](\d\d?)$/);
  if (!match) return "";
  const iso = match.slice(1).map(number => number.padStart(2, "0")).join("-");
  const parsed = parseLocalDate(iso);
  return parsed && toLocalDateText(parsed) === iso ? iso : "";
}

function positiveInteger(value) {
  let text = clean(value);
  if (/^\d{1,3}(,\d{3})+$/.test(text)) text = text.replace(/,/g, "");
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text) > 0 ? Number(text) : null;
}

function isAssetKey(value) {
  const { group, line, equipment } = parseEquipmentKey(value);
  return [group, line, equipment].every(piece => typeof piece === "string") &&
    Boolean(line || equipment) && value.length <= 500 && value === equipmentKey(group, line, equipment);
}

export function parseReplacementWorkbook(bytes) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
  const worksheet = workbook.Sheets["定期交換計画"] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet?.["!ref"]) throw new Error("empty-sheet");
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0, raw: true, defval: "", blankrows: true });
  const headerAt = matrix.findIndex(row => fields.every(name => row.some(cell => clean(cell) === headers[name])));
  if (headerAt < 0) throw new Error("invalid-header");
  const positions = Object.fromEntries(fields.map(name => [name, matrix[headerAt].findIndex(cell => clean(cell) === headers[name])]));
  const date1904 = workbook.Workbook?.WBProps?.date1904 === true;
  return matrix.slice(headerAt + 1).flatMap((row, index) => {
    const raw = Object.fromEntries(fields.map(name => [name, row[positions[name]]]));
    if (fields.every(name => clean(raw[name]) === "")) return [];
    const errors = [];
    const check = (field, validate, explanation) => {
      if (clean(raw[field]) === "") { errors.push(issue(field, "必須項目です。")); return null; }
      if (pending(raw[field])) { errors.push(issue(field, "「要確認（A confirmar）」を確定してください。")); return null; }
      const value = validate(raw[field]);
      if (value === null || value === "") errors.push(issue(field, explanation));
      return value;
    };
    // The machine key is matched byte-for-byte; normalizing its contents could select a different card.
    const machine = check("machine", value => {
      const key = String(value).trim();
      return isAssetKey(key) ? key : null;
    }, "設備カルテIDの形式が正しくありません。");
    const partName = check("partName", value => String(value).trim().length <= 120 ? String(value).trim() : null, "120文字以内で入力してください。");
    const partCode = check("partCode", value => String(value).trim().length <= 80 ? String(value).trim() : null, "80文字以内で入力してください。");
    const quantity = check("quantity", positiveInteger, "1以上の整数を入力してください。");
    const intervalDays = check("days", value => {
      const text = clean(value).replace(/\s*日$/, "");
      const n = positiveInteger(text);
      return n && n <= 3650 ? n : null;
    }, "1〜3650の日数を入力してください。生産数量周期には対応していません。");
    const referenceDate = check("referenceDate", value => calendarDate(value, date1904), "有効な日付を入力してください（例：2026/11/18）。");
    let firstDue = "";
    if (referenceDate && intervalDays) {
      const due = parseLocalDate(referenceDate);
      due.setDate(due.getDate() + intervalDays);
      firstDue = toLocalDateText(due);
      if (!/^20\d{2}-/.test(firstDue)) errors.push(issue("days", "次回交換日が2099年を超えます。"));
    }
    return [{
      row: headerAt + index + 2, machine, machineInput: String(raw.machine ?? ""), partName, partCode,
      quantity, intervalDays, referenceDate, firstDue, errors,
      identity: machine && partCode ? planKey(machine, partCode) : null,
    }];
  });
}

export async function replacementImportPreview(db, parsed, knownMachines) {
  const [plans, parts] = await Promise.all([
    getDocsFromServer(collection(db, preventiveCollection)),
    getDocsFromServer(query(collection(db, "parts"), where("isMaintenanceTarget", "==", true))),
  ]);
  const known = new Set(knownMachines);
  const existing = new Set();
  for (const doc of plans.docs) {
    const row = doc.data();
    if (row.machine) known.add(row.machine);
    if (row.machine && clean(row.replacementPartCode)) existing.add(planKey(row.machine, row.replacementPartCode));
  }
  for (const doc of parts.docs) {
    const row = doc.data();
    const keys = equipmentNamesFromRecord(row);
    keys.forEach(key => known.add(key));
    const type = row.maintenanceType || (["点検", "給油", "清掃", "調整", "校正", "修理"].includes(row.category) ? row.category : "交換");
    if (type !== "交換" || !clean(row.partNo)) continue;
    // Legacy child plans remain distinct from independently scheduled line-level plans.
    const exact = keys.at(-1);
    if (exact) existing.add(planKey(exact, row.partNo));
  }

  const unknown = [...new Set(parsed.map(row => row.machine).filter(key => key && !known.has(key)))];
  for (let from = 0; from < unknown.length; from += 8) {
    await Promise.all(unknown.slice(from, from + 8).map(async key => {
      const records = await getDocsFromServer(query(collection(db, "maintenanceReports"),
        where("equipmentHistoryKeys", "array-contains", key), limit(1)));
      if (!records.empty) known.add(key);
    }));
  }

  const seen = new Map();
  return parsed.map(row => {
    const errors = [...row.errors];
    if (row.machine && !known.has(row.machine)) errors.push(issue("machine", "該当する設備がありません。"));
    const existingPlan = existing.has(row.identity);
    if (!errors.length && !existingPlan) {
      if (seen.has(row.identity)) errors.push(issue("partCode", `${seen.get(row.identity)}行目と同じ設備・部品コードです。`));
      else seen.set(row.identity, row.row);
    }
    return { ...row, errors, status: errors.length ? "invalid" : existingPlan ? "existing" : "new" };
  });
}

export async function registerReplacementImport(db, rows, knownMachines, hashKey) {
  // Refresh before writing: a manually created plan since preview takes precedence.
  const current = await replacementImportPreview(db, rows, knownMachines);
  const results = [];
  for (const row of current) {
    if (row.status !== "new") { results.push(row); continue; }
    try {
      const ref = doc(db, preventiveCollection, "xlsx_" + await hashKey(row.identity));
      const created = await runTransaction(db, async tx => {
        const found = await tx.get(ref);
        if (found.exists()) {
          const item = found.data();
          if (planKey(item.machine, item.replacementPartCode) !== row.identity) throw new Error("duplicate-key-conflict");
          return false;
        }
        tx.set(ref, preventiveTaskData({
          machine: row.machine, title: row.partName, firstDue: row.firstDue,
          intervalDays: row.intervalDays, replacementPartName: row.partName,
          replacementPartCode: row.partCode, plannedReplacementQty: row.quantity, referenceDate: row.referenceDate,
        }));
        return true;
      });
      results.push({ ...row, status: created ? "created" : "existing" });
    } catch {
      results.push({ ...row, status: "invalid", errors: [{ field: "登録", message: "登録できませんでした。権限と接続を確認し、再度取り込んでください。" }] });
    }
  }
  return results;
}
