import { authorize, bodyObject, endpoint, HttpError, rateLimit, text } from "../lib/miyama-server.js";

export default endpoint(["POST"], async (req, res) => {
  const access = await authorize(req, { admin: true });
  await rateLimit(access, "admin-set-password", 10);
  const body = bodyObject(req, 10000);
  const profileId = text(body.firestoreUserId, 128);
  if (!profileId || profileId.includes("/")) throw new HttpError(400, "Valid profile ID required.");
  // Do not trim passwords: whitespace may be intentional.
  const password = body.newPassword;
  if (typeof password !== "string" || password.length < 6 || password.length > 4096)
    throw new HttpError(400, "Password must contain 6 to 4096 characters.");
  const ref = access.adminDb.collection("users").doc(profileId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpError(404, "User profile not found.");
  const profile = snapshot.data();
  let target;
  try {
    if (profile.authUid) target = await access.adminAuth.getUser(profile.authUid);
    else if (profile.email) target = await access.adminAuth.getUserByEmail(profile.email);
    else {
      try { target = await access.adminAuth.getUser(profileId); }
      catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
        const legacyEmail = text(body.email, 320);
        if (!legacyEmail) throw new HttpError(400, "Legacy account email is required.");
        target = await access.adminAuth.getUserByEmail(legacyEmail);
      }
    }
  } catch (error) {
    if (error?.code === "auth/user-not-found") throw new HttpError(404, "Authentication account not found. Check the profile linkage.");
    throw error;
  }
  const suppliedUid = text(body.authUid, 128);
  const suppliedEmail = text(body.email, 320).toLowerCase();
  if ((suppliedUid && suppliedUid !== target.uid) ||
      (suppliedEmail && suppliedEmail !== String(target.email || "").toLowerCase()) ||
      (profile.authUid && profile.email && profile.email.toLowerCase() !== String(target.email || "").toLowerCase()))
    throw new HttpError(409, "Profile and Authentication identifiers do not match. Correct the linkage first.");
  try { await access.adminAuth.updateUser(target.uid, { password }); }
  catch (error) {
    if (["auth/invalid-password", "auth/password-does-not-meet-requirements"].includes(error?.code))
      throw new HttpError(400, "The password does not meet the account password policy.");
    throw error;
  }
  try { await access.adminAuth.revokeRefreshTokens(target.uid); }
  catch { throw new HttpError(502, "Password updated, but session revocation failed. Check the account before retrying."); }
  try {
    await ref.update({ authUid: target.uid, email: target.email || "", authProvider: "password",
      authLinkedAt: new Date().toISOString(), authLinkedBy: access.decoded.uid,
      passwordChangedAt: new Date().toISOString(), passwordChangedBy: access.decoded.uid });
  } catch { throw new HttpError(502, "Password updated and sessions revoked, but the profile audit could not be saved."); }
  return res.status(200).json({ ok: true, uid: target.uid, email: target.email || "" });
});
