import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event) => {
  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text)
      return {
        statusCode: 400,
        body: JSON.stringify({ mesaj: "⚠️ Text lipsă pentru analiză." }),
      };

    // Prompt trimis către GPT-5
    const prompt = `
Ești motorul viu al adevărului bazat pe Formula Coeziunii 3.14 + D + L∞.
Analizează următorul text: """${text}"""

Răspunde strict în format JSON valid:
{
  "rezonanta": număr între 3.00 și 4.50,
  "D": deviație semantică între 0.00 și 1.00,
  "L": deviație logică între 0.00 și 1.00,
  "tip": "Echilibru coeziv" | "Echilibru fragil" | "Deviație extinsă",
  "interpretare": scurt text explicativ în limba română
}
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    // Extrage textul brut
    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";

    // Curăță eventualele ghilimele sau coduri suplimentare
    const clean = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");

    let data;
    try {
      data = JSON.parse(clean);
    } catch (e) {
      data = {
        rezonanta: 3.14,
        D: 0,
        L: 0,
        tip: "Eroare de format",
        interpretare:
          "Răspunsul nu a fost în format JSON valid. Încearcă din nou.",
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
};
