// /app/api/analyze/route.js
import { NextResponse } from "next/server";

export async function POST(req) {
  const { text } = await req.json();
  if (!text || text.length < 3)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // --- 1. Căutare factuală via Serper.dev ---
  const serperRes = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: text, num: 10 }),
  });

  const serperData = await serperRes.json();
  const sources = (serperData.organic || []).slice(0, 5).map(s => ({
    title: s.title,
    link: s.link,
    snippet: s.snippet,
  }));

  // dacă nu sunt suficiente surse, suspendăm analiza
  if (sources.length < 3) {
    return NextResponse.json({
      verdict: "⚠️ Analiză suspendată – insuficiente surse factuale (minim 3 necesare).",
      score: 0,
      interpretation: "Motorul nu a găsit suficiente surse relevante.",
      sources,
    });
  }

  // --- 2. Analiză semantică GPT ---
  const prompt = `
Evaluează factualitatea afirmației de mai jos pe baza următoarelor surse web:
${sources.map(s => `- ${s.title}: ${s.snippet}`).join("\n")}

Afirmație: "${text}"

Returnează un JSON cu următoarele câmpuri:
{
  "score": între 0 și 3.14,
  "verdict": "coeziv" | "parțial" | "incoerent",
  "interpretation": "descriere scurtă (în limba română)"
}`;

  const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await gptRes.json();
  let parsed;
  try {
    parsed = JSON.parse(data.choices[0].message.content);
  } catch {
    parsed = { score: 0, verdict: "incoerent", interpretation: "Eroare la analiză GPT." };
  }

  return NextResponse.json({ ...parsed, sources });
}
