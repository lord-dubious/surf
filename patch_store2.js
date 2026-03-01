const fs = require('fs');
let content = fs.readFileSync('lib/providers/store.ts', 'utf8');

const search = `  const apiKey = envKeys[type];
  if (type !== "ollama" && type !== "custom" && !apiKey) return null;`;

const replace = `  const apiKey = envKeys[type];
  if (type !== "ollama" && type !== "custom" && !apiKey) return null;
  if (type === "custom") return null;`;

content = content.replace(search, replace);
fs.writeFileSync('lib/providers/store.ts', content);
console.log('patched');
