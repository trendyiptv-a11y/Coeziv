import OpenAI from "openai";

export async function handler(event) {
  try {
    const { text } = JSON.parse(event.body || "{}");

    if (!text || text.trim().length < 3) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          verdict: "⚠️ Text lipsă",
          Fc: 3.14,
          rezultat: "3.14 + 0 = 3.14",
          tip: "Neanalizabil",
          interpretare: "Introduceți un text valid pentru analiză.",
        }),
      };
    }

    // === Inițializare client GPT-5 ===
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // === Prompt personalizat cu Formula Coeziunii ===
    const systemPrompt = `
Ești „Motorul de Coeziune 3.14”, construit împreună cu Sergiu Bulboacă.
Analizează orice text pe baza formulei 3.14 + Q + S + D + L∞, după următoarele principii:

Cᵢ = coeziune internă (claritate, logică, structură gramaticală)
Cₑ = coeziune externă (acord cu surse verificabile)
Q = factor de întrebare (+0.05 neutre, −0.10 sugestive)
S = coerență semantică (+0.10 termeni corecți, −0.20 manipulatori)
D = deviație semantică (abatere de sens)
L = deviație logică (contradicție rațională)
Fc = 3.14 + Cᵢ + Cₑ + Q + S + D + L∞

Intervale:
  3.10–3.14 → Adevăr complet (✅ veridic)
  2.90–3.09 → Parțial adevărat (⚠️ ambiguu)
  2.50–2.89 → Fals trunchiat (🔴 dezinformare)
  < 2.50   → Fals evident (⛔ complet fals)

Răspunde JSON cu următoarele câmpuri:
{
  "Fc": valoare numerică,
  "tip": text scurt,
  "interpretare": explicație coerentă,
  "verdict": text scurt pentru utilizator
}
`;

    // === Trimitere cerere GPT-5 ===
    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    });

    // === Preluare rezultat ===
    const response = completion.choices[0].message.content;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        result: JSON.parse(response),
      }),
    };
  } catch (err) {
    console.error("Eroare:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message,
        hint: "Verifică OPENAI_API_KEY și structura JSON returnată.",
      }),
    };
  }
}
