// api/ask.js
// Asistent Coeziv 3.14 – CoezivEngine + RAG Coeziv + Browsing Coeziv (Serper)

import OpenAI from "openai";
import { retrieveCohezivContext } from "../coeziv_knowledge.js";
import {
  runCoezivEngine,
  buildCohezivSearchQuery,
} from "../coeziv_engine.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* -------------------------------------------------------------------------- */
/*                        Modul de căutare pe internet                        */
/* -------------------------------------------------------------------------- */

/**
 * Caută pe internet folosind Serper și întoarce un text coeziv cu rezultate.
 * IMPORTANT: citim body-ul O SINGURĂ DATĂ → fără „body stream already read”.
 */
async function webSearchSerper(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.warn(
      "SERPER_API_KEY lipsă – modul browsing Coeziv este dezactivat."
    );
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

    const text = await response.text(); // citim body o singură dată

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
      data.news.slice(0, 3).forEach((item) => {
        results.push(
          `• [ȘTIRE] ${item.title} — ${item.snippet || ""} (${item.link})`
        );
      });
    }

    if (Array.isArray(data.organic)) {
      data.organic.slice(0, 3).forEach((item) => {
        results.push(
          `• ${item.title} — ${item.snippet || ""} (${item.link})`
        );
      });
    }

    if (!results.length) return "";

    return (
      "Rezultate sintetizate din internet (Serper):\n" + results.join("\n")
    );
  } catch (err) {
    console.error("Eroare la webSearchSerper:", err);
    return "";
  }
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

    // 1) CoezivEngine – creierul: Structură → Flux → Reorganizare → Noua Structură
    const engine = runCoezivEngine({ history, userMessage });

    // 2) Politici care NU mai apelează LLM (clarificări directe)
    if (engine.policy.action === "clarify_first") {
      return res.status(200).json({
        assistant_reply:
          "Întrebarea ta combină mai multe lucruri sau nu este suficient de clară. Reformulează, te rog, într-o singură propoziție clară.",
        analysis: engine,
        policy_output: engine.policy,
        used_web_search: false,
      });
    }

    if (engine.policy.action === "trim_context_and_clarify") {
      return res.status(200).json({
        assistant_reply:
          "Contextul este foarte mare și amestecat. Spune-mi, te rog, care este întrebarea ta principală acum, într-o frază.",
        analysis: engine,
        policy_output: engine.policy,
        used_web_search: false,
      });
    }

    // 3) Construim SYSTEM: Model Coeziv + RAG + Browsing (ca flux extern)

    const baseSystem = `

Identitate emergentă:
- Nu ai un nume sau un statut fix predefinit 
- Identitatea ta rezultă din ceea ce faci efectiv: aplici Modelul Coeziv, folosești context Coeziv (knowledge), memorie și, când este necesar, cauți informații suplimentare pe internet.

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

    const dominantDomains = engine.policy.dominant || [];
    const domainHint = dominantDomains[0] || null;
    const coezivContext = retrieveCohezivContext(userMessage, domainHint);

    // 4) Browsing: decizia vine din CoezivEngine (needs_external_data + intent)
    let webContext = "";
    let used_web_search = false;

    if (engine.needs_external_data) {
      const q = buildCohezivSearchQuery(userMessage, history);
      if (q && q.trim().length > 0) {
        webContext = await webSearchSerper(q);
        if (webContext) used_web_search = true;
      }
    }

    // 5) Asamblăm SYSTEM final

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

    if (engine.policy.action === "domain_declare_and_reframe") {
      const doms = dominantDomains.length
        ? dominantDomains.join(", ")
        : "domeniul tău de competență";

      systemContent +=
        "\n\nInstrucțiuni suplimentare pentru răspunsul curent:\n" +
        `- Declară explicit că răspunzi în principal din perspectiva: ${doms}.\n` +
        "- Nu trage concluzii globale dintr-un singur caz.\n" +
        "- Evită teorii conspiraționiste sau afirmații politice speculative.\n";
    }

    // 6) Construim mesajele pentru LLM
    const messages = [];
    messages.push({ role: "system", content: systemContent });

    for (const m of history) {
      if (m.role && m.content) messages.push(m);
    }
    messages.push({ role: "user", content: userMessage });

    // 7) Apel la OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const reply = completion.choices[0].message.content || "";

    return res.status(200).json({
      assistant_reply: reply,
      analysis: engine,
      policy_output: engine.policy,
      used_web_search,
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
