import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { reportPeriodDate } from "../src/utils/reportDates.js";

const [projectId, ...options] = process.argv.slice(2);
if (!projectId || projectId.startsWith("--") || options.length > 1 || options.some(option => option !== "--apply")) {
  console.error("Uso: node scripts/index-analytics-dates.mjs PROJECT_ID [--apply]");
  process.exit(1);
}
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const apply = options.includes("--apply");
const app = initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const db = getFirestore(app);
const query = db.collection("maintenanceReports").orderBy(FieldPath.documentId()).limit(200);
const summary = { scanned: 0, needsUpdate: 0, undated: 0, changed: 0 };
try {
  console.log(projectId, emulator || "Firebase", apply ? "gravação" : "somente leitura");
  let cursor;
  while (true) {
    const snapshot = await (cursor ? query.startAfter(cursor) : query).get();
    for (const doc of snapshot.docs) {
      const row = doc.data();
      const date = reportPeriodDate(row);
      summary.scanned++;
      if (!date) summary.undated++;
      if (row.analyticsDate === date) continue;
      summary.needsUpdate++;
      if (apply) {
        // Recompute against the latest version in case someone edited the report.
        const changed = await db.runTransaction(async transaction => {
          const current = await transaction.get(doc.ref);
          if (!current.exists) return false;
          const data = current.data();
          const analyticsDate = reportPeriodDate(data);
          if (data.analyticsDate === analyticsDate) return false;
          transaction.update(doc.ref, { analyticsDate });
          return true;
        });
        if (changed) summary.changed++;
      }
    }
    if (snapshot.size < 200) break;
    cursor = snapshot.docs.at(-1);
  }
  console.log(summary);
} finally {
  await db.terminate();
}
