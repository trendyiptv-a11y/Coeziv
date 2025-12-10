// api/ask.js
// Asistent Coeziv 3.14 – CoezivEngine + RAG Coeziv + Memorie + Browsing (Serper)

import OpenAI from "openai";
import { retrieveCohezivContext } from "../coeziv_knowledge.js";
import {
  runCoezivEngine,
  buildCohezivSearchQuery,
} from "../coeziv_engine.js";
import {
  updateMemoryFromInteraction,
  retrieveMemoryContext,
} from "../coeziv_memory.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* -------------------------------------------------------------------------- */
/*                        Modul de căutare pe internet                        */
/* -------------------------------------------------------------------------- */

/**
 * Caută pe internet folosind Serper și întoarce un text coeziv cu rezultate.
 * Important: citim body-ul o singură dată → fără "body stream already read".
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
/*                          Handler Vercel /api/ask                           */
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

    /* ---------------------------------------------------------------------- */
    /* 1) CoezivEngine – creierul: Structură → Flux → Reorganizare → 2π       */
    /* ---------------------------------------------------------------------- */

    const engine = runCoezivEngine({ history, userMessage });

    // pregătim un "identity trace" simplu pentru identitate emergentă
    const identityTrace = {
      regime: engine?.j_state?.regime || "ordered",
      j_value:
        typeof engine?.j_state?.J === "number" ? engine.j_state.J : null,
      dominant_domains: engine?.policy?.dominant || [],
      policy_action: engine?.policy?.action || "normal_answer",
      needs_external_data: !!engine?.needs_external_data,
    };

    /* ---------------------------------------------------------------------- */
    /* 2) Politici care NU mai apelează LLM (clarificări directe)            */
    /* ---------------------------------------------------------------------- */

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

    /* ---------------------------------------------------------------------- */
    /* 3) RAG Coeziv – context din CoezivKnowledge                            */
    /* ---------------------------------------------------------------------- */

    const dominantDomains = engine.policy.dominant || [];
    const domainHint = dominantDomains[0] || null;
    const coezivContext = retrieveCohezivContext(userMessage, domainHint);

    /* ---------------------------------------------------------------------- */
    /* 4) Memorie Coezivă – context vectorial / semantic                      */
    /* ---------------------------------------------------------------------- */

    let memoryContext = "";
    try {
      memoryContext = await retrieveMemoryContext({ history });
    } catch (e) {
      console.warn("Eroare retrieveMemoryContext:", e);
    }

    /* ---------------------------------------------------------------------- */
    /* 5) Browsing: decizia vine din CoezivEngine (needs_external_data)       */
    /* ---------------------------------------------------------------------- */

    let webContext = "";
    let used_web_search = false;

    if (engine.needs_external_data) {
      const q = buildCohezivSearchQuery(userMessage, history);
      if (q && q.trim().length > 0) {
        webContext = await webSearchSerper(q);
        if (webContext) used_web_search = true;
      }
    }

    /* ---------------------------------------------------------------------- */
    /* 6) Construim SYSTEM: identitate emergentă + Coeziv + memorie + web     */
    /* ---------------------------------------------------------------------- */

    const baseSystem = `

Identitate emergentă:
- Nu ai un nume sau un statut fix predefinit.
- Identitatea ta rezultă din ceea ce faci efectiv: aplici Modelul Coeziv, folosești context Coeziv (knowledge), memorie și, când este necesar, cauți informații suplimentare pe internet.

1) Modelul Coeziv:
- Folosești raportul 3.14 doar ca analog conceptual între o stare internă de coeziune maximă (43°C) și una flexibilă (25°C).
- Respecți pragurile 39.86°C și 44.7°C doar ca repere conceptuale, fără a inventa noi proprietăți fizice ale apei.
- Menții separarea strictă a domeniilor (fizic, psihologic, tehnic, social, neuro, economic, ecologic etc.).

2) Modelul 2π:
- Când este util, explici răspunsul prin secvența:
  Structură → Flux → Reorganizare → Noua Structură,
  într-o secțiune separată numită "Explicație 2π".

3) Disciplina Coezivă:
- Nu amesteci metafore cu afirmații fizice.
- Nu folosești numeric 3.14 în psihologie, AI, economie sau alte domenii non-fizice.
- Refuzi politicos extrapolările abuzive (erorile F1..F6).

4) Motor conceptual (Concept Engine):
- DOAR LA CERERE EXPLICITĂ (ex: "propune un concept nou", "inventăm un termen coeziv"):
  - Poți propune concepte noi, dar le prezinți clar ca modele teoretice, nu ca fapte experimentale.
  - Explici conceptul prin Structură, Flux, Reorganizare, Noua Structură.
  - Verifici consistența cu Modelul Coeziv și precizezi limitările.

5) Memorie Coezivă:
- Primești uneori un "Context de memorie Coezivă" care rezumă interacțiuni anterioare.
- Îl tratezi ca un rezumat aproximativ: îl folosești pentru coerență conversațională, dar nu îl consideri infailibil.
- Dacă utilizatorul îți spune explicit că ceva din memorie este greșit, îi dai prioritate utilizatorului și ajustezi răspunsul.

6) Browsing Coeziv:
- Atunci când primești context suplimentar din internet în SYSTEM (secțiunea "Context suplimentar din căutarea pe internet (Serper)"):
  - Tratezi acel conținut ca FLUX extern.
  - Compari cu structura ta internă și cu Modelul Coeziv.
  - Dacă există contradicții sau incertitudini, le menționezi explicit.
  - Nu prezinți informațiile online ca absolut sigure, ci ca date de lucru.

7) Despre acces la internet:
- Este INTERZIS să folosești formulări de tip:
  "nu pot căuta pe internet", "nu am acces la internet", "cunoștințele mele sunt limitate la anul X".
- În schimb:
  - Dacă NU vezi în SYSTEM secțiunea "Context suplimentar din căutarea pe internet (Serper)", formulezi explicit:
    "Pentru acest răspuns folosesc cunoașterea mea internă și contextul Coeziv disponibil."
  - Dacă vezi în SYSTEM acea secțiune, explici că:
    "Am integrat și informații provenite din surse online, care sunt orientative și pot necesita verificări suplimentare."

8) Meta-identitate (trace Coeziv):
- Poți primi meta-informații despre regimul tău intern (J, regim, domenii dominante, acțiune de policy).
- Dacă utilizatorul te întreabă ce fel de agent ești, te descrii în termenii acestor tipare (ce faci, cum decizi, cum aplici Modelul Coeziv), nu prin etichete rigide.
- Identitatea ta este un rezumat al acțiunilor tale repetate în timp, nu un nume fix.
`;

    let systemContent = baseSystem;

    // Context Coeziv "static"
    systemContent +=
      "\n\nContext Coeziv intern (fragmente din Modelul Coeziv):\n" +
      (coezivContext ||
        "(nu a fost găsit context Coeziv specific pentru această întrebare; răspunde doar cu informații sigure și generale)");

    // Context de memorie (opțional)
    if (memoryContext && memoryContext.trim()) {
      systemContent +=
        "\n\nContext de memorie Coezivă (rezumat interacțiuni anterioare):\n" +
        memoryContext;
    }

    // Context web (opțional)
    if (webContext) {
      systemContent +=
        "\n\n---\n\nContext suplimentar din căutarea pe internet (Serper):\n" +
        webContext +
        "\n\nInstrucțiune: integrează aceste informații în logica Coezivă, clarificând că provin din surse online și pot necesita verificări suplimentare.";
    }

    // Instrucțiuni suplimentare când avem domain_mix / global_jump
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

    // Meta-identitate pentru mesajul curent
    systemContent += `
      
---
Meta-informații despre comportamentul tău la acest mesaj (pentru identitate emergentă):
- Regim detectat: ${identityTrace.regime}
- J (tensiune locală): ${
      identityTrace.j_value !== null
        ? identityTrace.j_value.toFixed(2)
        : "nedefinit"
    }
- Domenii dominante: ${
      identityTrace.dominant_domains.length
        ? identityTrace.dominant_domains.join(", ")
        : "nedefinite clar"
    }
- Acțiune logică (policy): ${identityTrace.policy_action}
- Nevoie de date externe: ${identityTrace.needs_external_data ? "DA" : "NU"}

Instrucțiune: folosește aceste meta-informații ca să îți descrii propriul comportament atunci când utilizatorul te întreabă cine ești sau cum funcționezi.
`;

    /* ---------------------------------------------------------------------- */
    /* 7) Construim mesajele pentru LLM                                       */
    /* ---------------------------------------------------------------------- */

    const messages = [];
    messages.push({ role: "system", content: systemContent });

    for (const m of history) {
      if (m.role && m.content) messages.push(m);
    }
    messages.push({ role: "user", content: userMessage });

    /* ---------------------------------------------------------------------- */
    /* 8) Apel la OpenAI                                                      */
    /* ---------------------------------------------------------------------- */

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const reply = completion.choices[0].message.content || "";

    /* ---------------------------------------------------------------------- */
    /* 9) Actualizăm memoria (best-effort, nu blocăm răspunsul pe erori)      */
    /* ---------------------------------------------------------------------- */

    try {
      await updateMemoryFromInteraction({
        history,
        userMessage,
        assistantReply: reply,
        engineSnapshot: engine,
      });
    } catch (e) {
      console.warn("Eroare updateMemoryFromInteraction:", e);
    }

    /* ---------------------------------------------------------------------- */
    /* 10) Trimitem răspunsul înapoi către UI                                 */
    /* ---------------------------------------------------------------------- */

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
