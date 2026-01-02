# System Setup Guide

## Prerequisites

1. **Node.js 18+** installed
2. **Supabase account** (free tier works)
3. **Vercel account** (for deployment)
4. **M-Pesa Daraja API credentials** (if using M-Pesa features)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

This will install all required packages:
- @supabase/supabase-js
- express
- uuid
- zod
- axios

### 2. Database Setup (Supabase)

1. **Create a new Supabase project** at https://supabase.com
2. **Go to SQL Editor** in your Supabase dashboard
3. **Copy and paste** the entire contents of `database/schema.sql`
4. **Run the SQL** to create all tables, indexes, and policies
5. **Verify tables created:**
   - users
   - user_devices
   - transactions
   - ledger_entries
   - user_balances
   - referrals
   - webhook_idempotency
   - admin_controls
   - audit_logs

### 3. Environment Variables

#### For Local Development (.env file)

Create a `.env` file in the root directory:

```bash
# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000

# M-Pesa Daraja API (Required for signup/payments)
DARAJA_CONSUMER_KEY=your-consumer-key
DARAJA_CONSUMER_SECRET=your-consumer-secret
DARAJA_PASS_KEY=your-pass-key
DARAJA_SHORT_CODE=your-short-code
DARAJA_BASE_URL=https://sandbox.safaricom.co.ke  # or https://api.safaricom.co.ke for production
DARAJA_CALLBACK_URL=http://localhost:3000/webhooks/daraja  # Update with your actual URL
```

#### For Vercel Deployment

1. Go to your Vercel project dashboard
2. Navigate to **Settings → Environment Variables**
3. Add all the variables listed above
4. **Important:** Update `DARAJA_CALLBACK_URL` to your Vercel deployment URL:
   ```
   https://your-app.vercel.app/webhooks/daraja
   ```

### 4. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

### 5. Local Development

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or your configured PORT).

### 6. Vercel Deployment

1. **Push your code to GitHub**
2. **Import project in Vercel**
3. **Set environment variables** (Step 3 above)
4. **Deploy**

Vercel will automatically:
- Install dependencies
- Build the project
- Deploy as serverless functions

### 7. Initial Admin Setup

After deployment, you need to create an admin user:

1. **Sign up a user** via `/api/signup` endpoint
2. **Go to Supabase SQL Editor** and run:
   ```sql
   UPDATE users 
   SET is_admin = true 
   WHERE email = 'your-admin-email@example.com';
   ```

### 8. Configure Admin Controls

Once you have an admin user, set up system controls:

```bash
# Using the API (replace with your admin user ID)
PUT /api/admin/controls/escrow_delay_days
Headers: x-user-id: your-admin-user-id
Body: {
  "value": 7,
  "description": "Number of days before referral payouts are released"
}
```

Or set them directly in Supabase:
```sql
INSERT INTO admin_controls (key, value, description, updated_by)
VALUES 
  ('escrow_delay_days', '7', 'Escrow delay in days', 'your-admin-user-id'),
  ('referral_velocity_limit', '5', 'Max referrals per hour', 'your-admin-user-id'),
  ('fraud_check_enabled', 'true', 'Enable fraud detection', 'your-admin-user-id'),
  ('maintenance_mode', 'false', 'System maintenance mode', 'your-admin-user-id'),
  ('min_withdrawal_amount', '100', 'Minimum withdrawal amount', 'your-admin-user-id'),
  ('max_withdrawal_amount', '1000000', 'Maximum withdrawal amount', 'your-admin-user-id');
```

### 9. Set Up Cron Job (Escrow Processing)

For automatic escrow release, set up a cron job:

**Option A: Vercel Cron (Recommended)**
Create `vercel.json` cron configuration (already included):
```json
{
  "crons": [{
    "path": "/api/cron/process-escrow",
    "schedule": "0 * * * *"
  }]
}
```

**Option B: External Cron Service**
- Use a service like cron-job.org
- Set to call: `https://your-app.vercel.app/api/cron/process-escrow`
- Schedule: Every hour (`0 * * * *`)

### 10. Test the System

#### Test Signup
```bash
POST /api/signup
Body: {
  "email": "test@example.com",
  "phoneNumber": "254712345678"
}
```

#### Test Balance
```bash
GET /api/balance/:userId
```

#### Test Referral Creation
```bash
POST /api/referrals
Body: {
  "referrerId": "user-id-1",
  "referredId": "user-id-2",
  "amount": 100
}
```

#### Test Withdrawal Limits
```bash
POST /api/withdrawals/check
Body: {
  "userId": "user-id",
  "amount": 5000
}
```

## Troubleshooting

### Common Issues

1. **"SUPABASE_URL or SUPABASE_ANON_KEY not set"**
   - Ensure environment variables are set in Vercel
   - Check `.env` file for local development

2. **"Function invocation failed" on Vercel**
   - Check Vercel function logs
   - Verify all environment variables are set
   - Ensure database tables are created

3. **"Table does not exist" errors**
   - Run `database/schema.sql` in Supabase SQL Editor
   - Verify all tables are created

4. **Webhook not working**
   - Check `DARAJA_CALLBACK_URL` is correct
   - Verify it's accessible (not localhost)
   - Check webhook logs in Supabase

5. **Realtime subscriptions not working**
   - Ensure Supabase Realtime is enabled
   - Check Row Level Security policies
   - Verify user authentication

## Security Checklist

- [ ] Environment variables set and secured
- [ ] Supabase Row Level Security (RLS) enabled
- [ ] Admin users properly configured
- [ ] Webhook endpoints secured (consider adding authentication)
- [ ] CORS configured if needed
- [ ] Rate limiting considered for production

## Next Steps

1. ✅ Install dependencies
2. ✅ Set up Supabase database
3. ✅ Configure environment variables
4. ✅ Deploy to Vercel
5. ✅ Create admin user
6. ✅ Configure system settings
7. ✅ Set up cron job
8. ✅ Test all endpoints
9. ✅ Monitor logs and audit trails

## Support

If you encounter issues:
1. Check Vercel function logs
2. Check Supabase logs
3. Review audit logs: `GET /api/audit-logs`
4. Verify all environment variables are set
5. Ensure database schema is complete

