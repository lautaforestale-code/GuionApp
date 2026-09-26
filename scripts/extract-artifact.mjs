import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist-artifact/index.html", "utf8");

const titleMatch = html.match(/<title>[\s\S]*?<\/title>/);
const themeScriptMatch = html.match(/<script>[\s\S]*?<\/script>/); // inline, non-module theme-flash guard
const styleMatch = html.match(/<style[^>]*>[\s\S]*?<\/style>/);
const scriptMatch = html.match(/<script type="module"[^>]*>[\s\S]*?<\/script>/);
const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);

if (!titleMatch || !themeScriptMatch || !styleMatch || !scriptMatch || !bodyMatch) {
  console.error("Missing expected section", {
    title: !!titleMatch,
    themeScript: !!themeScriptMatch,
    style: !!styleMatch,
    script: !!scriptMatch,
    body: !!bodyMatch,
  });
  process.exit(1);
}

const out = [
  titleMatch[0],
  themeScriptMatch[0],
  styleMatch[0].replace(/<style[^>]*>/, "<style>"),
  bodyMatch[1].trim(),
  scriptMatch[0].replace(/<script[^>]*>/, '<script type="module">'),
].join("\n\n");

writeFileSync("dist-artifact/artifact-content.html", out, "utf8");
console.log("wrote dist-artifact/artifact-content.html", out.length, "bytes");
