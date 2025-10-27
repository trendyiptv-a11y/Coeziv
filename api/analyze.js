export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Metodă neacceptată" });

    const { text } = req.body;
    if (!text || text.length < 2)
      return res.status(400).json({ error: "Input invalid" });

    // --- Detectare tip afirmație ---
    const type = detectType(text);

    // Logice / matematice
    if (type === "logică") {
      return res.status(200).json({
        verdict: "✅ adevărată logic",
        score: 3.14,
        explanation: `Afirmația „${text}” este o propoziție logică/matematică universal adevărată.`,
        type,
        sources: []
      });
    }

    // Conceptuale
    if (type === "conceptuală") {
      return res.status(200).json({
        verdict: "💭 interpretativă",
        score: 1.57,
        explanation: `Afirmația „${text}” este conceptuală și ține de interpretare, nu de verificare factuală.`,
        type,
        sources: []
      });
    }

    // --- Căutare factuală via Serper.dev ---
    const serperRes = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: text, gl: "ro", hl: "ro", num: 10 })
    });

    if (!serperRes.ok) {
      return res.status(500).json({ error: "Eroare Serper.dev" });
    }

    const serperData = await serperRes.json();
    const sources = (serperData.organic || []).slice(0, 10).map(s => ({
      title: s.title,
      link: s.link,
      snippet: s.snippet || "",
      date: s.date || ""
    }));

    // --- Evaluare GPT ---
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
              "Ești un motor de verificare factuală și semantică. Returnează un verdict, scor (0–3.14) și o explicație clară, bazat pe surse."
          },
          {
            role: "user",
            content: `Afirmația: ${text}\nSurse:\n${sources.map(s => `- ${s.title}`).join("\n")}`
          }
        ]
      })
    });

    const gptData = await gptRes.json();
    const content = gptData?.choices?.[0]?.message?.content || "Eroare GPT";

    return res.status(200).json({
      verdict: content,
      score: content.includes("adevărat") ? 3.14 : content.includes("probabil") ? 1.5 : 0,
      explanation: content,
      type,
      sources
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Eroare internă", details: err.message });
  }
}

// --- mic helper ---
function detectType(text) {
  text = text.toLowerCase();
  if (/[0-9+\-*/=<>]/.test(text)) return "logică";
  if (/\b(ion|binance|românia|sua|președinte|ministru|ftx|crypto|anul)\b/.test(text)) return "factuală";
  if (/\b(libertate|adevăr|suflet|credință|viață|dreptate)\b/.test(text)) return "conceptuală";
  return "neclară";
}
