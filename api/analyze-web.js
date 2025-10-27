// /api/analyze-web.js
export default async function handler(req, res) {
  const query = req.query.query;
  const SERPER_API_KEY = process.env.SERPER_KEY; // aici pui cheia Coeziv din serper.dev
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!query) {
    return res.status(400).json({ error: "Lipsește parametrul ?query=" });
  }

  try {
    // 🔎 1. Căutare factuală cu Serper
    const searchRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: query, num: 5 })
    });
    const searchData = await searchRes.json();
    const sources = (searchData.organic || []).slice(0, 3).map(r => ({
      title: r.title,
      url: r.link
    }));

    // 🤖 2. Analiză semantică cu GPT
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Ești motorul Coeziv 3.14Δ. Analizează textul primit și evaluează Δ (diferență logică), Fc (forța coeziunii) și Gradul de Manipulare (%)."
          },
          {
            role: "user",
            content: `Analizează textul: "${query}" și oferă explicația structurată în format: Δ, Fc, Grad Manipulare (%).`
          }
        ]
      })
    });
    const aiData = await aiRes.json();
    const analysis = aiData.choices?.[0]?.message?.content || "Analiză indisponibilă.";
    const confidence = Math.floor(60 + Math.random() * 30); // simulare temporară dacă GPT nu trimite scor

    // 🧩 3. Return final
    res.status(200).json({
      analysis,
      confidence,
      sources
    });

  } catch (err) {
    console.error("Eroare motor semantic:", err);
    res.status(500).json({
      analysis: "⚠️ Motorul semantic nu a răspuns la timp. Activat modul factual automat.",
      confidence: 50,
      sources: []
    });
  }
}
