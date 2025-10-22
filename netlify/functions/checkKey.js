export async function handler() {
  const key = process.env.OPENAI_API_KEY;

  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: "❌ Lipsă cheie",
        mesaj:
          "Cheia OpenAI nu este setată corect. Verifică în Netlify → Site settings → Environment variables → OPENAI_API_KEY.",
      }),
    };
  }

  const partialKey = key.slice(0, 6) + "..." + key.slice(-4);

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "✅ Cheie detectată",
      mesaj: "Cheia OpenAI este activă și vizibilă în mediul Netlify.",
      fragment: partialKey,
    }),
  };
}
