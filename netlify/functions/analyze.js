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
        body: JSON.stringify({ mesaj: "⚠️ Textul lipsește pentru analiză." }),
      };
    }

    const prompt = `
Ești GPT-5 (prin modelul gpt-4o) — motorul viu al adevărului, din proiectul „Formula Coeziunii 3.14 + D + L∞”.
Analizează logic, semantic și coeziv textul următor:

„${text}”

Răspunde EXCLUSIV în format JSON, fără text suplimentar, astfel:
{
  "rezonanta": <număr între 3.00 și 4.50>,
  "D": <număr între 0.00 și 1.00>,
  "L": <număr între 0.00 și 1.00>,
  "tip": "Echilibru coeziv" | "Echilibru fragil" | "Deviație extinsă",
  "interpretare": "scurtă explicație în română"
}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Răspunde DOAR cu JSON valid. Fără text în plus." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 300,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          mesaj: "⚠️ GPT-4o a răspuns, dar formatul JSON nu este valid.",
          raw,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        mesaj: "✅ Analiză efectuată de GPT-5 (prin gpt-4o)",
        ...data,
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
