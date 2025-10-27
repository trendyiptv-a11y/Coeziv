import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const { text } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({
        analysis: "⚠️ Introdu un text pentru analiză.",
        confidence: 0,
        sources: []
      }), { status: 400 });
    }

    // 🔍 Căutare factuală cu Serper.dev
    const searchResponse = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: text, gl: "ro", hl: "ro", num: 5 }),
    });

    let sources = [];
    if (searchResponse.ok) {
      const data = await searchResponse.json();
      if (Array.isArray(data.organic)) {
        sources = data.organic.slice(0, 5).map((r) => ({
          title: r.title,
          url: r.link,
        }));
      }
    }

    // 🧱 Filtru de siguranță — fără 3 surse, nu se emite verdict
    if (!sources || sources.length < 3) {
      return new Response(
        JSON.stringify({
          analysis:
            "⚠️ Analiză suspendată – insuficiente surse factuale (minim 3 necesare pentru verdict).",
          confidence: 0,
          sources: sources.length ? sources : [
            { title: "Nicio sursă factuală relevantă găsită.", url: "#" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 🧠 Analiză semantică Coeziv 3.14Δ
    const prompt = `
Analizează afirmația: "${text}" prin Formula Coeziv 3.14Δ.
Include:
1. Δ (diferența logică)
2. Fc (forța coeziunii)
3. Grad de manipulare (%)
4. Raționament final + Indice global de încredere.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ești motorul Coeziv 3.14Δ, analist semantic factual." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
    });

    const analysis = completion.choices[0].message.content.trim();
    const match = analysis.match(/(\d{1,3})%/);
    const confidence = match ? parseInt(match[1]) : 50;

    return new Response(
      JSON.stringify({ analysis, confidence, sources }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Eroare:", err);
    return new Response(
      JSON.stringify({
        analysis: "⚠️ Eroare internă motor semantic.",
        confidence: 0,
        sources: [],
      }),
      { status: 500 }
    );
  }
}
