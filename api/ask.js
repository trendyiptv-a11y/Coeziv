// api/ask.js
// Asistent Coeziv 3.14 – Engine + Knowledge + Browsing + Memory Engine

import OpenAI from "openai";
import { retrieveCohezivContext } from "../coeziv_knowledge.js";
import {
  runCoezivEngine,
  buildCohezivSearchQuery,
} from "../coeziv_engine.js";

import {
  getUserMemory,
  updateMemoryFromInteraction,
  retrieveMemoryContext,
} from "../coeziv_memory.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* -------------------------------------------------------------------------- */
/*                        Modul de căutare pe internet                        */
/* -------------------------------------------------------------------------- */

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
      body: JSON.stringify({ q: query, num: 6 }),
    });

    const text = await response.text(); // citire unică

    if (!response.ok) {
      console.warn("Serper API error:", response.status, text);
      return "";
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.warn("Serper a returnat un răspuns non-JSON:", text);
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
    return "Rezultate sintetizate din internet (Serper):\n" + results.join("\n");
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
    const history = body.history || [];
    const userId = body.userId || "default_user";

    if (!userMessage.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    /* -------------------------------------------------------------------- */
    /* 1) CoezivEngine – creierul: S0 → Flux → Reorganizare → S1             */
    /* -------------------------------------------------------------------- */

    const engine = runCoezivEngine({ history, userMessage });

    /* -------------------------------------------------------------------- */
    /* 2) Politici care NU apelează LLM                                     */
    /* -------------------------------------------------------------------- */

    if (engine.policy.action === "clarify_first") {
      return res.status(200).json({
        assistant_reply:
          "Întrebarea ta combină prea multe lucruri sau nu este clară. Reformulează într-o singură propoziție bine definită.",
        analysis: engine,
        policy_output: engine.policy,
        used_web_search: false,
      });
    }

    if (engine.policy.action === "trim_context_and_clarify") {
      return res.status(200).json({
        assistant_reply:
          "Contextul este încărcat și eterogen. Spune-mi întrebarea principală într-o frază.",
        analysis: engine,
        policy_output: engine.policy,
        used_web_search: false,
      });
    }

    /* -------------------------------------------------------------------- */
    /* 3) Construim SYSTEM – Model Coeziv + Knowledge + Memory + Browsing   */
    /* -------------------------------------------------------------------- */

    const baseSystem = `
Identitate emergentă (Asistent Coeziv 3.14):
- Nu ai un nume fix, ci te definești prin patternurile acțiunilor tale.
- Folosești Modelul Coeziv și Knowledge-ul Coeziv.
- Poți integra memorie persistentă (profil + fragmente) pentru coerență în timp.

1) Modelul Coeziv:
- Folosești 3.14 strict conceptual (43°C / 25°C).
- Nu amesteci domenii fizice cu metafore.
- Menții disciplina conceptuală: fizic ≠ psihologic ≠ tehnic etc.

2) Modelul 2π:
- Poți explica răspunsul prin secvența:
  Structură → Flux → Reorganizare → Noua Structură.

3) Browsing Coeziv:
- Dacă există context online, îl tratezi ca "Flux extern".
- Nu îl prezinți ca absolut sigur; menționezi limitele.

4) Concept Engine:
- Creezi concepte noi DOAR LA CERERE.
- Le explici în cadru 2π și menționezi clar că sunt modele teoretice.

5) Despre acces:
- Nu afirmi niciodată că "nu ai acces la internet".
- Dacă nu s-a folosit browsing, spui: "Folosesc cunoașterea internă Coezivă."
`;

    /* ------------------- Context Coeziv (RAG) ---------------------- */

    const dominantDomains = engine.policy.dominant || [];
    const domainHint = dominantDomains[0] || null;
    const coezivContext = retrieveCohezivContext(userMessage, domainHint);

    /* ------------------- Browsing extern --------------------------- */

    let webContext = "";
    let used_web_search = false;

    if (engine.needs_external_data) {
      const q = buildCohezivSearchQuery(userMessage, history);
      if (q && q.trim().length > 0) {
        webContext = await webSearchSerper(q);
        if (webContext) used_web_search = true;
      }
    }

    /* ------------------- Memorie Coezivă (D complet) --------------- */

    const memoryContext = retrieveMemoryContext({
      userId,
      query: userMessage,
      maxItems: 4,
    });

    /* -------------------------------------------------------------------- */
    /* Construim systemContent final                                        */
    /* -------------------------------------------------------------------- */

    let systemContent = baseSystem;

    systemContent += "\n\nContext Coeziv intern:\n";
    systemContent +=
      coezivContext ||
      "(nu există fragment Coeziv relevant; răspunde disciplinat și sigur)";

    if (memoryContext.summary || memoryContext.snippets.length) {
      systemContent += "\n\n---\nMemorie Coezivă (profil + fragmente relevante):\n";
      if (memoryContext.summary) {
        systemContent += "- Profil: " + memoryContext.summary + "\n";
      }
      if (memoryContext.snippets.length) {
        systemContent += "Fragmente similare:\n";
        memoryContext.snippets.forEach((sn, i) => {
          systemContent += `#${i + 1}: ${sn.text.slice(0, 350)}\n`;
        });
      }
    }

    if (webContext) {
      systemContent +=
        "\n\n---\nContext suplimentar din internet:\n" +
        webContext +
        "\nIntegrează-l disciplinat, menționând limitele.";
    }

    /* ---- Identitate emergentă (feedback intern pentru LLM) -------- */

    if (engine.identity_trace) {
      const it = engine.identity_trace;
      systemContent += `
---
Meta-informații (pentru identitate emergentă):
- Regim: ${it.regime}
- J: ${typeof it.j_value === "number" ? it.j_value.toFixed(2) : it.j_value}
- Domenii dominante: ${
        it.dominant_domains?.length ? it.dominant_domains.join(", ") : "nedefinite"
      }
- Acțiune logică: ${it.policy_action}
- Necesită date externe: ${it.needs_external_data ? "DA" : "NU"}
`;
    }

    /* -------------------------------------------------------------------- */
    /* 4) Construim mesajele pentru LLM                                     */
    /* -------------------------------------------------------------------- */

    const messages = [];
    messages.push({ role: "system", content: systemContent });

    for (const m of history) {
      if (m.role && m.content) messages.push(m);
    }
    messages.push({ role: "user", content: userMessage });

    /* -------------------------------------------------------------------- */
    /* 5) Apel la OpenAI                                                    */
    /* -------------------------------------------------------------------- */

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const reply = completion.choices[0].message.content || "";

    /* -------------------------------------------------------------------- */
    /* 6) Actualizăm memoria Coezivă                                        */
    /* -------------------------------------------------------------------- */

    updateMemoryFromInteraction({
      userId,
      userMessage,
      assistantReply: reply,
      engine,
    });

    /* -------------------------------------------------------------------- */
    /* 7) Returnăm răspunsul către UI                                       */
    /* -------------------------------------------------------------------- */

    return res.status(200).json({
      assistant_reply: reply,
      analysis: engine,
      policy_output: engine.policy,
      used_web_search,
      memory_debug: getUserMemory(userId), // poți dezactiva dacă nu vrei în UI
    });

  } catch (error) {
    console.error("Eroare în /api/ask:", error);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message:
        "Eroare internă în Asistentul Coeziv. Poți reformula întrebarea sau încerca din nou.",
      details: error?.message || String(error),
    });
  }
}
