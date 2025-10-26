import OpenAI from "openai";

export default async function handler(req, res) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  try {
    console.log("🔍 Testare GPT web_search...");

    const response = await client.responses.create({
      model: "gpt-5", // sau "gpt-4.1" dacă nu ai acces la GPT-5
      tools: [{ type: "web_search" }],
      input: [
        {
          role: "user",
          content: "Is the Eiffel Tower in Paris?"
        }
      ]
    });

    const text = response.output_text || "Fără text în răspuns.";
    const citations = response.output?.[0]?.citations || [];

    return res.status(200).json({
      success: true,
      message: "✅ Web search funcțional!",
      answer: text,
      sources: citations.map((src) => src.url)
    });

  } catch (error) {
    console.error("❌ Eroare:", error.message);
    if (error.response) console.error(error.response.data);

    return res.status(500).json({
      success: false,
      error: error.message || "Eroare necunoscută la conexiunea GPT"
    });
  }
}
