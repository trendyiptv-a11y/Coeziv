export const config = {
  runtime: "edge",
};

/**
 * Endpoint factual pentru Coeziv 3.14Δ
 * Returnează surse factuale relevante folosind Serper.dev (Google Search API)
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
    // 🔍 Căutare factuală pe Google via Serper.dev
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 6,
        gl: "ro",
        hl: "ro",
        location: "Romania",
      }),
    });

    const data = await response.json();

    // 📚 Extragem doar linkuri verificate
    const sources =
      data?.organic
        ?.filter((r) =>
          /(reuters\.com|bbc\.com|apnews\.com|hotnews\.ro|wikipedia\.org|agerpres\.ro|cnn\.com|euronews\.com)/i.test(
            r.link
          )
        )
        .slice(0, 5)
        .map((r) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet,
        })) || [];

    if (sources.length === 0) {
      return new Response(
        JSON.stringify({
          sources: [],
          message: "Nicio sursă factuală relevantă găsită.",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ sources }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Eroare factual:", err);
    return new Response(
      JSON.stringify({
        error: "Eroare la conectarea cu motorul factual.",
        details: err.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
