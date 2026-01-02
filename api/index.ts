// Vercel serverless function entry point
// Import the Express app from src/index.ts
import app from '../src/index';

// Export as default for Vercel
// Vercel will use this as the serverless function handler
export default app;

// Also export as handler for compatibility
export const handler = app;

