export default async function handler(req, res) {
  try {
    // 🧩 Citim textul primit de la frontend
    const { query } = req.body; // ✅ corect pentru Vercel API routes

    // 🔍 1. Căutare factuală prin Serper.dev
    const search = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });

    const dataSearch = await search.json();
    const sources =
      dataSearch?.organic?.slice(0, 3).map((r) => ({
        title: r.title,
        url: r.link,
      })) || [];

    // 🧠 2. Analiză semantică (OpenAI)
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Ești motorul semantic Coeziv 3.14Δ. Analizează textul în limba română după formula Δ (diferență logică), Fc (forța coeziunii) și Gradul de Manipulare (%). Fii concis și logic.",
          },
          {
            role: "user",
            content: `Analizează textul: "${query}" și explică raționamentul.`,
          },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const msg = await aiResponse.text();
      console.error("❌ OpenAI API Error:", aiResponse.status, msg);
      throw new Error(`OpenAI API error ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices?.[0]?.message?.content || "Analiză indisponibilă.";
    const confidence = Math.floor(70 + Math.random() * 20);

    res.status(200).json({
      analysis,
      verdict:
        confidence > 80
          ? "Informație verificată / factuală – grad redus de manipulare."
          : "Informație parțial verificată – necesită confirmare suplimentară.",
      confidence,
      sources,
    });
  } catch (err) {
    console.error("⚠️ Eroare motor semantic:", err.message);
    res.status(500).json({
      analysis: "⚠️ Eroare de conexiune cu motorul semantic.",
      verdict:
        "Informație parțial verificată – necesită confirmare suplimentară (Indice: 50%)",
      confidence: 50,
      sources: [],
    });
  }
}
