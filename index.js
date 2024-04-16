import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import dotenv from "dotenv";
import { exec } from "child_process";
import express from "express";
import { promises as fs } from "fs";
import voice from "elevenlabs-node";
import os from "os"

dotenv.config();
const genAI = new GoogleGenerativeAI("AIzaSyApGW9OFoJC9q87xVqedKwqqR2AM82Qfg4");
const elevenLabsApiKey = "686942150665dfdeba8f5431077a67c0";
const voiceID = "21m00Tcm4TlvDq8ikWAM";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("it's running bro");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();

  console.log(`Starting uu conversion for message ${message}`);

  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
    // -y to overwrite the file
  );

  console.log(`Conversion done in ${new Date().getTime() - time}ms`);

  if (os.platform() === 'linux') {
    await execCommand(
      `./bin/rhubarb-l/rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
    );
  }

  if (os.platform() === 'win32') {
    await execCommand(
      `cd ./bin/rhubarb-w && rhubarb.exe -f json -o ../../audios/message_${message}.json ../../audios/message_${message}.wav -r phonetic`
    );
  }

  // -r phonetic is faster but less accurate
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  let messages = await getAnswerFromGemini(userMessage);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    // generate audio file
    const fileName = `audios/message_${i}.mp3`; // The name of your audio file
    const textInput = message.text; // The text you wish to convert to speech
    const res = await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
    // generate lipsync
    await lipSyncMessage(i);

    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  res.send({ messages });
});

const getAnswerFromGemini = async (message) => {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const prompt = ` You are a virtual girlfriend and your name is marcy.
    You will always reply with a JSON array of messages no matter what. With a maximum of 3 messages.
    Each message has a text, facialExpression, and animation property.
    The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
    The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry. 
    
    the message is "${message}"`
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  let answer = []
  answer = JSON.parse(text)
  return answer;
}

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Girlfriend listening on port ${port}`);
});
