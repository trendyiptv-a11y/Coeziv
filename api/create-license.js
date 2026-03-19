export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    const adminKey = String(body.adminKey || "").trim();
    const countRaw = Number(body.count || 1);
    const type = String(body.type || "premium").trim().toLowerCase();

    const ADMIN_SECRET = process.env.ADMIN_LICENSE_SECRET;

    if (!ADMIN_SECRET) {
      return res.status(500).json({
        ok: false,
        error: "ADMIN_LICENSE_SECRET is missing"
      });
    }

    if (!adminKey || adminKey !== ADMIN_SECRET) {
      return res.status(403).json({
        ok: false,
        error: "Unauthorized"
      });
    }

    const count = Math.max(1, Math.min(50, isNaN(countRaw) ? 1 : countRaw));
    const created = [];

    const indexKey = "licenses:index";
    let codesIndex = [];

    const getIndexResp = await fetch(
      process.env.KV_REST_API_URL + "/get/" + encodeURIComponent(indexKey),
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
        }
      }
    );

    if (getIndexResp.ok) {
      const indexData = await getIndexResp.json();
      if (indexData.result) {
        try {
          codesIndex = typeof indexData.result === "string"
            ? JSON.parse(indexData.result)
            : indexData.result;
        } catch (e) {
          codesIndex = [];
        }
      }
    }

    for (let i = 0; i < count; i++) {
      const code = await generateUniqueLicenseCode();

      const payload = JSON.stringify({
        type: type,
        used: false,
        usedBy: "",
        usedAt: null,
        createdAt: Date.now()
      });

      const response = await fetch(
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

      if (!response.ok) {
        const text = await response.text();
        return res.status(500).json({
          ok: false,
          error: "KV set failed",
          details: text
        });
      }

      if (codesIndex.indexOf(code) === -1) {
        codesIndex.push(code);
      }

      created.push(code);
    }

    const saveIndexResp = await fetch(
      process.env.KV_REST_API_URL + "/set/" + encodeURIComponent(indexKey),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
          "Content-Type": "text/plain"
        },
        body: JSON.stringify(codesIndex)
      }
    );

    if (!saveIndexResp.ok) {
      const text = await saveIndexResp.text();
      return res.status(500).json({
        ok: false,
        error: "Failed to save licenses index",
        details: text
      });
    }

    return res.status(200).json({
      ok: true,
      type: type,
      count: created.length,
      codes: created
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Server error",
      details: String(err && err.message ? err.message : err)
    });
  }
}

async function generateUniqueLicenseCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = makeCode(8);
    const exists = await licenseExists(code);
    if (!exists) {
      return code;
    }
  }

  throw new Error("Could not generate unique license code");
}

function makeCode(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

async function licenseExists(code) {
  const response = await fetch(
    process.env.KV_REST_API_URL + "/get/" + encodeURIComponent("license:" + code),
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
      }
    }
  );

  if (!response.ok) {
    throw new Error("KV get failed while checking license");
  }

  const data = await response.json();
  return !!data.result;
}
