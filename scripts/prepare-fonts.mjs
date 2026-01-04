import fs from "node:fs";
import path from "node:path";

const fontsDir = path.resolve("public", "fonts");
const cssPath = path.join(fontsDir, "fonts.css");

const extractUrls = (css) => {
  const urls = [];
  const regex = /url\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    const cleaned = raw.replace(/^['"]|['"]$/g, "");
    urls.push(cleaned);
  }
  return urls;
};

const run = async () => {
  if (!fs.existsSync(cssPath)) {
    throw new Error(
      `Missing ${path.relative(process.cwd(), cssPath)}. ` +
        "Ensure local font assets are present."
    );
  }

  const css = await fs.promises.readFile(cssPath, "utf8");
  const urls = extractUrls(css);
  const remoteUrls = urls.filter((url) => /^https?:\/\//i.test(url));
  if (remoteUrls.length) {
    throw new Error(
      `External font URLs detected in ${path.relative(process.cwd(), cssPath)}: ` +
        remoteUrls.join(", ")
    );
  }

  const missing = [];
  for (const url of urls) {
    if (!url.startsWith("/fonts/")) {
      continue;
    }
    const filePath = path.join(fontsDir, path.basename(url));
    if (!fs.existsSync(filePath)) {
      missing.push(path.basename(url));
    }
  }

  if (missing.length) {
    throw new Error(
      `Missing local font files in ${path.relative(process.cwd(), fontsDir)}: ` +
        missing.join(", ")
    );
  }

  console.log(`Using local fonts from ${path.relative(process.cwd(), fontsDir)}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
