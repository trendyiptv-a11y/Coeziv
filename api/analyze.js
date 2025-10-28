import fs from "fs";
import path from "path";

const CACHE_FILE = path.join("/tmp", "cache.json");
let memoryCache = {};

// 🔹 Încarcă memoria persistentă (dacă există)
try {
  if (fs.existsSync(CACHE_FILE)) {
    const data = fs.readFileSync(CACHE_FILE, "utf8");
    memoryCache = JSON.parse(data || "{}");
    console.log("🧠 Memorie Coezivă reactivată:", Object.keys(memoryCache).length, "intrări");
  }
} catch (err) {
  console.warn("⚠️ Nu s-a putut citi cache-ul:", err.message);
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { text } = req.body;
    if (!text || text.trim() === "")
      return res.status(400).json({ error: "Text missing" });

    const cleanText = text.trim().toLowerCase();

    // ✅ 1. Verificare cache
    if (memoryCache[cleanText]) {
      console.log("♻️ Cache hit:", cleanText);
      return res.status(200).json({
        ...memoryCache[cleanText],
        cached: true,
        message: "♻️ Răspuns servit din memorie Coezivă"
      });
    }

    console.log("🧠 Cache miss:", cleanText);

    // ✅ 2. Detectare tip semantic
    const type = detectType(cleanText);

    // ✅ 3. Atribuire scoruri de bază
    const scoreMap = {
      logică: 3.14,
      factuală: 2.9,
      parafrază: 2.5,
      predicție: 2.2,
      medicală: 2.8,
      filosofică: 1.8,
      opinie: 1.6,
      neclară: 0.0
    };

    // ✅ 4. Explicații tip dedicate
    const explanations = {
      logică: `Afirmația „${text}” reprezintă o relație logică sau matematică.`,
      factuală: `Afirmația „${text}” este un fapt verificabil prin surse publice.`,
      parafrază: `Afirmația „${text}” redă o informație dintr-o altă sursă (citare indirectă).`,
      predicție: `Afirmația „${text}” exprimă o posibilitate sau predicție despre viitor.`,
      medicală: `Afirmația „${text}” face referire la informații medicale sau științifice.`,
      filosofică: `Afirmația „${text}” explorează concepte spirituale sau morale.`,
      opinie: `Afirmația „${text}” exprimă o părere personală, subiectivă.`,
      neclară: `Afirmația „${text}” nu are un context clar detectabil.`
    };

    let score = scoreMap[type] || 0;

    // ✅ 5. Căutare factuală (doar pentru tipuri verificabile)
    let sources = [];
    if (["factuală", "medicală", "parafrază"].includes(type)) {
      const serper = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ q: text, gl: "ro", hl: "ro", num: 10 })
      });
      const result = await serper.json();
      if (result.organic && Array.isArray(result.organic)) {
        sources = result.organic
          .slice(0, 5)
          .filter(r => r.title && !r.title.toLowerCase().includes("cookie"))
          .map(r => ({
            title: r.title,
            link: r.link,
            snippet: (r.snippet || "").slice(0, 160) + "..."
          }));
      }
    }

    // ✅ 6. Construim verdictul
    const verdicts = {
      logică: "adevărată logic",
      factuală: "verificabilă factual",
      parafrază: "relatare indirectă",
      predicție: "posibilă, dar nedemonstrabilă",
      medicală: "necesită confirmare științifică",
      filosofică: "interpretabilă",
      opinie: "subiectivă",
      neclară: "neclară"
    };

    const response = {
      type,
      verdict: verdicts[type],
      explanation: explanations[type],
      score: score,
      maxScore: 3.14,
      sources,
      cached: false,
      message: "Analiză Coezivă completă 3.14Δ Semantic Extended"
    };

    // ✅ 7. Salvare în memorie
    memoryCache[cleanText] = response;
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2));
      console.log("💾 Cache actualizat:", cleanText);
    } catch (err) {
      console.warn("⚠️ Eroare la scriere cache:", err.message);
    }

    res.status(200).json(response);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// 🔹 Funcții auxiliare
function detectType(text) {
  const lower = text.toLowerCase();

  if (/^[0-9+\-*/=<> ]+$/.test(lower)) return "logică";
  if (hasAny(lower, ["cred", "părere", "mi se pare", "consider", "eu zic"])) return "opinie";
  if (hasAny(lower, ["va fi", "va deveni", "se va întâmpla", "probabil", "posibil"])) return "predicție";
  if (hasAny(lower, ["se spune că", "potrivit", "conform", "după cum a declarat", "raportul arată"])) return "parafrază";
  if (hasAny(lower, ["lege", "guvern", "președinte", "istoric", "război", "campionat", "țară", "companie"])) return "factuală";
  if (hasAny(lower, ["virus", "boal", "tratament", "doctor", "spital", "simptom"])) return "medicală";
  if (hasAny(lower, ["dumnezeu", "suflet", "viață", "moral", "conștiință", "spirit"])) return "filosofică";
  return "neclară";
}

function hasAny(text, arr) { return arr.some(w => text.includes(w)); }
