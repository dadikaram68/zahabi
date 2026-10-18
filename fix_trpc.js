const fs = require('fs');
const path = 'c:/Users/Karam/Documents/zahabi/Aldhahabi-Accounting-source/server/_core/trpc.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/startsWith\(.*?\)/, 'startsWith(CSRF_COOKIE_NAME + "=")');
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed trpc.ts');
