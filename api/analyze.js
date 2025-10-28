import fs from "fs";
import path from "path";

const CACHE_FILE = path.join("/tmp", "cache.json");
let memoryCache = {};

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
    if (memoryCache[cleanText])
      return res.status(200).json({ ...memoryCache[cleanText], cached: true });

    const type = detectType(cleanText);

    // 🔎 1. Caută pe Google via Serper
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: text, gl: "ro", hl: "ro", num: 10 })
    });
    const data = await response.json();

    let sources = [];
    if (data.organic && Array.isArray(data.organic)) {
      sources = data.organic
        .slice(0, 8)
        .filter(r => r.title && !r.title.toLowerCase().includes("cookie"))
        .map(r => ({
          title: r.title,
          link: r.link,
          snippet: (r.snippet || "").slice(0, 200)
        }));
    }

    // 🔬 2. Analiză semantică simplă
    const joined = sources.map(s => (s.title + " " + s.snippet)).join(" ").toLowerCase();
    const words = cleanText.split(/\s+/);
    const total = words.length;
    let matches = 0;

    for (const w of words) {
      if (joined.includes(w)) matches++;
    }

    const ratio = matches / total;
    let verdict = "verificabilă factual";
    let truth = "neutru";
    let correction = null;

    // 3️⃣  Detectare expresii contrazicătoare
    if (joined.includes("nu a câștigat") || joined.includes("a pierdut") || joined.includes("brazilia a câștigat")) {
      truth = "fals";
      verdict = "falsă factual";
      correction = "Conform surselor, afirmația este contrazisă de faptele cunoscute.";
    } else if (joined.includes("a câștigat") && joined.includes("românia")) {
      truth = "adevărat";
      verdict = "adevărată factual";
    } else if (ratio > 0.6) {
      truth = "verificabil";
      verdict = "verificabilă factual";
    }

    const score = Math.min(3.14, (ratio * 3.14).toFixed(2));
    const maxScore = 3.14;

    const explanation = `Afirmația „${text}” a fost comparată cu primele ${sources.length} rezultate Google. 
    Similaritate: ${(ratio * 100).toFixed(1)}%.`;

    const result = {
      type,
      truth,
      verdict,
      correction,
      score,
      maxScore,
      sources,
      explanation,
      cached: false,
      message: "Analiză Coezivă 3.14Δ – Comparare directă cu surse"
    };

    memoryCache[cleanText] = result;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2));

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function detectType(text) {
  const lower = text.toLowerCase();
  if (hasAny(lower, ["cred", "părere", "mi se pare", "consider", "eu zic"])) return "opinie";
  if (hasAny(lower, ["va fi", "va deveni", "se va întâmpla", "probabil", "posibil"])) return "predicție";
  if (hasAny(lower, ["lege", "guvern", "președinte", "istoric", "campionat", "țară"])) return "factuală";
  if (hasAny(lower, ["dumnezeu", "suflet", "viață", "moral", "spirit"])) return "filosofică";
  return "neclară";
}

function hasAny(text, arr) {
  return arr.some(w => text.includes(w));
}
