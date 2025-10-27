import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const { text } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({
          analysis: "⚠️ Introdu un text pentru analiză.",
          confidence: 0,
          sources: [],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 🔍 Căutare factuală reală prin Jina AI (text complet, simplu și stabil)
    const jinaUrl = `https://r.jina.ai/search?q=${encodeURIComponent(text + " site:.ro OR site:.com OR site:.org")}`;
    const searchResponse = await fetch(jinaUrl);
    let searchResults = [];

    if (searchResponse.ok) {
      const data = await searchResponse.json();
      // Jina returnează obiecte cu title + url
      if (Array.isArray(data.data)) {
        searchResults = data.data
          .filter((r) => r.title && r.url)
          .slice(0, 3)
          .map((r) => ({
            title: r.title,
            url: r.url,
          }));
      }
    }

    // 🔬 Analiză semantică GPT
    const prompt = `
Analizează afirmația: "${text}" folosind Formula Coeziv 3.14Δ.
Include:
1. Δ (diferența logică)
2. Fc (forța coeziunii)
3. Gradul de Manipulare (%)
4. Raționament final + Indice global de încredere.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ești un analist semantic factual (motorul Coeziv 3.14Δ)." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
    });

    const aiAnalysis = completion.choices[0].message.content.trim();

    // 🔢 Extragem procentul de încredere din analiză
    const match = aiAnalysis.match(/(\d{1,3})%/);
    const confidenceScore = match ? parseInt(match[1]) : 65;

    // 🧩 Surse factuale curate
    const sources =
      searchResults.length > 0
        ? searchResults
        : [{ title: "Nicio sursă factuală relevantă găsită.", url: "#" }];

    // ✅ Returnăm răspunsul
    return new Response(
      JSON.stringify({
        analysis: aiAnalysis,
        confidence: confidenceScore,
        sources,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Eroare analiză:", err);
    return new Response(
      JSON.stringify({
        analysis: "⚠️ Eroare internă a motorului semantic.",
        confidence: 0,
        sources: [],
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
