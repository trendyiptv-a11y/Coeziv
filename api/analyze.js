// /api/analyze.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Lipsă text" });

    // --- 🔎 Căutare factuală în știri recente (Serper News API) ---
    const serperRes = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: text,
        num: 10,
        tbs: "qdr:d", // ultimele 24h
        gl: "ro",     // regiune România
        hl: "ro",     // limbă română
      }),
    });

    const serperData = await serperRes.json();
    const sources = (serperData.news || []).slice(0, 5).map((s) => ({
      title: s.title,
      link: s.link,
      date: s.date,
      source: s.source,
      snippet: s.snippet,
    }));

    // dacă nu sunt suficiente surse
    if (sources.length < 3) {
      return res.status(200).json({
        score: 0,
        verdict: "incoerent",
        interpretation:
          "Analiza a fost suspendată – insuficiente surse factuale recente (minim 3 necesare).",
        sources,
      });
    }

    // --- 🤖 Analiză factual-semantică GPT ---
    const prompt = `
Verifică afirmația de mai jos în raport cu următoarele articole de presă recente:

${sources.map((s) => `- ${s.title} (${s.source}, ${s.date}): ${s.snippet}`).join("\n")}

Afirmație: "${text}"

Evaluează factualitatea și returnează strict JSON:
{
  "score": număr între 0 și 3.14,
  "verdict": "coeziv" | "parțial" | "incoerent",
  "interpretation": "explicație scurtă în română"
}
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
      parsed = JSON.parse(gptData.choices?.[0]?.message?.content || "{}");
    } catch {
      parsed = {
        score: 0,
        verdict: "incoerent",
        interpretation: "Eroare de analiză – răspuns GPT invalid.",
      };
    }

    // Asigurare valori valide
    parsed.score = Math.min(Math.max(Number(parsed.score || 0), 0), 3.14);
    parsed.sources = sources;

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Eroare Coeziv 3.14Δ:", err);
    return res.status(500).json({
      error: "Eroare internă în analiza Coeziv 3.14Δ.",
      score: 0,
      verdict: "eroare",
      interpretation: "Conexiune eșuată către OpenAI sau Serper.",
      sources: [],
    });
  }
}
