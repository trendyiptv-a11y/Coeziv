import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    const { textDeAnalizat } = req.body || {};
    if (!textDeAnalizat) {
      return res.status(400).json({ success: false, error: "Lipsește textul de analizat." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 🔹 Pas 1. Analiză semantică GPT-5 (Formula 3.14Δ)
    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `
          Ești un analizator factual și semantic. Pentru textul primit, oferă:
          - valoarea Δ (vibrația semantică)
          - coeficientul Fc (coeziune logică)
          - procentul manipulare (%)
          - verdict textual (Veridic, Ambiguu, Dezinformare)
          - un rezumat explicativ coerent și concis.
          Formatează rezultatul clar, ușor de extras numeric.`,
        },
        { role: "user", content: textDeAnalizat },
      ],
    });

    const raw = completion.choices[0].message.content || "";

    // 🔹 Extragem valorile numerice
    const delta = parseFloat(raw.match(/Δ[:=]?\s*([\d.,]+)/)?.[1] || 3.14);
    const fc = parseFloat(raw.match(/Fc[:=]?\s*([\d.,]+)/)?.[1] || 3.14);
    const manip = parseFloat(raw.match(/manipul[a-z]*[:=]?\s*([\d.,]+)/i)?.[1] || 0);
    const rezumat = raw;

    // 🧠 Pas 2. Generăm query factual în engleză pentru GDELT
    const simplificat = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content:
            "Extract 5–10 relevant English keywords for factual news search from this text. Use only plain keywords, no punctuation.",
        },
        { role: "user", content: textDeAnalizat },
      ],
    });

    const query = encodeURIComponent(simplificat.choices[0].message.content);
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&format=json`;

    // 🌍 Pas 3. Căutare GDELT
    let surse = [];
    let factualStatus = "Neconfirmat";

    try {
      const gdeltRes = await fetch(gdeltUrl);
      if (gdeltRes.ok) {
        const data = await gdeltRes.json();
        if (data?.articles?.length > 0) {
          factualStatus = "Confirmat";
          surse = data.articles
            .filter(a => a.title && a.url)
            .slice(0, 3)
            .map(a => ({
              title: a.title,
              url: a.url,
              source: a.domain || a.source || "necunoscut",
            }));
        }
      }
    } catch (err) {
      factualStatus = "Eroare verificare factuală";
    }

    // 🔹 Răspuns final
    return res.status(200).json({
      success: true,
      rezultat: {
        delta,
        fc,
        manipulare: manip,
        text: rezumat,
        factualStatus,
        surse,
      },
    });
  } catch (error) {
    console.error("Eroare API GPT:", error);
    return res.status(500).json({ success: false, error: "Eroare internă GPT sau GDELT." });
  }
}
