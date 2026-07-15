// lib/coeziv/semantic-verifier.js
// Semantic relation judge. It receives a claim and evidence snippets and returns
// confirmed / contradicted / incomplete / answered.

const MODEL = process.env.COEZIV_VERIFIER_MODEL || process.env.COEZIV_MODEL || "gpt-4.1-mini";

const isResponsesModel = m => String(m || "").toLowerCase().startsWith("gpt-5");

function pickJSON(text = "") {
  text = String(text || "");
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  if (fenced) text = fenced[1];
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  return a >= 0 && b > a ? text.slice(a, b + 1) : text.trim();
}

function responseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const out = [];
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if (typeof c?.text === "string") out.push(c.text);
      if (typeof c?.value === "string") out.push(c.value);
    }
  }
  return out.join("\n");
}

async function callModel({ env, system, input }) {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;

  const responses = isResponsesModel(MODEL);
  const url = responses ? "https://api.openai.com/v1/responses" : "https://api.openai.com/v1/chat/completions";
  const body = responses
    ? { model: MODEL, instructions: system, input }
    : { model: MODEL, temperature: 0, messages: [{ role: "system", content: system }, { role: "user", content: input }] };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
  });

  if (!r.ok) return null;
  const data = await r.json();
  return responses ? responseText(data) : (data?.choices?.[0]?.message?.content || "");
}

function evidencePack(sources = []) {
  return sources.slice(0, 8).map((s, index) => ({
    index,
    title: s.title || "",
    link: s.link || "",
    snippet: s.snippet || "",
    authority_score: Number(s.authority_score || 0)
  }));
}

function safeState(s) {
  return ["confirmed", "contradicted", "incomplete", "answered"].includes(s) ? s : "incomplete";
}

export async function semanticVerifyClaim({ claim, gate, sources = [], env = process.env }) {
  const evidence = evidencePack(sources);

  if (!evidence.length) {
    return {
      state: "incomplete",
      relation_subject: claim?.subject || null,
      relation_type: claim?.relation || null,
      relation_object_claimed: claim?.object || null,
      relation_object_found: null,
      evidence_index: null,
      explanation: "Nu există surse pentru verificarea semantică.",
      verifier_model: null
    };
  }

  const system = `Returnează numai JSON valid. Judeci relația afirmată folosind doar sursele primite.
confirmed = sursele susțin relația, inclusiv prin traducere sau echivalență semantică.
contradicted = sursele indică un obiect factual diferit.
incomplete = sursele nu sunt suficiente.
answered = întrebarea are răspuns clar.
JSON: {"state":"confirmed|contradicted|incomplete|answered","relation_subject":string|null,"relation_type":string|null,"relation_object_claimed":string|null,"relation_object_found":string|null,"evidence_index":number|null,"explanation":string,"confidence":number}`;

  const input = JSON.stringify({ claim, present_gate: gate, evidence }).slice(0, 12000);
  const raw = await callModel({ env, system, input });

  if (!raw) {
    return {
      state: "incomplete",
      relation_subject: claim?.subject || null,
      relation_type: claim?.relation || gate?.relation_type || null,
      relation_object_claimed: claim?.object || null,
      relation_object_found: null,
      evidence_index: null,
      explanation: "Verificatorul semantic AI nu a returnat rezultat.",
      verifier_model: MODEL
    };
  }

  try {
    const j = JSON.parse(pickJSON(raw));
    const idx = Number.isInteger(j.evidence_index) ? j.evidence_index : null;
    return {
      state: safeState(j.state),
      relation_subject: j.relation_subject ?? claim?.subject ?? null,
      relation_type: j.relation_type ?? claim?.relation ?? gate?.relation_type ?? null,
      relation_object_claimed: j.relation_object_claimed ?? claim?.object ?? null,
      relation_object_found: j.relation_object_found ?? null,
      evidence_index: idx,
      evidence_title: idx !== null ? evidence[idx]?.title || null : null,
      evidence_url: idx !== null ? evidence[idx]?.link || null : null,
      explanation: String(j.explanation || "").slice(0, 800),
      confidence: Number.isFinite(Number(j.confidence)) ? Number(j.confidence) : null,
      verifier_model: MODEL
    };
  } catch {
    return {
      state: "incomplete",
      relation_subject: claim?.subject || null,
      relation_type: claim?.relation || gate?.relation_type || null,
      relation_object_claimed: claim?.object || null,
      relation_object_found: null,
      evidence_index: null,
      explanation: "Verificatorul semantic AI nu a returnat JSON valid.",
      verifier_model: MODEL
    };
  }
}
