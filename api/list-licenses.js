export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const adminKey = String(body.adminKey || "").trim();
    const ADMIN_SECRET = process.env.ADMIN_LICENSE_SECRET;

    if (!ADMIN_SECRET) {
      return res.status(500).json({ ok: false, error: "ADMIN_LICENSE_SECRET missing" });
    }

    if (adminKey !== ADMIN_SECRET) {
      return res.status(403).json({ ok: false, error: "Unauthorized" });
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

    const licenses = [];

    for (const code of codes) {
      const resp = await fetch(
        process.env.KV_REST_API_URL + "/get/" + encodeURIComponent("license:" + code),
        {
          method: "GET",
          headers: {
            Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
          }
        }
      );

      if (!resp.ok) {
        continue;
      }

      const data = await resp.json();
      let value = data.result || null;

      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch (e) {}
      }

      if (value) {
        licenses.push({
          code,
          type: value.type || "premium",
          used: !!value.used,
          usedBy: value.usedBy || "",
          usedAt: value.usedAt || null,
          createdAt: value.createdAt || null
        });
      }
    }

    licenses.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return res.status(200).json({
      ok: true,
      licenses
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Server error",
      details: String(err && err.message ? err.message : err)
    });
  }
}
