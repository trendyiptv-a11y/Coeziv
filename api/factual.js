export default async function handler(req, res) {
  try {
    const query = req.query.query || "";
    if (!query) {
      return res.status(400).json({ error: "No query provided" });
    }

    // 🔍 Căutare publică pe DuckDuckGo
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const response = await fetch(ddgUrl);
    const data = await response.json();

    let sources = [];

    if (data && data.RelatedTopics && data.RelatedTopics.length > 0) {
      sources = data.RelatedTopics
        .filter(item => item.Text && item.FirstURL && !item.FirstURL.includes("yandex"))
        .slice(0, 4)
        .map(item => ({
          title: item.Text,
          url: item.FirstURL
        }));
    }

    // 🧩 Fallback Wikipedia dacă DuckDuckGo nu returnează nimic
    if (sources.length === 0) {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=4&search=${encodeURIComponent(query)}`;
      const wikiRes = await fetch(wikiUrl);
      const wikiData = await wikiRes.json();

      if (wikiData && wikiData[1]?.length) {
        sources = wikiData[1].map((title, i) => ({
          title: title,
          url: wikiData[3][i]
        }));
      }
    }

    // 🔚 Dacă tot nu există rezultate, trimitem fallback
    if (sources.length === 0) {
      sources = [
        { title: "Wikipedia – enciclopedie generală", url: "https://ro.wikipedia.org" },
        { title: "Reuters – știri globale verificate", url: "https://www.reuters.com" },
        { title: "Investopedia – concepte economice", url: "https://www.investopedia.com" }
      ];
    }

    res.status(200).json({ sources });
  } catch (error) {
    res.status(500).json({
      error: "Factual search failed",
      details: error.message
    });
  }
}
