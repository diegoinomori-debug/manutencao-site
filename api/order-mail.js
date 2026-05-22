import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { parts } = req.body;

    let html = `
      <h2>発注必要部品リスト</h2>
      <table border="1" cellpadding="8" cellspacing="0">
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
    `;

    parts.forEach((part) => {
      html += `
        <tr>
          <td>${part.priority}</td>
          <td>${part.equipment}</td>
          <td>${part.partName}</td>
          <td>${part.partNo}</td>
          <td>${part.supplier}</td>
          <td>${part.stockQty}</td>
          <td>${part.minStock}</td>
          <td>${part.recommendedQty}</td>
        </tr>
      `;
    });

    html += `</table>`;

    await resend.emails.send({
      from: '保全管理AI <noreply@miyama-unitec.co.jp>',
      to: process.env.SEND_TO_EMAIL,
      subject: '発注必要部品リスト',
      html,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Email send failed' });
  }
}