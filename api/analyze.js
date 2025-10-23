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
            "Ești modulul viu al Formulei Coeziunii. Interpretează logic, semantic și poetic mesajul uman. Răspunde concis și coerent.",
        },
        {
          role: "user",
          content: `Text: "${text}" | D=${D}, L=${L}, Rezonanță=${resonance}`,
        },
      ],
    });

    const interpretation =
      completion.choices?.[0]?.message?.content ||
      "Interpretare indisponibilă momentan.";

    return res.status(200).json({
      analysis: { D, L, resonance, interpretation },
    });
  } catch (err) {
    console.error("❌ Eroare API OpenAI:", err);
    return res.status(500).json({
      error: "Eroare la interpretarea GPT-5",
      details: err.message,
    });
  }
}
