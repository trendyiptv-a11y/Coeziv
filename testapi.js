// netlify/functions/testapi.js
export async function handler(event, context) {
  try {
    const data = {
      message: "✅ Funcția Netlify a răspuns corect!",
      timestamp: new Date().toISOString(),
    };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}