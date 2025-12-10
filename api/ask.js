// api/ask.js
// Asistent Coeziv 3.14 – CoezivWallet-AI + RAG Coeziv + Browsing Coeziv-Hibrid (Serper)

import OpenAI from "openai";
import { retrieveCohezivContext } from "../coeziv_knowledge.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* -------------------------------------------------------------------------- */
/*                        Modul de căutare pe internet                        */
/* -------------------------------------------------------------------------- */

/**
 * Browsing Coeziv-Hibrid:
 * - folosește browsing ca FLUX extern doar când Structura + domeniul o cer;
 * - ia în considerare:
 *   - verbe de tip "caută / verifică / află / search";
 *   - markeri de recență ("ultimele știri, prețul acum, recent, latest news...");
 *   - domenii dinamice (economie, AI, tehnic, social, politic, ecologie);
 *   - protecție pentru întrebări despre Modelul Coeziv / apă / 3.14.
 */
function shouldUseWebSearchHybrid(userMessage, domainsLocal, jState) {
  if (!userMessage) return false;
  const t = userMessage.toLowerCase();

  const hasSearchVerb = [
    "cauta",
    "caută",
    "verifica",
    "verifică",
    "afla",
    "află",
    "gaseste",
    "găsește",
    "search",
    "look up",
    "check",
    "vezi",
  ].some((p) => t.includes(p));

  const hasInternetWord = [
    "pe internet",
    "online",
    "pe net",
    "on the web",
    "web",
  ].some((p) => t.includes(p));

  const recencyMarkers = [
    "ultimele stiri",
    "ultimele știri",
    "stiri recente",
    "știri recente",
    "noutati",
    "noutăți",
    "informatii recente",
    "informații recente",
    "acum",
    "azi",
    "today",
    "recent",
    "latest",
    "latest news",
    "în timp real",
    "in timp real",
    "prețul acum",
    "pretul acum",
    "prețul",
    "pretul",
    "cotatia",
    "cotația",
    "price",
    "exchange rate",
    "market cap"
  ];
  const mentionsRecency = recencyMarkers.some((p) => t.includes(p));

  // domenii dinamice potrivite pentru browsing
  const allowedDomains = [
    "economie",
    "tehnic",
    "ai_advanced",
    "social",
    "politic",
    "ecologie",
  ];
  const localActiveDomains = Object.entries(domainsLocal || {})
    .filter(([_, v]) => v > 0.25)
    .map(([d]) => d);
  const hasAllowedDomain = localActiveDomains.some((d) =>
    allowedDomains.includes(d)
  );

  const coezivCoreMarkers = [
    "modelul coeziv",
    "model coeziv",
    "coeziv 3.14",
    "coeziv3.14",
    "3.14",
    "3,14",
    "apa",
    "apă",
    "homeostazie",
    "tensiune structurala",
    "tensiune structurală",
  ];
  const isCohezivCore = coezivCoreMarkers.some((p) => t.includes(p));

  // 1) dacă userul cere clar "caută pe internet" → browsing obligatoriu
  if (hasSearchVerb && hasInternetWord) {
    return true;
  }

  // 2) întrebări Coezive pure → nu fac browsing implicit
  if (isCoezivCore && !hasInternetWord) {
    return false;
  }

  // 3) verbe de căutare + recență + domeniu permis
  if (hasSearchVerb && mentionsRecency && hasAllowedDomain) {
    return true;
  }

  // 4) fără verb, dar întrebare clar dinamică (preț BTC etc.)
  if (!hasSearchVerb && hasAllowedDomain) {
    const dynamicHardKeywords = [
      "pretul bitcoin",
      "prețul bitcoin",
      "bitcoin acum",
      "cotatia bitcoin",
      "cotația bitcoin",
      "btc acum",
      "btc price",
      "stiri bitcoin",
      "știri bitcoin",
      "stiri crypto",
      "știri crypto",
      "actualizari",
      "actualizări",
      "update",
      "updates"
    ];
    const isDynamic = dynamicHardKeywords.some((p) => t.includes(p));
    if (isDynamic || mentionsRecency) {
      return true;
    }
  }

  // 5) dacă J este deja tensionat, nu mai băgăm browsing peste
  if (jState && jState.regime === "tensed") {
    return false;
  }

  return false;
}

/**
 * Construiește query-ul pentru Serper din întrebarea utilizatorului.
 */
