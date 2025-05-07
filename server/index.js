require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY || "AIzaSyClVZB37DZdHU2QsMoMamZK7zZ7gRAl5eo";
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || "86e6ba053ae2c467c";

app.post("/api/search", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Query is required." });
  }
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(
      query
    )}`;
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Search failed", details: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("AI Agent Chat Backend Running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
