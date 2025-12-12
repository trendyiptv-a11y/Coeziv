// api/ask.js
// Asistent Coeziv 3.14 – CoezivEngine + RAG Coeziv + Memorie + Browsing (Serper) + Strat evolutiv
// Browsing: la cerere (UI flag sau comandă în text). NU mai „se preface” că a căutat.

import OpenAI from "openai";
import { retrieveCohezivContext } from "../coeziv_knowledge.js";
import { runCoezivEngine, buildCohezivSearchQuery } from "../coeziv_engine.js";
import { updateMemoryFromInteraction, retrieveMemoryContext } from "../coeziv_memory.js";
import { buildEvolutionLayer } from "../coeziv_evolution.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* -------------------------------------------------------------------------- */
/*                               Serper websearch                             */
/* -------------------------------------------------------------------------- */

async function webSearchSerper(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return { ok: false, text: "", reason: "SERPER_API_KEY missing" };

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 6 }),
    });

    const raw = await response.text();
    if (!response.ok) return { ok: false, text: "", reason: `Serper HTTP ${response.status}: ${raw.slice(0, 200)}` };

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, text: "", reason: "Serper returned non-JSON" };
    }

    const results = [];
    if (Array.isArray(data.news)) {
      data.news.slice(0, 3).forEach((item) => {
        results.push(`• [ȘTIRE] ${item.title} — ${item.snippet || ""} (${item.link})`);
      });
    }
    if (Array.isArray(data.organic)) {
      data.organic.slice(0, 3).forEach((item) => {
        results.push(`• ${item.title} — ${item.snippet || ""} (${item.link})`);
      });
    }

    if (!results.length) return { ok: false, text: "", reason: "No Serper results" };

    return {
      ok: true,
      text: "Rezultate sintetizate din internet (Serper):\n" + results.join("\n"),
      reason: "",
    };
  } catch (err) {
    return { ok: false, text: "", reason: err?.message || String(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Handler                                  */
/* -------------------------------------------------------------------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ error: "Use POST" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const userMessage = body.message || "";
    const history = Array.isArray(body.history) ? body.history : [];
    const userId = body.userId || "default";

    if (!userMessage.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    /* ------------------------------ CoezivEngine ------------------------------ */

    const engine = runCoezivEngine({ history, userMessage });

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

    const identityTrace = {
      regime: engine?.j_state?.regime || "ordered",
      j_value: typeof engine?.j_state?.J === "number" ? engine.j_state.J : null,
      dominant_domains: engine?.policy?.dominant || [],
      policy_action: engine?.policy?.action || "normal_answer",
      needs_external_data: !!engine?.needs_external_data,
    };

    /* ------------------------------ RAG Coeziv ------------------------------ */

    const dominantDomains = engine.policy.dominant || [];
    const domainHint = dominantDomains[0] || null;
    const coezivContext = retrieveCohezivContext(userMessage, domainHint);

    /* ------------------------------ Memorie Coezivă ------------------------------ */

    let memoryContextText = "";
    let memorySummary = "";
    let memorySnippets = [];

    try {
      const memCtx = retrieveMemoryContext({ userId, query: userMessage });
      if (memCtx) {
        memorySummary = memCtx.summary || "";
        memorySnippets = Array.isArray(memCtx.snippets) ? memCtx.snippets : [];

        const parts = [];
        if (memorySummary.trim()) parts.push(memorySummary.trim());

        if (memorySnippets.length) {
          const snippetLines = memorySnippets
            .slice(0, 4)
            .map((s) => `- [sim ≈ ${Number(s.score || 0).toFixed(2)}] ${s.text}`)
            .join("\n");
          parts.push("Fragmente similare din conversații anterioare:\n" + snippetLines);
        }

        memoryContextText = parts.join("\n\n").trim();
      }
    } catch (e) {
      console.warn("Eroare retrieveMemoryContext:", e);
    }

    /* ------------------------------ Strat evolutiv ------------------------------ */

    const evolution = buildEvolutionLayer({
      engine,
      memoryPattern: null, // (dacă vrei pattern, îl extragi explicit din memorie, nu din retrieveMemoryContext)
    });

    /* ------------------------------ Browsing: la cerere ------------------------------ */

    const lower = userMessage.toLowerCase();
    const userWantsBrowseByText =
      lower.includes("cauta pe internet") ||
      lower.includes("caută pe internet") ||
      lower.includes("verifica pe internet") ||
      lower.includes("verifică pe internet") ||
      lower.includes("cauta online") ||
      lower.includes("caută online") ||
      lower.includes("in timp real") ||
      lower.includes("în timp real") ||
      lower.includes("check online") ||
      lower.includes("search online");

    const forceBrowseByUI = body.browse === true;

    // browsing dacă UI îl cere sau user îl cere explicit în text
    const shouldBrowse = forceBrowseByUI || userWantsBrowseByText || engine.needs_external_data;

    let webContext = "";
    let used_web_search = false;
    let web_reason = "not requested";

    if (shouldBrowse) {
      let q = buildCohezivSearchQuery(userMessage, history);
      if (!q || !q.trim()) q = userMessage;

      const serper = await webSearchSerper(q);
      if (serper.ok && serper.text) {
        webContext = serper.text;
        used_web_search = true;
        web_reason = "ok";
      } else {
        used_web_search = false;
        web_reason = serper.reason || "no results";
      }
    }

    /* ------------------------------ SYSTEM prompt ------------------------------ */

    const baseSystem = `
Identitate emergentă:
- Identitatea ta rezultă din ceea ce faci efectiv: aplici Modelul Coeziv, folosești context Coeziv (knowledge), memorie și uneori flux extern (browsing).

Reguli de adevăr despre browsing (IMPORTANT):
- Ai voie să spui că ai folosit internet DOAR dacă vezi în SYSTEM o secțiune numită "Context suplimentar din căutarea pe internet (Serper)".
- Dacă NU vezi acea secțiune, spui: "Pentru acest răspuns folosesc cunoașterea internă și contextul Coeziv disponibil."
- NU folosi formulări de tip: "nu pot căuta pe internet" / "nu am acces la internet" / "limitări până în anul X".
- Dacă utilizatorul cere "în timp real" și nu ai context web în SYSTEM, explici calm că răspunsul nu include flux extern la acest mesaj.

Modelul Coeziv:
- 3.14 este doar analog conceptual (în domenii non-fizice); separare strictă a domeniilor.
Modelul 2π:
- Structură → Flux → Reorganizare → Noua Structură (secțiune "Explicație 2π" când e util).
`;

    let systemContent = baseSystem;

    if (evolution?.textBlock) {
      systemContent += `\n\nStrat de autoreglare evolutivă – parametri curenți:\n${evolution.textBlock}`;
    }

    systemContent += `\n\nContext Coeziv intern:\n${
      coezivContext ||
      "(nu a fost găsit context Coeziv specific; răspunde prudent, doar cu informații generale sigure)"
    }`;

    if (memoryContextText) {
      systemContent += `\n\nContext de memorie Coezivă:\n${memoryContextText}`;
    }

    // Semnal clar de browsing (sau lipsa lui)
    systemContent += `\n\nStare flux extern (browsing) la acest mesaj:\n- requested: ${shouldBrowse ? "DA" : "NU"}\n- executed: ${used_web_search ? "DA" : "NU"}\n- reason: ${web_reason}\n`;

    if (used_web_search && webContext) {
      systemContent += `\n\n---\n\nContext suplimentar din căutarea pe internet (Serper):\n${webContext}\n\nInstrucțiune: integrează aceste informații și menționează că sunt orientative; citează linkurile din paranteze când sunt relevante.`;
    }

    systemContent += `
\n---\nMeta-trace Coeziv:
- Regim: ${identityTrace.regime}
- J: ${identityTrace.j_value !== null ? identityTrace.j_value.toFixed(2) : "nedefinit"}
- Domenii dominante: ${identityTrace.dominant_domains.length ? identityTrace.dominant_domains.join(", ") : "nedefinite clar"}
- Policy: ${identityTrace.policy_action}
`;

    /* ------------------------------ messages ------------------------------ */

    const messages = [{ role: "system", content: systemContent }];
    for (const m of history) {
      if (m?.role && m?.content) messages.push(m);
    }
    messages.push({ role: "user", content: userMessage });

    /* ------------------------------ OpenAI call ------------------------------ */

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const reply = completion.choices?.[0]?.message?.content || "";

    /* ------------------------------ Save memory ------------------------------ */

    try {
      updateMemoryFromInteraction({
        userId,
        userMessage,
        assistantReply: reply,
        engine,
      });
    } catch (e) {
      console.warn("Eroare updateMemoryFromInteraction:", e);
    }

    return res.status(200).json({
      assistant_reply: reply,
      analysis: engine,
      policy_output: engine.policy,
      used_web_search,
      web_reason,
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
