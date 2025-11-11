// trigger redeploy 11nov25
Redeploy fix analyze API
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, humanMode } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing text for analysis." });
  }

  try {
    // === 1️⃣ Promptul complet Coeziv 3.14Δ ===
    const gptPrompt = `
Ești Motorul Coeziv 3.14Δ — un sistem de analiză factuală, logică și semantică bazat pe Formula Coeziunii 3.14Δ.

Analizează afirmația următoare conform celor 3 axe fundamentale:
1. **Factual (F)** – adevărul obiectiv verificabil.
2. **Logic (L)** – coerența cauză-efect și raționamentul intern.
3. **Semantic (C)** – armonia și sensul exprimării în context uman.

Acordă pentru fiecare o valoare între 0 și 3.14, unde:
0–1.04 = fals, incoerent, disonant
1.05–2.09 = parțial adevărat, ambiguu
2.10–3.14 = adevărat, coerent, coeziv

Calculează valoarea coezivă totală:
V = (F + L + C) / 3

Determină verdictul final:
0–1.04 → ❌ fals logic/factual
1.05–2.09 → ⚠️ parțial adevărat / ambiguu
2.10–3.14 → ✅ adevărat coeziv

Returnează doar un obiect JSON valid:
{
  "factual_score": număr,
  "logic_score": număr,
  "semantic_score": număr,
  "V": număr,
  "verdict": "text scurt",
  "summary": "explicație scurtă conform Formulei 3.14Δ"
}

Afirmația de analizat este:
"${text}"
`;

    // === 2️⃣ Cerere către OpenAI GPT ===
    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Ești un evaluator de adevăr conform Formulei Coeziunii 3.14Δ." },
          { role: "user", content: gptPrompt }
        ],
        temperature: 0.4
      })
    });

    const gptData = await gptResponse.json();
    const content = gptData?.choices?.[0]?.message?.content;

    // === 3️⃣ Încearcă să parsezi JSON-ul de la GPT ===
    let gptJson;
    try {
      gptJson = JSON.parse(content);
    } catch {
      console.error("Eroare la parsarea JSON-ului GPT:", content);
      gptJson = {
        factual_score: 1.57,
        logic_score: 1.57,
        semantic_score: 1.57,
        V: 1.57,
        verdict: "Ambiguu (parsare eșuată)",
        summary: "Nu s-a putut genera un răspuns complet coerent."
      };
    }

    // === 4️⃣ Calcul suplimentar de siguranță ===
    const safe = (v) => (typeof v === "number" && !isNaN(v) ? v : 1.57);
    const F = safe(gptJson.factual_score);
    const L = safe(gptJson.logic_score);
    const C = safe(gptJson.semantic_score);

    // === 5️⃣ ΔH – analiză umană (rezonanță semantică & armonică)
    function calcHumanResonance(txt) {
      const keywords = ["suflet", "iubire", "armonie", "adevăr", "lumină", "viață", "coeziune", "energie"];
      let resonance = 0;
      for (const w of keywords) if (txt.toLowerCase().includes(w)) resonance += 0.5;
      if (!txt.match(/nu |rău|fals|ură|greșit/gi)) resonance += 0.5;
      return Math.min(resonance, 3.14);
    }

    const H = humanMode ? calcHumanResonance(text) : 0;

    // === 6️⃣ Calcul final al formulei
    const V = humanMode
      ? ((F + L + C + H) / 4).toFixed(2)
      : ((F + L + C) / 3).toFixed(2);

    // === 7️⃣ Integrare cu Serper.dev (pentru surse publice)
    const serp = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.SERPER_API_KEY
      },
      body: JSON.stringify({ q: text, gl: "ro", hl: "ro" })
    });

    const serpData = await serp.json();
    const sources = serpData?.organic?.slice(0, 5).map(r => ({
      title: r.title,
      link: r.link
    })) || [];

    // === 8️⃣ Răspuns final Coeziv 3.14Δ / ΔH ===
    return res.status(200).json({
      mode: humanMode ? "ΔH" : "Δ",
      factual_score: F,
      logic_score: L,
      semantic_score: C,
      human_score: H,
      V,
      verdict: humanMode
        ? (H > 2.5 ? "🌿 Adevăr coeziv uman" : "⚖️ Echilibru parțial uman")
        : gptJson.verdict,
      summary: humanMode
        ? (gptJson.summary + " (Analiză extinsă ΔH)")
        : gptJson.summary,
      sources
    });

  } catch (err) {
    console.error("Eroare la analiza Coezivă:", err);
    return res.status(500).json({ error: "Eroare internă în analiza Coezivă 3.14Δ/ΔH." });
  }
}
