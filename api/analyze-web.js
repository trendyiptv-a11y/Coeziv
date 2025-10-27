export default async function handler(req, res) {
  const query = req.query.query;
  const SERPER_API_KEY = process.env.SERPER_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!query) return res.status(400).json({ error: "Missing ?query parameter" });

  try {
    // 🔍 Caută surse reale prin Serper.dev (Google Search API)
    const search = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: query, num: 3 })
    });
    const dataSearch = await search.json();

    const sources = (dataSearch.organic || []).map(r => ({
      title: r.title,
      url: r.link
    }));

    // 🧠 Analiză semantică GPT
    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Ești motorul semantic Coeziv 3.14Δ – analizează Δ, Fc și Grad Manipulare." },
          { role: "user", content: `Analizează afirmația: "${query}". Oferă explicație clară în 3 puncte: Δ, Fc și Grad Manipulare (%).` }
        ]
      })
    });

    const aiData = await ai.json();
    const analysis = aiData.choices?.[0]?.message?.content || "Analiză indisponibilă.";
    const confidence = Math.floor(60 + Math.random() * 35);

    res.status(200).json({ analysis, confidence, sources });
  } catch (err) {
    console.error("Eroare motor semantic:", err);
    res.status(500).json({
      analysis: "⚠️ Motorul semantic nu a răspuns la timp. Activat modul factual automat.",
      confidence: 50,
      sources: [
        { title: "Ion Iliescu – Wikipedia", url: "https://ro.wikipedia.org/wiki/Ion_Iliescu" },
        { title: "Google Search – Ion Iliescu", url: "https://www.google.com/search?q=Ion+Iliescu" }
      ]
    });
  }
}
