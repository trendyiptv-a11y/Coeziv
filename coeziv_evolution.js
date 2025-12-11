// coeziv_evolution.js
// Strat de autoreglare evolutivă pentru Asistentul Coeziv 3.14

/**
 * buildEvolutionLayer primește:
 *  - engine: snapshotul returnat de runCoezivEngine
 *  - memoryPattern: mem.pattern din coeziv_memory (poate fi null)
 *
 * Returnează:
 *  - textBlock: text Coeziv care intră în SYSTEM
 *  - tuning: parametri numeric conceptuali pe care îi putem loga / folosi
 */
export function buildEvolutionLayer({ engine, memoryPattern }) {
  const pf = memoryPattern || {};
  const style = pf.style || {};

  const familiarity = clamp01(pf.coeziv_familiarity ?? 0);
  const avgJ = typeof pf.avg_J === "number" ? pf.avg_J : null;

  // preferințe de stil extrase din memorie
  const detailBias = clamp01(style.detailed ?? 0.5);
  const conciseBias = clamp01(style.concise ?? 0.5);
  const warmthBias = clamp01(style.warm ?? 0.5);
  const neutralBias = clamp01(style.neutral ?? 0.5);

  // stabilitate / tensiune pe termen lung – dacă J e mai mare, creștem bias-ul spre prudență
  const stabilityBias = (() => {
    if (avgJ == null) return 0.4;
    if (avgJ < 0.02) return 0.3;      // conversație liniștită
    if (avgJ < 0.07) return 0.5;      // tensiune moderată
    if (avgJ < 0.15) return 0.7;      // tensiune crescută
    return 0.9;                       // tensiune foarte mare
  })();

  // nivel global de adaptivitate: cât de mult are voie să combine memorie + browsing + concepte
  const adaptivity =
    0.4 * familiarity +
    0.3 * (1 - stabilityBias) +
    0.3 * warmthBias;

  // Dacă utilizatorul interacționează mult pe aceleași domenii, agentul poate crește
  // gradul de abstractizare (transfer între domenii).
  const domains = pf.domains || {};
  const domainList = Object.entries(domains).sort((a, b) => b[1] - a[1]);
  const domainDiversity =
    domainList.length === 0
      ? 0
      : clamp01(Math.min(1, domainList.length / 6));

  const crossDomainTransfer = clamp01(0.3 + 0.4 * domainDiversity + 0.3 * familiarity);

  const tuning = {
    familiarity,
    avgJ,
    stabilityBias,
    adaptivity,
    detailBias,
    conciseBias,
    warmthBias,
    neutralBias,
    domainDiversity,
    crossDomainTransfer,
  };

  const lines = [];

  lines.push(
    `- Nivel de adaptivitate (α) ≈ ${adaptivity.toFixed(
      2
    )} – cât de mult combini memorie, cunoaștere Coezivă și eventuale date online.`
  );

  if (avgJ != null) {
    lines.push(
      `- Tensiune medie istorică J ≈ ${avgJ.toFixed(
        2
      )} → bias de stabilitate ≈ ${stabilityBias.toFixed(
        2
      )} (cu cât e mai mare, cu atât răspunzi mai prudent și mai structurat).`
    );
  } else {
    lines.push(
      `- Tensiune medie J încă nedefinită – păstrezi un nivel moderat de stabilitate.`
    );
  }

  lines.push(
    `- Preferință de detaliu: ${detailBias.toFixed(
      2
    )}, concizie: ${conciseBias.toFixed(
      2
    )}, ton cald: ${warmthBias.toFixed(2)}, ton neutru: ${neutralBias.toFixed(
      2
    )}.`
  );

  if (domainList.length) {
    const topDomains = domainList
      .slice(0, 3)
      .map(([d, c]) => `${d} (x${c})`)
      .join(", ");
    lines.push(
      `- Domenii frecvente: ${topDomains}; diversitate domenii ≈ ${domainDiversity.toFixed(
        2
      )}, transfer între domenii (2π cross-domain) ≈ ${crossDomainTransfer.toFixed(
        2
      )}.`
    );
  } else {
    lines.push(
      `- Domenii încă neclare – tratezi întrebările cu deschidere, fără presupuneri puternice.`
    );
  }

  lines.push(
    `Instrucțiune Coezivă: folosește acești parametri ca autoreglare evolutivă. 
- Când stabilitatea este mare, clarifică mai mult, evită salturile de la un domeniu la altul și preferă exemplul concret.
- Când adaptivitatea este mare, poți integra mai creativ memoria, contextul Coeziv și datele online, dar marchează clar ce este cert și ce este doar ipoteză.
- Când cross-domain transfer este mare, explică explicit cum transferi o structură dintr-un domeniu în altul, folosind secvența 2π (Structură → Flux → Reorganizare → Noua Structură).`
  );

  return {
    textBlock: lines.join("\n"),
    tuning,
  };
}

function clamp01(x) {
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