function buildSearchQuery(userMessage) {
  if (!userMessage) return "";
  let q = userMessage.toLowerCase();

  const patternsToStrip = [
    "cauta pe internet",
    "caută pe internet",
    "cauta online",
    "caută online",
    "cauta pe net",
    "caută pe net",
    "verifica pe internet",
    "verifică pe internet",
    "cauta stiri despre",
    "caută știri despre",
    "cauta stiri",
    "caută știri",
    "fa o cautare pe internet",
    "fă o căutare pe internet",
    "cauta despre",
    "caută despre",
    "cauta informatii despre",
    "caută informații despre"
  ];

  for (const p of patternsToStrip) {
    q = q.replace(p, "");
  }

  q = q.replace(/\s+/g, " ").trim();
  if (!q) q = userMessage.trim();

  return q;
}

/**
 * Caută pe internet folosind Serper și întoarce un text coeziv cu rezultate.
 * IMPORTANT: citim body-ul O SINGURĂ DATĂ → fără „body stream already read”.
 */
async function webSearchSerper(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.warn("SERPER_API_KEY lipsă – modul browsing Coeziv este dezactivat.");
    return "";
  }

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 6,
      }),
    });

    const text = await response.text(); // citim body-ul o singură dată

    if (!response.ok) {
      console.warn("Serper API error:", response.status, text);
      return "";
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.warn("Eroare: răspuns Serper ne-JSON:", text);
      return "";
    }

    const results = [];

    if (Array.isArray(data.news)) {
      data.news.slice(0, 3).forEach(item => {
        results.push(`• [ȘTIRE] ${item.title} — ${item.snippet || ""} (${item.link})`);
      });
    }

    if (Array.isArray(data.organic)) {
      data.organic.slice(0, 3).forEach(item => {
        results.push(`• ${item.title} — ${item.snippet || ""} (${item.link})`);
      });
    }

    if (!results.length) return "";

    return "Rezultate sintetizate din internet (Serper):\n" + results.join("\n");

  } catch (err) {
    console.error("Eroare la webSearchSerper:", err);
    return "";
  }
}

/* -------------------------------------------------------------------------- */
/*                        CoezivWallet – Structură 2π                         */
/* -------------------------------------------------------------------------- */

