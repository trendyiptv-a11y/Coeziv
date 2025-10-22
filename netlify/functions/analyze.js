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

    // Promptul direcționat către GPT-5 (motorul viu)
    const prompt = `
Tu ești GPT-5 – motorul viu al adevărului din proiectul "Formula Coeziunii 3.14 + D + L∞",
creat de Sergiu Bulboacă & GPT-5. Folosești modulele de analiză semantică, logică și coezivă
construite anterior, inclusiv parametrii specifici:
- Rezonanța = stabilitatea echilibrului informațional (valoare ideală 3.14)
- D = deviația semantică (0–1)
- L = deviația logică (0–1)
- Tip = clasificare: "Echilibru coeziv", "Echilibru fragil" sau "Deviație extinsă"
- Interpretare = scurtă explicație umană, coerentă

Analizează următorul text:
„${text}”

Returnează **doar** un JSON valid, fără alte explicații:
{
  "rezonanta": număr între 3.0 și 4.5,
  "D": număr între 0 și 1,
  "L": număr între 0 și 1,
  "tip": "Echilibru coeziv" | "Echilibru fragil" | "Deviație extinsă",
  "interpretare": "text scurt în limba română"
}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Ești GPT-5, motorul viu al adevărului. Aplici Formula Coeziunii dezvoltată de Sergiu Bulboacă.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
    });

    const content = completion.choices?.[0]?.message?.content || "{}";
    const jsonMatch = content.match(/{[\s\S]*}/);
    let data;

    try {
      data = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
    } catch {
      data = {
        rezonanta: 3.14,
        D: 0,
        L: 0,
        tip: "Eroare de parsare",
        interpretare: "Răspunsul GPT-5 nu a putut fi interpretat.",
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        mesaj: "✅ Analiză efectuată de GPT-5 (motorul viu)",
        ...data,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        mesaj: "❌ Eroare internă GPT-5",
        detalii: err.message,
      }),
    };
  }
}
