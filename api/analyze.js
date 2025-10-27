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

    // === 1️⃣ Căutare factuală Serper.dev în surse verificate ===
    const trustedQuery = `${text} site:romania.europalibera.org OR site:hotnews.ro OR site:digi24.ro OR site:antena3.ro OR site:adevărul.ro`;

    let serperRes = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: trustedQuery,
        num: 10,
        gl: "ro",
        hl: "ro",
      }),
    });

    let data = await serperRes.json();
    let sources = (data.news || []).filter(
      s =>
        s.title &&
        !/zgomote|glum|pamflet|ironic/i.test(s.title) &&
        !/mormânt|CTP/i.test(s.title)
    ).map(s => ({
      title: s.title,
      link: s.link,
      date: s.date || "",
      snippet: s.snippet || "",
    }));

    // === 2️⃣ Fallback dacă nu găsește nimic ===
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
      sources = (webData.organic || []).filter(
        s =>
          s.title &&
          !/zgomote|glum|pamflet|ironic/i.test(s.title)
      ).map(s => ({
        title: s.title,
        link: s.link,
        date: s.date || "",
        snippet: s.snippet || "",
      }));
    }

    // === 3️⃣ Construim contextul pentru GPT ===
    const contextText = sources
      .slice(0, 5)
      .map((s) => `• ${s.title} (${s.date}) — ${s.snippet}`)
      .join("\n");

    const prompt = `
Evaluează factual și semantic afirmația următoare, folosind contextul de mai jos.

🔹 Afirmație: "${text}"
🔹 Surse disponibile:
${contextText}

Dacă sursele confirmă explicit afirmația, marchează-o ca ✅ adevărată și dă un scor apropiat de 3.14.
Dacă o infirmă clar, marchează ❌ falsă (scor 0.0–0.5).
Dacă sursele sunt vagi sau indirecte, marchează ⚠️ probabilă (scor 1.0–2.0).

Returnează textul final în format clar și scurt:
„Verdict: ... Scor: X / 3.14 Explicație: ...”
`;

    // === 4️⃣ Analiză GPT ===
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

    // === 5️⃣ Răspuns complet ===
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
