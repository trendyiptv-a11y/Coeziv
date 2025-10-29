import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing text for analysis." });
  }

  try {
    // === 1️⃣ Promptul complet Coeziv 3.14Δ ===
    const gptPrompt = `
Ești Motorul Coeziv 3.14Δ — un sistem de analiză factuală, logică și umană bazat pe Formula Coeziunii 3.14Δ.

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

Apoi returnează **doar un obiect JSON valid**:
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
    const V = ((F + L + C) / 3).toFixed(2);

    // === 5️⃣ Integrare cu Serper.dev (pentru surse publice) ===
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

    // === 6️⃣ Răspuns final Coeziv 3.14Δ ===
    return res.status(200).json({
      factual_score: F,
      logic_score: L,
      semantic_score: C,
      V,
      verdict: gptJson.verdict,
      summary: gptJson.summary,
      sources
    });

  } catch (err) {
    console.error("Eroare la analiza Coezivă:", err);
    return res.status(500).json({ error: "Eroare internă în analiza Coezivă 3.14Δ." });
  }
}
