import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Analizează textul conform Formulei Coeziunii 3.14 + D + L∞. Returnează DOAR JSON valid în format {rezonanta, D, L, interpretare}.",
        },
        { role: "user", content: text },
      ],
      temperature: 0.4,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    const match = raw.match(/\{[\s\S]*\}/);
    let parsed;

    try {
      parsed = JSON.parse(match ? match[0] : raw);
    } catch {
      parsed = {
        rezonanta: 3.14,
        D: 0,
        L: 0,
        interpretare: raw || "Răspuns text neformatat",
      };
    }

    res.status(200).json({ analysis: parsed });
  } catch (error) {
    console.error("Eroare analiză:", error);
    res.status(500).json({ error: error.message });
  }
}
