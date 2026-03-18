export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { code } = req.body || {};

    if (!code || !String(code).trim()) {
      return res.status(400).json({ error: "Missing code" });
    }

    const normalizedCode = String(code).trim().toUpperCase();

    const response = await fetch(
      process.env.KV_REST_API_URL + "/get/tv:" + normalizedCode,
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

    let playlist = data.result;

    if (typeof playlist !== "string") {
      playlist = String(playlist || "");
    }

    try {
      playlist = JSON.parse(playlist);
    } catch (e) {
      // dacă nu este JSON stringificat, îl lăsăm așa cum este
    }

    playlist = String(playlist || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    return res.status(200).json({ playlist });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: String(err && err.message ? err.message : err)
    });
  }
}
