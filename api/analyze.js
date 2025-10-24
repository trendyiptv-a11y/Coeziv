import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5",
      max_completion_tokens: 300,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `Ești un motor de analiză informațională numit Formula 3.14Δ.
Analizează textul primit și răspunde STRICT în acest format:

Δ (vibrație semantică): [valoare între 0–5]
Fc (coeziune logică): [valoare între 0–5]
Manipulare probabilă: [valoare între 0–100%]
Verdict: [ADEVĂRAT / PARȚIAL / FALS / MANIPULATOR]
Explicație: [max 2 propoziții cu motivul principal]`,
        },
        { role: "user", content: text },
      ],
    });

    const result =
      completion.choices?.[0]?.message?.content ||
      completion.choices?.[0]?.delta?.content ||
      "❌ Eroare: fără conținut primit de la GPT-5.";

    res.status(200).json({ result });
  } catch (error) {
    console.error("Eroare GPT-5:", error);
    res.status(500).json({ error: "Eroare la procesarea GPT-5." });
  }
}
