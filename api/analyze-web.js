export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST method" });
    }

    const { text } = await req.json();     // citire corectă a body-ului
    if (!text || text.trim() === "") {
      return res.status(400).json({ analysis: "Text lipsă.", confidence: 0, sources: [] });
    }

    // căutare factuală
    const search = await fetch(`https://api.serper.dev/search`, {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: text })
    });
    const dataSearch = await search.json();
    const sources = (dataSearch.organic || []).slice(0,3).map(r => ({
      title: r.title, url: r.link
    }));

    // analiză semantică GPT
    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Ești motorul semantic Coeziv 3.14Δ. Analizează gradul de coeziune, manipulare și forța logică a textului." },
          { role: "user", content: `Analizează afirmația: "${text}"` }
        ]
      })
    });

    const aiData = await ai.json();
    const analysis = aiData.choices?.[0]?.message?.content || "Analiză indisponibilă.";
    const confidence = Math.floor(60 + Math.random()*30); // simulare de indice

    return res.status(200).json({ analysis, confidence, sources });
  } catch (err) {
    console.error("Eroare motor semantic:", err);
    return res.status(500).json({
      analysis: "⚠️ Eroare de conexiune cu motorul semantic.",
      confidence: 0,
      sources: []
    });
  }
}
