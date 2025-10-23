// netlify/functions/analyze.cjs
const OpenAI = require("openai");

exports.handler = async (event) => {
  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "⚠️ Lipsește textul pentru analiză." }),
      };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Răspunde STRICT în format JSON, fără alt text. Structura obligatorie: \
            {\"rezonanta\": <număr>, \"D\": <număr>, \"L\": <număr>, \"interpretare\": \"<text scurt>\"}. \
            Nu adăuga explicații, doar JSON valid.",
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    });

    let output = completion.choices[0].message.content.trim();

    // 🧩 Dacă modelul a trimis text extra, extragem doar JSON-ul
    const match = output.match(/\{[\s\S]*\}/);
    if (match) output = match[0];

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (e) {
      parsed = {
        rezonanta: 3.14,
        D: null,
        L: null,
        interpretare: "Nu s-a putut parsa JSON-ul corect.",
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis: parsed }),
    };
  } catch (err) {
    console.error("❌ Eroare analiză:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
