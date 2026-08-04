import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
You are MIYAMA Maintenance AI, an industrial maintenance assistant.

Your duties:
- Analyze machine failures and maintenance reports.
- Suggest probable causes, checks, corrective actions, and recurrence prevention.
- Help create Why-Why analysis (Why 1, Why 2, Why 3).
- Translate technical maintenance text between Japanese, English, and Brazilian Portuguese.
- Preserve machine codes, model numbers, alarm numbers, drawing numbers, and filenames.
- Clearly separate confirmed facts from hypotheses.
- Never claim that a repair is safe or complete without physical confirmation by a qualified technician.
- Do not instruct the user to bypass safety interlocks, guards, lockout/tagout, or electrical protections.
- Answer in the language requested by the user. If no language is specified, answer in the user's language.
- Keep answers practical, structured, and suitable for factory maintenance teams.
`.trim();

function cleanText(value, maxLength = 20000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured on the server.",
    });
  }

  try {
    const body = req.body ?? {};
    const message = cleanText(body.message, 12000);
    const language = cleanText(body.language, 30) || "auto";
    const machine = cleanText(body.machine, 200);
    const context = cleanText(body.context, 20000);
    const history = Array.isArray(body.history)
      ? body.history
          .slice(-10)
          .map((item) => ({
            role: item?.role === "assistant" ? "assistant" : "user",
            content: cleanText(item?.content, 4000),
          }))
          .filter((item) => item.content)
      : [];

    if (!message) {
      return res.status(400).json({
        error: "The message field is required.",
      });
    }

    const contextBlock = [
      machine ? `Selected machine/equipment: ${machine}` : "",
      language ? `Requested response language: ${language}` : "",
      context ? `Maintenance data supplied by the application:\n${context}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const input = [
      ...history.map((item) => ({
        role: item.role,
        content: [{ type: "input_text", text: item.content }],
      })),
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `${contextBlock ? `${contextBlock}\n\n` : ""}User request:\n${message}`,
          },
        ],
      },
    ];

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions: SYSTEM_PROMPT,
      input,
      max_output_tokens: 1400,
    });

    const answer = response.output_text?.trim();

    if (!answer) {
      return res.status(502).json({
        error: "The AI returned an empty response.",
      });
    }

    return res.status(200).json({
      answer,
      responseId: response.id,
    });
  } catch (error) {
    console.error("MIYAMA AI API error:", error);

    const status = Number(error?.status) || 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;

    return res.status(safeStatus).json({
      error:
        safeStatus === 401
          ? "OpenAI authentication failed. Check OPENAI_API_KEY."
          : safeStatus === 429
            ? "OpenAI rate limit or account quota reached."
            : "MIYAMA AI could not generate a response.",
    });
  }
}
