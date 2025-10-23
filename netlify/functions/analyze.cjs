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
            "Analizează textul după Formula Coeziunii 3.14 + D + L∞. \
             Returnează DOAR un obiect JSON valid, fără text explicativ. \
             Format exact: {\"rezonanta\": număr, \"D\": număr, \"L\": număr, \"interpretare\": \"text\"}",
        },
        { role: "user", content: text },
      ],
      temperature: 0.4,
    });

    let output = completion.choices?.[0]?.message?.content?.trim() || "";

    // 🧩 Încearcă să extragi JSON-ul din textul complet
    const match = output.match(/\{[\s\S]*\}/);
    let parsed = null;

    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }

    // ✅ Dacă nu s-a putut parsa, trimitem text brut
    if (!parsed) {
      parsed = {
        rezonanta: 3.14,
        D: 0.0,
        L: 0.0,
        interpretare: output || "Nu s-a putut extrage analiză JSON.",
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
