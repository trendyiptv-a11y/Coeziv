import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    const { text } = req.body;
    if (!text || text.trim().length === 0)
      return res.status(400).json({ error: "Text lipsă pentru analiză." });

    // 1️⃣ — Căutare factuală reală prin Serper.dev
    const query = text.trim();
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });

    const data = await response.json();
    const results = data.organic || [];

    // 2️⃣ — Extragem sursele relevante
    const sources = results
      .map((r) => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link,
      }))
      .filter((r) => r.title && r.snippet)
      .slice(0, 5);

    // 3️⃣ — Prag minim de 3 surse
    if (sources.length < 3) {
      return res.status(200).json({
        status: "insuficiente_surse",
        verdictColor: "⚠️",
        verdictText:
          "Analiză suspendată – insuficiente surse factuale (minim 3 necesare).",
        trustIndex: 0,
        sources,
      });
    }

    // 4️⃣ — Analiză semantică reală cu GPT-4o-mini
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `
Evaluează afirmația conform Formulei Coezive 3.14Δ:
Δ = diferență logică, Fc = forță a coeziunii, Mp = grad de manipulare.
Include o concluzie scurtă și un indice de încredere între 0 și 100.

Afirmația: "${text}"

Surse factuale:
${sources.map((s, i) => `${i + 1}. ${s.title} – ${s.link}`).join("\n")}
`;

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ești un analist informațional neutru." },
        { role: "user", content: prompt },
      ],
    });

    const analysis = aiResponse.choices[0].message.content;

    // 5️⃣ — Determinare culoare verdict
    const extractTrust = analysis.match(/(\d{1,3})%/);
    const trustIndex = extractTrust
      ? Math.min(parseInt(extractTrust[1]), 100)
      : 50;

    let verdictColor = "🟨";
    let verdictText = "Risc moderat de manipulare – recomandăm verificare suplimentară.";

    if (trustIndex >= 75) {
      verdictColor = "🟩";
      verdictText = "Informație verificată – grad redus de manipulare.";
    } else if (trustIndex <= 40) {
      verdictColor = "🟥";
      verdictText = "Grad ridicat de manipulare – necesită confirmare factuală.";
    }

    // 6️⃣ — Returnăm rezultat complet
    return res.status(200).json({
      status: "ok",
      verdictColor,
      verdictText,
      trustIndex,
      analysis,
      sources,
    });
  } catch (err) {
    console.error("Eroare motor Coeziv:", err);
    return res.status(500).json({
      status: "error",
      verdictColor: "⚠️",
      verdictText: "Eroare internă în motorul semantic.",
      trustIndex: 0,
      analysis: "",
      sources: [],
    });
  }
}
