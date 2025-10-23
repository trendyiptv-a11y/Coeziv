import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Textul lipsește" });
  }

  // Calcule locale — Formula Coeziunii
  const words = text.trim().split(/\s+/).length;
  const letters = text.replace(/\s+/g, "").length;
  const D = ((letters / words) % 3.14).toFixed(2);
  const L = ((Math.sin(letters) + 1.5) % 3.14).toFixed(2);
  const resonance =
    Math.abs(D - L) < 0.1 ? "3.14 (coeziv)" : "3.14 ± fluctuație minoră";

  // Conectare GPT-5
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-turbo",
      messages: [
        {
          role: "system",
          content:
            "Ești modulul viu al Formulei Coeziunii 3.14 + D + L∞. Interpretează logic, semantic și spiritual textul, în stil poetic, dar clar.",
        },
        {
          role: "user",
          content: `Text: "${text}"\nD=${D}, L=${L}, Rezonanță=${resonance}\nAnalizează conform formulei.`,
        },
      ],
    });

    const interpretation =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Nu s-a putut genera interpretarea.";

    return res.status(200).json({
      analysis: { D, L, resonance, interpretation },
    });
  } catch (error) {
    console.error("Eroare GPT-5:", error);
    return res
      .status(500)
      .json({ error: "Eroare la interpretarea GPT-5", details: error.message });
  }
}
