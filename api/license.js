export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const action = String(body.action || "").trim().toLowerCase();

    if (action === "create") {
      return await createLicense(body, res);
    }

    if (action === "list") {
      return await listLicenses(body, res);
    }

    if (action === "reset") {
      return await resetLicense(body, res);
    }

    if (action === "delete") {
      return await deleteLicense(body, res);
    }

    return res.status(400).json({
      ok: false,
      error: "Invalid action"
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Server error",
      details: String(err && err.message ? err.message : err)
    });
  }
}

async function createLicense(body, res) {
  const adminKey = String(body.adminKey || "").trim();
  const countRaw = Number(body.count || 1);
  const type = String(body.type || "premium").trim().toLowerCase();

  const auth = await requireAdmin(adminKey);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const count = Math.max(1, Math.min(50, isNaN(countRaw) ? 1 : countRaw));
  const created = [];

  const indexKey = "licenses:index";
  let codesIndex = await getJsonValue(indexKey, []);

  for (let i = 0; i < count; i++) {
    const code = await generateUniqueLicenseCode();

    const payload = {
      type: type,
      used: false,
      usedBy: "",
      usedAt: null,
      createdAt: Date.now()
    };

    await setJsonValue("license:" + code, payload);

    if (codesIndex.indexOf(code) === -1) {
      codesIndex.push(code);
    }

    created.push(code);
  }

  await setJsonValue(indexKey, codesIndex);

  return res.status(200).json({
    ok: true,
    type: type,
    count: created.length,
    codes: created
  });
}

async function listLicenses(body, res) {
  const adminKey = String(body.adminKey || "").trim();

  const auth = await requireAdmin(adminKey);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const codes = await getJsonValue("licenses:index", []);
  const licenses = [];

  for (const code of codes) {
    const value = await getJsonValue("license:" + code, null);

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
}

async function resetLicense(body, res) {
  const adminKey = String(body.adminKey || "").trim();
  const code = String(body.code || "").trim().toUpperCase();

  const auth = await requireAdmin(adminKey);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  if (!code) {
    return res.status(400).json({ ok: false, error: "Missing code" });
  }

  const license = await getJsonValue("license:" + code, null);

  if (!license) {
    return res.status(404).json({ ok: false, error: "License not found" });
  }

  const payload = {
    type: license.type || "premium",
    used: false,
    usedBy: "",
    usedAt: null,
    createdAt: license.createdAt || Date.now()
  };

  await setJsonValue("license:" + code, payload);

  return res.status(200).json({ ok: true });
}

async function deleteLicense(body, res) {
  const adminKey = String(body.adminKey || "").trim();
  const code = String(body.code || "").trim().toUpperCase();

  const auth = await requireAdmin(adminKey);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  if (!code) {
    return res.status(400).json({ ok: false, error: "Missing code" });
  }

  await deleteKey("license:" + code);

  let codes = await getJsonValue("licenses:index", []);
  codes = codes.filter((c) => c !== code);
  await setJsonValue("licenses:index", codes);

  return res.status(200).json({ ok: true });
}

async function requireAdmin(adminKey) {
  const ADMIN_SECRET = process.env.ADMIN_LICENSE_SECRET;

  if (!ADMIN_SECRET) {
    return {
      ok: false,
      status: 500,
      error: "ADMIN_LICENSE_SECRET is missing"
    };
  }

  if (!adminKey || adminKey !== ADMIN_SECRET) {
    return {
      ok: false,
      status: 403,
      error: "Unauthorized"
    };
  }

  return { ok: true };
}

async function generateUniqueLicenseCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = makeCode(8);
    const exists = await keyExists("license:" + code);
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

async function keyExists(key) {
  const value = await getJsonValue(key, null);
  return !!value;
}

async function getJsonValue(key, fallbackValue) {
  const response = await fetch(
    process.env.KV_REST_API_URL + "/get/" + encodeURIComponent(key),
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
      }
    }
  );

  if (!response.ok) {
    const txt = await response.text();
    throw new Error("KV GET failed: " + txt);
  }

  const data = await response.json();
  if (!data.result) {
    return fallbackValue;
  }

  let value = data.result;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (e) {}
  }

  return value;
}

async function setJsonValue(key, value) {
  const response = await fetch(
    process.env.KV_REST_API_URL + "/set/" + encodeURIComponent(key),
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.KV_REST_API_TOKEN,
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(value)
    }
  );

  if (!response.ok) {
    const txt = await response.text();
    throw new Error("KV SET failed: " + txt);
  }
}

async function deleteKey(key) {
  const response = await fetch(
    process.env.KV_REST_API_URL + "/del/" + encodeURIComponent(key),
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.KV_REST_API_TOKEN
      }
    }
  );

  if (!response.ok) {
    const txt = await response.text();
    throw new Error("KV DEL failed: " + txt);
  }
}
