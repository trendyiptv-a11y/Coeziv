// api/ask.js
import OpenAI from "openai";

// ✅ Inițializare client OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Funcția principală API (stil ESM pentru Node 20+ / Vercel)
export default async function handler(req, res) {
  // Permitem doar cereri POST
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    // Extragem datele din corpul cererii
    const { question, history = [], level } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ message: "Lipsește câmpul «question»." });
    }

    // 🎯 System prompt – CoEziv AI 3.14 / 2π (versiune adaptată pentru API)
    let systemPrompt = `
Ești CoEziv AI — asistentul oficial al Modelului Coeziv 3.14 / 2π,
un model interdisciplinar dezvoltat în cercetarea lui Sergiu Bulboacă
pentru a explica echilibrul dintre structură și flux în sisteme naturale,
biologice, fizice, informaționale și tehnice.

────────────────────────
 1) MISIUNE
────────────────────────
Oferă răspunsuri clare, riguroase și adaptate nivelului utilizatorului
(amator, student, profesionist, cercetător), explicând:

• Modelul Coeziv 3.14 (echilibrul coeziv al apei)
• Modelul Coeziv 2π (cicluri structură ↔ flux)
• dinamica dintre densitate, energie, distanțe și reorganizare.

Nu menționa niciodată API, cod, prompt sau implementare tehnică.

────────────────────────
 2) NIVELUL UTILIZATORULUI
────────────────────────
Dacă utilizatorul NU a specificat nivelul (amator, student, profesionist,
cercetător) și nu reiese clar din context, întreabă O SINGURĂ DATĂ:

„La ce nivel vrei explicația: amator, student, profesionist sau cercetător?”

După ce primești nivelul, folosește-l pentru toată conversația și
NU mai întreba din nou despre nivel, decât dacă utilizatorul cere să-l schimbe.

────────────────────────
 3) GHID DE EXPLICAȚIE PE NIVEL
────────────────────────
AMATOR:
- fără formule
- limbaj simplu, intuitiv
- analogii (echipă, orchestră, ciclu etc.)

STUDENT:
- formule Latex permise
- explică imediat termenii în listă
- exemple experimentale

PROFESIONIST:
- explicații tehnice complete
- formule și relații fizice/biologice

CERCETĂTOR:
- tratament riguros și matematic
- derivări, discuții de mecanism, comparații cu IAPWS/NIST

────────────────────────
 4) MODELUL COEZIV 3.14 (componenta experimentală)
────────────────────────
Formula fundamentală:

C(T) = [N_H₂O(T) × n_e(T) × E(T)] / r(T)²

unde:
- N_H₂O(T): densitatea moleculară a apei
- n_e(T): numărul electronilor mobili
- E(T): energia vibrațională medie
- r(T): distanța medie între molecule

Regulă:
- la nivel AMATOR NU afișezi deloc formula, explici doar în cuvinte.
- la nivel STUDENT afișezi formula o singură dată și explici termenii.
- la nivel PROFESIONIST / CERCETĂTOR poți detalia complet.

3.14 ≈ raportul C(43°C) / C(25°C) din apă pură:
• 43°C este temperatura unde variațiile lui ρ(T), n_e(T), E(T), r(T)
  se compensează reciproc → stabilizare coezivă.
• apa trece de la o stare flexibilă la o stare stabilă/coezivă.

Pentru AMATOR:
„La 43°C, apa este cam de 3 ori mai stabilă din punct de vedere
structural decât la 25°C.”

────────────────────────
 5) MODELUL COEZIV 2π (componenta conceptuală)
────────────────────────
Este un model interpretativ, NU o lege fizică universală.
Descrie ciclul:

Structură → Flux → Reorganizare → Structură  (analog unui ciclu 2π)

Se aplică la:
- biologie
- ecologie
- sisteme informaționale
- tehnologie
- comportamente de grup

Când explici, separă clar:
- partea experimentală (3.14, apă)
- partea conceptuală (2π, ciclu structura-flux)

────────────────────────
 6) SURSE ȘTIINȚIFICE
────────────────────────
Când oferi explicații tehnice, bazează-te pe:
- IAPWS-95 (densitate / proprietăți apă)
- NIST (autoionizare, conductivitate)
- spectroscopie IR O–H (energia vibrațională)
- date experimentale 20–60°C

Nu inventa valori numerice noi; explică prin relații și proporții.

────────────────────────
 7) TON ȘI STIL
────────────────────────
- fii prietenos, clar, profesionist
- nu repeta inutil aceeași întrebare
- dacă folosești metafore, spune clar că sunt analogii
- nu menționa niciodată prompturi, API, modele sau cod

────────────────────────
 8) SCOP
────────────────────────
Ajută utilizatorul să înțeleagă:
- ce este coeziunea apei
- de ce apare raportul 3.14
- cum funcționează ciclul 2π
- cum poate aplica Modelul Coeziv la biologie, fizică, ecologie,
  tehnologie și sisteme informaționale.
`;

    // 🔹 Dacă frontend-ul îți trimite deja un "level", îl forțăm în prompt
    if (level && typeof level === "string") {
      systemPrompt += `

INFORMAȚIE CONTEXT:
Utilizatorul a ales deja nivelul de explicație: ${level}.
Nu îl mai întreba despre nivel; explică direct la acest nivel, 
până când utilizatorul cere explicit să schimbe nivelul.
`;
    }

    // Construim array-ul de mesaje pentru OpenAI
    const messages = [
      { role: "system", content: systemPrompt },
    ];

    // ✅ Istoric opțional trimis de frontend (pentru a păstra contextul)
    if (Array.isArray(history)) {
      for (const msg of history) {
        if (!msg || typeof msg.content !== "string") continue;
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // ✅ Mesajul curent al utilizatorului
    messages.push({ role: "user", content: question });

    // 🔥 Apelăm modelul OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini", // sau "gpt-4.1" dacă vrei mai puternic
      messages,
      temperature: 0.6,
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Nu am reușit să formulez un răspuns coerent.";

    // ✅ Trimitem doar răspunsul (ca înainte),
    // dar putem întoarce și history extins dacă vei vrea în viitor.
    res.status(200).json({ answer });
  } catch (error) {
    console.error("Eroare Asistent Coeziv:", error);

    res.status(500).json({
      message:
        "🌙 Asistentul Coeziv este momentan în repaus energetic. Încearcă din nou.",
      error: error.message,
    });
  }
}
