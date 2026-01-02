# Troubleshooting Guide

## "Route not found" Error

If you're seeing `{"error":"Route not found"}` on your Vercel deployment:

### Step 1: Check Vercel Function Logs

1. Go to your Vercel project dashboard
2. Click on the deployment
3. Go to **Functions** tab
4. Click on the function (usually `api/index.ts`)
5. Check the **Logs** tab for errors

### Step 2: Common Issues

#### Issue: Environment Variables Not Set
**Symptom:** Function crashes on initialization
**Solution:** 
- Go to Vercel Settings → Environment Variables
- Ensure all required variables are set:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - Other M-Pesa variables if using payments

#### Issue: Database Tables Not Created
**Symptom:** Errors about missing tables
**Solution:**
- Run `database/schema.sql` in Supabase SQL Editor
- Verify all tables exist

#### Issue: TypeScript Compilation Errors
**Symptom:** Build fails
**Solution:**
- Check build logs in Vercel
- Ensure `tsconfig.json` is correct
- Run `npm run build` locally to test

#### Issue: Import/Export Errors
**Symptom:** "Cannot find module" or "default export" errors
**Solution:**
- Ensure `src/index.ts` exports the app: `export default app;`
- Ensure `api/index.ts` imports correctly: `import app from '../src/index';`

### Step 3: Test the Root Route

After deployment, test:
```
GET https://your-app.vercel.app/
```

Should return:
```json
{
  "message": "Fraud Prevention Payment System API",
  "version": "1.0.0",
  "endpoints": { ... }
}
```

### Step 4: Test API Routes

Test a simple endpoint:
```
GET https://your-app.vercel.app/api/balance/test-user-id
```

### Step 5: Check vercel.json Configuration

Ensure `vercel.json` has:
```json
{
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/api/index.ts"
    }
  ]
}
```

### Step 6: Verify Build Output

1. Check that `dist/` folder is created (if using build)
2. Or ensure Vercel is compiling TypeScript correctly
3. Check build logs for any errors

## Debugging Steps

1. **Check Function Logs** - Most important!
2. **Verify Environment Variables** - All set correctly?
3. **Test Locally** - Does `npm run dev` work?
4. **Check Database** - Are tables created?
5. **Verify Routes** - Are routes defined correctly?

## Getting Help

If still having issues:
1. Share the error from Vercel function logs
2. Share your `vercel.json` configuration
3. Share any build errors
4. Verify environment variables are set (without sharing actual values)

