export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const adminKey = String(body.adminKey || "").trim();
    const code = String(body.code || "").trim().toUpperCase();
    const ADMIN_SECRET = process.env.ADMIN_LICENSE_SECRET;

    if (!ADMIN_SECRET) {
      return res.status(500).json({ ok: false, error: "ADMIN_LICENSE_SECRET missing" });
    }

    if (adminKey !== ADMIN_SECRET) {
      return res.status(403).json({ ok: false, error: "Unauthorized" });
    }

    if (!code) {
      return res.status(400).json({ ok: false, error: "Missing code" });
    }

    const getResp = await fetch(
      process.env.KV_REST_API_URL + "/get/" + encodeURIComponent("license:" + code),
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
        }
      }
    );

    if (!getResp.ok) {
      const txt = await getResp.text();
      return res.status(500).json({ ok: false, error: "Failed to load license", details: txt });
    }

    const getData = await getResp.json();
    let license = getData.result;

    if (!license) {
      return res.status(404).json({ ok: false, error: "License not found" });
    }

    if (typeof license === "string") {
      try {
        license = JSON.parse(license);
      } catch (e) {}
    }

    const payload = JSON.stringify({
      type: license.type || "premium",
      used: false,
      usedBy: "",
      usedAt: null,
      createdAt: license.createdAt || Date.now()
    });

    const setResp = await fetch(
      process.env.KV_REST_API_URL + "/set/" + encodeURIComponent("license:" + code),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
          "Content-Type": "text/plain"
        },
        body: payload
      }
    );

    if (!setResp.ok) {
      const txt = await setResp.text();
      return res.status(500).json({ ok: false, error: "Reset failed", details: txt });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Server error",
      details: String(err && err.message ? err.message : err)
    });
  }
}
