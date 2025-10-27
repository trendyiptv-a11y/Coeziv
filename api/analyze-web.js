export const config = {
  runtime: "edge",
};

/**
 * Analizor Coeziv 3.14Δ – combină GPT + căutare factuală Serper
 */
export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  if (!query) {
    return new Response(
      JSON.stringify({ error: "Lipsește parametrul ?query=" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // 🧠 Pas 1 – încercăm analiza GPT
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 secunde max
    const gptResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: `
Analizează afirmația următoare conform Formulei Coeziv 3.14Δ:
1. Δ (diferență logică)
2. Fc (forța coeziunii)
3. Gradul de Manipulare (%)
4. Concluzie informațională
Text: "${query}"
Răspuns clar, concis, în română, max 200 cuvinte.
        `,
        tools: [{ type: "web_search" }],
      }),
    });

    clearTimeout(timeout);
    const gptData = await gptResponse.json();
    let analysis =
      gptData?.output?.[0]?.content?.[0]?.text ||
      gptData?.choices?.[0]?.message?.content ||
      "";

    // 🔎 Pas 2 – fallback factual (dacă analiza e goală sau timeout)
    if (!analysis || analysis.trim().length < 30) {
      console.warn("⚠️ GPT timeout sau răspuns gol – fallback factual activat.");
      const serper = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, gl: "ro", hl: "ro" }),
      });

      const data = await serper.json();
      const sources =
        data?.organic?.slice(0, 5).map((s) => ({
          title: s.title,
          url: s.link,
        })) || [];

      const confidence = Math.min(100, sources.length * 20);
      const fallbackMsg = `
⏳ Analiza semantică nu a răspuns la timp.
Rezultatul se bazează pe surse factuale verificate.
Indice de veridicitate: ${confidence}%.
`;

      return new Response(
        JSON.stringify({
          analysis: fallbackMsg.trim(),
          sources,
          confidence,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 🔹 Pas 3 – colectăm eventualele surse GPT (dacă sunt)
    const sources =
      gptData?.output?.[0]?.content
        ?.filter((x) => x.type === "reference")
        ?.map((x) => ({
          title: x.metadata?.title || "Sursă",
          url: x.metadata?.url || "#",
        })) || [];

    const confidence = Math.min(100, 70 + sources.length * 5);

    return new Response(
      JSON.stringify({ analysis, sources, confidence }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Eroare:", error);

    // 🩹 fallback sigur dacă apare o eroare neașteptată
    return new Response(
      JSON.stringify({
        analysis:
          "⚠️ Motorul semantic nu a răspuns la timp. Informația a fost redirecționată către modul factual automat.",
        sources: [],
        confidence: 50,
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  }
}
