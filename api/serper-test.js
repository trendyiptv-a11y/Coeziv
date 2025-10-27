// /api/serper-test.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Lipsă text" });

    // 1️⃣ Mai întâi încercăm în știri recente
    let serperRes = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: text,
        num: 10,
        tbs: "qdr:w",
        gl: "ro",
        hl: "ro",
      }),
    });

    let data = await serperRes.json();
    let results = (data.news || []).map((s) => ({
      title: s.title,
      link: s.link,
      source: s.source,
      date: s.date,
      snippet: s.snippet,
    }));

    // 2️⃣ Dacă nu există rezultate în știri, căutăm pe web general
    if (!results.length) {
      serperRes = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: text,
          num: 10,
          gl: "ro",
          hl: "ro",
        }),
      });

      data = await serperRes.json();
      results = (data.organic || []).map((s) => ({
        title: s.title,
        link: s.link,
        source: s.source || s.domain,
        date: s.date || "",
        snippet: s.snippet,
      }));
    }

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
