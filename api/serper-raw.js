// /api/serper-raw.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { query } = await req.json?.() || req.body || {};
    if (!query) {
      return res.status(400).json({ error: "Missing query text" });
    }

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 10,
        gl: "ro",
        hl: "ro",
      }),
    });

    const data = await response.json();

    return res.status(200).json({
      query,
      raw: data,
    });

  } catch (error) {
    console.error("Eroare Serper RAW:", error);
    return res.status(500).json({ error: "Eroare de conexiune cu Serper.dev" });
  }
}
