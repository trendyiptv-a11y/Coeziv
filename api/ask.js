import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { question } = req.body;
  if (!question || question.trim() === "") {
    return res.status(400).json({ error: "No question provided" });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `Ești Coeziv AI – asistentul dedicat formulei coeziunii 3.14Δ, creată în colaborare cu Sergiu Bulboacă.
Formula descrie relația dintre densitatea moleculară a apei, numărul de electroni mobili, energia mediului și distanța medie dintre centrele de coerență:
F_c = (N_H₂O * nₑ⁻ * E) / r².
Într-o celulă sănătoasă, raportul numeric este ≈3.14, interpretat ca stare de echilibru natural – homeostazie.
Răspunde științific, clar și contextual. Evită interpretările ezoterice sau metaforice. Dacă întrebarea este filozofică, explică sensul în limbaj logic și coerent.`
        },
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0.5,
      max_tokens: 900,
    });

    const answer = completion.choices[0].message.content.trim();
    res.status(200).json({ answer });

  } catch (error) {
    console.error("OpenAI API error:", error);
    res.status(500).json({
      error: "Failed to get response from OpenAI",
      details: error.message,
    });
  }
}
