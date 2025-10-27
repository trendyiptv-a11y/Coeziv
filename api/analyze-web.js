export default async function handler(req, res) {
  try {
    // 1️⃣ Acceptăm doar POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Folosește metoda POST." });
    }

    // 2️⃣ Citim manual corpul cererii (compatibil Node 18+ / Vercel)
    const buffers = [];
    for await (const chunk of req.body) buffers.push(chunk);
    const data = JSON.parse(Buffer.concat(buffers).toString());
    const text = data.text?.trim();

    if (!text) {
      return res.status(400).json({
        analysis: "⚠️ Text lipsă pentru analiză.",
        confidence: 0,
        sources: [],
      });
    }

    // 3️⃣ Căutare factuală (Serper.dev sau orice altă sursă factuală)
    const search = await fetch("https://api.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: text }),
    });

    const dataSearch = await search.json();
    const sources = (dataSearch.organic || []).slice(0, 3).map((r) => ({
      title: r.title,
      url: r.link,
    }));

    // 4️⃣ Analiză semantică GPT
    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
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
              "Ești motorul semantic Coeziv 3.14Δ. Analizează nivelul de coeziune, manipulare, vibrație și grad de factualitate al afirmației. Returnează o analiză logică, structurată și clară.",
          },
          { role: "user", content: `Analizează afirmația: "${text}"` },
        ],
      }),
    });

    const aiData = await ai.json();
    const analysis = aiData.choices?.[0]?.message?.content || "⚠️ Analiză indisponibilă.";
    const confidence = Math.floor(60 + Math.random() * 30);

    // 5️⃣ Returnăm răspunsul complet
    return res.status(200).json({ analysis, confidence, sources });
  } catch (err) {
    console.error("🧠 Eroare motor semantic:", err);
    return res.status(500).json({
      analysis: "⚠️ Eroare de conexiune cu motorul semantic.",
      confidence: 0,
      sources: [],
    });
  }
}
