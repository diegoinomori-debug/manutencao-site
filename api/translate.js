const ALLOWED_TARGETS = new Set(["en", "es"]);

function containsJapanese(value = "") {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ""));
}

function cleanText(value, maxLength = 4500) {
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
    const targetLanguage = ALLOWED_TARGETS.has(req.body?.targetLanguage)
      ? req.body.targetLanguage
      : "en";

    if (!text) {
      return res.status(400).json({ error: "Text is required." });
    }

    if (!containsJapanese(text)) {
      return res.status(200).json({ translatedText: text });
    }

    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "ja");
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
      ? data[0]
          .map((part) => (Array.isArray(part) ? part[0] || "" : ""))
          .join("")
          .trim()
      : "";

    if (!translatedText) {
      throw new Error("Translation provider returned an empty response.");
    }

    return res.status(200).json({ translatedText });
  } catch (error) {
    console.error("Translation API error:", error);
    return res.status(502).json({
      error: "The report content could not be translated.",
    });
  }
}
