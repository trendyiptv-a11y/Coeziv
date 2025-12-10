// api/ask.js
// Asistent Coeziv 3.14 – CoezivWallet-AI + RAG Coeziv + Internet Search (Serper)

// Necesită:
// - OPENAI_API_KEY (deja setat la tine în Vercel)
// - SERPER_API_KEY (pentru căutare pe internet via https://serper.dev)

import OpenAI from "openai";
import { retrieveCohezivContext } from "../coeziv_knowledge.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* -------------------------------------------------------------------------- */
/*                         Modul de căutare pe internet                        */
/* -------------------------------------------------------------------------- */

function shouldUseWebSearch(userMessage) {
  if (!userMessage) return false;
  const t = userMessage.toLowerCase();

  const triggers = [
    "cauta pe internet",
    "caută pe internet",
    "cauta online",
    "caută online",
    "cauta pe net",
    "caută pe net",
    "verifica pe internet",
    "verifică pe internet",
    "cauta stiri",
    "caută știri",
    "ultimele stiri",
    "ultimele știri",
    "stiri recente",
    "știri recente",
    "latest news",
    "search the web",
    "search on the web",
    "look up",
    "check online"
  ];

  return triggers.some((p) => t.includes(p));
}

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
    "caută știri"
  ];

  for (const p of patternsToStrip) {
    q = q.replace(p, "");
  }

  // scoatem spații duble
  q = q.replace(/\s+/g, " ").trim();
  if (!q) q = userMessage.trim();

  return q;
}

async function webSearchSerper(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.warn("SERPER_API_KEY lipsă – modul internet dezactivat.");
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
        num: 5,
      }),
    });

    if (!response.ok) {
      console.warn("Serper API error:", response.status, await response.text());
      return "";
    }

    const data = await response.json();

    const results = [];

    // întâi știri, dacă există
    if (Array.isArray(data.news)) {
      for (const item of data.news.slice(0, 3)) {
        results.push(
          `• [ȘTIRI] ${item.title} — ${item.snippet || ""} (${item.link})`
        );
      }
    }

    // apoi rezultate organice
    if (Array.isArray(data.organic)) {
      for (const item of data.organic.slice(0, 3)) {
        results.push(
          `• ${item.title} — ${item.snippet || ""} (${item.link})`
        );
      }
    }

    if (!results.length) return "";

    return (
      "Rezultate sintetizate din căutarea pe internet:\n" +
      results.join("\n")
    );
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
    economie: ["pia", "infla", "capital", "ofert", "cerer", "econom", "bani", "moned"],
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

  // F1 — amestec de domenii în același flux local
  const active = Object.entries(domains).filter(([_, v]) => v > 0.2);
  if (active.length >= 2) flags.F1_domain_mix = true;

  // F3 — suprasaturare de context în mesajul curent
  if (contextDepth > 0.7 && conflictScore > 0) {
    flags.F3_oversaturation = true;
  }

  // F2 — salt local → global în aceeași propoziție
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
 * CoezivWallet – 2π explicit:
 * Structură (istoric global) → Flux (mesaj curent) → Reorganizare (J_local + flags) → Noua Structură (policy)
 */
function runCohezivWallet(history, userMessage) {
  const historyText = (history || [])
    .map(h => h.content || "")
    .join("\n")
    .trim();
  const lastText = (userMessage || "").trim();

  // STRUCTURĂ – profil global (doar pentru telemetrie)
  const fullText = (historyText + "\n" + lastText).trim();
  const wordCountGlobal = fullText.split(/\s+/).filter(Boolean).length;
  const contextDepthGlobal = Math.min(wordCountGlobal / 800, 1.0);
  const domainsGlobal = detectDomains(fullText);
  const activeDomainsGlobal = Object.values(domainsGlobal).filter(v => v > 0.15).length;
  const conflictScoreGlobal =
    activeDomainsGlobal > 1 ? Math.min(activeDomainsGlobal / 3, 1.0) : 0;

  // FLUX – profil local (mesajul curent)
  const wordCountLocal = lastText.split(/\s+/).filter(Boolean).length;
  const contextDepthLocal = Math.min(wordCountLocal / 80, 1.0);
  const domainsLocal = detectDomains(lastText);
  const activeDomainsLocal = Object.values(domainsLocal).filter(v => v > 0.15).length;
  const conflictScoreLocal =
    activeDomainsLocal > 1 ? Math.min(activeDomainsLocal / 3, 1.0) : 0;

  // REORGANIZARE – erori + J_local
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
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Use POST" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
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
    });
  }

  if (analysis.policy.action === "trim_context_and_clarify") {
    return res.status(200).json({
      assistant_reply:
        "Contextul este foarte mare și amestecat. Spune-mi, te rog, care este întrebarea ta principală acum, într-o frază.",
      analysis,
      policy_output: analysis.policy,
    });
  }

  // 3) Context Coeziv + (opțional) context de pe internet

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

5) Despre acces la internet și limite:
- Nu menționa spontan că nu ai acces la internet sau că ești limitat la o anumită dată.
- Dacă utilizatorul te întreabă explicit despre accesul la internet sau date foarte recente, explică simplu:
  "În acest asistent Coeziv folosesc un modul de căutare pe internet pentru a aduce informații actuale, atunci când îmi ceri asta explicit. În rest, lucrez cu cunoașterea mea internă și cu baza de cunoaștere Coezivă."
`;

  const dominantDomains = analysis.policy.dominant || [];
  const domainHint = dominantDomains[0] || null;
  const coezivContext = retrieveCohezivContext(userMessage, domainHint);

  let webContext = "";
  if (shouldUseWebSearch(userMessage)) {
    const q = buildSearchQuery(userMessage);
    webContext = await webSearchSerper(q);
  }

  let systemContent =
    baseSystem +
    "\n\nContext Coeziv relevant (fragmente din Modelul Coeziv):\n" +
    (coezivContext ||
      "(nu a fost găsit context Coeziv specific pentru această întrebare; răspunde doar cu informații sigure și generale)");

  if (webContext) {
    systemContent +=
      "\n\n---\n\nContext suplimentar din căutarea pe internet (Serper):\n" +
      webContext;
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

  // 4) Pregătim mesajele pentru LLM
  const messages = [];
  messages.push({ role: "system", content: systemContent });

  for (const m of history) {
    if (m.role && m.content) messages.push(m);
  }
  messages.push({ role: "user", content: userMessage });

  // 5) Apelăm LLM-ul
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });

  const reply = completion.choices[0].message.content;

  // 6) Returnăm răspunsul + analiza coezivă
  return res.status(200).json({
    assistant_reply: reply,
    analysis,
    policy_output: analysis.policy,
    used_web_search: !!webContext,
  });
}
