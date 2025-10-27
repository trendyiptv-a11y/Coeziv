import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("."));

app.post("/analyze", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Lipsă text" });

    const serper = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: text, num: 10 })
    });
    const serperData = await serper.json();
    const sources = (serperData.organic || []).slice(0, 5);

    const prompt = `
Evaluează factualitatea afirmației:
"${text}"
Pe baza surselor:
${sources.map(s => `- ${s.title}: ${s.snippet}`).join("\n")}
Răspunde JSON:
{ "score": 0–3.14, "verdict": "coeziv"|"parțial"|"incoerent", "interpretation": "scurtă explicație" }
`;

    const gpt = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const gptData = await gpt.json();
    let parsed;
    try {
      parsed = JSON.parse(gptData.choices[0].message.content);
    } catch {
      parsed = { score: 0, verdict: "incoerent", interpretation: "Eroare GPT" };
    }

    res.json({ ...parsed, sources });
  } catch (e) {
    res.status(500).json({ error: "Eroare server" });
  }
});

app.listen(3000, () => console.log("✅ Motor Coeziv 3.14Δ activ pe http://localhost:3000"));
