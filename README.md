# Fraud Prevention Payment System

A comprehensive payment system with fraud prevention, ledger-based accounting, referral management, and admin controls.

## Features

### 🔒 Fraud Prevention
- **Device Fingerprinting**: Tracks and validates device fingerprints to detect suspicious account activity
- **Referral Velocity Limits**: Prevents abuse by limiting referral creation rate
- **Referral Abuse Detection**: Detects circular referrals, duplicate referrals, and suspicious patterns

### 📊 Ledger-Based Accounting
- **Double-entry bookkeeping**: All transactions recorded in ledger entries
- **Balance Computation**: Balances computed from transaction history (source of truth)
- **Transaction History**: Complete audit trail of all financial movements

### 💰 Referral System
- **Escrow Delay**: Referral payouts held in escrow for configurable days (default: 7)
- **Automatic Release**: Cron job processes escrow releases when due
- **Abuse Prevention**: Fraud checks before referral creation

### 🏦 Withdrawal Limits
- **Tiered System**: 4 tiers (Basic, Standard, Premium, Enterprise)
- **Daily & Monthly Limits**: Enforced per tier based on account history and KYC status
- **Automatic Tier Assignment**: Based on transaction count, account age, and KYC verification

### 🔐 Admin Controls
- **System Settings**: Configurable system-wide settings
- **Maintenance Mode**: Toggle system maintenance
- **Control Management**: Update escrow delays, velocity limits, etc.

### 📝 Audit Logging
- **Comprehensive Logging**: All actions logged with user, IP, device fingerprint
- **Change Tracking**: Records changes to resources
- **Query Interface**: Filter logs by user, action, resource type, date range

### 🔔 Supabase Realtime
- **User-Specific Subscriptions**: Optimized to only subscribe to current user's data
- **Balance Updates**: Real-time balance updates
- **Transaction Updates**: Real-time transaction notifications
- **Referral Updates**: Real-time referral status changes

### 🌐 M-Pesa Daraja Integration
- **STK Push Signup**: 250 KES payment required for account signup
- **Automatic User Creation**: User account created automatically after successful payment
- **Idempotent Webhooks**: Prevents duplicate webhook processing
- **24-hour Window**: Idempotency window for webhook deduplication
- **Status Updates**: Automatic transaction status updates from M-Pesa callbacks

## Setup

### Prerequisites
- Node.js 18+
- Supabase account
- PostgreSQL database (via Supabase)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
PORT=3000

# M-Pesa Daraja API credentials
DARAJA_CONSUMER_KEY=your_consumer_key
DARAJA_CONSUMER_SECRET=your_consumer_secret
DARAJA_PASS_KEY=your_pass_key
DARAJA_SHORT_CODE=your_short_code
DARAJA_BASE_URL=https://sandbox.safaricom.co.ke  # or https://api.safaricom.co.ke for production
DARAJA_CALLBACK_URL=https://your-domain.com/webhooks/daraja
BASE_URL=https://your-domain.com
```

3. Run database migrations:
```bash
# Execute database/schema.sql in your Supabase SQL editor
```

4. Build and run:
```bash
npm run build
npm start
```

Or for development:
```bash
npm run dev
```

## API Endpoints

### Webhooks
- `POST /webhooks/daraja` - Daraja STK push webhook

### User Endpoints
- `POST /api/signup` - Sign up with M-Pesa STK push (250 KES payment required)
- `GET /api/balance/:userId` - Get user balance (computed from transactions)
- `POST /api/referrals` - Create referral with escrow
- `POST /api/withdrawals/check` - Check withdrawal limits

### Admin Endpoints
- `GET /api/admin/settings` - Get system settings
- `PUT /api/admin/controls/:key` - Update admin control

### Audit
- `GET /api/audit-logs` - Get audit logs with filters

### Cron
- `POST /api/cron/process-escrow` - Process escrow releases (call via cron)

## Database Schema

The system uses the following main tables:
- `users` - User accounts
- `user_devices` - Device fingerprints
- `transactions` - All financial transactions
- `ledger_entries` - Double-entry ledger records
- `user_balances` - Cached balance (computed from transactions)
- `referrals` - Referral records with escrow
- `webhook_idempotency` - Webhook deduplication
- `admin_controls` - System configuration
- `audit_logs` - Comprehensive audit trail

## Security Features

1. **Row Level Security (RLS)**: Enabled on all user data tables
2. **Device Fingerprinting**: Prevents account sharing and fraud
3. **Fraud Detection**: Multi-factor fraud checks
4. **Audit Logging**: Complete activity tracking
5. **Admin Controls**: Secure admin-only endpoints

## Realtime Subscriptions

The system uses optimized Supabase realtime subscriptions that only subscribe to the current user's data:

```typescript
const unsubscribe = realtimeService.subscribeToUser(userId, {
  onBalanceUpdate: (balance) => {
    // Handle balance update
  },
  onTransactionUpdate: (transaction) => {
    // Handle transaction update
  },
  onReferralUpdate: (referral) => {
    // Handle referral update
  }
});

// Cleanup
unsubscribe();
```

## Configuration

System settings can be configured via admin controls:
- `escrow_delay_days` - Days before referral payout release (default: 7)
- `referral_velocity_limit` - Max referrals per hour (default: 5)
- `fraud_check_enabled` - Enable/disable fraud checks (default: true)
- `maintenance_mode` - System maintenance mode (default: false)
- `min_withdrawal_amount` - Minimum withdrawal (default: 100)
- `max_withdrawal_amount` - Maximum withdrawal (default: 1000000)

## License

ISC

