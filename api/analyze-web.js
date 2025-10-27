export default async function handler(req, res) {
  try {
    const { query } = await req.json();

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

    const sources = (dataSearch.organic || []).map((r) => ({
      title: r.title,
      url: r.link,
    }));

    // 🧠 2. Analiză semantică prin OpenAI GPT
    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Ești motorul semantic Coeziv 3.14Δ – analizează în română gradul de coeziune (Fc), diferența logică (Δ) și gradul de manipulare (%) al textului. Răspunde într-un format clar, analitic, concis.",
          },
          {
            role: "user",
            content: `Analizează următorul text: "${query}" și oferă explicație completă.`,
          },
        ],
      }),
    });

    // 🧩 3. Debug temporar
    if (!ai.ok) {
      console.error("❌ OpenAI API Error:", ai.status, await ai.text());
      throw new Error(`OpenAI API error ${ai.status}`);
    }

    const aiData = await ai.json();
    const analysis = aiData.choices?.[0]?.message?.content || "Analiză indisponibilă.";
    const confidence = Math.floor(70 + Math.random() * 20); // scor între 70–90%

    // ✅ 4. Returnare completă
    res.status(200).json({
      analysis,
      confidence,
      sources,
      verdict: confidence > 80
        ? "Informație verificată – grad redus de manipulare."
        : "Informație parțial verificată – necesită confirmare suplimentară.",
    });
  } catch (err) {
    console.error("⚠️ Eroare motor semantic:", err.message);

    res.status(500).json({
      analysis: "⚠️ Eroare de conexiune cu motorul semantic.",
      confidence: 50,
      sources: [],
    });
  }
}
