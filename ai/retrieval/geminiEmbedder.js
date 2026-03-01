const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function embed(text) {

  const response = await ai.models.embedContent({
    model: "models/gemini-embedding-001",
    contents: text,
  });

  return response.embeddings[0].values;
}

module.exports = embed;