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

    // 🔍 1️⃣ Verificare factuală prin GDELT API (gratuit, fără cheie)
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
      textDeAnalizat
    )}&format=json`;

    let factualInfo = "Nu s-au găsit surse externe pentru verificare.";
    try {
      const resp = await fetch(gdeltUrl);
      const data = await resp.json();
      if (data?.articles?.length > 0) {
        const first = data.articles[0];
        factualInfo = `Sursă găsită: ${first.url || "necunoscută"} (${first.seendate || "fără dată"})`;
      }
    } catch (err) {
      factualInfo = "Eroare la conectarea cu GDELT.";
    }

    // 🧠 2️⃣ Analiza logică prin GPT
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Text: ${textDeAnalizat}\n\nVerificare factuală: ${factualInfo}` }
      ],
    });

    const raw = completion.choices[0].message.content || "";

    // 🔢 3️⃣ Extragem valorile numerice din răspunsul GPT
    const deltaMatch = raw.match(/Δ\s*=?\s*([\d.]+)/);
    const fcMatch = raw.match(/Fc\s*=?\s*([\d.]+)/);
    const manipMatch = raw.match(/manipulare\s*=?\s*([\d.]+)/);

    const delta = deltaMatch ? parseFloat(deltaMatch[1]) : 3.14;
    const fc = fcMatch ? parseFloat(fcMatch[1]) : 3.14;
    const manipulare = manipMatch ? parseFloat(manipMatch[1]) : Math.max(0, (1 - fc / 3.14) * 100);

    const rezultat = {
      text: raw,
      delta,
      fc,
      manipulare,
      sursa: factualInfo,
    };

    return res.status(200).json({ success: true, rezultat });
  } catch (error) {
    console.error("Eroare API GPT:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
