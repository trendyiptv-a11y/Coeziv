// Verificare instalare OpenAI + cheie activă (CommonJS)
// Formula Coeziunii — test de diagnostic
// Autor: Sergiu Bulboacă & GPT-5 💡

const OpenAI = require("openai");

exports.handler = async function () {
  try {
    // Test 1 — Verificare instalare pachet
    const openaiVersion = typeof OpenAI === "function"
      ? "✅ OpenAI importat corect (CommonJS)"
      : "❌ Problema la import";

    // Test 2 — Inițializează clientul
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    let modelStatus = "❌ Niciun răspuns de la API";

    try {
      const models = await client.models.list();
      const firstModel = models.data?.[0]?.id || "necunoscut";
      modelStatus = `✅ API funcțional (primul model: ${firstModel})`;
    } catch (err) {
      modelStatus = `⚠️ Eroare API: ${err.message}`;
    }

    // Rezultatul testului
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mesaj: "Raport de verificare Formula Coeziunii",
        openaiVersion,
        modelStatus,
        nodeVersion: process.version,
        envKey: process.env.OPENAI_API_KEY
          ? "✅ Cheie API detectată"
          : "❌ Lipsă cheie API",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        mesaj: "Eroare critică în testul de instalare",
        detalii: err.message,
      }),
    };
  }
};
