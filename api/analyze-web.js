import OpenAI from "openai";

// === 🧠 CACHE LOCAL (pentru reducerea costurilor) ===
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minute

function makeKey(text) {
  return text.trim().toLowerCase();
}
function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  const expired = Date.now() - item.timestamp > CACHE_TTL;
  if (expired) {
    cache.delete(key);
    return null;
  }
  return item.value;
}
function setCache(key, value) {
  cache.set(key, { value, timestamp: Date.now() });
}

// === 🔍 HANDLER PRINCIPAL ===
export default async function handler(req, res) {
  try {
    const { textDeAnalizat } = req.body || {};
    if (!textDeAnalizat)
      return res.status(400).json({ success: false, error: "Lipsește textul de analizat." });

    // 🧠 Verificăm dacă există deja în cache
    const key = makeKey(textDeAnalizat);
    const cached = getCache(key);
    if (cached) {
      console.log("🧠 Rezultat servit din cache");
      return res.status(200).json(cached);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // === Pas 1 – Verificare factuală (web_search) ===
    const search = await client.responses.create({
      model: "gpt-5",
      tools: [{ type: "web_search" }],
      input: [
        {
          role: "user",
          content: `Verifică factual următorul text și indică sursele principale, data și verdictul (Adevărat, Parțial, Fals). Text: """${textDeAnalizat}"""`,
        },
      ],
    });

    const webAnswer = search.output_text || "Nu s-au găsit surse relevante.";
    const webSources =
      search.output?.[0]?.citations?.map((c) => c.url) ||
      search.output?.[0]?.references?.map((r) => r.url) ||
      [];

    // === Pas 2 – Analiză semantică (Formula 3.14Δ) ===
    const analyze = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `
Ești motorul Formula 3.14Δ. Calculează:
Δ între 0–6.28, Fc = 3.14 - |Δ - 3.14|/3.14, Manipulare% = (1 - Fc/3.14)*100.
Evaluează coeziunea, adevărul logic și gradul de manipulare al afirmației.
Returnează atât valorile numerice, cât și o explicație clară:
1. Ce reprezintă Δ (vibrația) — variația logică a informației.
2. Ce reprezintă Fc (coeziunea) — consistența internă a sensului.
3. Cum se interpretează Manipulare%.
4. Verdict semantic: Verde = Coeziv / Galben = Ambiguu / Roșu = Manipulativ.
`,
        },
        { role: "user", content: textDeAnalizat },
      ],
    });

    const raw = analyze.choices[0].message.content || "";
    const delta = parseFloat(raw.match(/Δ\s*=?\s*([\d.,]+)/)?.[1] || "3.14");
    const fc = parseFloat(raw.match(/Fc\s*=?\s*([\d.,]+)/)?.[1] || "3.14");
    const manipulare = parseFloat(raw.match(/manipulare[%]?\s*=?\s*([\d.,]+)/i)?.[1] || "0");

    // === ✅ Combinăm rezultatele (cu surse clickabile) ===
    const rezultat = {
      success: true,
      rezultat: {
        text: `🧩 Analiză factuală:\n${webAnswer}\n\n📊 Analiză semantică (Formula 3.14Δ):\nΔ = ${delta}\nFc = ${fc}\nManipulare% = ${manipulare}\n\n${raw}`,
        fc,
        delta,
        manipulare,
        surse: (webSources || []).map((src, index) => {
          if (typeof src === "object" && src.url) {
            return { title: src.title || `Sursă ${index + 1}`, url: src.url };
          }
          return { title: `Sursă ${index + 1}`, url: src };
        }),
      },
    };

    // 💾 Salvăm în cache
    setCache(key, rezultat);

    return res.status(200).json(rezultat);
  } catch (err) {
    console.error("Eroare analiză completă:", err);
    return res.status(500).json({ success: false, error: "Eroare API / analiză." });
  }
}
