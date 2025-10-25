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
          content: "Ești un tester de funcționalități. Spune-mi dacă ai acces la web-search și poți căuta informații online.",
        },
        {
          role: "user",
          content: "Poți verifica online care este cea mai recentă știre despre România?",
        },
      ],
      temperature: 0.1,
      max_tokens: 150,
      tools: [{ type: "web_search" }],
    });

    return res.status(200).json({
      succes: true,
      content: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      succes: false,
      eroare: error.message,
    });
  }
}
