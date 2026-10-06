// Prints the bcrypt hash of the hidden-options code (docs/spec/deploy.md).
// The code comes from env CODE, a pipe on stdin, or a silent prompt; never from argv.
// Cost: env COST (default 12).
import bcrypt from "bcryptjs";

const cost = Number(process.env.COST ?? 12);
if (!Number.isInteger(cost) || cost < 4 || cost > 31) {
  console.error("COST must be an integer from 4 to 31");
  process.exit(1);
}

async function readCode() {
  if (process.env.CODE) return process.env.CODE;
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let text = "";
    for await (const chunk of stdin) text += chunk;
    return text.replace(/\r?\n$/, "");
  }
  process.stderr.write("Code (hidden): ");
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return new Promise((resolve) => {
    let text = "";
    stdin.on("data", (s) => {
      for (const ch of s) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          process.stderr.write("\n");
          return resolve(text);
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f") text = text.slice(0, -1);
        else text += ch;
      }
    });
  });
}

// The app trims the typed code before checking, so hash the trimmed one.
const code = (await readCode()).trim();
if (!code) {
  console.error("No code given.");
  process.exit(1);
}
console.log(await bcrypt.hash(code, cost));
