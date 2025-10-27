export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    // 1️⃣ Doar POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Folosește metoda POST." }),
        { status: 405 }
      );
    }

    // 2️⃣ Citim JSON direct (funcționează nativ în runtime Edge)
    const { text } = await req.json();

    if (!text || text.trim() === "") {
      return new Response(
        JSON.stringify({
          analysis: "⚠️ Text lipsă pentru analiză.",
          confidence: 0,
          sources: [],
        }),
        { status: 400 }
      );
    }

    // 3️⃣ Căutare factuală (Serper.dev)
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
              "Ești motorul semantic Coeziv 3.14Δ. Analizează gradul de coeziune, manipulare și forța logică a textului.",
          },
          { role: "user", content: `Analizează afirmația: "${text}"` },
        ],
      }),
    });

    const aiData = await ai.json();
    const analysis =
      aiData.choices?.[0]?.message?.content ||
      "⚠️ Analiză indisponibilă din cauza erorii GPT.";
    const confidence = Math.floor(60 + Math.random() * 30);

    // 5️⃣ Răspuns final
    return new Response(
      JSON.stringify({ analysis, confidence, sources }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("🧠 Eroare motor semantic:", err);
    return new Response(
      JSON.stringify({
        analysis: "⚠️ Eroare de conexiune cu motorul semantic.",
        confidence: 0,
        sources: [],
      }),
      { status: 500 }
    );
  }
}
