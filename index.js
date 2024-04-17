import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import dotenv from "dotenv";
import { exec } from "child_process";
import express from "express";
import { promises as fs } from "fs";
import voice from "elevenlabs-node";
import os from "os"
import path from 'path';
import { getData, setData } from "./services/redis_service.js";
import { v4 as uuidv4 } from 'uuid';

dotenv.config();
const genAI = new GoogleGenerativeAI("AIzaSyApGW9OFoJC9q87xVqedKwqqR2AM82Qfg4");
const elevenLabsApiKey = "a01a1d868e9c23c649cd16fb3f909b0a";
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

const lipSyncMessage = async (message, folderPath) => {
  const time = new Date().getTime();

  console.log(`Starting uu conversion for message ${message}`);

  await execCommand(
    `ffmpeg -y -i ${folderPath}/message_${message}.mp3 ${folderPath}/message_${message}.wav`
    // -y to overwrite the file
  );

  console.log(`Conversion done in ${new Date().getTime() - time}ms`);

  if (os.platform() === 'linux') {
    await execCommand(
      `./bin/rhubarb-l/rhubarb -f json -o ${folderPath}/message_${message}.json ${folderPath}/message_${message}.wav -r phonetic`
    );
  }

  if (os.platform() === 'win32') {
    await execCommand(
      `cd ./bin/rhubarb-w && rhubarb.exe -f json -o ../../${folderPath}/message_${message}.json ../../${folderPath}/message_${message}.wav -r phonetic`
    );
  }

  // -r phonetic is faster but less accurate
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

app.post("/chat", async (req, res) => {
  let userMessage = req.body.message;
  userMessage = userMessage.replace(/\s+/g, ' ')

  const response = await getData(`messages:${userMessage}`);

  if (response) {
    return res.send(response)
  }

  if (userMessage == "@greeting") {
    const response = await fs.readFile("raw-json/greeting.json", "utf8")
    return res.send({ messages: JSON.parse(response) })
  }

  let messages;
  const folderPath = `audios/${uuidv4()}`;

  try {
    if (!userMessage.length) throw new Error('Empty message');
    messages = await getAnswerFromGemini(userMessage);
    await createFolder(folderPath)

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      // generate audio file
      const fileName = `${folderPath}/message_${i}.mp3`; // The name of your audio file
      const textInput = message.text; // The text you wish to convert to speech
      await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
      // generate lipsync
      await lipSyncMessage(i, folderPath);

      message.audio = await audioFileToBase64(fileName);
      message.lipsync = await readJsonTranscript(`${folderPath}/message_${i}.json`);
    }
  } catch (error) {
    const response = await fs.readFile("raw-json/sorry.json", "utf8")
    return res.send({ messages: JSON.parse(response) })
  }

  // fs.writeFile('data.json', JSON.stringify(messages), (err) => {
  //   if (err) {
  //     console.error('Error writing file:', err);
  //     return;
  //   }
  //   console.log('Data saved successfully!');
  // });

  await deleteFiles(folderPath)
  await setData(`messages:${userMessage}`, { messages: messages }, 3600)
  res.send({ messages });
});

async function createFolder(folderPath) {
  try {
    // Check if the folder exists
    const stats = await fs.stat(folderPath);
    if (stats.isDirectory()) {
      return 'Folder already exists';
    } else {
      throw new Error('Path exists but is not a folder');
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Directory does not exist, create it
      await fs.mkdir(folderPath, { recursive: true });
      return 'Folder created successfully';
    } else {
      throw err;
    }
  }
}

const deleteFiles = async (folderPath) => {
  try {
    const files = await fs.readdir(folderPath);
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      console.log(filePath)
      await fs.unlink(filePath);
      console.log(`Deleted ${filePath}`);
    }

    // await fs.rm(folderPath, { recursive: true })
    console.log('All files deleted successfully');
  } catch (error) {
    console.error('Error deleting files:', error);
  }
}

const getAnswerFromGemini = async (message) => {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const prompt = `You are a virtual assistant girl and your name is marcy.
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
  console.log(`AI listening on port ${port}`);
});
