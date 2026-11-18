import { addDoc, collection, doc, getDocFromServer, runTransaction, serverTimestamp } from "firebase/firestore";
import { parseLocalDate, toLocalDateText } from "./reportDates.js";

export const preventiveCollection = "equipmentPreventiveTasks";

export function preventiveDate(timestamp) {
  return timestamp?.toDate ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(timestamp.toDate()) : "";
}

export function lastPreventiveDate(task) {
  return preventiveDate(task.lastCompletedAt) || task.referenceDate || "";
}

export function nextPreventiveDate(task) {
  const lastDate = preventiveDate(task.lastCompletedAt);
  if (!lastDate) return task.firstDue;
  const next = parseLocalDate(lastDate);
  next.setDate(next.getDate() + task.intervalDays);
  return toLocalDateText(next);
}

export function preventiveTaskData({ machine, title, firstDue, intervalDays, replacementPartName = "", replacementPartCode = "", plannedReplacementQty = null, referenceDate = "" }) {
  const date = parseLocalDate(firstDue);
  const reference = referenceDate && parseLocalDate(referenceDate);
  const partName = replacementPartName.trim();
  const partCode = replacementPartCode.trim();
  if (!title.trim() || title.trim().length > 120 || !date || toLocalDateText(date) !== firstDue ||
      !Number.isSafeInteger(intervalDays) || intervalDays < 1 || intervalDays > 3650 ||
      (referenceDate && (!reference || toLocalDateText(reference) !== referenceDate)) ||
      partName.length > 120 || partCode.length > 80 ||
      (plannedReplacementQty !== null && ((!partName && !partCode) || !Number.isSafeInteger(plannedReplacementQty) || plannedReplacementQty < 1))) {
    throw new Error("invalid-task");
  }
  return {
    machine, title: title.trim(), firstDue, intervalDays, revision: 0, createdAt: serverTimestamp(),
    ...(reference && { referenceDate }),
    ...(partName && { replacementPartName: partName }),
    ...(partCode && { replacementPartCode: partCode }),
    ...(plannedReplacementQty !== null && { plannedReplacementQty }),
  };
}

export function createPreventiveTask(db, input) {
  return addDoc(collection(db, preventiveCollection), preventiveTaskData(input));
}

export async function completePreventiveTask(db, task, actor) {
  const ref = doc(db, preventiveCollection, task.id);
  const entry = doc(collection(ref, "completions"));
  try {
    return await runTransaction(db, async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists() || snapshot.data().revision !== task.revision) return false;
      const revision = task.revision + 1;
      const at = serverTimestamp();
      tx.update(ref, {
        revision, completionId: entry.id, lastCompletedAt: at,
        lastActorUid: actor.uid, lastActorName: actor.name,
      });
      tx.set(entry, { revision, at, actorUid: actor.uid, actorName: actor.name });
      return true;
    });
  } catch (error) {
    // The rules can reject a stale revision before the transaction precondition is evaluated.
    if (error.code === "permission-denied") {
      const latest = await getDocFromServer(ref);
      if (latest.exists() && latest.data().revision > task.revision) return false;
    }
    throw error;
  }
}
