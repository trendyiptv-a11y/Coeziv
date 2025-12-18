// /api/ask.js
// Controller curat: orchestrat, dar funcțional identic cu ask (13).js

import { buildSystemContext, commitInteraction } from "../coeziv_orchestrator.js";
import { runWebSearch, crawlDocumentIfNeeded } from "../web_tools.js"; // păstrezi ce aveai
import { callLLM } from "../llm_client.js"; // exact clientul tău existent

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const {
      message,
      history = [],
      user_id,
      browse,
      crawl,
    } = body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing message" });
    }

    const userId = user_id || "default";

    /* =========================================================
       1) ORCHESTRATOR — punct unic de adevăr
       ========================================================= */
    const ctx = buildSystemContext({
      userId,
      history,
      userMessage: message,
      options: {
        forceWeb: browse === true,
        maxMemoryItems: 4,
      },
    });

    const engine = ctx.engine;

    /* =========================================================
       2) DECIZIE WEB / CRAWL (logică IDENTICĂ, doar clară)
       ========================================================= */
    let used_web_search = false;
    let web_context_text = "";

    const shouldBrowse = ctx.web.needWeb === true;

    if (shouldBrowse) {
      used_web_search = true;

      // 🔎 SEARCH
      const searchResults = await runWebSearch(ctx.web.query);

      // 🕷️ CRAWL (dacă era deja în logica ta)
      const crawled = crawl === true
        ? await crawlDocumentIfNeeded(searchResults)
        : "";

      web_context_text = [
        "Date online (pentru verificare factuală):",
        searchResults || "",
        crawled || "",
      ].filter(Boolean).join("\n\n");
    }

    /* =========================================================
       3) SYSTEM PROMPT — coloană vertebrală
       ========================================================= */
    const systemMessages = [
      {
        role: "system",
        content: ctx.systemText,
      },
    ];

    if (web_context_text) {
      systemMessages.push({
        role: "system",
        content: web_context_text,
      });
    }

    /* =========================================================
       4) MESAJE FINALE CĂTRE MODEL
       ========================================================= */
    const messages = [
      ...systemMessages,
      ...(Array.isArray(history) ? history : []),
      { role: "user", content: message },
    ];

    /* =========================================================
       5) CALL LLM (nemodificat)
       ========================================================= */
    const assistant_reply = await callLLM(messages);

    /* =========================================================
       6) COMMIT MEMORIE (post-răspuns)
       ========================================================= */
    commitInteraction({
      userId,
      userMessage: message,
      assistantReply: assistant_reply,
      engine,
    });

    /* =========================================================
       7) RESPONSE — contract UI IDENTIC
       ========================================================= */
    return res.status(200).json({
      assistant_reply,
      used_web_search,
      analysis: engine,        // EXACT ce așteaptă UI-ul tău
      web: ctx.web,            // opțional, util pentru debug
    });

  } catch (err) {
    console.error("ask.js error:", err);
    return res.status(500).json({
      error: err?.message || "Internal server error",
    });
  }
}
