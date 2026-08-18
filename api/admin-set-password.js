import admin from "firebase-admin";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured.");
  }

  const parsed = JSON.parse(raw);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  return admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
  });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    getAdminApp();

    const authHeader = String(req.headers.authorization || "");
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const idToken = authHeader.slice(7).trim();
    const decoded = await admin.auth().verifyIdToken(idToken);

    // Do not trust only the client. Confirm the caller is an active admin in Firestore.
    const adminProfileSnap = await admin
      .firestore()
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (!adminProfileSnap.exists) {
      return res.status(403).json({ error: "Administrator profile not found." });
    }

    const profile = adminProfileSnap.data() || {};
    if (String(profile.role || "").toLowerCase() !== "admin" || profile.active === false) {
      return res.status(403).json({ error: "Administrator permission required." });
    }

    const uid = String(req.body?.uid || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!uid) {
      return res.status(400).json({ error: "User UID is required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    // Confirm the target user exists before changing anything.
    await admin.auth().getUser(uid);

    await admin.auth().updateUser(uid, {
      password: newPassword,
    });

    // Revoke existing sessions so the new password takes effect cleanly.
    await admin.auth().revokeRefreshTokens(uid);

    await admin.firestore().collection("users").doc(uid).set(
      {
        passwordChangedAt: new Date().toISOString(),
        passwordChangedBy: decoded.uid,
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Admin password reset error:", error);

    const code = String(error?.code || "");
    let message = error?.message || "Password update failed.";

    if (code.includes("auth/user-not-found")) {
      message = "Firebase Authentication user not found.";
    } else if (code.includes("auth/invalid-password")) {
      message = "The new password is invalid.";
    } else if (code.includes("auth/id-token-expired")) {
      message = "Administrator session expired. Sign in again.";
    }

    return res.status(500).json({ error: message });
  }
}
