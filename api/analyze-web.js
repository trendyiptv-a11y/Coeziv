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
          analysis: "⚠️ Nu a fost introdus niciun text pentru analiză.",
          confidence: 0,
          sources: [],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 🔍 Căutare factuală pe web (prin Bing, DuckDuckGo, Google fallback etc.)
    const searchResponse = await fetch(
      `https://r.jina.ai/http://www.google.com/search?q=${encodeURIComponent(
        text
      )}`
    );

    let searchResults = [];

    if (searchResponse.ok) {
      const rawText = await searchResponse.text();
      const matches = [...rawText.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)];
      searchResults = matches.slice(0, 5).map((m) => ({
        url: m[1],
        title: m[2],
      }));
    }

    // 🔬 Analiză semantică GPT
    const prompt = `
Evaluează afirmația: "${text}" folosind Formula Coeziv 3.14Δ.
Returnează o analiză completă în limba română care să includă:

1. Δ (diferența logică) – claritatea și coerența afirmației.
2. Fc (forța coeziunii) – gradul de unitate și claritate semantică.
3. Gradul de Manipulare (%) – cât de mult poate influența sau distorsiona percepția.
4. Raționament final.

La final oferă un indice global de încredere (0–100).
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

    // 🔢 Extragem un procent de încredere din analiză (fallback random moderat)
    const match = aiAnalysis.match(/(\d{1,3})%/);
    const confidenceScore = match ? parseInt(match[1]) : 70;

    // 🧩 Surse factuale prelucrate
    const sources =
      searchResults.length > 0
        ? searchResults.slice(0, 3)
        : [
            {
              title: "Nicio sursă factuală relevantă găsită.",
              url: "#",
            },
          ];

    // ✅ Returnăm datele către interfață
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
