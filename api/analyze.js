// Motor Coeziv 3.14Δ / 3.14ΔH
// Îmbunătățiri: ΔH extins, verdicturi rafinate, explicații pe axe și filtrare semantică a surselor.

export default async function handler(req, res) {
  // Acceptă doar POST și răspunde JSON mereu
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ error: "Method not allowed. Use POST /api/analyze" });
  }

  // Body safe (Vercel poate trimite string; Next API îl parsează deja)
  let body = {};
  try {
    body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  const { text, humanMode } = body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing text for analysis." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "Server misconfigured: OPENAI_API_KEY is missing.",
    });
  }

  try {
    const gptPrompt = `
Ești Motorul Coeziv 3.14Δ — un sistem de analiză factuală, logică și semantică bazat pe Formula Coeziunii 3.14Δ.

Analizează afirmația următoare conform celor 3 axe fundamentale:
1. Factual (F) – adevărul obiectiv verificabil și existența unor date/surse posibile.
2. Logic (L) – coerența cauză-efect și raționamentul intern.
3. Semantic (C) – claritatea termenilor, armonia sensului și adecvarea la contextul uman.

Acordă pentru fiecare o valoare între 0 și 3.14, apoi calculează V=(F+L+C)/3.
Folosește verdicturi nuanțate, nu generice:
- 2.80–3.14: coerență ridicată
- 2.20–2.79: probabil coerent / probabil adevărat
- 1.50–2.19: parțial coerent / necesită clarificări
- 0.80–1.49: coerență slabă
- 0.00–0.79: probabil fals / incoerent

Returnează DOAR JSON VALID:
{
  "factual_score": number,
  "logic_score": number,
  "semantic_score": number,
  "V": number,
  "verdict": "scurt",
  "summary": "explicație scurtă pe baza F, L și C"
}

Afirmația:
"${text}"
`.trim();

    // Cerere către OpenAI (fetch global în Node 18/20 pe Vercel)
    const gptResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.25,
        messages: [
          {
            role: "system",
            content:
              "Ești un evaluator de adevăr conform Formulei Coeziunii 3.14Δ. Răspunde strict cu JSON valid, fără markdown.",
          },
          { role: "user", content: gptPrompt },
        ],
      }),
    });

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

    // Parse robust al JSON-ului (acceptă și varianta cu ```json)
    function extractJson(str) {
      const fenced =
        str.match(/```json\s*([\s\S]*?)\s*```/) ||
        str.match(/```\s*([\s\S]*?)\s*```/);
      if (fenced) return fenced[1].trim();
      const start = str.indexOf("{");
      const end = str.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) return str.slice(start, end + 1);
      return str.trim();
    }

    let gptJson;
    try {
      gptJson = JSON.parse(extractJson(content));
    } catch {
      gptJson = {
        factual_score: 1.57,
        logic_score: 1.57,
        semantic_score: 1.57,
        V: 1.57,
        verdict: "Ambiguu (parsare eșuată)",
        summary: "Modelul nu a întors JSON pur; s-a folosit fallback.",
      };
    }

    const safe = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(n, 3.14)) : 1.57;
    };

    const F = safe(gptJson.factual_score);
    const L = safe(gptJson.logic_score);
    const C = safe(gptJson.semantic_score);

    function calcHumanResonance(txt) {
      const lower = String(txt || "").toLowerCase();

      const positive = [
        "viață", "viata", "suflet", "adevăr", "adevar", "iubire",
        "armonie", "echilibru", "sens", "demnitate", "libertate",
        "conștiință", "constiinta", "responsabilitate", "claritate",
        "vindecare", "coerență", "coerenta", "coeziune", "energie"
      ];

      const constructive = [
        "cum putem", "soluție", "solutie", "îmbunătăți", "imbunatati",
        "înțelege", "intelege", "corecta", "echilibra", "repara",
        "clarifica", "construi", "dezvolta"
      ];

      const negative = [
        "ură", "ura", "minciună", "minciuna", "manipulare", "distrugere",
        "frică", "frica", "haos", "abuz", "dezbinare"
      ];

      let score = 0.5;

      for (const word of positive) {
        if (lower.includes(word)) score += 0.35;
      }

      for (const phrase of constructive) {
        if (lower.includes(phrase)) score += 0.45;
      }

      for (const word of negative) {
        if (lower.includes(word)) score -= 0.25;
      }

      if (lower.length > 80) score += 0.25;
      if (/[?]/.test(txt)) score += 0.15;

      return Math.max(0, Math.min(score, 3.14));
    }

    function cohesiveVerdict(V, isHumanMode = false) {
      if (V >= 2.8) {
        return isHumanMode ? "🌿 Adevăr coeziv uman puternic" : "✅ Coerență ridicată";
      }
      if (V >= 2.2) {
        return isHumanMode ? "🌱 Coerență umană bună" : "🟢 Probabil adevărat / coerent";
      }
      if (V >= 1.5) {
        return isHumanMode ? "⚖️ Echilibru parțial uman" : "🟡 Parțial adevărat / necesită clarificări";
      }
      if (V >= 0.8) {
        return isHumanMode ? "🌫️ Rezonanță umană slabă" : "🟠 Coerență slabă";
      }
      return isHumanMode ? "⚠️ Dezechilibru ΔH" : "🔴 Probabil fals / incoerent";
    }

    function generateCohesiveExplanation(F, L, C, H, isHumanMode = false) {
      const parts = [];

      if (F < 1.5) {
        parts.push("Nivelul factual este slab: afirmația are puține elemente verificabile direct.");
      } else {
        parts.push("Nivelul factual indică existența unor elemente verificabile.");
      }

      if (L < 1.5) {
        parts.push("Nivelul logic necesită clarificare: legătura cauză–efect nu este complet consolidată.");
      } else {
        parts.push("Nivelul logic este relativ coerent.");
      }

      if (C < 1.5) {
        parts.push("Nivelul semantic este fragil: termenii pot avea mai multe sensuri.");
      } else {
        parts.push("Nivelul semantic arată o direcție coerentă de interpretare.");
      }

      if (isHumanMode) {
        if (H < 1.5) {
          parts.push("Nivelul ΔH este redus: componenta umană, etică sau integratoare este slab exprimată.");
        } else {
          parts.push("Nivelul ΔH indică o rezonanță umană prezentă.");
        }
      }

      return parts.join(" ");
    }

    function buildSearchQuery(txt) {
      const clean = String(txt || "").trim().slice(0, 220);
      return [
        clean ? `"${clean}"` : "",
        "\"Model Coeziv\" OR \"Formula Coeziunii\" OR \"3.14ΔH\" OR \"Sergiu Bulboacă\"",
        "-teren -terasament -geotehnic -tapiterie -tapiserie -honda -compactarea -pământuri -pamanturi -soluri"
      ].filter(Boolean).join(" ");
    }

    function sourceRelevanceScore(source, inputText) {
      const haystack = `${source.title || ""} ${source.snippet || ""} ${source.link || ""}`.toLowerCase();
      const input = String(inputText || "").toLowerCase();

      const goodTerms = [
        "model coeziv", "formula coeziunii", "3.14", "3.14δh", "3.14Δh",
        "sergiu bulboacă", "sergiu bulboaca", "coeziv.vercel.app", "coerență",
        "coerenta", "homeostazie", "semantic", "uman", "viață", "viata",
        "suflet", "energie", "echilibru"
      ];

      const badTerms = [
        "terasament", "terasamente", "pământuri coezive", "pamanturi coezive",
        "sol coeziv", "soluri coezive", "geotehnic", "geotehnică", "geotehnica",
        "compactarea", "tapiteria", "tapiserie", "honda", "broșura-model", "brosura-model"
      ];

      let score = 0;

      for (const term of goodTerms) {
        if (haystack.includes(term.toLowerCase())) score += 1.2;
        if (input.includes(term.toLowerCase())) score += 0.2;
      }

      for (const term of badTerms) {
        if (haystack.includes(term.toLowerCase())) score -= 3;
      }

      if (haystack.includes("coeziv")) score += 0.4;
      if (haystack.includes("pdf")) score -= 0.4;

      return score;
    }

    const H = humanMode ? calcHumanResonance(text) : 0;
    const Vnum = humanMode ? (F + L + C + H) / 4 : (F + L + C) / 3;
    const V = Number(Vnum.toFixed(2));

    // Căutare opțională (nu bloca dacă lipsește cheia)
    let sources = [];
    if (process.env.SERPER_API_KEY) {
      try {
        const query = buildSearchQuery(text);
        const serp = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": process.env.SERPER_API_KEY,
          },
          body: JSON.stringify({ q: query, gl: "ro", hl: "ro" }),
        });

        if (serp.ok) {
          const serpData = await serp.json();
          sources = (serpData?.organic || [])
            .map((r) => ({
              title: r.title || "Sursă",
              link: r.link || "#",
              snippet: r.snippet || "",
              relevance: sourceRelevanceScore(r, text),
            }))
            .filter((source) => source.relevance > 0)
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, 5)
            .map(({ title, link }) => ({ title, link }));
        }
      } catch { /* ignore */ }
    }

    const summary = generateCohesiveExplanation(F, L, C, H, Boolean(humanMode));

    return res.status(200).json({
      mode: humanMode ? "ΔH" : "Δ",
      factual_score: F,
      logic_score: L,
      semantic_score: C,
      human_score: humanMode ? H : undefined,
      V,
      verdict: cohesiveVerdict(V, Boolean(humanMode)),
      summary: summary || gptJson.summary || "—",
      sources,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Eroare internă în analiza Coezivă 3.14Δ/ΔH.",
      detail: String(err?.message || err).slice(0, 500),
    });
  }
}
