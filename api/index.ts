// Vercel serverless function entry point
// Import the Express app from src/index.ts
import app from '../src/index';

// Export the Express app directly
// @vercel/node automatically handles Express apps
export default app;

