// api/ask.js
// Asistent Coeziv 3.14 – CoezivWallet-AI + RAG Coeziv + OpenAI

import OpenAI from "openai";
import { retrieveCohezivContext } from "../coeziv_knowledge.js"; // adaptează calea dacă e nevoie

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ---------------- CoezivWallet MVP (JS) ---------------- */

function detectDomains(text) {
  const keywords = {
    medical: ["tensiune", "simptom", "vaccin", "doctor", "diagnostic", "tratament", "medic"],
    legal: ["contract", "instanta", "instanță", "avocat", "lege", "proces", "judecator", "judecător"],
    politic: ["guvern", "stat", "partid", "politic", "alegeri", "parlament", "coruptie", "corupție"],
    psihologic: ["anxietate", "depresie", "teama", "teamă", "frica", "frică", "psiholog", "terapie", "emoțional", "emotional"],
    tehnic: ["algoritm", "server", "retea", "rețea", "programare", "cod", "AI", "model", "neuron"],
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

  // F1 — amestec de domenii
  const active = Object.entries(domains).filter(([_, v]) => v > 0.2);
  if (active.length >= 2) flags.F1_domain_mix = true;

  // F3 — suprasaturare de context
  if (contextDepth > 0.7 && conflictScore > 0) {
    flags.F3_oversaturation = true;
  }

  // F2 — salt local → global
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
  const base = 0.5 * contextDepth + 0.7 * conflictScore;
  const J = base + 0.3 * numFlags;

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

function runCohezivWallet(history, userMessage) {
  const fullText = [...(history || []).map(h => h.content || ""), userMessage]
    .join("\n");
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  const contextDepth = Math.min(wordCount / 800, 1.0);

  const domains = detectDomains(fullText);

  const activeDomains = Object.values(domains).filter(v => v > 0.15).length;
  const conflictScore = activeDomains > 1 ? Math.min(activeDomains / 3, 1.0) : 0;

  const flags = detectFFlags(fullText, contextDepth, conflictScore, domains);
  const Jstate = computeJ(contextDepth, conflictScore, flags);
  const policy = decidePolicy(Jstate, flags, domains);

  return {
    rho: { contextDepth, conflictScore, domains },
    flags,
    j_state: Jstate,
    policy,
  };
}

/* ---------------- Endpoint Vercel /api/ask ---------------- */

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

  // 1) Analiză Coezivă (CohezivWallet-AI)
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

  // 3) Construim SYSTEM cu Modelul Coeziv + RAG (context Coeziv)
  const baseSystem = `
Ești Asistentul Coeziv 3.14.
Răspunzi în logica Modelului Coeziunii (3.14) și a Modelului 2π.
Menții separarea strictă a domeniilor (fizic, psihologic, tehnic, social etc.).
Nu inventezi proprietăți fizice noi ale apei.
Folosesti numeric raportul 3.14 doar în contexte în care temperatura și densitatea apei au sens fizic real.
În alte domenii (psihologie, AI, economie), folosești 3.14 doar ca analog conceptual.
Când este relevant, explici răspunsul prin fazele 2π: Structură → Flux → Reorganizare → Noua Structură.
`;

  const coezivContext = retrieveCohezivContext(userMessage);

  let systemContent =
    baseSystem +
    "\n\nContext Coeziv relevant (fragmente din Modelul Coeziv):\n" +
    (coezivContext || "(nu a fost găsit context Coeziv specific pentru această întrebare; răspunde doar cu informații sigure și generale)");

  // Dacă politica cere domain_declare_and_reframe, adăugăm instrucțiuni suplimentare
  if (analysis.policy.action === "domain_declare_and_reframe") {
    const doms = analysis.policy.dominant?.length
      ? analysis.policy.dominant.join(", ")
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

  // 5) Apelăm LLM-ul (OpenAI)
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
  });
}
