import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    const { textDeAnalizat } = req.body || {};
    if (!textDeAnalizat)
      return res.status(400).json({ success: false, error: "LipseÈ™te textul pentru analizÄƒ." });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 🧠 Pas 1 — verificare factuală live
const search = await client.chat.completions.create({
  model: "gpt-5",
  messages: [
    {
      role: "system",
      content: `Ești un verificator factual. Analizează textul și întoarce surse externe reale (cu https://...)`,
    },
    {
      role: "user",
      content: `
Verifică factual următorul text: "${textDeAnalizat}". 
Include 3–5 linkuri din surse majore (Reuters, BBC, Wikipedia, etc.).
Răspunde în format:
🧩 Analiză factuală:
Verdict: [Adevărat / Fals / Parțial adevărat]
Explicație scurtă: [...]
Surse:
1. [Titlu sursă](https://...)
2. [Titlu sursă](https://...)
3. [Titlu sursă](https://...)
`,
    },
  ],
});

    // ðŸ§  Pas 2 â€” analizÄƒ semanticÄƒ (Formula 3.14Î”)
    const analyze = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `
Tu ești motorul oficial de analiză al proiectului „Formula 3.14Δ”, creat de Sergiu Bulboacă.

Scopul tău este să evaluezi textele după coeziunea informațională, adevăr logic și manipulare semantică, astfel:
1️⃣ Calculează valoarea Δ (vibrația semantică) între 0.00 și 6.28, unde 3.14 este echilibrul perfect.
2️⃣ Calculează Fc = 3.14 - |Δ - 3.14| / 3.14.
3️⃣ Calculează gradul de manipulare = (1 - Fc / 3.14) × 100.
4️⃣ Evaluează coerența logică, biasul și intenția comunicării.,'
        },
        { role: "user", content: textDeAnalizat },
      ],
    });

    const raw = analyze.choices[0].message.content;
    const delta = parseFloat(raw.match(/Î”\s*=?\s*([\d.]+)/)?.[1]) || 3.14;
    const fc = parseFloat(raw.match(/Fc\s*=?\s*([\d.]+)/)?.[1]) || 3.14;
    const manipulare = parseFloat(raw.match(/manipulare\s*=?\s*([\d.]+)/)?.[1]) || Math.max(0, (1 - fc / 3.14) * 100);

    // âœ… CombinÄƒm rezultatele (cu surse clickabile)
return res.status(200).json({
  success: true,
  rezultat: {
    // text combinat pentru afiÈ™area completÄƒ Ã®n UI
    text: `${webAnswer}\n\nðŸ“Š AnalizÄƒ semanticÄƒ:\nÎ” = ${delta}\nFc = ${fc}\nManipulare% = ${manipulare}`,
    fc,
    delta,
    manipulare,
    // ðŸ”— Formatare surse clickabile
    surse:
  webSources && webSources.length > 0
    ? webSources.map((src, index) => {
        if (typeof src === "object" && src.url) {
          return { title: src.title || `SursÄƒ ${index + 1}`, url: src.url };
        }
        if (typeof src === "string") {
          return { title: `SursÄƒ ${index + 1}`, url: src };
        }
        return null;
      }).filter(Boolean)
    : null,
  },
});
  } catch (err) {
    console.error("Eroare analizÄƒ completÄƒ:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
