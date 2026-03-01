const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function listModels() {
  try {
    console.log("Fetching models...\n");

    const modelPager = await ai.models.list();

    for await (const model of modelPager) {

      console.log("Model:", model.name);

      if (model.supportedActions) {
        console.log("Supported actions:", model.supportedActions);
      }

      console.log("----------------------------------");
    }

  } catch (err) {
    console.error(err);
  }
}

listModels();