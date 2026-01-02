// JavaScript version for Vercel (fallback if TypeScript doesn't work)
const app = require('../dist/index.js').default || require('../dist/index.js');
module.exports = app;

