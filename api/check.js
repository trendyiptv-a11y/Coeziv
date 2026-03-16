export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, deviceId } = req.body || {};
  if (!token || !deviceId) {
    return res.status(400).json({ valid: false, error: "Missing token or deviceId" });
  }

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [license, tokenDeviceId] = decoded.split(":");

    const validLicenses = ["COEZIV-2026-PRO-1234", "COEZIV-FULL-RO-9999"];
    const valid = validLicenses.includes(license) && tokenDeviceId === deviceId;

    return res.status(200).json({ valid });
  } catch {
    return res.status(200).json({ valid: false });
  }
}
