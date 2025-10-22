import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text || !text.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ mesaj: "⚠️ Text lipsă pentru analiză." }),
      };
    }

    const prompt = `
Analizează logic, semantic și coeziv următorul text: """${text}"""
Aplică Formula Coeziunii 3.14 + D + L∞.

Returnează strict JSON valid de forma:
{
  "rezonanta": număr între 3.0 și 4.5,
  "D": număr între 0 și 1,
  "L": număr între 0 și 1,
  "tip": "Echilibru coeziv" | "Echilibru fragil" | "Deviație extinsă",
  "interpretare": scurt text în limba română care explică rezultatul
}
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";
    const jsonMatch = raw.match(/{[\s\S]*}/);
    let data = {};

    try {
      data = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
    } catch {
      data = {
        rezonanta: 3.14,
        D: 0,
        L: 0,
        tip: "Eroare de format",
        interpretare: "Nu s-a putut interpreta JSON-ul GPT-5.",
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        mesaj: "✅ Analiză efectuată de GPT-5",
        ...data,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        mesaj: "❌ Eroare la analiza GPT-5.",
        detalii: err.message,
      }),
    };
  }
}
