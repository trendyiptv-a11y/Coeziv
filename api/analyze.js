import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (typeof req.body === "string") req.body = JSON.parse(req.body);
  const { text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Textul nu poate fi gol." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Cheia OpenAI lipsește." });
  }

  // --- Formula Coeziunii ---
  const words = text.trim().split(/\s+/).length;
  const letters = text.replace(/\s+/g, "").length;
  const D = ((letters / words) % 3.14).toFixed(2);
  const L = ((Math.sin(letters) + 1.5) % 3.14).toFixed(2);
  const resonance =
    Math.abs(D - L) < 0.1 ? "3.14 (coeziv)" : "3.14 ± fluctuație minoră";

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let interpretation = "GPT nu a oferit răspuns.";

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: "Ești modulul viu al Formulei Coeziunii 3.14Δ.",
        },
        {
          role: "user",
          content: `
Text: "${text}"
Valorile: D=${D}, L=${L}, Rezonanță=${resonance}.
Explică semnificația echilibrului logic și semantic conform Formulei 3.14Δ.
Descrie dacă informația este coezivă, rigidă sau distorsionată.`,
        },
      ],
    });

    interpretation =
      completion.choices?.[0]?.message?.content?.trim() ||
      "GPT nu a returnat conținut clar.";
  } catch (error) {
    console.error("❌ Eroare GPT:", error);
    interpretation = `Eroare GPT: ${error.message}`;
  }

  return res.status(200).json({
    analysis: { D, L, resonance, interpretation },
  });
}
