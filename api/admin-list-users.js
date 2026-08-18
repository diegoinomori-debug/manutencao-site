import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured.");
  }

  const account = JSON.parse(raw);

  if (account.private_key) {
    account.private_key = account.private_key.replace(/\\n/g, "\n");
  }

  return account;
}

function getAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp({
    credential: cert(getServiceAccount()),
  });
}

async function checkAdmin(request) {
  const authorization = request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "Authentication required.",
    };
  }

  const token = authorization.slice(7).trim();

  const app = getAdminApp();
  const adminAuth = getAuth(app);
  const adminDb = getFirestore(app);

  const decoded = await adminAuth.verifyIdToken(token);

  const profileSnapshot = await adminDb
    .collection("users")
    .doc(decoded.uid)
    .get();

  if (!profileSnapshot.exists) {
    return {
      ok: false,
      status: 403,
      error: "Administrator profile not found.",
    };
  }

  const profile = profileSnapshot.data() || {};

  if (
    String(profile.role || "").toLowerCase() !== "admin" ||
    profile.active === false
  ) {
    return {
      ok: false,
      status: 403,
      error: "Administrator permission required.",
    };
  }

  return {
    ok: true,
    adminAuth,
  };
}

export default {
  async fetch(request) {
    if (request.method !== "GET") {
      return Response.json(
        { error: "Method not allowed. Use GET." },
        { status: 405 }
      );
    }

    try {
      const adminCheck = await checkAdmin(request);

      if (!adminCheck.ok) {
        return Response.json(
          { error: adminCheck.error },
          { status: adminCheck.status }
        );
      }

      const users = [];
      let pageToken;

      do {
        const result = await adminCheck.adminAuth.listUsers(
          1000,
          pageToken
        );

        const pageUsers = Array.isArray(result?.users)
          ? result.users
          : [];

        for (const user of pageUsers) {
          users.push({
            uid: user.uid || "",
            email: user.email || "",
            displayName: user.displayName || "",
            disabled: Boolean(user.disabled),
            creationTime: user.metadata?.creationTime || "",
            lastSignInTime: user.metadata?.lastSignInTime || "",
          });
        }

        pageToken = result?.pageToken || undefined;
      } while (pageToken);

      return Response.json({
        ok: true,
        count: users.length,
        users,
      });
    } catch (error) {
      console.error("admin-list-users:", error);

      return Response.json(
        {
          error:
            error?.message ||
            "Could not load Firebase Authentication users.",
        },
        { status: 500 }
      );
    }
  },
};