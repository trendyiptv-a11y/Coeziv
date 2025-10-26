import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(400).json({ success: false, message: "Câmpul 'query' lipsește." });
    }

    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url);
    const data = await response.json();

    const results = [];

    if (data.RelatedTopics?.length > 0) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text && topic.FirstURL) {
          results.push({ title: topic.Text, url: topic.FirstURL });
        }
      }
    }

    res.status(200).json({
      success: true,
      sources: results.length > 0 ? results : [{ title: "Nicio sursă factuală relevantă găsită.", url: "" }],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Eroare la căutarea factuală.", error: error.message });
  }
}
