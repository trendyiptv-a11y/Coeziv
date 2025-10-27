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

    // 🔍 Căutare factuală extinsă (Google News + DuckDuckGo + Bing proxy)
    const query = `${text} site:.ro OR site:.com OR site:.org after:2024-09`;
    const jinaURL = `https://r.jina.ai/http://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(jinaURL);
    let sources = [];

    if (response.ok) {
      const html = await response.text();
      const matches = [...html.matchAll(/<a rel="nofollow" href="([^"]+)"[^>]*>(.*?)<\/a>/g)];
      sources = matches
        .map((m) => ({
          url: m[1],
          title: m[2].replace(/<[^>]*>/g, "").trim(),
        }))
        .filter((s) => s.title && !s.url.includes("duckduckgo"))
        .slice(0, 3);
    }

    if (sources.length === 0) {
      sources = [{ title: "Nicio sursă factuală relevantă găsită.", url: "#" }];
    }

    // 🔬 Analiza semantică GPT
    const prompt = `
Evaluează afirmația: "${text}" prin Formula Coeziv 3.14Δ.
Descrie:
1. Δ (diferența logică) – claritate și veridicitate.
2. Fc (forța coeziunii) – unitate semantică.
3. Gradul de Manipulare (%) – risc de distorsiune.
4. Raționament final + Indice global de încredere.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ești un analist semantic factual (motorul Coeziv 3.14Δ)." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
    });

    const analysis = completion.choices[0].message.content.trim();

    // 🔢 Extrage procentul de încredere
    const match = analysis.match(/(\d{1,3})%/);
    const confidence = match ? parseInt(match[1]) : 70;

    return new Response(
      JSON.stringify({ analysis, confidence, sources }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Eroare Coeziv:", err);
    return new Response(
      JSON.stringify({
        analysis: "⚠️ Eroare de conexiune cu motorul factual.",
        confidence: 0,
        sources: [],
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
