import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { equipmentHistoryDate } from "../src/utils/reportDates.js";

const [projectId, ...args] = process.argv.slice(2);
const apply = args.includes("--apply");
const afterArg = args.find(arg => arg.startsWith("--after="));
if (!projectId || projectId.startsWith("-") || args.some(arg => arg !== "--apply" && arg !== afterArg) ||
    (afterArg && !afterArg.slice(8))) {
  throw new Error("Uso: node scripts/index-equipment-history-dates.mjs PROJECT_ID [--apply] [--after=ID]");
}

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const app = initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const db = getFirestore(app);
const size = 100;
const base = db.collection("maintenanceReports").orderBy(FieldPath.documentId()).limit(size);
const total = { scanned: 0, pending: 0, changed: 0 };
let cursor = afterArg?.slice(8);

try {
  console.log({ projectId, emulator, apply, cursor });
  while (true) {
    const page = await (cursor ? base.startAfter(cursor) : base)
      .select("troubleDateTime", "reportCreatedDate", "createdAt", "equipmentHistoryDate").get();
    if (page.empty) break;
    const batch = db.batch();
    let pending = 0;
    for (const report of page.docs) {
      const row = report.data();
      const date = equipmentHistoryDate(row);
      if (row.equipmentHistoryDate === date) continue;
      pending++;
      if (apply) batch.update(report.ref, { equipmentHistoryDate: date }, { lastUpdateTime: report.updateTime });
    }
    // A concurrent edit aborts the whole batch. Resume after the last successful cursor.
    if (apply && pending) await batch.commit();
    cursor = page.docs.at(-1).id;
    total.scanned += page.size;
    total.pending += pending;
    total.changed += apply ? pending : 0;
    console.log({ cursor, ...total });
    if (page.size < size) break;
  }
  console.log(total);
} finally {
  await db.terminate();
}
