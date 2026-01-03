import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const fontsDir = path.resolve("public", "fonts");
const cssPath = path.join(fontsDir, "fonts.css");
const fontCssUrls = [
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@400;600;700&display=swap",
];

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const fetchText = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": userAgent } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to fetch ${url} (${res.statusCode})`));
          res.resume();
          return;
        }
        res.setEncoding("utf8");
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });

const downloadFile = (url, destination) =>
  new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https
      .get(url, { headers: { "User-Agent": userAgent } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${url} (${res.statusCode})`));
          res.resume();
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (error) => {
        fs.unlink(destination, () => reject(error));
      });
  });

const ensureDir = (dir) => fs.promises.mkdir(dir, { recursive: true });

const cleanFonts = async () => {
  try {
    const entries = await fs.promises.readdir(fontsDir);
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".woff2") || entry === "fonts.css")
        .map((entry) => fs.promises.rm(path.join(fontsDir, entry)))
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
};

const run = async () => {
  await ensureDir(fontsDir);
  await cleanFonts();

  const cssChunks = [];
  for (const url of fontCssUrls) {
    cssChunks.push(await fetchText(url));
  }

  let combinedCss = `${cssChunks.join("\n")}\n`;
  const urlRegex = /https:\/\/fonts\.gstatic\.com\/[^)\s]+/g;
  const urls = Array.from(new Set(combinedCss.match(urlRegex) ?? []));

  for (const url of urls) {
    const fileName = path.basename(url);
    const outPath = path.join(fontsDir, fileName);
    await downloadFile(url, outPath);
    combinedCss = combinedCss.replaceAll(url, `/fonts/${fileName}`);
  }

  await fs.promises.writeFile(cssPath, combinedCss, "ascii");
  console.log(`Prepared fonts in ${path.relative(process.cwd(), fontsDir)}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
