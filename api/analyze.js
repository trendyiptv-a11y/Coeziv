import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// --- 🔹 Clasificator de tip de afirmație ---
function detectStatementType(text) {
  text = text.toLowerCase();

  // Logice / matematice
  if (/[0-9+\-*/=<>]/.test(text) || text.includes("este adevărat") || text.includes("egal"))
    return "logică";

  // Factuale (persoane, locuri, organizații, evenimente)
  if (/\b(ion|binance|românia|sua|nato|minister|președinte|prim|guvern|cnn|bbc|ftx|crypto|anul|august|ianuarie|martie|noiembrie|decembrie)\b/.test(text))
    return "factuală";

  // Conceptuale / filozofice
  if (/\b(libertate|adevăr|democrație|suflet|credință|viață|moarte|iubire|dreptate|putere|coeziune|energie)\b/.test(text))
    return "conceptuală";

  return "neclară";
}

// --- 🔹 Endpoint principal ---
app.post("/analyze", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 2)
      return res.status(400).json({ error: "Input invalid" });

    const statementType = detectStatementType(text);
    console.log("Tip detectat:", statementType);

    // 🔸 Caz logic – evaluare internă
    if (statementType === "logică") {
      return res.json({
        verdict: "✅ adevărată logic",
        score: 3.14,
        explanation: `Afirmația „${text}” aparține domeniului logic/matematic și este universal adevărată.`,
        type: statementType,
        sources: []
      });
    }

    // 🔸 Caz conceptual – interpretativ
    if (statementType === "conceptuală") {
      return res.json({
        verdict: "💭 interpretativă",
        score: 1.57,
        explanation: `Afirmația „${text}” este conceptuală și ține de interpretare, nu de verificare factuală.`,
        type: statementType,
        sources: []
      });
    }

    // 🔸 Cazuri factuale – interogare Serper.dev
    const serperRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: text, gl: "ro", hl: "ro", num: 10 })
    });

    if (!serperRes.ok) {
      return res.status(500).json({
        verdict: "❌ eroare factuală",
        explanation: "Eroare la interogarea Serper.dev",
        details: await serperRes.text()
      });
    }

    const serperData = await serperRes.json();
    const sources = (serperData.organic || []).slice(0, 10).map(s => ({
      title: s.title,
      link: s.link,
      snippet: s.snippet || "",
      date: s.date || "",
    }));

    // 🔸 Analiză semantică GPT (folosește contextul din surse)
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Ești un motor de analiză factuală și semantică. Evaluează afirmația dată pe baza surselor și decide dacă este adevărată, falsă sau probabilă. Returnează un verdict, scor 0–3.14 și o explicație clară."
          },
          {
            role: "user",
            content: `Afirmația: ${text}\n\nSurse:\n${sources.map(s => `- ${s.title} (${s.link})`).join("\n")}`
          }
        ]
      })
    });

    const gptData = await gptRes.json();
    const verdictText = gptData?.choices?.[0]?.message?.content || "Eroare GPT";

    res.json({
      verdict: verdictText,
      score: verdictText.includes("adevărat") ? 3.14 : verdictText.includes("probabil") ? 1.5 : 0,
      explanation: verdictText,
      type: statementType,
      sources
    });

  } catch (err) {
    console.error("Eroare analiză:", err);
    res.status(500).json({ error: "Eroare internă de server", details: err.message });
  }
});

app.listen(3000, () => console.log("✅ Coeziv 3.14Δ activ pe portul 3000"));
