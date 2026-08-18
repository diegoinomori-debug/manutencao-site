const ALLOWED_TARGETS = new Set(["en", "es", "th"]);

function cleanText(value, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=3600");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const text = cleanText(req.body?.text);
    const requested = String(req.body?.targetLanguage || "");
    const targetLanguage = ALLOWED_TARGETS.has(requested) ? requested : "en";

    if (!text) return res.status(400).json({ error: "Text is required." });

    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", targetLanguage);
    url.searchParams.set("dt", "t");
    url.searchParams.append("q", text);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "MIYAMA-Maintenance/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Translation provider returned ${response.status}`);
    }

    const data = await response.json();
    const translatedText = Array.isArray(data?.[0])
      ? data[0].map((part) => (Array.isArray(part) ? part[0] || "" : "")).join("").trim()
      : "";

    if (!translatedText) throw new Error("Translation provider returned an empty response.");

    return res.status(200).json({ translatedText });
  } catch (error) {
    console.error("Translation API error:", error);
    return res.status(502).json({ error: "The content could not be translated." });
  }
}
