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

    const delResp = await fetch(
      process.env.KV_REST_API_URL + "/del/" + encodeURIComponent("license:" + code),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
        }
      }
    );

    if (!delResp.ok) {
      const txt = await delResp.text();
      return res.status(500).json({ ok: false, error: "Delete failed", details: txt });
    }

    const indexResp = await fetch(
      process.env.KV_REST_API_URL + "/get/" + encodeURIComponent("licenses:index"),
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
        }
      }
    );

    if (!indexResp.ok) {
      const txt = await indexResp.text();
      return res.status(500).json({ ok: false, error: "Failed to load index", details: txt });
    }

    const indexData = await indexResp.json();
    let codes = [];

    if (indexData.result) {
      try {
        codes = typeof indexData.result === "string"
          ? JSON.parse(indexData.result)
          : indexData.result;
      } catch (e) {
        codes = [];
      }
    }

    codes = codes.filter((c) => c !== code);

    const saveIndexResp = await fetch(
      process.env.KV_REST_API_URL + "/set/" + encodeURIComponent("licenses:index"),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
          "Content-Type": "text/plain"
        },
        body: JSON.stringify(codes)
      }
    );

    if (!saveIndexResp.ok) {
      const txt = await saveIndexResp.text();
      return res.status(500).json({ ok: false, error: "Failed to update index", details: txt });
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
