(async () => {
try {
const chalk = (await import("chalk")).default;
const { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore } = await import("@whiskeysockets/baileys");
const fs = await import("fs");
const pino = await import("pino");

const readline = (await import("readline")).createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (text) => new Promise((resolve) => readline.question(text, resolve));

const readMessagesFromFiles = async (filePaths) => {
  let messages = [];
  for (const filePath of filePaths) {
    try {
      const data = await fs.promises.readFile(filePath, "utf-8");
      messages = messages.concat(data.split("\n").filter(line => line.trim() !== ""));
    } catch (err) {
      console.log("Error reading file:", filePath);
    }
  }
  return messages;
};

const connect = async () => {

  const { state, saveCreds } = await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    logger: pino.default({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino.default({ level: "fatal" }))
    },
    markOnlineOnConnect: true
  });

  let phoneNumber;

  if (!state.creds.registered) {
    phoneNumber = await question(
      chalk.bgBlack(chalk.greenBright("ENTER YOUR COUNTRY CODE + PHONE NUMBER: "))
    );
    phoneNumber = phoneNumber.replace(/[^0-9]/g, "");
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      console.log("Connecting to WhatsApp...");
    }

    if (connection === "open") {
      console.log(chalk.yellow("WHATSAPP CONNECTED SUCCESSFULLY"));

      if (phoneNumber) {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(
          chalk.black(chalk.bgGreen("PAIR CODE:")),
          chalk.cyan(code.match(/.{1,4}/g).join("-"))
        );
      }

      const targetNumber = await question("Enter target number (923xxxxxxxxx): ");
      const intervalTime = await question("Enter interval time (seconds): ");
      const fileInput = await question("Enter message file names (comma separated): ");

      const files = fileInput.split(",").map(f => f.trim());
      const messages = await readMessagesFromFiles(files);

      if (messages.length === 0) {
        console.log("No messages found in files");
        process.exit();
      }

      let index = 0;

      const sendLoop = async () => {
        const msg = messages[index];
        await sock.sendMessage(targetNumber + "@s.whatsapp.net", { text: msg });

        console.log("Message sent:", msg);

        index = (index + 1) % messages.length;

        setTimeout(sendLoop, intervalTime * 1000);
      };

      sendLoop();
    }

    if (connection === "close") {
      const status = lastDisconnect?.error?.output?.statusCode;

      if (status !== 401) {
        console.log("Connection closed, reconnecting...");
        connect();
      } else {
        console.log("Logged out. Delete session folder and login again.");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
};

connect();

} catch (err) {
console.log("Error:", err);
}
})();
