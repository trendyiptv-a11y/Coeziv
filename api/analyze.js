import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { textDeAnalizat } = req.body;
    const rezultat = {
      surse: [],
      factualStatus: "Neconfirmat",
    };

    // === 1️⃣ Analiza semantică GPT ==========================================
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-5-turbo",
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `
Ești motorul de analiză informațională „Formula 3.14Δ”.
Analizează textul primit și oferă:
- Δ (vibrație semantică) între 0–6.28
- Fc (coeziune logică) între 0–6.28
- Manipulare (%) între 0–100
- Verdict (Veridic / Ambiguu / Fals / Manipulator)
- Rezumat logic (2-4 fraze clare, neutre)
Returnează text structurat, lizibil.
            `,
          },
          { role: "user", content: textDeAnalizat },
        ],
      });

      const raspuns = completion.choices[0].message.content || "";
      rezultat.delta =
        parseFloat(raspuns.match(/Δ[:=]?\s*([\d.,]+)/i)?.[1]?.replace(",", ".")) ||
        3.14;
      rezultat.fc =
        parseFloat(raspuns.match(/Fc[:=]?\s*([\d.,]+)/i)?.[1]?.replace(",", ".")) ||
        3.14;
      rezultat.manipulare =
        parseFloat(raspuns.match(/Manipulare[:=]?\s*([\d.,]+)/i)?.[1]) || 0;
      rezultat.verdict =
        raspuns.match(/(Veridic|Ambiguu|Fals|Manipulator)/i)?.[1] || "Ambiguu";
      rezultat.rezumat =
        raspuns.match(/Rezumat[:=]?\s*([\s\S]*)/i)?.[1]?.trim() ||
        "Text analizat fără erori evidente.";
    } catch (err) {
      console.error("Eroare GPT:", err);
      rezultat.verdict = "Eroare GPT";
    }

    // === 2️⃣ Căutare factuală gratuită =======================================
    try {
      const queries = [
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          textDeAnalizat
        )}&format=json`,
        `https://en.wikinews.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          textDeAnalizat
        )}&format=json`,
        `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
          textDeAnalizat
        )}&format=json`,
      ];

      const responses = await Promise.allSettled(
        queries.map((url) =>
          fetch(url).then((r) => (r.ok ? r.json() : Promise.reject()))
        )
      );

      const allResults = [];

      // Wikipedia
      if (responses[0].status === "fulfilled") {
        const wiki = responses[0].value.query?.search?.slice(0, 3) || [];
        wiki.forEach((a) => {
          allResults.push({
            title: a.title,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.title)}`,
            source: "Wikipedia",
          });
        });
      }

      // Wikinews
      if (responses[1].status === "fulfilled") {
        const news = responses[1].value.query?.search?.slice(0, 3) || [];
        news.forEach((a) => {
          allResults.push({
            title: a.title,
            url: `https://en.wikinews.org/wiki/${encodeURIComponent(a.title)}`,
            source: "Wikinews",
          });
        });
      }

      // GDELT fallback
      if (responses[2].status === "fulfilled") {
        const gdelt = responses[2].value.articles?.slice(0, 3) || [];
        gdelt.forEach((a) => {
          allResults.push({
            title: a.title || "Articol fără titlu",
            url: a.url || "#",
            source: a.source || "GDELT",
          });
        });
      }

      if (allResults.length > 0) {
        rezultat.factualStatus = "Confirmat";
        rezultat.surse = allResults;
      } else {
        rezultat.factualStatus = "Neconfirmat";
      }
    } catch (err) {
      rezultat.factualStatus = "Eroare verificare factuală";
    }

    // === 3️⃣ Răspuns final ====================================================
    return res.status(200).json({ success: true, rezultat });
  } catch (error) {
    console.error("Eroare generală:", error);
    return res.status(500).json({ error: "Eroare API principal" });
  }
}
