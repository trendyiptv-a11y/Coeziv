import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // cheia ta din Netlify > Site settings > Environment variables
});

exports.handler = async (event, context) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const text = body.text ? body.text.trim() : "";

    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ mesaj: "⚠️ Text lipsă pentru analiză." }),
      };
    }

    // 🔮 Prompt trimis către GPT-5 (Formula Coeziunii)
    const prompt = `
Ești motorul viu al adevărului bazat pe Formula Coeziunii 3.14 + D + L∞.
Analizează următorul text: """${text}"""

Răspunde strict în format JSON:
{
  "rezonanta": număr între 3.00 și 4.50,
  "D": deviație semantică între 0.00 și 1.00,
  "L": deviație logică între 0.00 și 1.00,
  "tip": "Echilibru coeziv" | "Echilibru fragil" | "Deviație extinsă",
  "interpretare": text scurt explicativ în limba română
}
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const responseText = completion.choices[0].message.content.trim();
    const data = JSON.parse(responseText);

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
};
