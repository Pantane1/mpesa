import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { DarajaWebhookService } from './services/darajaWebhook';
import { DarajaStkService } from './services/darajaStk';
import { LedgerService } from './services/ledger';
import { FraudPreventionService } from './services/fraudPrevention';
import { ReferralEscrowService } from './services/referralEscrow';
import { WithdrawalLimitsService } from './services/withdrawalLimits';
import { AdminControlsService } from './services/adminControls';
import { AuditLogService } from './services/auditLog';
import { RealtimeService } from './services/realtime';
import { DeviceFingerprintService } from './utils/deviceFingerprint';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_ANON_KEY not set. Some features may not work.');
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder-key');

// Initialize services
const ledgerService = new LedgerService(supabase);
const fraudPreventionService = new FraudPreventionService(supabase);
const darajaWebhookService = new DarajaWebhookService(supabase, ledgerService);
const darajaStkService = new DarajaStkService();
const adminControlsService = new AdminControlsService(supabase);
const auditLogService = new AuditLogService(supabase);
const realtimeService = new RealtimeService(supabase);

// Get escrow delay from admin controls (with error handling)
let escrowDelayDays = 7;
adminControlsService.getSystemSettings().then((settings) => {
  escrowDelayDays = settings.escrowDelayDays;
}).catch((error) => {
  console.error('Failed to get system settings:', error);
  // Use default value on error
  escrowDelayDays = 7;
});

// Initialize referral escrow service with default delay (will be updated async)
const referralEscrowService = new ReferralEscrowService(
  supabase,
  ledgerService,
  escrowDelayDays
);
const withdrawalLimitsService = new WithdrawalLimitsService(supabase);

// Middleware for extracting request info
const extractRequestInfo = (req: Request) => {
  const fingerprintData = DeviceFingerprintService.extractFromRequest(req);
  const fingerprint = DeviceFingerprintService.generateFingerprint({
    userAgent: fingerprintData.userAgent || '',
    language: fingerprintData.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenResolution: '',
    platform: '',
    cookieEnabled: true,
    ipAddress: fingerprintData.ipAddress,
  });

  return {
    fingerprint,
    fingerprintData: {
      ...fingerprintData,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenResolution: '',
      platform: '',
      cookieEnabled: true,
    },
    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
};

// Routes

// Signup with M-Pesa STK push (250 KES)
app.post('/api/signup', async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;
    const requestInfo = extractRequestInfo(req);

    // Validate input
    if (!email || !phoneNumber) {
      return res.status(400).json({ error: 'Email and phone number are required' });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create pending transaction for signup
    const checkoutRequestId = uuidv4();
    const transactionId = uuidv4();

    const { error: txError } = await supabase.from('transactions').insert({
      id: transactionId,
      user_id: null, // Will be set after user creation
      type: 'deposit',
      amount: 250,
      status: 'pending',
      reference: checkoutRequestId,
      metadata: {
        isSignup: true,
        email,
        phoneNumber,
        deviceFingerprint: requestInfo.fingerprint,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (txError) {
      throw new Error(`Failed to create transaction: ${txError.message}`);
    }

    // Initiate STK push
    const stkResponse = await darajaStkService.initiateSignupPayment(
      phoneNumber,
      email,
      checkoutRequestId
    );

    // Audit log
    await auditLogService.log(
      'signup_initiated',
      'user',
      email,
      undefined,
      { phoneNumber, checkoutRequestId },
      requestInfo
    );

    res.json({
      message: 'STK push initiated. Please complete payment on your phone.',
      checkoutRequestId: stkResponse.CheckoutRequestID,
      merchantRequestId: stkResponse.MerchantRequestID,
      transactionId,
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Daraja webhook endpoint
app.post('/webhooks/daraja', async (req: Request, res: Response) => {
  await darajaWebhookService.processWebhook(req, res);
});

// Get user balance (computed from transactions)
app.get('/api/balance/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const forceRecompute = req.query.recompute === 'true';

    const balance = await ledgerService.getUserBalance(userId, forceRecompute);

    // Audit log
    await auditLogService.log(
      'balance_viewed',
      'user_balance',
      userId,
      userId,
      undefined,
      extractRequestInfo(req)
    );

    res.json(balance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create referral with escrow
app.post('/api/referrals', async (req: Request, res: Response) => {
  try {
    const { referrerId, referredId, amount } = req.body;
    const requestInfo = extractRequestInfo(req);

    // Fraud check
    const fraudCheck = await fraudPreventionService.performFraudCheck(
      referrerId,
      requestInfo.fingerprint,
      requestInfo.fingerprintData,
      true
    );

    if (fraudCheck.isFraudulent) {
      await auditLogService.log(
        'referral_blocked',
        'referral',
        '',
        referrerId,
        { fraudCheck },
        requestInfo
      );

      return res.status(403).json({
        error: 'Referral blocked due to fraud detection',
        reasons: fraudCheck.reasons,
      });
    }

    const referral = await referralEscrowService.createReferral(
      referrerId,
      referredId,
      amount
    );

    await auditLogService.log(
      'referral_created',
      'referral',
      referral.id,
      referrerId,
      { referral },
      requestInfo
    );

    res.json(referral);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Check withdrawal limits
app.post('/api/withdrawals/check', async (req: Request, res: Response) => {
  try {
    const { userId, amount } = req.body;

    const check = await withdrawalLimitsService.checkWithdrawalLimit(userId, amount);

    await auditLogService.log(
      'withdrawal_limit_checked',
      'withdrawal',
      '',
      userId,
      { amount, check },
      extractRequestInfo(req)
    );

    res.json(check);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get system settings
app.get('/api/admin/settings', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    if (!(await adminControlsService.isAdmin(userId))) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const settings = await adminControlsService.getSystemSettings();

    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update control
app.put('/api/admin/controls/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;
    const userId = req.headers['x-user-id'] as string;

    if (!(await adminControlsService.isAdmin(userId))) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const control = await adminControlsService.setControl(key, value, description, userId);

    await auditLogService.log(
      'admin_control_updated',
      'admin_control',
      control.id,
      userId,
      { key, value },
      extractRequestInfo(req)
    );

    res.json(control);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit logs
app.get('/api/audit-logs', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const filters = {
      userId: req.query.userId as string | undefined,
      action: req.query.action as string | undefined,
      resourceType: req.query.resourceType as string | undefined,
      resourceId: req.query.resourceId as string | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    };

    // Only admins can view all logs, users can only view their own
    if (filters.userId && filters.userId !== userId) {
      if (!(await adminControlsService.isAdmin(userId))) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    } else if (!filters.userId) {
      filters.userId = userId; // Default to user's own logs
    }

    const logs = await auditLogService.getLogs(
      filters,
      parseInt(req.query.limit as string) || 100,
      parseInt(req.query.offset as string) || 0
    );

    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Process escrow releases (cron endpoint)
app.post('/api/cron/process-escrow', async (req: Request, res: Response) => {
  try {
    const processed = await referralEscrowService.processEscrowReleases();
    res.json({ processed, message: `Processed ${processed} escrow releases` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Export app for Vercel serverless
export default app;

// Only start server if not in serverless environment
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

