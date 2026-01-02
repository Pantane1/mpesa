export interface DeviceFingerprint {
  userAgent: string;
  language: string;
  timezone: string;
  screenResolution: string;
  platform: string;
  cookieEnabled: boolean;
  canvasFingerprint?: string;
  webglFingerprint?: string;
  hash: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'referral_payout' | 'escrow_release' | 'fee';
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  reference: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  userId: string;
  debit: number;
  credit: number;
  balance: number;
  description: string;
  createdAt: Date;
}

export interface UserBalance {
  userId: string;
  availableBalance: number;
  escrowBalance: number;
  totalBalance: number;
  lastComputedAt: Date;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredId: string;
  amount: number;
  status: 'pending' | 'escrow' | 'paid' | 'cancelled';
  escrowReleaseDate?: Date;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface DarajaWebhook {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: string | number;
        }>;
      };
    };
  };
}

export interface WithdrawalTier {
  tier: number;
  name: string;
  dailyLimit: number;
  monthlyLimit: number;
  requirements: {
    minTransactions?: number;
    minAccountAge?: number;
    kycVerified?: boolean;
  };
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  createdAt: Date;
}

export interface AdminControl {
  id: string;
  key: string;
  value: any;
  description: string;
  updatedBy: string;
  updatedAt: Date;
}

