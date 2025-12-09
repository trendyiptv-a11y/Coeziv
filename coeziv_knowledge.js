// coeziv_knowledge.js
// Bază de cunoaștere + RAG simplu pentru Asistentul Coeziv 3.14

// --- DOCUMENTE COEZIVE ---

export const coezivDocs = [
  {
    id: "baza-3_14",
    domain: "biologic",
    title: "Modelul Coeziv 3.14 – raportul apei",
    content: `
Modelul Coeziv 3.14 pornește de la comportamentul apei pure în jurul
temperaturii de 43°C. 43°C este considerat un punct de stabilitate internă
maximă a apei, asociat cu o coeziune internă ridicată și o organizare
structurală foarte coerentă. 25°C este referința pentru o stare mai flexibilă.

Raportul 3.14 nu este un număr „magic”, ci o metaforă cuantificată:
raportul dintre o stare internă de coeziune maximă și o stare flexibilă.
În acest model, apa este folosită ca matrice de referință pentru homeostazie,
reglaj fin și tranziții de fază în sisteme biologice.

Modelul Coeziv 3.14 nu inventează proprietăți fizice noi ale apei,
ci folosește intervalul termic și densitatea ca reper pentru a descrie
diferența dintre „stare stabilă” și „stare flexibilă”.
`
  },
  {
    id: "praguri-apei",
    domain: "biologic",
    title: "Praguri de tranziție: 39.86°C și 44.7°C",
    content: `
În Modelul Coeziv apar două praguri de tranziție conceptuală:

• 39.86°C – prag de intrare în zona de tensiune structurală crescută,
unde sistemele biologice încep să își modifice modul de funcționare,
intrând într-o zonă de stres controlat.

• 44.7°C – prag de ieșire din zona de stabilitate; peste acest punct,
homeostazia este greu de menținut iar sistemul intră în regim critic.

Aceste praguri sunt folosite ca referințe conceptuale pentru a descrie
când un sistem se află într-o stare „aproape de limită”, chiar dacă
în alte domenii (psihologie, tehnologie, AI) nu lucrăm direct cu temperaturi.
`
  },
  {
    id: "model-2pi",
    domain: "generic",
    title: "Modelul 2π – ciclu de transformare",
    content: `
Modelul 2π descrie dinamica universală în patru faze:

1. Structură – o configurație inițială relativ stabilă.
2. Flux – apar perturbații, informație nouă, stres, input.
3. Reorganizare – sistemul reconfigurază conexiunile pentru a integra fluxul.
4. Noua Structură – apare o stare nouă, mai stabilă (sau mai adaptată).

În biologie, acest ciclu descrie adaptarea și procesele de homeostazie.
În psihologie, poate descrie o criză urmată de integrare și schimbare
de perspectivă. În tehnologie și AI, reprezintă cicluri iterative de
îmbunătățire: versiune inițială, feedback, refactorizare, noua versiune.
`
  },
  {
    id: "regulator-coeziv",
    domain: "generic",
    title: "Regulatorul Coeziv – erori F1..F6",
    content: `
Regulatorul Coeziv definește un set de blocaje conceptuale frecvente:

F1 – Amestec de domenii: combinarea necritică a fizicii cu psihologia,
a metaforei cu termodinamica, a homeostaziei cu IT fără precizarea
nivelului de analiză.

F2 – Salt abuziv de la local la global: dintr-un exemplu particular se
trage o concluzie despre întregul sistem sau societate.

F3 – Suprasaturare de context: prea multe informații eterogene puse
în același cadru, fără structurare sau prioritizare.

F4 – Confuzie micro–macro: amestec între mecanisme locale (celule,
neuroni, noduri de rețea) și comportament global (organism, psihic,
sistem social sau AI) fără o punte clară între niveluri.

F5 – Confuzia dintre tensiune și energie: tensiunea structurală este
un descriptor de stare, nu o sursă de „energie liberă” miraculoasă.

F6 – Utilizare numerică improprie a raportului 3.14 în domenii non-fizice:
3.14 este folosit ca analog conceptual, nu ca constantă numerică în
psihologie, AI sau economie.

Regulatorul Coeziv este folosit pentru a menține claritatea și
consistența interpretărilor interdisciplinare.
`
  },
  {
    id: "apa-homeostazie",
    domain: "biologic",
    title: "Apa ca matrice de homeostazie",
    content: `
În Modelul Coeziunii, apa este privită ca matrice universală pentru
homeostazie și coerență internă. Proporția ei în corp, structura
rețelei de apă intra- și extracelulară, sensibilitatea la temperatură
și presiune permit descrierea fină a stărilor de echilibru și dezechilibru.

Apa nu este „magică”, ci un mediu foarte sensibil la condiții, ceea ce
o face un bun indicator de stare. 3.14 și pragurile termice sunt
instrumente conceptuale pentru a discuta despre:

• stabilitate internă maximă vs flexibilitate;
• tranziții de fază în sisteme biologice;
• modul în care corpul gestionează stresul termic și metabolic.
`
  },
  {
    id: "psihologie-coeziva",
    domain: "psihologic",
    title: "Psihologia în Modelul Coeziv",
    content: `
Modelul Coeziv aplică structura 2π și conceptul de tensiune structurală
și în psihologie. În loc să vorbim doar despre „emoții” difuze,
considerăm că există structuri interne (convingeri, reprezentări,
scheme de relaționare) care suportă fluxul de experiență.

Când fluxul este intens sau contradictoriu, tensiunea structurală crește.
Dacă sistemul psihic poate să reorganizeze aceste structuri (prin reflecție,
terapie, insight, învățare), apare o nouă structură mai stabilă.
Dacă nu, tensiunea rămâne ridicată și pot apărea simptome, rigidizare
sau colaps de funcționare.

Modelul Coeziv nu reduce psihologia la biologie, dar folosește analogiile
cu homeostazia și apa ca să descrie mai precis procesele de reglaj intern.
`
  },
  {
    id: "ai-coeziv",
    domain: "tehnic",
    title: "AI și Modelul Coeziv",
    content: `
În inteligența artificială, Modelul Coeziv este folosit ca metaforă
structurală pentru a descrie:

• ρ_struct – profilul structural al unui sistem AI: cum sunt organizate
modulele, rutele de informație, memoria și mecanismele de decizie.

• J – o măsură conceptuală a tensiunii structurale: cât de aproape este
sistemul de o stare de confuzie, conflict între module, sau regim critic.

• Ciclul 2π – modul în care un AI trece de la o configurație stabilă
de răspuns, prin flux de inputuri dificile, la reorganizare (adaptare
de politici, reglaje de siguranță, schimbări de rutare) și apoi la o
nouă structură mai robustă.

CohezivWallet-AI este o aplicație directă a acestui model: un strat
care observă tensiunea, detectează erorile F1..F3 și ghidează sistemul
spre răspunsuri mai coerente și mai stabile.
`
  },
  {
    id: "vocabular-coeziv",
    domain: "generic",
    title: "Vocabularul Coeziv – termeni cheie",
    content: `
Câteva concepte cheie în Modelul Coeziv:

• ρ_struct – profil structural: distribuția fluxurilor, încărcarea
pe module, gradul de conflict intern.

• J – tensiune structurală: un scalar conceptual care indică cât de aproape
este sistemul de o tranziție de fază sau de o zonă critică.

• Fazele 2π – Structură, Flux, Reorganizare, Noua Structură.

• Frontiere critice – zone în care mici schimbări de flux duc la schimbări
mari de structură.

• Regim ordonat / mixt / tensionat – tipuri de funcționare ale unui sistem:
de la stabil și clar până la aproape instabil.

Acest vocabular nu este o teorie fizică nouă, ci un limbaj pentru a
discuta coerent despre sisteme complexe (biologice, psihologice, sociale,
tehnice sau AI).
`
  }
];

// --- RAG SIMPLU (scor de similaritate pe cuvinte + bonus de domeniu) ---

function scoreDoc(query, doc, domainHint) {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = (doc.title + " " + doc.content).toLowerCase();

  let score = 0;
  for (const w of q) {
    if (w.length < 3) continue; // ignorăm cuvinte foarte scurte
    if (text.includes(w)) score += 1;
  }

  // bonus dacă domeniul se potrivește cu domainHint
  if (domainHint && doc.domain === domainHint) {
    score += 2;
  }

  return score;
}

/**
 * Returnează până la k fragmente relevante din baza Coezivă,
 * concatenate într-un singur string, gata de pus în mesajul SYSTEM.
 */
export function retrieveCohezivContext(query, domainHint = null, k = 3) {
  if (!query || !query.trim()) return "";

  const scored = coezivDocs
    .map(d => ({ ...d, score: scoreDoc(query, d, domainHint) }))
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  if (!scored.length) return "";

  const parts = scored.map(d => `# ${d.title}\n${d.content.trim()}`);
  return parts.join("\n\n---\n\n");
}
