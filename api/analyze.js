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

    // --- Căutare pe Google
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

    // --- Verificare semantică (adevărat / fals)
    const affirm = cleanText.match(/([a-zăâîșț ]+) a câștigat ([a-zăâîșț ]+)?din (\d{4})/i);
    let truth = "verificabil";
    let verdict = "verificabilă factual";
    let correction = null;

    if (affirm) {
      const subject = affirm[1]?.trim() || "";
      const year = affirm[3] || "";

      // caută în rezultate dacă apare alt "a câștigat" cu alt subiect
      const pattern = new RegExp(`a câștigat[^\\n]+${year}`, "gi");
      const matches = [...allText.matchAll(pattern)].map(m => m[0]);

      const contradictory = matches.find(m => !m.toLowerCase().includes(subject));

      if (contradictory) {
        truth = "fals";
        verdict = "falsă factual";
        correction = "Conform surselor, " + contradictory.trim() + ".";
      } else if (matches.some(m => m.toLowerCase().includes(subject))) {
        truth = "adevărat";
        verdict = "adevărată factual";
      }
    }

    // --- Calcul scor
    const similarity = computeSimilarity(cleanText, allText);
    const score = +(Math.min(3.14, similarity * 3.14)).toFixed(2);

    const explanation =
      `Afirmația „${text}” a fost comparată cu sursele publice. ` +
      `Similaritate lexicală: ${(similarity * 100).toFixed(1)}%.`;

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
      message: "Analiză Coezivă 3.14Δ – detecție de contradicție factuală"
    };

    memoryCache[cleanText] = result;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memoryCache, null, 2));

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function computeSimilarity(a, b) {
  const aw = new Set(a.split(/\s+/));
  const bw = new Set(b.split(/\s+/));
  const inter = [...aw].filter(x => bw.has(x));
  return inter.length / Math.max(aw.size, 1);
}
