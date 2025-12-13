// crawler.js
// Crawling minimal: fetch + text extraction
// Fără AI, fără parsing agresiv

export async function crawlWeb(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "CoezivBot/1.0"
    }
  });

  if (!res.ok) {
    throw new Error("Crawling failed");
  }

  const html = await res.text();

  // extracție extrem de simplă (cheap & robust)
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // limităm volumul (cost control)
  return text.slice(0, 3000);
}
