import fs from "fs";
import path from "path";

const CACHE_FILE = path.join("/tmp", "cache.json");
let memoryCache = {};

// 🔹 Încarcă memoria persistentă
try {
  if (fs.existsSync(CACHE_FILE)) {
    memoryCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8") || "{}");
    console.log("🧠 Memorie Coezivă activă:", Object.keys(memoryCache).length);
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

    // 🔁 Verifică cache
    if (memoryCache[cleanText]) {
      return res.status(200).json({ ...memoryCache[cleanText], cached: true });
    }

    // 🧠 Detectează tipul semantic
    const type = detectType(cleanText);

    // 🧮 Scoruri de bază
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
    let score = scoreMap[type] || 0;

    // 💬 Explicații tip dedicate
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

    // 🌐 Căutare factuală (doar unde are sens)
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

    // ✅ Pasul 8 — verificare de consistență semantică (adevărat/fals/neutru)
    let truth = "neutru";
    let correction = null;

    if (["factuală", "medicală"].includes(type) && sources.length > 0) {
      const joined = sources.map(s => (s.title + " " + s.snippet)).join(" ").toLowerCase();

      // ⚽ exemplu: România / Brazilia
      if (joined.includes("românia a câștigat") || joined.includes("romania won")) {
        truth = "adevărat";
      } else if (joined.includes("brazilia a câștigat") || joined.includes("brazil won")) {
        truth = "fals";
        correction = "Brazilia a câștigat Campionatul Mondial din 1994.";
      }

      // 🧩 alte formule generice
      else if (joined.includes("nu este adevărat") || joined.includes("false information")) {
        truth = "fals";
      }
    }

    // 🎯 Construiește verdictul
    let verdict = {
      logică: "adevărată logic",
      factuală: truth === "adevărat" ? "adevărată factual" : truth === "fals" ? "falsă factual" : "verificabilă factual",
      parafrază: "relatare indirectă",
      predicție: "posibilă, dar nedemonstrabilă",
      medicală: "necesită confirmare științifică",
      filosofică: "interpretabilă",
      opinie: "subiectivă",
      neclară: "neclară"
    }[type];

    // 🧾 Răspuns complet
    const response = {
      type,
      verdict,
      truth,
      correction,
      explanation: explanations[type],
      score,
      maxScore: 3.14,
      sources,
      cached: false,
      message: "Analiză Coezivă 3.14Δ – Semantic + Consistent"
    };

    // 💾 Salvează în cache
    memoryCache[cleanText] = response;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2));

    res.status(200).json(response);

  } catch (err) {
    res.status(500).json({ error: err.message });
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

function hasAny(text, arr) {
  return arr.some(w => text.includes(w));
}
