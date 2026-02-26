(async () => {
  try {
    const chalk = (await import("chalk")).default;
    const { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore } = await import("@whiskeysockets/baileys");
    const fs = await import('fs');
    const pino = await import('pino');
    const readline = (await import("readline")).createInterface({ input: process.stdin, output: process.stdout });
    const question = (text) => new Promise((resolve) => readline.question(text, resolve));

    // Function to read messages from multiple files
    const readMessagesFromFiles = async (filePaths) => {
      let messages = [];
      for (const filePath of filePaths) {
        try {
          const data = await fs.promises.readFile(filePath, 'utf-8');
          messages = messages.concat(data.split('\n').filter(line => line.trim() !== ''));
        } catch (err) {
          console.error(`Error reading message file ${filePath}:`, err);
        }
      }
      return messages;
    };

    // Function to start WhatsApp connection
    const connect = async () => {
      const { state, saveCreds } = await useMultiFileAuthState(`./session`);

      const MznKing = makeWASocket({
        logger: pino.default({ level: 'silent' }),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino.default({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
      });

      // Check if user is registered
      if (!MznKing.authState.creds.registered) {
        let phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`ENTER YOUR COUNTRY CODE + PHONE NUMBER : `)));
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        // Request pairing code after a delay
        setTimeout(async () => {
          let code = await MznKing.requestPairingCode(phoneNumber);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(chalk.black(chalk.bgGreen(`THIS IS YOUR LOGIN CODE : `)), chalk.black(chalk.cyan(code)));
        }, 3000);
      }

      MznKing.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection === "open") {
          console.log(chalk.yellow("YOUR WHATSAPP SUCCESSFULLY LOGIN DEAR USER"));

          const targetNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type the target number (format: +947xxxxxxxxx) : `)));
          const intervalTime = await question(chalk.bgBlack(chalk.greenBright(`Please type the interval time in seconds : `)));

          // Get message file names
          const filePathsInput = await question(chalk.bgBlack(chalk.greenBright(`Please enter the message file names (comma-separated) : `)));
          const filePaths = filePathsInput.split(',').map(file => file.trim());

          // Read messages from the specified files
          const messages = await readMessagesFromFiles(filePaths);

          if (messages.length === 0) {
            console.log(chalk.bgBlack(chalk.redBright("No messages found in the specified files.")));
            process.exit(0);
          }

          // Send messages in intervals
          let currentIndex = 0;

          const sendMessageInfinite = async () => {
            const message = messages[currentIndex];
            await MznKing.sendMessage(targetNumber + '@s.whatsapp.net', { text: message });
            console.log(`Message sent: ${message}`);
            currentIndex = (currentIndex + 1) % messages.length; // Loop through messages
            setTimeout(sendMessageInfinite, intervalTime * 1000); // Send message every intervalTime seconds
          };
          sendMessageInfinite();
        }

        // Handle connection closure and attempt to reconnect
        if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
          console.log("Connection closed, attempting to reconnect...");
          await connect(); // Call the connect function again to reconnect
        }
      });

      MznKing.ev.on('creds.update', saveCreds); // Save credentials to keep the session alive
    };

    await connect(); // Initial connection call

  } catch (error) {
    console.error("Error importing modules:", error);
  }
})();