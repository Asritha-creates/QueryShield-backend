const Groq = require("groq-sdk");
require("dotenv").config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function askGroq(systemPrompt, userPrompt) {
    try {

        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ]
        });

        let text = completion.choices[0].message.content;

        text = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        return text;

    } catch (err) {
        console.error("Groq Error:", err);
        throw err;
    }
}

module.exports = askGroq;