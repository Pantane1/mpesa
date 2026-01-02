import { SupabaseClient } from '@supabase/supabase-js';
import { WithdrawalTier } from '../types';

export interface WithdrawalLimitCheck {
  allowed: boolean;
  reason?: string;
  dailyRemaining: number;
  monthlyRemaining: number;
  currentTier: WithdrawalTier;
}

export class WithdrawalLimitsService {
  private tiers: WithdrawalTier[] = [
    {
      tier: 1,
      name: 'Basic',
      dailyLimit: 5000,
      monthlyLimit: 50000,
      requirements: {
        minTransactions: 0,
        minAccountAge: 0,
        kycVerified: false,
      },
    },
    {
      tier: 2,
      name: 'Standard',
      dailyLimit: 20000,
      monthlyLimit: 200000,
      requirements: {
        minTransactions: 5,
        minAccountAge: 7, // days
        kycVerified: false,
      },
    },
    {
      tier: 3,
      name: 'Premium',
      dailyLimit: 100000,
      monthlyLimit: 1000000,
      requirements: {
        minTransactions: 20,
        minAccountAge: 30, // days
        kycVerified: true,
      },
    },
    {
      tier: 4,
      name: 'Enterprise',
      dailyLimit: 500000,
      monthlyLimit: 5000000,
      requirements: {
        minTransactions: 100,
        minAccountAge: 90, // days
        kycVerified: true,
      },
    },
  ];

  constructor(private supabase: SupabaseClient) {}

  /**
   * Get user's withdrawal tier
   */
  async getUserTier(userId: string): Promise<WithdrawalTier> {
    // Get user account info
    const { data: user } = await this.supabase
      .from('users')
      .select('created_at, kyc_verified')
      .eq('id', userId)
      .single();

    if (!user) {
      return this.tiers[0]; // Default to tier 1
    }

    const accountAge = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get transaction count
    const { data: transactions } = await this.supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed');

    const transactionCount = transactions?.length || 0;
    const kycVerified = user.kyc_verified || false;

    // Determine tier based on requirements
    for (let i = this.tiers.length - 1; i >= 0; i--) {
      const tier = this.tiers[i];
      const requirements = tier.requirements;

      if (
        transactionCount >= (requirements.minTransactions || 0) &&
        accountAge >= (requirements.minAccountAge || 0) &&
        (!requirements.kycVerified || kycVerified)
      ) {
        return tier;
      }
    }

    return this.tiers[0];
  }

  /**
   * Check if withdrawal is allowed
   */
  async checkWithdrawalLimit(
    userId: string,
    amount: number
  ): Promise<WithdrawalLimitCheck> {
    const tier = await this.getUserTier(userId);

    // Get today's withdrawals
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayWithdrawals } = await this.supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'withdrawal')
      .eq('status', 'completed')
      .gte('processed_at', today.toISOString());

    const dailyUsed = (todayWithdrawals || []).reduce(
      (sum, tx) => sum + tx.amount,
      0
    );
    const dailyRemaining = Math.max(0, tier.dailyLimit - dailyUsed);

    // Get this month's withdrawals
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: monthWithdrawals } = await this.supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'withdrawal')
      .eq('status', 'completed')
      .gte('processed_at', monthStart.toISOString());

    const monthlyUsed = (monthWithdrawals || []).reduce(
      (sum, tx) => sum + tx.amount,
      0
    );
    const monthlyRemaining = Math.max(0, tier.monthlyLimit - monthlyUsed);

    // Check limits
    if (amount > dailyRemaining) {
      return {
        allowed: false,
        reason: `Daily limit exceeded. Remaining: ${dailyRemaining}`,
        dailyRemaining,
        monthlyRemaining,
        currentTier: tier,
      };
    }

    if (amount > monthlyRemaining) {
      return {
        allowed: false,
        reason: `Monthly limit exceeded. Remaining: ${monthlyRemaining}`,
        dailyRemaining,
        monthlyRemaining,
        currentTier: tier,
      };
    }

    return {
      allowed: true,
      dailyRemaining: dailyRemaining - amount,
      monthlyRemaining: monthlyRemaining - amount,
      currentTier: tier,
    };
  }

  /**
   * Get all tiers
   */
  getTiers(): WithdrawalTier[] {
    return this.tiers;
  }

  /**
   * Update tier limits (admin function)
   */
  updateTierLimits(tier: number, limits: Partial<WithdrawalTier>): void {
    const tierIndex = this.tiers.findIndex((t) => t.tier === tier);
    if (tierIndex !== -1) {
      this.tiers[tierIndex] = { ...this.tiers[tierIndex], ...limits };
    }
  }
}

