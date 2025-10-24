import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Textul nu poate fi gol." });
    }

    // === Calcule interne – Formula Coeziunii 3.14Δ ===
    const words = text.trim().split(/\s+/).length;
    const letters = text.replace(/\s+/g, "").length;
    const fc = ((letters / words) % 3.14).toFixed(2);
    const delta = Math.abs(Math.sin(letters / words)).toFixed(2);
    const manipulation = ((Math.abs(fc - delta) / 3.14) * 100).toFixed(2);

    // === Analiză GPT rapidă și factuală ===
    const gptResponse = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 150,
      messages: [
        {
          role: "system",
          content:
            "Ești un analizor de adevăr logic. Evaluează scurt dacă afirmația este adevărată, falsă, manipulatoare sau neutră. Răspunde concis în maxim 3 propoziții.",
        },
        {
          role: "user",
          content: `Analizează: "${text}"`,
        },
      ],
    });

    const interpretation =
      gptResponse.choices?.[0]?.message?.content || "Fără interpretare.";

    // === Return final către interfață ===
    return res.status(200).json({
      fc,
      delta,
      manipulation,
      interpretation,
    });
  } catch (error) {
    console.error("Eroare GPT:", error);
    return res.status(500).json({
      error: "Eroare la interpretarea GPT-5",
      details: error.message,
    });
  }
}
