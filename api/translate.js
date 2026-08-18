export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, targetLanguage } = req.body || {};
    const sourceText = String(text || "").trim();
    const target = ["en", "es", "th"].includes(String(targetLanguage || ""))
      ? String(targetLanguage)
      : "en";

    if (!sourceText) return res.status(200).json({ translatedText: "" });
    if (sourceText.length > 5000) {
      return res.status(400).json({ error: "Text is too long" });
    }

    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", target);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", sourceText);

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Translation service error ${response.status}` });
    }

    const data = await response.json();
    const translatedText = Array.isArray(data?.[0])
      ? data[0].map((part) => String(part?.[0] || "")).join("")
      : sourceText;

    return res.status(200).json({ translatedText: translatedText || sourceText });
  } catch (error) {
    console.error("translate api error", error);
    return res.status(500).json({ error: error?.message || "Translation failed" });
  }
}
