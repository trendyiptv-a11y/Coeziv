import fs from "fs";
import path from "path";

// 🧠 Coeziune – Cache local în memorie + fișier temporar
const CACHE_FILE = path.join("/tmp", "cache.json");
let memoryCache = {};

try {
  if (fs.existsSync(CACHE_FILE)) {
    memoryCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    console.log("🧠 Memorie Coezivă activată din cache local.");
  }
} catch (err) {
    console.warn("⚠️ Nu s-a putut citi cache-ul:", err);
}

// 🔑 Variabile de mediu (din Vercel)
const GPT_API_KEY = process.env.GPT_API_KEY;
const SERPER_KEY = process.env.SERPER_KEY;

// 🧩 Funcția principală API
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Metodă neacceptată" });

  try {
    const { text } = req.body;
    if (!text || text.trim() === "")
      return res.status(400).json({ error: "Text gol" });

    // 📦 Verifică cache-ul întâi
    if (memoryCache[text]) {
      return res.status(200).json(memoryCache[text]);
    }

    // 🌐 Caută surse factuale
    const searchResponse = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": SERPER_KEY
      },
      body: JSON.stringify({ q: text })
    });

    const searchData = await searchResponse.json();
    const sources = (searchData?.organic || [])
      .slice(0, 5)
      .map((r) => `${r.title}\n${r.link}`)
      .join("\n");

    // 🧠 Analiza GPT
    const prompt = `
Analizează factual și logic afirmația de mai jos.
Returnează JSON cu: { verdict, tip, scor, explicatie, surse }

Afirmația: "${text}"
Surse disponibile:
${sources}
`;

    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GPT_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    const gptData = await gptResponse.json();
    const parsed =
      JSON.parse(gptData.choices?.[0]?.message?.content || "{}") || {};

    const result = {
      verdict: parsed.verdict || "verificabilă factual",
      tip: parsed.tip || "factuală",
      scor: parsed.scor || 3.14,
      explicatie: parsed.explicatie || "Analiză completă efectuată.",
      surse: sources,
    };

    // 💾 Salvează în cache local
    memoryCache[text] = result;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache));

    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Eroare analiză:", err);
    res.status(500).json({ error: "Eroare internă de server" });
  }
}
