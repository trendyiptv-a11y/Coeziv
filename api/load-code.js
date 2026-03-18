export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { code } = req.body || {};

    if (!code || !String(code).trim()) {
      return res.status(400).json({ error: "Missing code" });
    }

    const response = await fetch(
      process.env.KV_REST_API_URL + "/get/tv:" + String(code).trim().toUpperCase(),
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({
        error: "KV get failed",
        details: text
      });
    }

    const data = await response.json();

    if (!data.result) {
      return res.status(404).json({ error: "Cod invalid sau expirat" });
    }

    return res.status(200).json({ playlist: data.result });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: String(err && err.message ? err.message : err)
    });
  }
}
