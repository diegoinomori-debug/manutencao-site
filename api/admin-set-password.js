import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured.");
  }

  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT contains invalid JSON.");
  }

  if (account.private_key) {
    account.private_key = account.private_key.replace(/\\n/g, "\n");
  }

  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing required fields.");
  }

  return account;
}

function getAdminApp() {
  if (getApps().length > 0) return getApp();

  return initializeApp({
    credential: cert(getServiceAccount()),
  });
}

async function requireActiveAdmin(request) {
  const app = getAdminApp();
  const adminAuth = getAuth(app);
  const adminDb = getFirestore(app);

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  const idToken = authorization.slice(7).trim();
  if (!idToken) {
    return { ok: false, status: 401, error: "Authentication token is empty." };
  }

  const decoded = await adminAuth.verifyIdToken(idToken);

  const profileSnap = await adminDb
    .collection("users")
    .doc(decoded.uid)
    .get();

  if (!profileSnap.exists) {
    return { ok: false, status: 403, error: "Administrator profile not found." };
  }

  const profile = profileSnap.data() || {};
  if (
    String(profile.role || "").toLowerCase() !== "admin" ||
    profile.active === false
  ) {
    return { ok: false, status: 403, error: "Administrator permission required." };
  }

  return { ok: true, decoded, adminAuth, adminDb };
}

async function resolveTargetUser(adminAuth, { authUid, candidateUid, email }) {
  // 1) Persisted, verified Authentication UID.
  if (authUid) {
    try {
      return await adminAuth.getUser(authUid);
    } catch (error) {
      if (String(error?.code || "") !== "auth/user-not-found") throw error;
    }
  }

  // 2) Email is the safest identifier for legacy accounts.
  if (email) {
    try {
      return await adminAuth.getUserByEmail(email);
    } catch (error) {
      if (String(error?.code || "") !== "auth/user-not-found") throw error;
    }
  }

  // 3) Accounts originally created by MIYAMA used the Auth UID as Firestore doc id.
  if (candidateUid) {
    try {
      return await adminAuth.getUser(candidateUid);
    } catch (error) {
      if (String(error?.code || "") !== "auth/user-not-found") throw error;
    }
  }

  return null;
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed. Use POST." },
        { status: 405 }
      );
    }

    try {
      const access = await requireActiveAdmin(request);
      if (!access.ok) {
        return Response.json(
          { error: access.error },
          { status: access.status }
        );
      }

      const body = await request.json();

      const firestoreUserId = String(body?.firestoreUserId || "").trim();
      const authUid = String(body?.authUid || "").trim();
      const candidateUid = String(body?.candidateUid || "").trim();
      const email = String(body?.email || "").trim().toLowerCase();
      const newPassword = String(body?.newPassword || "");

      if (!firestoreUserId) {
        return Response.json(
          { error: "Firestore user profile ID is required." },
          { status: 400 }
        );
      }

      if (newPassword.length < 6) {
        return Response.json(
          { error: "Password must contain at least 6 characters." },
          { status: 400 }
        );
      }

      const targetUser = await resolveTargetUser(access.adminAuth, {
        authUid,
        candidateUid,
        email,
      });

      if (!targetUser) {
        return Response.json(
          {
            error:
              "Firebase Authentication account was not found. " +
              "For an old account, enter the exact email shown in Firebase Authentication.",
          },
          { status: 404 }
        );
      }

      await access.adminAuth.updateUser(targetUser.uid, {
        password: newPassword,
      });

      // Invalidate existing refresh sessions after an admin password reset.
      await access.adminAuth.revokeRefreshTokens(targetUser.uid);

      // Persist the Authentication linkage so future operations need no lookup/listing.
      await access.adminDb
        .collection("users")
        .doc(firestoreUserId)
        .set(
          {
            authUid: targetUser.uid,
            email: targetUser.email || email || "",
            authProvider: "password",
            authLinkedAt: new Date().toISOString(),
            authLinkedBy: access.decoded.uid,
            passwordChangedAt: new Date().toISOString(),
            passwordChangedBy: access.decoded.uid,
          },
          { merge: true }
        );

      return Response.json({
        ok: true,
        uid: targetUser.uid,
        email: targetUser.email || email || "",
      });
    } catch (error) {
      console.error("admin-set-password:", error);

      const code = String(error?.code || "");
      let message = error?.message || "Password update failed.";

      if (code === "auth/user-not-found") {
        message = "Firebase Authentication user was not found.";
      } else if (code === "auth/invalid-password") {
        message = "The new password is invalid.";
      } else if (code === "auth/id-token-expired") {
        message = "Administrator session expired. Sign in again.";
      } else if (code === "auth/invalid-id-token") {
        message = "Administrator authentication token is invalid.";
      }

      return Response.json(
        { error: message, code: code || undefined },
        { status: 500 }
      );
    }
  },
};
