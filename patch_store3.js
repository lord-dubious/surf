const fs = require('fs');
let content = fs.readFileSync('lib/providers/store.ts', 'utf8');

const search = `    model: type !== "custom" ? defaultModels[type] : "",`;
const replace = `    model: type !== ("custom" as ProviderType) ? defaultModels[type as Exclude<ProviderType, "custom">] : "",`;

content = content.replace(search, replace);
fs.writeFileSync('lib/providers/store.ts', content);
console.log('patched');
