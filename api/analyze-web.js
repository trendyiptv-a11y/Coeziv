export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") || "";

  if (!query)
    return new Response(JSON.stringify({ error: "Missing query parameter" }), {
      status: 400,
    });

  try {
    // 🔹 Pasul 1: Încercăm analiza GPT cu browsing
    const gptResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: `
          Analizează afirmația următoare conform Formulei Coeziv 3.14Δ.
          1. Δ (diferență logică)
          2. Fc (forța coeziunii)
          3. Gradul de Manipulare (%)
          4. Concluzie informațională
          Text: "${query}"
          Răspunsul trebuie să fie structurat clar, concis și în limba română.
        `,
        tools: [{ type: "web_search" }],
      }),
    });

    const gptData = await gptResponse.json();
    let analysisText =
      gptData?.output?.[0]?.content?.[0]?.text ||
      gptData?.choices?.[0]?.message?.content ||
      "";

    // 🔸 Pasul 2: fallback – dacă GPT nu a dat conținut coerent
    if (!analysisText || analysisText.trim().length < 30) {
      console.log("⚠️ Fallback activat: căutare factuală web");

      const serperRes = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query }),
      });

      const serperData = await serperRes.json();
      const sources =
        serperData?.organic?.slice(0, 5).map((item) => ({
          title: item.title,
          url: item.link,
        })) || [];

      return new Response(
        JSON.stringify({
          analysis:
            "Nicio analiză semantică disponibilă momentan. Au fost totuși identificate surse factuale relevante.",
          sources,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 🔹 Pasul 3: dacă analiza GPT a reușit, extragem și sursele din browsing
    const sources =
      gptData?.output?.[0]?.content
        ?.filter((x) => x.type === "reference")
        ?.map((x) => ({
          title: x.metadata?.title || "Sursă",
          url: x.metadata?.url || "#",
        })) || [];

    return new Response(JSON.stringify({ analysis: analysisText, sources }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Eroare analiză:", err);
    return new Response(
      JSON.stringify({ error: "Eroare la analiza GPT sau websearch." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
