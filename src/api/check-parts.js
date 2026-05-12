import { Resend } from "resend";
  const date = new Date(dateString);
  date.setDate(date.getDate() + Number(days));
  return date;
}

function diffDays(targetDate) {
  const today = new Date();

  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  return Math.ceil(
    (targetDate - today) / (1000 * 60 * 60 * 24)
  );
}

export default async function handler(req, res) {
  try {
    const snapshot = await getDocs(collection(db, "parts"));

    for (const item of snapshot.docs) {
      const data = item.data();

      if (!data.lastDate || !data.cycle) continue;

      const nextDate = addDays(data.lastDate, data.cycle);

      const daysLeft = diffDays(nextDate);

      let sendMail = false;
      let title = "";

      // troca em 7 dias
      if (daysLeft === 7) {
        sendMail = true;
        title = "【設備保全】部品交換予定通知";
      }

      // compra baseada no lead time
      const lead = parseInt(data.leadTime);

      if (!isNaN(lead) && daysLeft === lead) {
        sendMail = true;
        title = "【設備保全】部品購入通知";
      }

      if (sendMail) {
        await resend.emails.send({
          from: "onboarding@resend.dev",
          to: process.env.SEND_TO_EMAIL,
          subject: title,

          html: `
            <h2>${title}</h2>

            <p><b>設備名:</b> ${data.equipment || "-"}</p>
            <p><b>部品名:</b> ${data.partName || "-"}</p>
            <p><b>部品番号:</b> ${data.partNo || "-"}</p>
            <p><b>部品値段:</b> ${data.price || "-"}</p>
            <p><b>購入先:</b> ${data.supplier || "-"}</p>
            <p><b>予備品ロケーション:</b> ${data.location || "-"}</p>
            <p><b>部品納期:</b> ${data.leadTime || "-"}</p>
            <p><b>担当者:</b> ${data.owner || "-"}</p>
            <p><b>次回交換日:</b> ${nextDate.toLocaleDateString()}</p>
          `,
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}