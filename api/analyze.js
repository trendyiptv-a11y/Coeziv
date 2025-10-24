import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Textul nu poate fi gol." });
    }

    // Calcule interne - Formula Coeziunii 3.14Δ
    const words = text.trim().split(/\s+/).length;
    const letters = text.replace(/\s+/g, "").length;

    const delta = Math.abs(Math.sin(letters / words)).toFixed(2);
    const fc = ((letters / words) % 3.14).toFixed(2);
    const manipulation = ((Math.abs(fc - delta) / 3.14) * 100).toFixed(2);

    // Solicitare către GPT-5 (sau gpt-4o)
    const gptResponse = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "Ești un evaluator logic și semantic. Analizează textul primit și explică gradul de veridicitate, coerență și eventual bias sau intenție manipulatoare. Fii clar și neutru.",
        },
        {
          role: "user",
          content: `Analizează următorul text: "${text}". Oferă un scurt rezumat obiectiv.`,
        },
      ],
    });

    // Extragem interpretarea din răspunsul GPT-5
    const interpretation =
      gptResponse.choices?.[0]?.message?.content || "Fără interpretare.";

    // Returnăm rezultatul complet
    return res.status(200).json({
      delta,
      fc,
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
