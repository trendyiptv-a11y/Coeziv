export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let { playlist } = req.body || {};

    if (!playlist || !String(playlist).trim()) {
      return res.status(400).json({ error: "Missing playlist" });
    }

    // 🔥 normalizare IMPORTANTĂ
    playlist = String(playlist)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const response = await fetch(
      process.env.KV_REST_API_URL + "/set/tv:" + code,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
          "Content-Type": "text/plain"
        },
        body: playlist
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({
        error: "KV set failed",
        details: text
      });
    }

    return res.status(200).json({ code });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: String(err && err.message ? err.message : err)
    });
  }
}
