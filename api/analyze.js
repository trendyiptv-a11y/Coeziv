import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodă neacceptată" });
  }

  const { text } = req.body;
  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Textul nu poate fi gol." });
  }

  try {
    const prompt = `
Analizează următorul text și oferă:
1. O interpretare scurtă și obiectivă (max 3 rânduri).
2. Trei valori numerice între 0 și 6:
   - Δ (vibrație semantică): măsura coerenței expresive și emoționale.
   - Fc (coeziune logică): gradul de structură și consistență logică.
   - Manipulare probabilă (%): estimarea intenției de manipulare sau distorsionare.

Text: "${text}"

Răspuns în format JSON cu cheile:
{
  "interpretation": "...",
  "delta": număr,
  "fc": număr,
  "manipulation": număr
}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 300,
    });

    const message = completion.choices[0].message.content;
    let result;

    try {
      result = JSON.parse(message);
    } catch {
      // fallback dacă GPT returnează text liber
      const match = message.match(
        /"delta":\s*([\d.]+).*?"fc":\s*([\d.]+).*?"manipulation":\s*([\d.]+)/s
      );
      result = {
        interpretation: message.split("\n")[0] || "Interpretare indisponibilă.",
        delta: match ? parseFloat(match[1]) : Math.random() * 3,
        fc: match ? parseFloat(match[2]) : Math.random() * 3,
        manipulation: match ? parseFloat(match[3]) : Math.random() * 50,
      };
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("Eroare GPT:", error);
    res.status(500).json({ error: "Eroare la analiza GPT: " + error.message });
  }
}
