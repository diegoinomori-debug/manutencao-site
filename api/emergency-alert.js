import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      equipment,
      phenomenon,
      action,
      level,
      createdAt,
    } = req.body;

    const subject = `【緊急保全通知】${equipment || "設備名なし"}`;

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: process.env.SEND_TO_EMAIL,
      subject,
      html: `
        <h2>【緊急保全通知】</h2>
        <p><b>危険度:</b> ${level || "緊急"}</p>
        <p><b>日付:</b> ${createdAt || "-"}</p>
        <p><b>設備名:</b> ${equipment || "-"}</p>
        <p><b>不具合現象:</b> ${phenomenon || "-"}</p>
        <p><b>処置内容:</b> ${action || "-"}</p>
        <hr />
        <p>保全管理サイトから自動送信されています。</p>
      `,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}