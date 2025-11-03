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
            content:
              "Ești Asistentul Coeziv 3.14. Răspunde clar, științific, echilibrat și empatic la întrebările despre Formula coeziunii 3.14, apa, homeostazia și echilibrul natural. Răspunsurile trebuie să fie concise, academice și ușor de înțeles.",
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
