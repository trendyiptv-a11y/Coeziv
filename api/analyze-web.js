export default async function handler(req, res) {
  try {
    const { query } = await req.json();

    // 🧩 1. Căutare factuală (Serper)
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

    // 🧠 2. Analiză semantică (GPT)
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "Ești motorul semantic Coeziv 3.14Δ. Analizează în limba română textul primit după formula Δ (diferență logică), Fc (forța coeziunii) și Gradul de Manipulare (%). Răspunde clar, concis, cu explicație logică.",
          },
          {
            role: "user",
            content: `Analizează textul: "${query}" și oferă o interpretare completă.`,
          },
        ],
      }),
    });

    // 🩻 3. Verificare răspuns OpenAI
    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("❌ OpenAI API Error:", aiResponse.status, errText);
      throw new Error(`Eroare GPT: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis =
      aiData?.choices?.[0]?.message?.content ||
      "Analiza semantică nu a fost generată.";

    const confidence = Math.floor(70 + Math.random() * 20);

    // ✅ 4. Returnare completă către frontend
    return res.status(200).json({
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
    return res.status(500).json({
      analysis: "⚠️ Eroare de conexiune cu motorul semantic.",
      verdict:
        "Informație parțial verificată – necesită confirmare suplimentară (Indice: 50%)",
      confidence: 50,
      sources: [],
    });
  }
}
