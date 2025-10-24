export default async function handler(req, res) {
  try {
    const { text } = await req.json?.() || req.body;
    const apiKey = process.env.NEWS_API_KEY; // cheie de la https://newsapi.org

    if (!apiKey) {
      return res.status(500).json({ error: "Lipsește NEWS_API_KEY în environment variables" });
    }

    const query = encodeURIComponent(text.slice(0, 60)); // extragem esența frazei
    const url = `https://newsapi.org/v2/everything?q=${query}&language=ro&sortBy=publishedAt&pageSize=3&apiKey=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data?.articles?.length > 0) {
      res.status(200).json({
        found: true,
        articles: data.articles.map(a => ({
          title: a.title,
          source: a.source.name,
          publishedAt: a.publishedAt,
          url: a.url
        }))
      });
    } else {
      res.status(200).json({ found: false, articles: [] });
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
