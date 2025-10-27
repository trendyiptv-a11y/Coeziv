import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Lipsă text" });

    // 🔹 Căutare factuală via Serper.dev
    const serperRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: text, num: 10 }),
    });

    const serperData = await serperRes.json();
    const sources = (serperData.organic || []).slice(0, 5);

    // 🔹 Analiză GPT
    const prompt = `
Evaluează factualitatea afirmației: "${text}"
Pe baza acestor surse:
${sources.map(s => `- ${s.title}: ${s.snippet}`).join("\n")}
Returnează JSON cu:
{ "score": 0–3.14, "verdict": "coeziv"|"parțial"|"incoerent", "interpretation": "scurtă explicație" }
`;

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const gptData = await gptRes.json();
    let parsed;
    try {
      parsed = JSON.parse(gptData.choices[0].message.content);
    } catch {
      parsed = { score: 0, verdict: "incoerent", interpretation: "Eroare GPT" };
    }

    return res.status(200).json({ ...parsed, sources });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Eroare server" });
  }
}
