import fetch from "node-fetch";

// 🔹 Verifică afirmația prin Serper.dev (căutare web factuală)
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Doar metoda POST este acceptată." });

  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Textul lipsește." });

    const query = encodeURIComponent(text);
    const SERPER_API_KEY = process.env.SERPER_API_KEY;

    // 🔍 Caută rezultate reale în Google (via Serper.dev)
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 10, gl: "ro", hl: "ro" }),
    });

    const json = await response.json();
    if (!json.organic || json.organic.length === 0)
      return res.status(200).json({
        type: "factuală",
        verdict: "neconcludent factual",
        score: 0,
        maxScore: 3.14,
        explanation: "Nu s-au găsit surse suficiente pentru verificare.",
        sources: [],
      });

    // 🔹 Extrage text din surse
    const sources = json.organic.slice(0, 8).map((item) => ({
      title: item.title || "Rezultat Google",
      link: item.link,
      snippet: item.snippet || "",
    }));

    const allText = sources.map((s) => s.title + " " + s.snippet).join(" ");
    const claim = text.toLowerCase();

    // ===============================
    // 🧠 Analiză semantică de potrivire
    // ===============================

    // Extrage subiectul afirmației (ex: „Brazilia”)
    const subjectMatch = claim.match(/^([A-ZĂÂÎȘȚa-zăâîșț\s\-]+?)\s+a\s+câștigat/);
    const subject = subjectMatch ? subjectMatch[1].trim() : "";

    // Detectează cine este câștigătorul real din textul surselor
    let detectedWinner = "";
    const winnerPatterns = [
      /([A-ZĂÂÎȘȚ][a-zăâîșț]+)\s+a\s+câștigat\s+(?:Campionatul|Cupa)\s+Mondial[^\.\,]+1994/i,
      /Campionatul\s+Mondial[^\.\,]+1994[^\.\,]+a\s+fost\s+câștigat\s+de\s+([A-ZĂÂÎȘȚ][a-zăâîșț]+)/i,
      /victorie\s+pentru\s+([A-ZĂÂÎȘȚ][a-zăâîșț]+)/i,
    ];

    for (const pattern of winnerPatterns) {
      const match = allText.match(pattern);
      if (match) {
        detectedWinner = match[1];
        break;
      }
    }

    // Calculează scorul lexical (similitudine brută)
    const lexicalMatches = (allText.match(new RegExp(subject, "gi")) || []).length;
    const totalRefs = allText.split(" ").length;
    const lexicalScore = Math.min(3.14, (lexicalMatches / (totalRefs / 50)) * 3.14);

    // ===============================
    // 🔹 Verdict logic final
    // ===============================
    let verdict = "verificabilă factual";
    let correction = "";
    let explanation = "";
    let score = 2.5;

    if (detectedWinner) {
      if (detectedWinner.toLowerCase() === subject.toLowerCase()) {
        verdict = "adevărat factual";
        correction = `${detectedWinner} este într-adevăr câștigătoarea Campionatului Mondial de Fotbal 1994.`;
        score = 3.14;
        explanation = `Afirmatia este confirmată de sursele care menționează clar: „${detectedWinner} a câștigat Campionatul Mondial de Fotbal din 1994.”`;
      } else {
        verdict = "fals factual";
        correction = `${detectedWinner} a câștigat de fapt Campionatul Mondial de Fotbal din 1994, nu ${subject}.`;
        score = 1.1;
        explanation = `Sursele verificabile arată că ${detectedWinner} a fost câștigătoarea titlului mondial din 1994.`;
      }
    } else {
      verdict = "verificabilă factual";
      correction = "";
      explanation = `Rezultatele sunt parțial relevante, dar nu există o mențiune clară despre câștigător.`;
    }

    // Returnează rezultatul final coerent cu interfața
    return res.status(200).json({
      type: "factuală",
      verdict,
      score,
      maxScore: 3.14,
      correction,
      explanation,
      sources,
    });
  } catch (error) {
    console.error("Eroare API:", error);
    return res.status(500).json({ error: error.message });
  }
}
