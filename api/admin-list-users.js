import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured.");
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT contains invalid JSON.");
  }

  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is missing required fields."
    );
  }

  return parsed;
}

function getAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp({
    credential: cert(getServiceAccount()),
  });
}

async function requireActiveAdmin(req) {
  const app = getAdminApp();
  const adminAuth = getAuth(app);
  const adminDb = getFirestore(app);

  const authHeader = String(req.headers.authorization || "");

  if (!authHeader.startsWith("Bearer ")) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  const idToken = authHeader.slice(7).trim();

  if (!idToken) {
    const error = new Error("Authentication token is empty.");
    error.statusCode = 401;
    throw error;
  }

  const decoded = await adminAuth.verifyIdToken(idToken);

  const profileSnap = await adminDb
    .collection("users")
    .doc(decoded.uid)
    .get();

  if (!profileSnap.exists) {
    const error = new Error("Administrator profile not found.");
    error.statusCode = 403;
    throw error;
  }

  const profile = profileSnap.data() || {};
  const role = String(profile.role || "").toLowerCase();

  if (role !== "admin" || profile.active === false) {
    const error = new Error("Administrator permission required.");
    error.statusCode = 403;
    throw error;
  }

  return {
    decoded,
    adminAuth,
    adminDb,
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Method not allowed. Use GET.",
    });
  }

  try {
    const { adminAuth } = await requireActiveAdmin(req);

    const users = [];
    let pageToken;

    do {
      const page = await adminAuth.listUsers(1000, pageToken);

      const pageUsers = Array.isArray(page?.users)
        ? page.users
        : [];

      for (const u of pageUsers) {
        users.push({
          uid: String(u.uid || ""),
          email: String(u.email || ""),
          displayName: String(u.displayName || ""),
          disabled: Boolean(u.disabled),

          creationTime: String(
            u.metadata?.creationTime || ""
          ),

          lastSignInTime: String(
            u.metadata?.lastSignInTime || ""
          ),

          providerIds: Array.isArray(u.providerData)
            ? u.providerData
                .map((provider) =>
                  String(provider?.providerId || "")
                )
                .filter(Boolean)
            : [],
        });
      }

      pageToken = page?.pageToken || undefined;
    } while (pageToken);

    return res.status(200).json({
      ok: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Admin list users error:", error);

    const code = String(error?.code || "");

    let message =
      error?.message ||
      "Could not load Firebase Authentication users.";

    if (code.includes("auth/id-token-expired")) {
      message =
        "Administrator session expired. Please sign in again.";
    } else if (code.includes("auth/argument-error")) {
      message =
        "Administrator authentication token is invalid.";
    }

    return res.status(error?.statusCode || 500).json({
      error: message,
      code: code || undefined,
    });
  }
}