export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const code = String(body.code || "").trim().toUpperCase();
    const deviceId = String(body.deviceId || "").trim();

    if (!code) {
      return res.status(400).json({ ok: false, error: "Missing code" });
    }

    if (!deviceId) {
      return res.status(400).json({ ok: false, error: "Missing deviceId" });
    }

    const licenseKey = "license:" + code;
    const licenseResp = await fetch(
      process.env.KV_REST_API_URL + "/get/" + encodeURIComponent(licenseKey),
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
        }
      }
    );

    const licenseData = await licenseResp.json();

    if (!licenseData.result) {
      return res.status(404).json({ ok: false, error: "Cod invalid" });
    }

    let license = licenseData.result;

    if (typeof license === "string") {
      try { license = JSON.parse(license); } catch (e) {}
    }

    if (!license || license.used === true) {
      return res.status(409).json({ ok: false, error: "Cod deja folosit" });
    }

    const devicePayload = JSON.stringify({
      premium: true,
      activatedAt: Date.now(),
      licenseCode: code
    });

    const updateLicensePayload = JSON.stringify({
      type: license.type || "premium",
      used: true,
      usedBy: deviceId,
      usedAt: Date.now()
    });

    const saveDevice = await fetch(
      process.env.KV_REST_API_URL + "/set/" + encodeURIComponent("device:" + deviceId),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
          "Content-Type": "text/plain"
        },
        body: devicePayload
      }
    );

    if (!saveDevice.ok) {
      const t = await saveDevice.text();
      return res.status(500).json({ ok: false, error: "Save device failed", details: t });
    }

    const saveLicense = await fetch(
      process.env.KV_REST_API_URL + "/set/" + encodeURIComponent(licenseKey),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
          "Content-Type": "text/plain"
        },
        body: updateLicensePayload
      }
    );

    if (!saveLicense.ok) {
      const t = await saveLicense.text();
      return res.status(500).json({ ok: false, error: "Update license failed", details: t });
    }

    return res.status(200).json({
      ok: true,
      premium: true
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Server error",
      details: String(err && err.message ? err.message : err)
    });
  }
}
