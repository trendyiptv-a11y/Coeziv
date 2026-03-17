export default async function handler(req, res) {
  try {
    const { code } = req.body;

    const response = await fetch(
      process.env.KV_REST_API_URL + "/get/tv:" + code,
      {
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
        }
      }
    );

    const data = await response.json();

    if (!data.result) {
      return res.status(404).json({ error: "Cod invalid sau expirat" });
    }

    res.json({ playlist: data.result });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
}
