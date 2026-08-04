export async function askMiyamaAI({
  message,
  language = "auto",
  machine = "",
  context = "",
  history = [],
  signal,
}) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      language,
      machine,
      context,
      history,
    }),
    signal,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(data.error || `MIYAMA AI error (${response.status})`);
  }

  return data;
}
