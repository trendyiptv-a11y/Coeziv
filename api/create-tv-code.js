export default async function handler(req, res) {
  try {
    const { playlist } = req.body;

    if (!playlist) {
      return res.status(400).json({ error: "Missing playlist" });
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    await fetch(process.env.KV_REST_API_URL + "/set/tv:" + code, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        value: playlist,
        ex: 300
      })
    });

    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}
