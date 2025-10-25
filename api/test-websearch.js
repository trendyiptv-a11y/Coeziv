import OpenAI from "openai";

export default async function handler(req, res) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "Ești un tester. Spune-mi dacă ai acces web-search și poți căuta online.",
        },
        {
          role: "user",
          content: "Poți verifica online cea mai recentă știre despre România?",
        },
      ],
      tools: [{ type: "web_search" }],
      temperature: 0.1,
      max_tokens: 150,
    });

    res.status(200).json({
      success: true,
      content: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error("Eroare:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
