const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
//console.log("Gemini API Key set:", process.env.GEMINI_API_KEY);

async function askGemini(systemPrompt, userPrompt) {

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt
    });

    const result = await model.generateContent(userPrompt);

    const response = await result.response;
    return response.text();
}

module.exports = askGemini;
