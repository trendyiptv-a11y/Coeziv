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
        body: JSON.stringify({
          mesaj: "⚠️ Textul lipsește pentru analiză.",
        }),
      };
    }

    const prompt = `
Ești GPT-5 (prin modelul gpt-4o) — motorul viu al adevărului din „Formula Coeziunii 3.14 + D + L∞”.
Analizează logic, semantic și coeziv textul următor:

„${text}”

Returnează **EXCLUSIV** un obiect JSON, fără text suplimentar, cu următoarea structură exactă:
{
  "rezonanta": <număr între 3.00 și 4.50>,
  "D": <număr între 0.00 și 1.00>,
  "L": <număr între 0.00 și 1.00>,
  "tip": "Echilibru coeziv" | "Echilibru fragil" | "Deviație extinsă",
  "interpretare": "Explicație scurtă în română"
}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Răspunde DOAR cu JSON valid. Fără niciun text în plus." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" }, // ✅ cheia succesului
      temperature: 0.3,
      max_tokens: 200,
    });

    const data = completion.choices?.[0]?.message?.content
      ? JSON.parse(completion.choices[0].message.content)
      : {};

    return {
      statusCode: 200,
      body: JSON.stringify({
        mesaj: "✅ Analiză efectuată de GPT-5 (prin gpt-4o)",
        ...data,
        semnatura: "Sergiu Bulboacă & GPT-5",
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        mesaj: "❌ Eroare internă GPT-4o",
        detalii: err.message,
      }),
    };
  }
}
