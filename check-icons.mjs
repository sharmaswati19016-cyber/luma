import fs from "fs";

const words = fs
  .readFileSync("words.txt", "utf8")
  .split("\n")
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean);

const missing = words.filter((w) => !fs.existsSync(`public/icons/${w}.png`));

console.log(
  missing.length
    ? "Missing images: " + missing.join(", ")
    : "All " + words.length + " icons found"
);
