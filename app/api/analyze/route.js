// /app/api/analyze/route.js
import { NextResponse } from "next/server";

export const maxDuration = 10; // limita de execuție (Vercel Edge)

export async function POST(req) {
  try {
    const { text } = await req.json();
    if (!text || text.length < 3)
      return NextResponse.json({ error: "Input invalid." }, { status: 400 });

    // --- 1. Căutare factuală prin Serper.dev ---
    const serperRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: text, num: 10 }),
    });

    if (!serperRes.ok)
      return NextResponse.json({
        verdict: "eroare",
        score: 0,
        interpretation: "Eroare la conexiunea cu Serper.dev.",
        sources: [],
      });

    const serperData = await serperRes.json();
    const sources = (serperData.organic || []).slice(0, 5).map(s => ({
      title: s.title,
      link: s.link,
      snippet: s.snippet,
    }));

    if (sources.length < 3) {
      return NextResponse.json({
        verdict: "suspendat",
        score: 0,
        interpretation:
          "Analiză suspendată – insuficiente surse factuale (minim 3 necesare).",
        sources,
      });
    }

    // --- 2. Analiză factual-semantică GPT ---
    const prompt = `
Evaluează factualitatea afirmației de mai jos pe baza următoarelor surse web:

${sources.map(s => `- ${s.title}: ${s.snippet}`).join("\n")}

Afirmație: "${text}"

Returnează strict JSON:
{
  "score": (număr între 0 și 3.14),
  "verdict": "coeziv" | "parțial" | "incoerent",
  "interpretation": "scurtă explicație în română"
}
`;

    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const gptData = await gptRes.json();

    let parsed = {};
    try {
      parsed = JSON.parse(gptData.choices?.[0]?.message?.content || "{}");
    } catch {
      parsed = {};
    }

    // fallback dacă GPT a eșuat
    if (!parsed.verdict) {
      parsed = {
        score: 0,
        verdict: "incoerent",
        interpretation: "Analiză indisponibilă – eroare de răspuns GPT.",
      };
    }

    // normalizare valori
    parsed.score = Math.min(Math.max(Number(parsed.score || 0), 0), 3.14);
    parsed.sources = sources;

    return NextResponse.json(parsed, { status: 200 });
  } catch (err) {
    console.error("Eroare Coeziv 3.14Δ:", err);
    return NextResponse.json(
      {
        verdict: "eroare",
        score: 0,
        interpretation: "Eroare internă în analiza Coeziv 3.14Δ.",
        sources: [],
      },
      { status: 500 }
    );
  }
}
