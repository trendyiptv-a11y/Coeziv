// analyze.cjs
const OpenAI = require("openai");
exports.handler = async (event, context) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const text = body.text || "";

    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Lipsă text pentru analiză." }),
      };
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Trimiterea cererii către model
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ești modulul de analiză semantică și coezivă din Formula Coeziunii 3.14 + D + L∞. Răspunzi concis și structurat.",
        },
        {
          role: "user",
          content: `Analizează următorul text: "${text}". 
          Oferă rezultatele conform formulei:
          - Rezonanță (valoare numerică aproximativ 3.14)
          - Devație semantică (D)
          - Devație logică (L)
          - Tip coeziune
          - Interpretare concisă`,
        },
      ],
    });

    const answer = response.choices[0].message.content.trim();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        text,
        analysis: answer,
      }),
    };
  } catch (error) {
    console.error("Eroare analiză:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Eroare la procesarea analizei",
        details: error.message,
      }),
    };
  }
};
