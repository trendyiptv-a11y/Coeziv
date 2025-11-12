// trigger redeploy 11nov25
// (Nota: linia de mai jos era problema - trebuia comentată sau ștearsă.)
// Redeploy fix analyze API

import dotenv from "dotenv";
dotenv.config();

export default async function handler(req, res) {
  // Acceptă doar POST și răspunde JSON mereu
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ error: "Method not allowed. Use POST /api/analyze" });
  }

  // Validează input
  const { text, humanMode } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing text for analysis." });
  }

  // Verifică chei
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "Server misconfigured: OPENAI_API_KEY is missing.",
    });
  }

  try {
    // 1) Promptul pentru model
    const gptPrompt = `
Ești Motorul Coeziv 3.14Δ — un sistem de analiză factuală, logică și semantică bazat pe Formula Coeziunii 3.14Δ.

Analizează afirmația următoare conform celor 3 axe fundamentale:
1. Factual (F) – adevărul obiectiv verificabil.
2. Logic (L) – coerența cauză-efect și raționamentul intern.
3. Semantic (C) – armonia și sensul exprimării în context uman.

Acordă pentru fiecare o valoare între 0 și 3.14:
0–1.04 = fals/incoerent
1.05–2.09 = parțial adevărat/ambiguu
2.10–3.14 = adevărat/coeziv

Calculează valoarea coezivă totală:
V = (F + L + C) / 3

Determină verdictul final:
0–1.04 → ❌ fals logic/factual
1.05–2.09 → ⚠️ parțial adevărat / ambiguu
2.10–3.14 → ✅ adevărat coeziv

Returnează DOAR un JSON VALID, fără text în afara lui:
{
  "factual_score": number,
  "logic_score": number,
  "semantic_score": number,
  "V": number,
  "verdict": "scurt",
  "summary": "scurt"
}

Afirmația:
"${text}"
`.trim();

    // 2) Cerere către OpenAI
    const gptResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "Ești un evaluator de adevăr conform Formulei Coeziunii 3.14Δ. Răspunde strict cu JSON valid.",
          },
          { role: "user", content: gptPrompt },
        ],
      }),
    });

    // Dacă OpenAI dă eroare HTTP, citește body ca text pt. debug și returnează JSON
    if (!gptResp.ok) {
      const errText = await gptResp.text();
      return res.status(502).json({
        error: "OpenAI request failed",
        status: gptResp.status,
        detail: errText?.slice(0, 500),
      });
    }

    const gptData = await gptResp.json();
    const content = gptData?.choices?.[0]?.message?.content || "";

    // 3) Parse robust al JSON-ului (acceptă și variante cu ```json … ```)
    function extractJson(str) {
      // încearcă bloc ```json ... ```
      const fenced =
        str.match(/```json\s*([\s\S]*?)\s*```/) ||
        str.match(/```\s*([\s\S]*?)\s*```/);
      if (fenced) return fenced[1].trim();

      // sau încearcă să găsești primul { ... } echilibrat
      const start = str.indexOf("{");
      const end = str.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        return str.slice(start, end + 1);
      }
      return str.trim();
    }

    let gptJson;
    try {
      gptJson = JSON.parse(extractJson(content));
    } catch (e) {
      // fallback sigur
      gptJson = {
        factual_score: 1.57,
        logic_score: 1.57,
        semantic_score: 1.57,
        V: 1.57,
        verdict: "Ambiguu (parsare eșuată)",
        summary: "Modelul nu a întors JSON pur; s-a folosit fallback.",
      };
    }

    // 4) Normalizări & siguranțe
    const safe = (v) =>
      typeof v === "number" && isFinite(v) ? v : Number(1.57);
    const F = safe(gptJson.factual_score);
    const L = safe(gptJson.logic_score);
    const C = safe(gptJson.semantic_score);

    // 5) ΔH – scor uman (opțional)
    function calcHumanResonance(txt) {
      const kws = [
        "suflet",
        "iubire",
        "armonie",
        "adevăr",
        "lumină",
        "viață",
        "coeziune",
        "energie",
      ];
      let r = 0;
      const low = txt.toLowerCase();
      for (const k of kws) if (low.includes(k)) r += 0.5;
      if (!/(?:\bnu\b|rău|fals|ură|greșit)/i.test(low)) r += 0.5;
      return Math.min(r, 3.14);
    }
    const H = humanMode ? calcHumanResonance(text) : 0;

    const Vnum = humanMode ? (F + L + C + H) / 4 : (F + L + C) / 3;
    const V = Number(Vnum.toFixed(2));

    // 6) Serper (opțional) — nu bloca răspunsul dacă lipsește cheia
    let sources = [];
    if (process.env.SERPER_API_KEY) {
      try {
        const serp = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": process.env.SERPER_API_KEY,
          },
          body: JSON.stringify({ q: text, gl: "ro", hl: "ro" }),
        });
        if (serp.ok) {
          const serpData = await serp.json();
          sources =
            serpData?.organic?.slice(0, 5).map((r) => ({
              title: r.title,
              link: r.link,
            })) || [];
        }
      } catch {
        // ignoră — sursele sunt opționale
      }
    }

    // 7) Răspuns final (JSON mereu)
    return res.status(200).json({
      mode: humanMode ? "ΔH" : "Δ",
      factual_score: F,
      logic_score: L,
      semantic_score: C,
      human_score: humanMode ? H : undefined,
      V,
      verdict: humanMode
        ? H > 2.5
          ? "🌿 Adevăr coeziv uman"
          : "⚖️ Echilibru parțial uman"
        : gptJson.verdict || "—",
      summary: humanMode
        ? `${gptJson.summary || ""} (Analiză extinsă ΔH)`
        : gptJson.summary || "—",
      sources,
    });
  } catch (err) {
    // Orice eroare => JSON valid
    return res.status(500).json({
      error: "Eroare internă în analiza Coezivă 3.14Δ/ΔH.",
      detail: String(err?.message || err).slice(0, 500),
    });
  }
}
