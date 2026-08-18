import admin from "firebase-admin";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured.");

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

async function requireActiveAdmin(req) {
  getAdminApp();

  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.startsWith("Bearer ")) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  const idToken = authHeader.slice(7).trim();
  const decoded = await admin.auth().verifyIdToken(idToken);

  const profileSnap = await admin
    .firestore()
    .collection("users")
    .doc(decoded.uid)
    .get();

  if (!profileSnap.exists) {
    const error = new Error("Administrator profile not found.");
    error.statusCode = 403;
    throw error;
  }

  const profile = profileSnap.data() || {};
  if (String(profile.role || "").toLowerCase() !== "admin" || profile.active === false) {
    const error = new Error("Administrator permission required.");
    error.statusCode = 403;
    throw error;
  }

  return decoded;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    await requireActiveAdmin(req);

    const users = [];
    let pageToken;

    do {
      const page = await admin.auth().listUsers(1000, pageToken);
      users.push(
        ...page.users.map((u) => ({
          uid: u.uid,
          email: u.email || "",
          displayName: u.displayName || "",
          disabled: Boolean(u.disabled),
          creationTime: u.metadata?.creationTime || "",
          lastSignInTime: u.metadata?.lastSignInTime || "",
          providerIds: (u.providerData || []).map((p) => p.providerId),
        }))
      );
      pageToken = page.pageToken;
    } while (pageToken);

    return res.status(200).json({ users });
  } catch (error) {
    console.error("Admin list users error:", error);
    return res.status(error?.statusCode || 500).json({
      error: error?.message || "Could not load Firebase Authentication users.",
    });
  }
}
