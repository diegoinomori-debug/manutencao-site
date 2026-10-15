import { authorize, bodyObject, endpoint, HttpError, rateLimit, text as cleanText } from "../lib/miyama-server.js";
const TARGETS = new Set(["en", "es", "th"]);
export default endpoint(["POST"], async (req, res) => {
  const access = await authorize(req);
  const body = bodyObject(req, 30000);
  const text = cleanText(body.text, 5000);
  const targetLanguage = cleanText(body.targetLanguage, 8) || "en";
  if (!text) throw new HttpError(400, "Text is required.");
  if (!TARGETS.has(targetLanguage)) throw new HttpError(400, "Unsupported target language.");
  await rateLimit(access, "translate", 300);
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  for (const [key, value] of Object.entries({ client: "gtx", sl: "auto", tl: targetLanguage, dt: "t", q: text })) url.searchParams.set(key, value);
  let translatedText;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("provider");
    const data = await response.json();
    translatedText = Array.isArray(data?.[0]) ? data[0].map(part => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("").trim() : "";
  } catch { throw new HttpError(502, "The content could not be translated."); }
  if (!translatedText) throw new HttpError(502, "Translation provider returned an empty response.");
  return res.status(200).json({ translatedText });
});
