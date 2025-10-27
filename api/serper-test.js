// /api/serper-test.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Lipsă text" });

    // 🔎 Interogare directă în știri recente (ultimele 7 zile)
    const serperRes = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: text,
        num: 10,
        tbs: "qdr:w", // ultima săptămână
        gl: "ro",
        hl: "ro",
      }),
    });

    const data = await serperRes.json();

    // extragem doar ce e relevant
    const results = (data.news || []).map((s) => ({
      title: s.title,
      link: s.link,
      source: s.source,
      date: s.date,
      snippet: s.snippet,
    }));

    return res.status(200).json({
      query: text,
      total: results.length,
      results,
    });
  } catch (err) {
    console.error("Eroare la test Serper:", err);
    return res.status(500).json({ error: "Eroare de conexiune la Serper.dev" });
  }
}
