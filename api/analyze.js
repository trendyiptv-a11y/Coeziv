import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodă neacceptată" });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text lipsă pentru analiză." });
  }

  try {
    // aici vine codul nostru complet 3.14Δ, cu corecția numerică
