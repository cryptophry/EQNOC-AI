import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const chat = ai.chats.create({
    model: 'gemini-3.1-pro-preview',
    config: {
        tools: [{ functionDeclarations: [{ name: 'test', description: 'test' }] }]
    }
});
async function run() {
    try {
        const res = await chat.sendMessageStream({ message: "Call test" });
        for await (const chunk of res) {
            console.log("Chunk text:", chunk.text);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
