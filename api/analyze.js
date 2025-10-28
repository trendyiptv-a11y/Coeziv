import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Doar metoda POST este acceptată." });

  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Textul lipsește." });

    const SERPER_API_KEY = process.env.SERPER_API_KEY;
    const query = text.trim();
    const lowerText = query.toLowerCase();

    // 🔎 1️⃣ Căutare factuală cu Serper.dev
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 10, gl: "ro", hl: "ro" }),
    });

    const json = await response.json();
    const sources = (json.organic || []).slice(0, 8).map((r) => ({
      title: r.title || "Rezultat",
      link: r.link,
      snippet: r.snippet || "",
    }));

    const allText = sources.map((s) => (s.title + " " + s.snippet).toLowerCase()).join(" ");

    // ===============================
    // 🧭 2️⃣ Identificare tip propoziție
    // ===============================
    let type = "factuală";

    if (
      lowerText.match(
        /\b(cred|simt|par|pare|iubesc|urăsc|mi se pare|îmi place|nu-mi place|frumos|urât|important|bine|rău|fericire|tristețe|dragoste|viață|suflet|moral|emoție)\b/
      )
    ) {
      type = "opinie / subiectivă";
    } else if (lowerText.includes("este")) {
      type = "descriptivă";
    } else if (lowerText.includes("a câștigat")) {
      type = "sportivă / competitivă";
    } else if (lowerText.includes("capitala")) {
      type = "geografică";
    } else if (lowerText.includes("descoperit") || lowerText.includes("inventat")) {
      type = "științifică / istorică";
    }

    // ===============================
    // ⚖️ 3️⃣ Verdict logic + scor
    // ===============================
    let verdict = "verificabil factual";
    let explanation = "";
    let correction = "";
    let score = 2.0;
    let color = "#cccccc";

    // --- OPINII (nu se verifică factual)
    if (type === "opinie / subiectivă") {
      verdict = "opinie personală";
      score = 0;
      color = "#999999";
      correction = "Aceasta este o afirmație subiectivă, bazată pe percepție sau valoare personală.";
      explanation =
        "Motorul Coeziv 3.14Δ o clasifică drept opinie morală sau emoțională, nu ca fapt verificabil.";
    }

    // ===============================
    // 🧩 4️⃣ Analiză descriptivă (“X este Y”)
    // ===============================
    const descMatch = text.match(/([A-ZĂÂÎȘȚa-zăâîșț\s]+)\s+este\s+([A-ZĂÂÎȘȚa-zăâîșț]+)/i);
    if (type === "descriptivă" && descMatch) {
      const subject = descMatch[1].trim().toLowerCase();
      const attribute = descMatch[2].trim().toLowerCase();

      if (allText.includes(subject) && allText.includes(attribute)) {
        verdict = "adevărat factual";
        color = "#00ff99";
        score = 3.14;
        correction = `${descMatch[1]} este într-adevăr ${descMatch[2]}.`;
        explanation = `Afirmația este confirmată de sursele publice.`;
      } else if (allText.includes(subject) && !allText.includes(attribute)) {
        verdict = "fals factual";
        color = "#ff3366";
        score = 1.0;
        correction = `${descMatch[1]} nu este ${descMatch[2]}, potrivit surselor.`;
        explanation = `Atributul „${descMatch[2]}” nu este confirmat factual.`;
      } else {
        verdict = "verificabil factual";
        color = "#ffc800";
        score = 2.0;
        correction = "Nu există dovezi clare într-un sens sau altul.";
        explanation = "Rezultatele sunt parțiale sau ambigue.";
      }
    }

    // ===============================
    // 🌍 5️⃣ Analiză factuală generală (sport, istorie, geografie)
    // ===============================
    if (type !== "opinie / subiectivă" && !descMatch) {
      // Corect
      if (
        allText.includes("a câștigat") ||
        allText.includes("adevărat") ||
        allText.includes("confirmat") ||
        allText.includes("campion") ||
        allText.includes("capitala") ||
        allText.includes("fierbere") ||
        allText.includes("descoperit de")
      ) {
        verdict = "adevărat factual";
        color = "#00ff99";
        score = 3.14;
        correction = "Afirmația este confirmată de sursele analizate.";
        explanation = "Informațiile colectate susțin propoziția enunțată.";
      }
      // Fals
      else if (
        allText.includes("nu a câștigat") ||
        allText.includes("greșit") ||
        allText.includes("fals") ||
        allText.includes("contrazis")
      ) {
        verdict = "fals factual";
        color = "#ff3366";
        score = 1.0;
        correction = "Afirmația este contrazisă de sursele publice.";
        explanation = "Rezultatele indică o discrepanță între afirmație și faptele verificate.";
      }
      // Ambiguu
      else {
        verdict = "verificabil factual";
        color = "#ffc800";
        score = 2.0;
        correction = "Rezultatele sunt parțial relevante, dar nu decisive.";
        explanation = "Analiza suplimentară este necesară.";
      }
    }

    // ===============================
    // 🧮 6️⃣ Verdict logic sintetic (combină toate cazurile)
    // ===============================
    const summary =
      type === "opinie / subiectivă"
        ? "Această propoziție exprimă o percepție sau o valoare, nu un fapt măsurabil."
        : verdict === "adevărat factual"
        ? "Afirmația corespunde realității factuale."
        : verdict === "fals factual"
        ? "Afirmația contrazice realitatea verificabilă."
        : verdict === "verificabil factual"
        ? "Afirmația necesită verificare suplimentară."
        : "";

    // ===============================
    // 📤 7️⃣ Returnare rezultat complet
    // ===============================
    return res.status(200).json({
      type,
      verdict,
      correction,
      explanation,
      score,
      maxScore: 3.14,
      color,
      summary,
      sources,
    });
  } catch (err) {
    console.error("Eroare:", err);
    return res.status(500).json({ error: err.message });
  }
}
