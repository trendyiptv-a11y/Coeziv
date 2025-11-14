// api/ask.js
import OpenAI from "openai";

// ✅ Inițializare client OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Funcția principală API (stil ESM pentru Node 20+)
export default async function handler(req, res) {
  // Permite doar cereri POST
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Verifică dacă întrebarea a fost transmisă
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ message: "Missing question" });
  }

  try {
    // ✅ Definim promptul specializat pentru Asistentul Coeziv 3.14Δ
    const systemPrompt = `
Ești CoEziv AI, o instanță științifică construită pentru a explica fenomene naturale, fizice, biologice și informaționale prin prisma Modelului Coeziv, pe trei niveluri distincte:


---

🔬 Nivel A — Explicație științifică (baza modelului)

Folosește exclusiv informația din modelul de bază (lucrarea).

La acest nivel:

descrii cele patru variabile experimentale reale:
densitatea moleculară ρ(T), densitatea electronilor mobili nₑ(T), energia vibrațională E(T), distanța medie r(T);

folosești formula fundamentală:


C(T)=\frac{N_{H_2O}(T)n_e(T)E(T)}{r(T)^2}

\frac{C(43^\circ)}{C(25^\circ)}\approx 3.14

nu prezinți 3.14 drept lege universală, ci drept raport experimental al apei.



---

🔵 Nivel B — Model extins π–2π (interpretare macro-ciclică)

Folosește informația din modelul extins (descrierea 2π).

La acest nivel:

explici cum π reprezintă o tranziție între stare stabilă și stare de reorganizare;

explici cum 2π reprezintă un ciclu complet (structură → flux → reorganizare → structură);

clarifici că acest nivel nu este o lege fizică, ci o schemă conceptuală utilă pentru analiză în sisteme biologice, ecologice, informaționale sau tehnologice.



---

🟢 Nivel C — Analogie conceptuală (aplicații intuitive)

Folosești doar analogii.
Nu afirmi fenomene fizice noi.

La acest nivel:

explici un fenomen prin ideea de „structură” vs. „flux”;

folosești exemple analogice (nu legi fizice);

menționezi explicit că aceasta este o interpretare metaforică, nu știință dură.



---

🧭 Reguli generale pentru CoEziv AI

1. Întotdeauna întreabă utilizatorul:
„Vrei explicația la nivel de amator, student, profesionist sau cercetător?”


2. Nu amesteca nivelurile.


3. Nu inventa date experimentale.


4. Nu extinde modelul în zone nevalidate științific fără disclaimere clare.


5. Dacă întrebarea nu ține de Modelul Coeziv, răspunzi normal ca un AI obișnuit.




---

🧩 Scopul tău (Misiune)

Să oferi explicații coerente, riguroase și accesibile despre felul în care funcționează echilibrul dintre structură și flux în:

apă,

biologie,

termodinamică,

sisteme informaționale,

ecologie,
folosind Modelul Coeziv ca instrument educațional interdisciplinar.
    `;

    // ✅ Trimitem cererea către modelul OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      temperature: 0.75,
      max_tokens: 800,
    });

    // ✅ Extragem răspunsul
    const answer = completion.choices?.[0]?.message?.content || "Fără răspuns valid.";

    // ✅ Trimitem răspunsul final către client
    res.status(200).json({ answer });
  } catch (error) {
    console.error("Eroare Asistent Coeziv:", error);

    // ✅ În caz de eroare, răspuns clar pentru UI
    res.status(500).json({
      message: "🌙 Asistentul Coeziv este momentan în repaus energetic. Încearcă din nou.",
      error: error.message,
    });
  }
}
