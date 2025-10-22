// Verificare instalare OpenAI + cheie activă
// Formula Coeziunii — test de diagnostic

import OpenAI from "openai";

export async function handler() {
  try {
    // Test 1 — Verifică dacă biblioteca OpenAI este instalată
    const openaiVersion = OpenAI?.toString ? "✅ OpenAI importat corect" : "❌ Problema la import";

    // Test 2 — Încearcă o cerere minimă către API
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    let modelStatus = "❌ Niciun model nu a răspuns";
    try {
      const models = await client.models.list();
      const found = models.data?.[0]?.id || "Nedefinit";
      modelStatus = `✅ Conexiune API activă (${found})`;
    } catch (err) {
      modelStatus = `⚠️ Eroare la conexiune API: ${err.message}`;
    }

    // Returnează rezultatele în format clar
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mesaj: "Raport de verificare instalare Formula Coeziunii",
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
}
