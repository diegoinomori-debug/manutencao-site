import { addDoc, collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { parseLocalDate, toLocalDateText } from "./reportDates.js";
import { equipmentNamesFromRecord } from "./equipmentIdentity.js";

export const handoverCollection = "shiftHandover";

export const pendingRepairStatuses = ["未対応", "対応中"];

export function ongoingIncidents(reports) {
  return reports.flatMap(report => {
    const machine = equipmentNamesFromRecord(report).at(-1);
    const repair = pendingRepairStatuses.includes(report.repairStatus);
    const returnRecorded = report.productionReturnRecorded === true ||
      (report.productionReturnRecorded !== false && report.productionStartDateTime &&
        report.productionStartDateTime !== report.workEndDateTime);
    const stopped = report.incidentMachineStopped === "yes" && !returnRecorded;
    if (!machine || (!repair && !stopped)) return [];
    return [{ id: report.id, machine, stopped, repairStatus: repair ? report.repairStatus : "",
      date: report.troubleDateTime || report.equipmentHistoryDate || "",
      situation: report.phenomenon || report.troublePoint || "", owner: report.repairOwner || "" }];
  });
}

export function addHandover(db, values, actor) {
  const { machine, situation, nextAction, assignee, dueDate } = values;
  const details = { situation: situation.trim(), nextAction: nextAction.trim(), assignee: assignee.trim() };
  const date = parseLocalDate(dueDate);
  if (!machine.startsWith("asset:") || machine.length > 500 || !/^20\d{2}-/.test(dueDate) ||
      !date || toLocalDateText(date) !== dueDate || !details.situation || details.situation.length > 500 ||
      !details.nextAction || details.nextAction.length > 500 || !details.assignee || details.assignee.length > 120) {
    throw new Error("invalid-handover");
  }
  return addDoc(collection(db, handoverCollection), {
    machine, ...details, dueDate, status: "open",
    createdByUid: actor.uid, createdByName: actor.name, createdAt: serverTimestamp(),
  });
}

export function closeHandover(db, id, actor) {
  const ref = doc(db, handoverCollection, id);
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists() || snapshot.data().status !== "open") return false;
    tx.update(ref, { status: "closed", closedByUid: actor.uid, closedByName: actor.name, closedAt: serverTimestamp() });
    return true;
  });
}
