// /api/analyze.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = await req.json?.() || req.body || {};
    if (!text || text.length < 3) {
      return res.status(400).json({ error: "Text insuficient" });
    }

    // --- 1️⃣ Căutare factuală Serper.dev (știri + fallback web general)
    let serperRes = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: text,
        num: 10,
        tbs: "qdr:m", // ultimele 30 zile
        gl: "ro",
        hl: "ro",
      }),
    });

    let data = await serperRes.json();
    let sources = (data.news || []).map((s) => ({
      title: s.title,
      link: s.link,
      date: s.date || "",
      snippet: s.snippet || "",
    }));

    if (!sources.length) {
      const webRes = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: text, num: 10, gl: "ro", hl: "ro" }),
      });
      const webData = await webRes.json();
      sources = (webData.organic || []).map((s) => ({
        title: s.title,
        link: s.link,
        date: s.date || "",
        snippet: s.snippet || "",
      }));
    }

    // --- 2️⃣ Analiză semantică GPT (Formula Coezivă 3.14Δ)
    const contextText = sources
      .slice(0, 5)
      .map((s) => `• ${s.title} (${s.date}) — ${s.snippet}`)
      .join("\n");

    const prompt = `
Analizează factual și semantic afirmația de mai jos.

🔹 Afirmație: "${text}"
🔹 Surse recente:
${contextText}

Evaluează dacă afirmația este:
1. ✅ adevărată,
2. ⚠️ probabilă / parțial adevărată,
3. ❌ falsă.

Returnează un scurt verdict coerent în limba română, cu scor pe o scară 0–3.14 și un mesaj scurt explicativ.
`;

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

    const gptData = await gptRes.json();
    const answer = gptData.choices?.[0]?.message?.content || "Eroare GPT";

    // --- 3️⃣ Returnăm rezultatul complet
    return res.status(200).json({
      statement: text,
      verdict: answer,
      sources,
      sourceCount: sources.length,
    });

  } catch (error) {
    console.error("Eroare analiza Coeziv 3.14Δ:", error);
    return res.status(500).json({ error: "Eroare server analiză Coeziv 3.14Δ" });
  }
}
