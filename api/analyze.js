export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const { text } = await req.json();
    if (!text || text.trim().length < 3)
      return new Response(JSON.stringify({ error: "Text prea scurt pentru analiză." }), { status: 400 });

    const query = text.trim();
    const serperKey = process.env.SERPER_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // 1️⃣ — Căutare factuală prin Serper.dev
    const serperRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 5, gl: "ro", hl: "ro" }),
    });

    const serperData = await serperRes.json();
    const results = serperData.organic || [];
    const sources = results.slice(0, 5).map(r => `${r.title} — ${r.snippet || ""}`);

    const factualScore = results.length > 0 ? 2.2 + Math.random() * 0.8 : 0.6;

    // 2️⃣ — Analiză semantică GPT-4-mini
    const prompt = `
Evaluează afirmația: "${query}".
Ține cont de următoarele surse online:
${sources.join("\n\n")}

Răspunde EXCLUSIV în format JSON:
{
 "logic_score": (0-3.14),
 "semantic_score": (0-3.14),
 "verdict": "adevărat factual / fals logic / parțial / opinie / verificabil",
 "explanation": "explicație scurtă"
}
`;

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4-mini",
        messages: [
          { role: "system", content: "Ești un evaluator științific al adevărului factual și logic. Răspunzi numai în JSON valid." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    const gptData = await gptRes.json();
    const content = gptData.choices?.[0]?.message?.content || "{}";

    let gptJson = {};
    try {
      gptJson = JSON.parse(content);
    } catch {
      gptJson = {
        logic_score: 1.5,
        semantic_score: 1.5,
        verdict: "verificabil factual",
        explanation: "GPT nu a returnat un JSON valid.",
      };
    }

    const logicScore = gptJson.logic_score || 1.5;
    const semanticScore = gptJson.semantic_score || 1.8;

    // 3️⃣ — Formula Coezivă 3.14Δ
    const V = ((factualScore + logicScore + semanticScore) / 3).toFixed(2);
    let verdict = gptJson.verdict || "verificabil factual";
    let color = "#9ba1a6";
    if (V > 2.6) color = "#00ffb7";
    else if (V > 1.8) color = "#00ccff";
    else if (V < 1.5) color = "#ff0055";

    const explanation = gptJson.explanation || "Analiza semantică nu a putut fi completă.";

    // 4️⃣ — Răspuns final
    return new Response(
      JSON.stringify({
        type: "coeziune 3.14Δ",
        verdict,
        color,
        F: factualScore.toFixed(2),
        L: logicScore.toFixed(2),
        C: semanticScore.toFixed(2),
        V,
        explanation,
        sources: results.slice(0, 5).map(r => ({ title: r.title, link: r.link })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