function detectDomains(text) {
  const keywords = {
    medical: ["tensiune", "simptom", "vaccin", "doctor", "diagnostic", "tratament", "medic"],
    legal: ["contract", "instanta", "instanță", "avocat", "lege", "proces", "judecator", "judecător"],
    politic: ["guvern", "stat", "partid", "politic", "alegeri", "parlament", "coruptie", "corupție"],
    psihologic: ["anxietate", "depresie", "teama", "teamă", "frica", "frică", "psiholog", "terapie", "emoțional", "emotional"],
    tehnic: ["algoritm", "server", "retea", "rețea", "programare", "cod", "ai", "model", "neuron"],
    neuro: ["neuron", "sinaps", "ax", "dopamin", "plasticit", "cortex", "hipocamp"],
    economie: ["pia", "infla", "capital", "ofert", "cerer", "econom", "bani", "moned", "bitcoin", "btc", "crypto", "criptomoned"],
    ecologie: ["ecosistem", "habitat", "biodivers", "specie", "lanț trofic", "poluare", "climat"],
    social: ["grup", "comunit", "institu", "colectiv", "societ", "norme", "roluri"],
    ai_advanced: ["multi-agent", "agent", "policy", "reinforcement", "memorie", "vector", "embedding"]
  };

  const lower = text.toLowerCase();
  const scores = {};

  for (const [domain, words] of Object.entries(keywords)) {
    scores[domain] = words.reduce(
      (acc, w) => acc + (lower.includes(w) ? 1 : 0),
      0
    );
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;

  const normalized = {};
  for (const d of Object.keys(scores)) {
    normalized[d] = scores[d] / total;
  }

  return normalized;
}

function detectFFlags(text, contextDepth, conflictScore, domains) {
  const flags = {
    F1_domain_mix: false,
    F2_global_jump: false,
    F3_oversaturation: false
  };

  const active = Object.entries(domains).filter(([_, v]) => v > 0.2);
  if (active.length >= 2) flags.F1_domain_mix = true;

  if (contextDepth > 0.7 && conflictScore > 0) {
    flags.F3_oversaturation = true;
  }

  const personalMarkers = ["eu", "mie", "la mine", "am pățit"];
  const universalizers = ["toți", "toate", "mereu", "niciodată", "întotdeauna", "oricine", "orice"];

  const lower = text.toLowerCase();
  const personal = personalMarkers.some(m => lower.includes(m));
  const universal = universalizers.some(u => lower.includes(u));
  if (personal && universal) flags.F2_global_jump = true;

  return flags;
}

function computeJ(contextDepth, conflictScore, flags) {
  const numFlags = Object.values(flags).filter(v => v).length;
  const base = 0.3 * contextDepth + 0.8 * conflictScore;
  const J = base + 0.25 * numFlags;

  let regime = "ordered";
  if (J >= 1.0) regime = "tensed";
  else if (J >= 0.5) regime = "mixed";

  return { J, regime };
}

function decidePolicy(Jstate, flags, domains) {
  const dominant = Object.entries(domains)
    .filter(([_, v]) => v > 0.2)
    .map(([d, _]) => d);

  if (Jstate.regime === "tensed") {
    if (flags.F3_oversaturation) {
      return { action: "trim_context_and_clarify", dominant };
    }
    return { action: "clarify_first", dominant };
  }

  if (flags.F1_domain_mix || flags.F2_global_jump) {
    return { action: "domain_declare_and_reframe", dominant };
  }

  if (flags.F3_oversaturation) {
    return { action: "trim_context", dominant };
  }

  return { action: "normal_answer", dominant };
}

/**
 * CoezivWallet – implementare 2π:
 * Structură (istoric global) → Flux (mesaj curent) → Reorganizare (J_local + flags) → Noua Structură (policy)
 */
function runCohezivWallet(history, userMessage) {
  const historyText = (history || [])
    .map(h => h.content || "")
    .join("\n")
    .trim();
  const lastText = (userMessage || "").trim();

  // STRUCTURĂ – profil global (telemetrie)
  const fullText = (historyText + "\n" + lastText).trim();
  const wordCountGlobal = fullText.split(/\s+/).filter(Boolean).length;
  const contextDepthGlobal = Math.min(wordCountGlobal / 800, 1.0);
  const domainsGlobal = detectDomains(fullText);
  const activeDomainsGlobal = Object.values(domainsGlobal).filter(v => v > 0.15).length;
  const conflictScoreGlobal =
    activeDomainsGlobal > 1 ? Math.min(activeDomainsGlobal / 3, 1.0) : 0;

  // FLUX – profil local (doar mesajul curent)
  const wordCountLocal = lastText.split(/\s+/).filter(Boolean).length;
  const contextDepthLocal = Math.min(wordCountLocal / 80, 1.0);
  const domainsLocal = detectDomains(lastText);
  const activeDomainsLocal = Object.values(domainsLocal).filter(v => v > 0.15).length;
  const conflictScoreLocal =
    activeDomainsLocal > 1 ? Math.min(activeDomainsLocal / 3, 1.0) : 0;

  // REORGANIZARE – erori locale + J_local
  const flagsLocal = detectFFlags(
    lastText,
    contextDepthLocal,
    conflictScoreLocal,
    domainsLocal
  );
  const Jlocal = computeJ(contextDepthLocal, conflictScoreLocal, flagsLocal);

  // NOUA STRUCTURĂ – policy
  const policy = decidePolicy(Jlocal, flagsLocal, domainsLocal);

  return {
    rho: {
      contextDepth_global: contextDepthGlobal,
      conflictScore_global: conflictScoreGlobal,
      domains_global: domainsGlobal,
      contextDepth_local: contextDepthLocal,
      conflictScore_local: conflictScoreLocal,
      domains_local: domainsLocal
    },
    flags: flagsLocal,
    j_state: Jlocal,
    policy
  };
}

/* -------------------------------------------------------------------------- */
/*                          Handler Vercel /api/ask                            */
/* -------------------------------------------------------------------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ error: "Use POST" });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const userMessage = body.message || "";
    const history = body.history || []; // [{role, content}, ...]

    if (!userMessage.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    // 1) Analiză Coezivă
    const analysis = runCohezivWallet(history, userMessage);

    // 2) Politici care NU mai apelează LLM (clarificări directe)
    if (analysis.policy.action === "clarify_first") {
      return res.status(200).json({
        assistant_reply:
          "Întrebarea ta combină mai multe lucruri sau nu este suficient de clară. Reformulează, te rog, într-o singură propoziție clară.",
        analysis,
        policy_output: analysis.policy,
        used_web_search: false,
      });
    }

    if (analysis.policy.action === "trim_context_and_clarify") {
      return res.status(200).json({
        assistant_reply:
          "Contextul este foarte mare și amestecat. Spune-mi, te rog, care este întrebarea ta principală acum, într-o frază.",
        analysis,
        policy_output: analysis.policy,
        used_web_search: false,
      });
    }

    // 3) Construim SYSTEM: Model Coeziv + RAG + Browsing Coeziv-Hibrid

    const baseSystem = `
Ești Asistentul Coeziv 3.14.

1) Modelul Coeziv:
- folosești raportul 3.14 doar ca analog conceptual între o stare internă de coeziune maximă (43°C) și una flexibilă (25°C);
- respecți pragurile 39.86°C și 44.7°C doar ca repere conceptuale, fără a inventa noi proprietăți fizice ale apei;
- menții separarea strictă a domeniilor (fizic, psihologic, tehnic, social, neuro, economic, ecologic etc.).

2) Modelul 2π:
- când este util, explici răspunsul prin secvența:
  Structură → Flux → Reorganizare → Noua Structură,
  într-o secțiune separată numită "Explicație 2π".

3) Disciplina Coezivă:
- nu amesteci metafore cu afirmații fizice;
- nu folosești numeric 3.14 în psihologie, AI, economie sau alte domenii non-fizice;
- refuzi politicos extrapolările abuzive (erorile F1..F6).

4) Motor conceptual (Concept Engine):
- DOAR LA CERERE EXPLICITĂ (ex: "propune un concept nou", "inventăm un termen coeziv"):
  - poți propune concepte noi, dar le prezinți clar ca modele teoretice, nu ca fapte experimentale;
  - explici conceptul prin Structură, Flux, Reorganizare, Noua Structură;
  - verifici consistența cu Modelul Coeziv și precizezi limitările.

5) Browsing Coeziv:
- atunci când primești context suplimentar din internet, tratează-l ca FLUX extern:
  - compară-l cu structura ta internă și cu Modelul Coeziv;
  - dacă există contradicții sau incertitudini, menționează-le explicit;
  - nu prezenta informațiile online ca absolut sigure, ci ca date de lucru.
- Integrează rezultatele într-o mică "Explicație 2π" atunci când are sens (Structură inițială, Fluxul noilor informații, Reorganizarea, Noua Structură).

6) Despre acces la internet:
- Este INTERZIS să spui fraze de tip:
  "nu pot căuta pe internet", "nu am acces la internet", "cunoștințele mele sunt limitate la 2023".
- Dacă nu ai folosit modulul de căutare pentru o întrebare, poți spune doar:
  "Pentru acest răspuns folosesc cunoașterea mea internă și contextul Coeziv disponibil."
`;

    const dominantDomains = analysis.policy.dominant || [];
    const domainHint = dominantDomains[0] || null;
    const coezivContext = retrieveCohezivContext(userMessage, domainHint);

    const domainsLocal = analysis.rho?.domains_local || {};
    let webContext = "";
    let usedWebSearch = false;

    if (
      shouldUseWebSearchHybrid(
        userMessage,
        domainsLocal,
        analysis.j_state
      )
    ) {
      const q = buildSearchQuery(userMessage);
      webContext = await webSearchSerper(q);
      if (webContext) usedWebSearch = true;
    }

    let systemContent =
      baseSystem +
      "\n\nContext Coeziv intern (fragmente din Modelul Coeziv):\n" +
      (coezivContext ||
        "(nu a fost găsit context Coeziv specific pentru această întrebare; răspunde doar cu informații sigure și generale)");

    if (webContext) {
      systemContent +=
        "\n\n---\n\nContext suplimentar din căutarea pe internet (Serper):\n" +
        webContext +
        "\n\nIntegrează aceste informații în logica Coezivă, clarificând sursele și limitările.";
    }

    if (analysis.policy.action === "domain_declare_and_reframe") {
      const doms = dominantDomains.length
        ? dominantDomains.join(", ")
        : "domeniul tău de competență";

      systemContent +=
        "\n\nInstrucțiuni suplimentare pentru răspunsul curent:\n" +
        `- Declară explicit că răspunzi în principal din perspectiva: ${doms}.\n` +
        "- Nu trage concluzii globale dintr-un singur caz.\n" +
        "- Evită teorii conspiraționiste sau afirmații politice speculative.\n";
    }

    const messages = [];
    messages.push({ role: "system", content: systemContent });

    for (const m of history) {
      if (m.role && m.content) messages.push(m);
    }
    messages.push({ role: "user", content: userMessage });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const reply = completion.choices[0].message.content || "";

    return res.status(200).json({
      assistant_reply: reply,
      analysis,
      policy_output: analysis.policy,
      used_web_search: usedWebSearch,
    });
  } catch (error) {
    console.error("Eroare în /api/ask:", error);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message:
        "A apărut o eroare internă în Asistentul Coeziv. Poți încerca din nou sau poți reformula întrebarea.",
      details: error?.message || String(error),
    });
  }
}
