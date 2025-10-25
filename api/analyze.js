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

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 🔍 Integrare verificare factuală automată prin GDELT
let factualSources = [];
let factualStatus = "Neconfirmat";

try {
  const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(textDeAnalizat)}&format=json`;
  const gdeltRes = await fetch(gdeltUrl);

  if (gdeltRes.ok) {
    const gdeltData = await gdeltRes.json();
    if (gdeltData?.articles?.length > 0) {
      factualStatus = "Confirmat";
      factualSources = gdeltData.articles.slice(0, 3).map(a => a.url);
    }
  } else {
    factualStatus = "Eroare verificare externă";
  }
} catch (e) {
  console.error("Eroare GDELT:", e);
  factualStatus = "Eșuat";
}

// 🧠 Răspunsul GPT (fără web_search)
const completion = await client.chat.completions.create({
  model: "gpt-5",
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${textDeAnalizat}\n\n(Surse externe: ${factualSources.join(", ")})` }
  ],
  temperature: 1
});

    const raw = completion.choices[0].message.content;

    // 🧠 Extragem valorile numerice din răspunsul GPT
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
    };

     // 🔗 Adăugăm verificarea factuală prin GDELT și includerea surselor
try {
  // 🌐 traducem textul pentru GDELT (căutare globală, în engleză)
const q = encodeURIComponent(
  textDeAnalizat
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // eliminăm diacritice
    .replace(/\s+/g, " ")
    .replace(/a declarat/gi, "said")
    .replace(/azi/gi, "today")
    .replace(/ieri/gi, "yesterday")
    .replace(/Ucraina/gi, "Ukraine")
    .replace(/Danemarca/gi, "Denmark")
    .replace(/România/gi, "Romania")
    .replace(/Trump/gi, "Donald Trump")
);
const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&format=json`;
  const gdeltRes = await fetch(gdeltUrl);
  rezultat.surse = [];
  rezultat.factualStatus = "Neconfirmat";

  if (gdeltRes.ok) {
    const gdeltData = await gdeltRes.json();

    if (gdeltData?.articles?.length > 0) {
      rezultat.factualStatus = "Confirmat";
      rezultat.surse = gdeltData.articles
        .slice(0, 3)
        .map(a => ({
          title: a.title || "Articol fără titlu",
          url: a.url || "—",
          source: a.source || "necunoscut"
        }));
    }
  }
} catch (err) {
  rezultat.factualStatus = "Eroare verificare factuală";
}
    return res.status(200).json({ success: true, rezultat });
  } catch (error) {
    console.error("Eroare API GPT:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
