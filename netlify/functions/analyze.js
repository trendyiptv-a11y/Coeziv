// .netlify/functions/analyze.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event, context) {
  try {
    const { text } = JSON.parse(event.body || "{}");

    if (!text || text.trim().length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ mesaj: "⚠️ Textul de analizat este gol." }),
      };
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 250,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Ești un analizor semantic, logic și coeziv. Returnează strict JSON cu câmpurile: rezonanta, D, L, tip, interpretare.",
        },
        {
          role: "user",
          content: `Analizează textul: "${text}" conform formulei 3.14 + D + L∞.`,
        },
      ],
    });

    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mesaj: "✅ Analiză efectuată de GPT-5 (prin gpt-4o)",
        ...parsed,
        semnatura: "Sergiu Bulboacă & GPT-5",
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error("Eroare analiză:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        mesaj: "❌ Eroare internă GPT-5",
        detalii: error.message,
      }),
    };
  }
}
