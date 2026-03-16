export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { license, deviceId } = req.body || {};
  if (!license || !deviceId) {
    return res.status(400).json({ error: "Missing license or deviceId" });
  }

  const LICENSES = {
    "COEZIV-2026-PRO-1234": { deviceId: null },
    "COEZIV-FULL-RO-9999": { deviceId: null }
  };

  const record = LICENSES[license];
  if (!record) {
    return res.status(403).json({ valid: false, error: "Invalid license" });
  }

  if (record.deviceId && record.deviceId !== deviceId) {
    return res.status(403).json({ valid: false, error: "License already bound to another device" });
  }

  record.deviceId = deviceId;
  const token = Buffer.from(`${license}:${deviceId}`).toString("base64url");

  return res.status(200).json({ valid: true, token });
}
