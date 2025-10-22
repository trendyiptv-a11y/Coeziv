// --- Formula Coeziunii 3.14 + D + L∞ ---
// Funcție de analiză semantică, logică și coezivă
// Creată de Sergiu Bulboacă & GPT-5 💡

// Import OpenAI SDK (ESM)
import OpenAI from "openai";

// Creează clientul OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event, context) {
  try {
    const body = JSON.parse(event.body || "{}");
    const text = body.text || "";

    if (!text.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ eroare: "Niciun text de analizat." }),
      };
    }

    // Solicitare către GPT-5 (sau GPT-4o dacă GPT-5 nu e disponibil)
    const completion = await client.chat.completions.create({
      model: "gpt-5", // dacă dă eroare 404, schimbă în "gpt-4o"
      messages: [
        {
          role: "system",
          content:
            "Ești motorul viu al formulei coeziunii 3.14 + D + L∞. " +
            "Primești un text și calculezi: rezonanta (0–3.14), deviatia_semantica (D), deviatia_logica (L), " +
            "tipul (Echilibru coeziv / Dezechilibru semantic / Dezechilibru logic) și o scurtă interpretare. " +
            "Returnează răspunsul strict în format JSON cu aceste câmpuri.",
        },
        { role: "user", content: text },
      ],
      temperature: 0.5,
    });

    const rezultat = completion.choices?.[0]?.message?.content || "{}";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rezultat }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        mesaj: "Eroare internă GPT-5",
        detalii: err.message,
      }),
    };
  }
}
