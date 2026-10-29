require("dotenv").config();

const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const DOWNLOAD_DIR = path.join(__dirname, "..", "downloads");
const AUTO_REPLY_TEXT =
  process.env.AUTO_REPLY_TEXT ||
  "Got your message. If you sent a file, it has been saved.";

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const chromePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, "..", ".wwebjs_auth") }),
  puppeteer: {
    headless: true,
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("\nScan this QR in WhatsApp → Linked devices → Link a device\n");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("Authenticated. Session will be reused next time.");
});

client.on("ready", () => {
  console.log("WhatsApp is connected. Listening for messages.");
});

client.on("auth_failure", (msg) => {
  console.error("Auth failed:", msg);
});

client.on("disconnected", (reason) => {
  console.log("Disconnected:", reason);
});

client.on("message", async (message) => {
  try {
    if (message.from === "status@broadcast") return;
    if (message.fromMe) return;

    let savedPath = null;
    if (message.hasMedia) {
      savedPath = await saveIncomingMedia(message);
    }

    const reply = savedPath
      ? `Received your file and saved it as ${path.basename(savedPath)}.`
      : AUTO_REPLY_TEXT;

    await message.reply(reply);
    console.log(`Replied to ${message.from}${savedPath ? ` (saved ${savedPath})` : ""}`);
  } catch (err) {
    console.error("Failed to handle message:", err);
  }
});

async function saveIncomingMedia(message) {
  const media = await message.downloadMedia();
  if (!media) return null;

  const from = (message.from || "unknown").replace(/[^\dA-Za-z]/g, "_");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = extensionFor(media, message);
  const kind = message.type || "media";
  const filename = `${stamp}_${from}_${kind}${ext}`;
  const filepath = path.join(DOWNLOAD_DIR, filename);

  fs.writeFileSync(filepath, Buffer.from(media.data, "base64"));
  return filepath;
}

function extensionFor(media, message) {
  const fromName = path.extname(message.body || "") || path.extname(media.filename || "");
  if (fromName) return fromName;

  const map = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "application/zip": ".zip",
  };
  return map[media.mimetype] || "";
}

client.initialize();
