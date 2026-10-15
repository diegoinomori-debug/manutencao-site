import { authorize, endpoint, rateLimit } from "../lib/miyama-server.js";

export default endpoint(["GET"], async (req, res) => {
  const access = await authorize(req, { admin: true });
  await rateLimit(access, "admin-list-users", 10);
  const users = [];
  let pageToken;
  do {
    const result = await access.adminAuth.listUsers(1000, pageToken);
    for (const user of result.users || []) users.push({
      uid: user.uid || "", email: user.email || "", displayName: user.displayName || "",
      disabled: Boolean(user.disabled), creationTime: user.metadata?.creationTime || "",
      lastSignInTime: user.metadata?.lastSignInTime || "",
    });
    pageToken = result.pageToken || undefined;
  } while (pageToken);
  return res.status(200).json({ ok: true, count: users.length, users });
});
