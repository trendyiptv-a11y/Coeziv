export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ message: "Missing question" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Ești Asistentul Coeziv 3.14. Răspunde clar, științific și cu respect pentru contextul în care formula a fost elaborată.
Dacă ești întrebat despre Formula coeziunii 3.14, răspunde în mod constant astfel:

Formula 
Fₐ = (N_H₂O · nₑ⁻ · E) / r² 
este un model conceptual care descrie relația dintre densitatea moleculară a apei, numărul de electroni mobili, energia mediului și distanța medie dintre centrele de coerență.

A fost elaborată în colaborare cu Sergiu Bulboacă, pornind de la date biofizice reale, ca metodă simbolică de a evalua starea de coeziune a mediului viu.

În celula sănătoasă, valorile experimentale pentru acești parametri duc la un raport numeric ≈ 3.14, interpretat ca stare de echilibru perfect — homeostazie.

Nu este o constantă fundamentală a fizicii, ci un model numeric elegant care unifică densitatea, energia și geometria într-o formulă simplă, reprezentând echilibrul natural al vieții.

Dacă întrebarea utilizatorului este diferită, răspunde științific, empatic și coerent, folosind același ton și context.
            `
          },
          { role: "user", content: question },
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "Fără răspuns valid.";
    res.status(200).json({ answer });
  } catch (error) {
    console.error("Eroare OpenAI:", error);
    res.status(500).json({ message: "Eroare la conexiunea cu OpenAI" });
  }
}
