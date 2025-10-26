import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    const { textDeAnalizat } = req.body || {};
    if (!textDeAnalizat)
      return res.status(400).json({ success: false, error: "Lipsește textul pentru analiză." });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 🧠 Pas 1 — verificare factuală live
    const search = await client.responses.create({
      model: "gpt-5",
      tools: [{ type: "web_search" }],
      input: [
        {
          role: "user",
          content: `Verifică factual următorul text și explică dacă este confirmat, parțial confirmat sau fals.
                    Include sursele principale și oferă un scurt rezumat: "${textDeAnalizat}"`,
        },
      ],
    });

    const webAnswer = search.output_text || "Nu s-au găsit surse clare.";
    const webSources =
      search.output?.[0]?.citations?.map((c) => c.url) ||
      search.output?.[0]?.references?.map((r) => r.url) ||
      [];

    // 🧠 Pas 2 — analiză semantică (Formula 3.14Δ)
    const analyze = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `
Tu ești motorul Formula 3.14Δ. Calculează:
Δ între 0–6.28, Fc = 3.14 - |Δ - 3.14|/3.14,
Manipulare% = (1 - Fc/3.14)*100.
Evaluează coeziunea, adevărul logic și manipularea.`,
        },
        { role: "user", content: textDeAnalizat },
      ],
    });

    const raw = analyze.choices[0].message.content;
    const delta = parseFloat(raw.match(/Δ\s*=?\s*([\d.]+)/)?.[1]) || 3.14;
    const fc = parseFloat(raw.match(/Fc\s*=?\s*([\d.]+)/)?.[1]) || 3.14;
    const manipulare = parseFloat(raw.match(/manipulare\s*=?\s*([\d.]+)/)?.[1]) || Math.max(0, (1 - fc / 3.14) * 100);

    // ✅ Combinăm rezultatele (cu surse clickabile)
return res.status(200).json({
  success: true,
  rezultat: {
    // text combinat pentru afișarea completă în UI
    text: `🧩 Analiză factuală:\n${webAnswer}\n\n📊 Analiză semantică:\nΔ = ${delta}\nFc = ${fc}\nManipulare% = ${manipulare}`,
    fc,
    delta,
    manipulare,
    // 🔗 Formatare surse clickabile
    surse: (webSources || []).map((src, index) => {
      if (typeof src === "object" && src.url) {
        return { title: src.title || `Sursă ${index + 1}`, url: src.url };
      }
      return { title: `Sursă ${index + 1}`, url: src };
    }),
  },
});
  } catch (err) {
    console.error("Eroare analiză completă:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
