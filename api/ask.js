// /pages/api/ask.js (sau /src/pages/api/ask.js)
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { question, threadId } = req.body;

  if (!question || typeof question !== "string") {
    return res.status(400).json({ message: "Lipsește câmpul 'question'." });
  }

  try {
    let currentThreadId = threadId;

    // 1) Dacă nu avem încă thread, creăm unul nou
    if (!currentThreadId) {
      const thread = await client.beta.threads.create();
      currentThreadId = thread.id;
    }

    // 2) Adăugăm mesajul utilizatorului în thread
    await client.beta.threads.messages.create(currentThreadId, {
      role: "user",
      content: question,
    });

    // 3) Lansăm un run cu asistentul CoezivAI
    const run = await client.beta.threads.runs.create(currentThreadId, {
      assistant_id: process.env.COEZIV_ASSISTANT_ID,
    });

    // 4) Așteptăm să termine (polling simplu)
    let completedRun = run;
    while (
      completedRun.status === "queued" ||
      completedRun.status === "in_progress"
    ) {
      await new Promise((r) => setTimeout(r, 800));
      completedRun = await client.beta.threads.runs.retrieve(
        currentThreadId,
        completedRun.id
      );
    }

    if (completedRun.status !== "completed") {
      return res.status(500).json({
        message: "Run-ul nu a fost completat.",
        status: completedRun.status,
      });
    }

    // 5) Luăm ultimul mesaj al asistentului din thread
    const messages = await client.beta.threads.messages.list(currentThreadId, {
      limit: 10,
    });

    const lastAssistantMessage = messages.data.find(
      (m) => m.role === "assistant"
    );

    const answer =
      lastAssistantMessage?.content?.[0]?.text?.value ??
      "Nu am reușit să formulez un răspuns.";

    // 6) Întoarcem răspunsul + threadId (ca să-l păstrăm în frontend)
    res.status(200).json({
      answer,
      threadId: currentThreadId,
    });
  } catch (error) {
    console.error("Eroare CoezivAI:", error);
    res.status(500).json({
      message: "Eroare internă la CoezivAI.",
      error: error.message,
    });
  }
}
