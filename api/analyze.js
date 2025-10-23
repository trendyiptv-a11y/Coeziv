import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Textul nu poate fi gol." });
  }

  // 🔢 Calcule locale — Formula Coeziunii
  const words = text.trim().split(/\s+/).length;
  const letters = text.replace(/\s+/g, "").length;
  const D = ((letters / words) % 3.14).toFixed(2);
  const L = ((Math.sin(letters) + 1.5) % 3.14).toFixed(2);
  const resonance =
    Math.abs(D - L) < 0.1 ? "3.14 (coeziv)" : "3.14 ± fluctuație minoră";

  // 🤖 Conectare OpenAI GPT
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ești modulul viu al Formulei Coeziunii. Interpretează mesajul uman în termeni de armonie, rezonanță și echilibru logic.",
        },
        {
          role: "user",
          content: `Analizează textul: "${text}". Valorile: D=${D}, L=${L}, Rezonanță=${resonance}. Oferă o interpretare poetică și logică într-o singură frază.`,
        },
      ],
    });

    // 🔍 Verificare sigură a conținutului răspunsului
    const message = completion.choices?.[0]?.message?.content ?? "";
    const interpretation =
      message && message.length > 0
        ? message
        : "GPT nu a returnat conținut — verifică cheia API.";

    return res.status(200).json({
      analysis: { D, L, resonance, interpretation },
    });
  } catch (err) {
    console.error("❌ Eroare GPT:", err);
    return res.status(500).json({
      error: "Eroare la interpretarea GPT-5",
      details: err.message,
    });
  }
}
