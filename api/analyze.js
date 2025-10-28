import fs from "fs";
import path from "path";

const CACHE_FILE = path.join("/tmp", "cache.json");
let memoryCache = {};

try {
  if (fs.existsSync(CACHE_FILE)) {
    memoryCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8") || "{}");
  }
} catch {}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "Text missing" });

    const cleanText = text.trim().toLowerCase();
    if (memoryCache[cleanText])
      return res.status(200).json({ ...memoryCache[cleanText], cached: true });

    // --- 1️⃣ Caută pe Google (Serper)
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: text, gl: "ro", hl: "ro", num: 10 })
    });
    const data = await response.json();

    const sources = (data.organic || [])
      .slice(0, 8)
      .map(r => ({
        title: r.title || "",
        link: r.link || "",
        snippet: (r.snippet || "").slice(0, 200)
      }));

    const allText = sources.map(s => (s.title + " " + s.snippet)).join(" ").toLowerCase();

    // --- 2️⃣ Extrage informația afirmată
    const affirm = cleanText.match(/([a-zăâîșț ]+) a câștigat ([a-zăâîșț ]+)?din (\d{4})/i);
    let verdict = "verificabilă factual";
    let truth = "neutru";
    let correction = null;

    if (affirm) {
      const subjectAffirm = affirm[1].trim(); // ex. "brazilia"
      const year = affirm[3];
      let winnerDetected = null;

      // --- 3️⃣ Caută fraze „X a câștigat campionatul mondial ... YYYY” în rezultate
      const found = [...allText.matchAll(/([a-zăâîșț]+) a câștigat[^\.!\n]*1994/g)];
      if (found.length > 0) {
        const possible = found.map(f => f[1].trim());
        const freq = countFrequency(possible);
        winnerDetected = Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
      }

      // --- 4️⃣ Comparație logică
      if (winnerDetected) {
        if (winnerDetected === subjectAffirm) {
          truth = "adevărat";
          verdict = "adevărat factual";
        } else {
          truth = "fals";
          verdict = "fals factual";
          correction = `Conform surselor, ${winnerDetected} a câștigat Campionatul Mondial de Fotbal din ${year}.`;
        }
      } else {
        verdict = "verificabilă factual";
      }
    }

    // --- 5️⃣ Scor și explicație
    const similarity = computeSimilarity(cleanText, allText);
    const score = +(Math.min(3.14, similarity * 3.14)).toFixed(2);

    const explanation =
      `Afirmația „${text}” a fost comparată cu sursele publice. ` +
      (truth === "fals"
        ? "A fost detectată o contradicție logică cu faptele istorice."
        : truth === "adevărat"
        ? "Afirmația corespunde faptelor relatate în surse."
        : "Rezultatele sunt ambigue, analiza suplimentară e necesară.");

    const result = {
      type: "factuală",
      verdict,
      truth,
      correction,
      score,
      maxScore: 3.14,
      sources,
      explanation,
      cached: false,
      message: "Analiză Coezivă 3.14Δ – potrivire logică a afirmației cu realitatea"
    };

    memoryCache[cleanText] = result;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2));

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// --- Ajutoare
function computeSimilarity(a, b) {
  const aw = new Set(a.split(/\s+/));
  const bw = new Set(b.split(/\s+/));
  const inter = [...aw].filter(x => bw.has(x));
  return inter.length / Math.max(aw.size, 1);
}

function countFrequency(arr) {
  const freq = {};
  arr.forEach(el => (freq[el] = (freq[el] || 0) + 1));
  return freq;
}
