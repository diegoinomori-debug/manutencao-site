import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { parts } = req.body;

    const rows = (parts || [])
      .map(
        (item) => `
          <tr>
            <td>${item.priority || "-"}</td>
            <td>${item.equipment || "-"}</td>
            <td>${item.partName || "-"}</td>
            <td>${item.partNo || "-"}</td>
            <td>${item.supplier || "-"}</td>
            <td>${item.stockQty || "0"}</td>
            <td>${item.minStock || "1"}</td>
            <td>${item.recommendedQty || "1"}</td>
          </tr>
        `
      )
      .join("");

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: process.env.SEND_TO_EMAIL,
      subject: "【保全】発注必要部品リスト",
      html: `
        <h2>【保全】発注必要部品リスト</h2>
        <p>在庫不足・在庫注意の部品一覧です。</p>

        <table border="1" cellpadding="8" cellspacing="0">
          <thead>
            <tr>
              <th>優先度</th>
              <th>設備名</th>
              <th>部品名</th>
              <th>部品番号</th>
              <th>購入先</th>
              <th>現在在庫</th>
              <th>最低在庫</th>
              <th>推奨発注数</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="8">発注必要部品はありません。</td></tr>`}
          </tbody>
        </table>

        <p>保全管理サイトから自動送信されています。</p>
      `,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}