#!/usr/bin/env node
// scripts/hash-password.js
// Interactive CLI to securely generate a bcrypt hash for ArcVerse Owner Admin

import readline from "node:readline";
import bcrypt from "bcryptjs";

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let password = "";
    process.stdout.write(prompt);

    // Mute stdout to hide typed characters
    process.stdin.on("data", (char) => {
      char = char.toString();
      switch (char) {
        case "\n":
        case "\r":
        case "\u0004":
          break;
        default:
          process.stdout.write("*");
          break;
      }
    });

    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  console.log("\n=== ArcVerse: Admin Password Hasher ===");
  console.log("Enter the desired owner password to generate a secure bcrypt hash.\n");

  const pwd1 = await askHidden("Enter new admin password: ");
  if (!pwd1 || pwd1.length < 6) {
    console.error("\n[Error] Password must be at least 6 characters long.");
    process.exit(1);
  }

  const pwd2 = await askHidden("Confirm admin password:   ");
  if (pwd1 !== pwd2) {
    console.error("\n[Error] Passwords do not match. Please run the command again.");
    process.exit(1);
  }

  console.log("\nGenerating bcrypt hash (salt rounds: 10)...");
  const hash = await bcrypt.hash(pwd1, 10);

  console.log("\n=======================================================");
  console.log("SUCCESS! Copy the line below into your .env file:");
  console.log("=======================================================");
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("Error generating hash:", err);
  process.exit(1);
});
