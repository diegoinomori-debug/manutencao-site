import { createHash, timingSafeEqual } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function services() {
  let app = getApps().find(item => item.name === "miyama-server");
  if (!app) {
    let account;
    try { account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ""); }
    catch { throw new HttpError(503, "Server authentication is not configured."); }
    if (!account.project_id || !account.client_email || !account.private_key)
      throw new HttpError(503, "Server authentication is not configured.");
    account.private_key = account.private_key.replace(/\\n/g, "\n");
    app = initializeApp({ credential: cert(account) }, "miyama-server");
  }
  return { adminAuth: getAuth(app), adminDb: getFirestore(app) };
}
function header(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  return typeof value === "string" ? value : "";
}
export async function authorize(req, { admin = false, write = false } = {}) {
  const match = header(req, "authorization").match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new HttpError(401, "Authentication required.");
  const { adminAuth, adminDb } = services();
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(match[1], true); }
  catch { throw new HttpError(401, "Session expired or invalid. Sign in again."); }
  const snap = await adminDb.collection("users").doc(decoded.uid).get();
  const profile = snap.exists ? snap.data() : null;
  if (!profile || profile.active !== true) throw new HttpError(403, "Active user profile required.");
  const role = profile.role || "operator";
  const writable = ["operator", "inspector", "approver", "admin"].includes(role) && profile.readOnly !== true;
  if (write && !writable) throw new HttpError(403, "Write permission required.");
  if (admin && !(writable && (role === "admin" || profile.isAdmin === true)))
    throw new HttpError(403, "Administrator permission required.");
  return { decoded, profile, adminAuth, adminDb };
}
export async function authorizeMaintenanceJob(req) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(header(req, "authorization"));
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (secret && supplied.length === expected.length && timingSafeEqual(supplied, expected)) return { ...services(), decoded: { uid: "scheduled-maintenance-job" } };
  return authorize(req, { admin: true });
}
export function bodyObject(req, limit = 100000) {
  let body = req.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > limit) throw new HttpError(413, "Request is too large.");
    try { body = JSON.parse(body); } catch { throw new HttpError(400, "Invalid JSON body."); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "A JSON object is required.");
  if (Buffer.byteLength(JSON.stringify(body)) > limit) throw new HttpError(413, "Request is too large.");
  return body;
}
export function text(value, max = 5000) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max) throw new HttpError(400, "Invalid text field or text too long.");
  return value.trim();
}
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
export function hash(value) { return createHash("sha256").update(value).digest("hex"); }
// Shared across serverless instances. Client rules deliberately deny this collection.
export async function rateLimit(access, name, maximum, periodSeconds = 60) {
  const bucket = Math.floor(Date.now() / (periodSeconds * 1000));
  const ref = access.adminDb.collection("_apiRateLimits").doc(hash(`${access.decoded.uid}|${name}|${bucket}`));
  await access.adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const count = snapshot.exists ? Number(snapshot.data().count || 0) : 0;
    if (count >= maximum) throw new HttpError(429, "Too many requests. Try again later.");
    transaction.set(ref, { count: count + 1, expiresAt: new Date((bucket + 1) * periodSeconds * 1000) });
  });
}
export function endpoint(methods, handler) {
  return async function (req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (!methods.includes(req.method)) {
      res.setHeader("Allow", methods.join(", "));
      return res.status(405).json({ error: "Method not allowed." });
    }
    try { return await handler(req, res); }
    catch (error) {
      const known = error instanceof HttpError;
      const status = known ? error.status : 500;
      // Never log request bodies, passwords, tokens or provider payloads.
      console.error("MIYAMA API failure", { status, code: typeof error?.code === "string" ? error.code : "internal" });
      if (status === 429) res.setHeader("Retry-After", "60");
      return res.status(status).json({ error: known ? error.message : "The server could not complete this request." });
    }
  };
}
export async function sendEmail({ subject, html, idempotencyKey }) {
  if (!process.env.RESEND_API_KEY || !process.env.SEND_TO_EMAIL) throw new HttpError(503, "Email delivery is not configured.");
  const { Resend } = await import("resend");
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.SEND_FROM_EMAIL || "onboarding@resend.dev",
    to: process.env.SEND_TO_EMAIL, subject, html,
  }, { idempotencyKey });
  if (result?.error || !result?.data?.id) throw new HttpError(502, "Email provider did not confirm delivery acceptance.");
  return result.data.id;
}
