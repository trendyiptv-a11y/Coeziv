import OpenAI from "openai";

console.log("🧩 DEBUG START — verificare conexiune OPENAI");
console.log("🔑 Cheie prezentă:", !!process.env.OPENAI_API_KEY);
console.log("📦 Pachet OPENAI importat corect:", typeof OpenAI !== "undefined");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Textul nu poate fi gol." });
  }

  // --- Calcule locale — Formula Coeziunii ---
  const words = text.trim().split(/\s+/).length;
  const letters = text.replace(/\s+/g, "").length;
  const D = ((letters / words) % 3.14).toFixed(2);
  const L = ((Math.sin(letters) + 1.5) % 3.14).toFixed(2);
  const resonance =
    Math.abs(D - L) < 0.1 ? "3.14 (coeziv)" : "3.14 ± fluctuație minoră";

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let interpretation = "GPT nu a oferit răspuns.";

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ești modulul viu al Formulei Coeziunii. Interpretează mesajul poetic și logic.",
        },
        {
          role: "user",
          content: `Text: "${text}". Valorile: D=${D}, L=${L}, Rezonanță=${resonance}.`,
        },
      ],
    });

    console.log("🧠 GPT response complet:", completion);

    interpretation =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "GPT nu a returnat conținut clar.";
  } catch (error) {
    console.error("❌ Eroare GPT:", error);
  }

  return res.status(200).json({
    analysis: { D, L, resonance, interpretation },
  });
}
