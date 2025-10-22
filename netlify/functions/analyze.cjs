// --- Importă biblioteca OpenAI ---
import OpenAI from "openai";

// Creează clientul OpenAI folosind cheia ta din variabilele de mediu
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Funcția principală Netlify
export async function handler(event, context) {
  try {
    // Parsează textul primit din frontend
    const body = JSON.parse(event.body || "{}");
    const text = body.text || "";

    if (!text) {
      return {
        statusCode: 400,
        body: JSON.stringify({ eroare: "Nu s-a primit niciun text pentru analiză." }),
      };
    }

    // Trimite textul către GPT pentru analiză semantică și coezivă
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", // poți schimba în "gpt-4o" sau "gpt-5"
      messages: [
        {
          role: "system",
          content:
            "Ești motorul viu al formulei coeziunii 3.14 + D + L∞. " +
            "Analizează textul primit și returnează o structură JSON cu următoarele câmpuri: " +
            "rezonanta (valoare numerică între 0 și 3.14), deviatia_semantica, deviatia_logica, tip, interpretare. " +
            "Răspunsul trebuie să fie JSON curat fără explicații.",
        },
        { role: "user", content: text },
      ],
    });

    const reply = completion.choices[0].message.content;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rezultat: reply }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        mesaj: "Eroare internă GPT",
        detalii: err.message,
      }),
    };
  }
}
