import OpenAI from "openai";

const SYSTEM_PROMPT = `
Tu ești motorul oficial de analiză al proiectului „Formula 3.14Δ”, creat de Sergiu Bulboacă.

Scopul tău este să evaluezi textele după coeziunea informațională, adevăr logic și manipulare semantică, astfel:
1️⃣ Calculează valoarea Δ (vibrația semantică) între 0.00 și 6.28, unde 3.14 este echilibrul perfect.
2️⃣ Calculează Fc = 3.14 - |Δ - 3.14| / 3.14.
3️⃣ Calculează gradul de manipulare = (1 - Fc / 3.14) × 100.
4️⃣ Evaluează coerența logică, biasul și intenția comunicării.
5️⃣ Returnează:
   - valoarea Δ
   - coeficientul Fc
   - procentul manipulare
   - verdict textual (Veridic, Ambiguu, Dezinformare, Fals)
   - un scurt rezumat explicativ.
`;

export default async function handler(req, res) {
  try {
    const { textDeAnalizat } = req.body || {};
    if (!textDeAnalizat) {
      return res.status(400).json({ success: false, error: "Lipsește textul pentru analiză." });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // === PAS 1: verificare factuală ===
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const verifyRes = await fetch(`${baseUrl}/api/verifyNews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textDeAnalizat }),
    });

    const verifyData = await verifyRes.json();
    const sources = verifyData.found
      ? `✅ Surse confirmate: ${verifyData.articles.map(a => `${a.source} (${a.title})`).join("; ")}`
      : "⚠️ Nicio sursă confirmată în presa actuală.";

    // === PAS 2: GPT – analiza Formula 3.14Δ cu context factual ===
    const prompt = `
Text de analizat: "${textDeAnalizat}"

Context factual actual: ${sources}

Aplică Formula 3.14Δ și oferă:
- Δ (0–6.28)
- Fc (0–3.14)
- grad manipulare (%)
- verdict textual (Veridic / Ambiguu / Fals / Manipulator)
- scurt rezumat explicativ.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0].message.content;

    // === PAS 3: extragere valori numerice ===
    const deltaMatch = raw.match(/Δ\s*=?\s*([\d.]+)/);
    const fcMatch = raw.match(/Fc\s*=?\s*([\d.]+)/);
    const manipMatch = raw.match(/manipulare\s*=?\s*([\d.]+)/);

    const delta = deltaMatch ? parseFloat(deltaMatch[1]) : 3.14;
    const fc = fcMatch ? parseFloat(fcMatch[1]) : 3.14;
    const manipulare = manipMatch ? parseFloat(manipMatch[1]) : Math.max(0, (1 - fc / 3.14) * 100);

    const rezultat = {
      surse: verifyData.articles || [],
      text: raw,
      delta,
      fc,
      manipulare,
    };

    return res.status(200).json({ success: true, rezultat });

  } catch (error) {
    console.error("Eroare API GPT:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
