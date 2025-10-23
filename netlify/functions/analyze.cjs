// netlify/functions/analyze.cjs
const OpenAI = require("openai");

exports.handler = async (event) => {
  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Lipsește textul de analizat." }),
      };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 🔹 Solicitare simplă către GPT
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ești motorul analitic al Formulei Coeziunii 3.14 + D + L∞. \
            Analizează textul primit și întoarce rezultatul sub formă de JSON cu câmpurile: \
            rezonanta (număr), D (deviație semantică), L (deviație logică) și interpretare (text scurt).",
        },
        { role: "user", content: text },
      ],
      temperature: 0.4,
    });

    const output = completion.choices[0].message.content.trim();

    // ✅ Asigurăm răspuns JSON pentru frontend
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis: output }),
    };
  } catch (err) {
    console.error("Eroare analiză:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
