export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const deviceId = String(body.deviceId || "").trim();

    if (!deviceId) {
      return res.status(400).json({ ok: false, error: "Missing deviceId" });
    }

    const response = await fetch(
      process.env.KV_REST_API_URL + "/get/" + encodeURIComponent("device:" + deviceId),
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
        }
      }
    );

    const data = await response.json();

    if (!data.result) {
      return res.status(200).json({ ok: true, premium: false });
    }

    let device = data.result;
    if (typeof device === "string") {
      try { device = JSON.parse(device); } catch (e) {}
    }

    return res.status(200).json({
      ok: true,
      premium: !!(device && device.premium)
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Server error",
      details: String(err && err.message ? err.message : err)
    });
  }
}
