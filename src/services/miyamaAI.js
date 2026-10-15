import { auth } from "../firebase";

export async function askMiyamaAI({
  message,
  language = "auto",
  machine = "",
  context = "",
  history = [],
  signal,
}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to use MIYAMA AI.");
  const token = await user.getIdToken();
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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
