import { DeviceFingerprintService, FingerprintData } from '../utils/deviceFingerprint';
import { SupabaseClient } from '@supabase/supabase-js';

export interface FraudCheckResult {
  isFraudulent: boolean;
  riskScore: number;
  reasons: string[];
}

export class FraudPreventionService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Check device fingerprint for suspicious activity
   */
  async checkDeviceFingerprint(
    userId: string,
    fingerprint: string,
    fingerprintData: FingerprintData
  ): Promise<FraudCheckResult> {
    const reasons: string[] = [];
    let riskScore = 0;

    // Check for multiple accounts with same fingerprint
    const { data: duplicateAccounts } = await this.supabase
      .from('user_devices')
      .select('user_id')
      .eq('fingerprint_hash', fingerprint)
      .neq('user_id', userId);

    if (duplicateAccounts && duplicateAccounts.length > 0) {
      riskScore += 50;
      reasons.push(`Device fingerprint associated with ${duplicateAccounts.length} other account(s)`);
    }

    // Check for recent fingerprint changes
    const { data: recentChanges } = await this.supabase
      .from('user_devices')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentChanges && recentChanges.length > 3) {
      riskScore += 30;
      reasons.push('Multiple device changes in short period');
    }

    // Store device fingerprint
    await this.supabase.from('user_devices').upsert({
      user_id: userId,
      fingerprint_hash: fingerprint,
      user_agent: fingerprintData.userAgent,
      ip_address: fingerprintData.ipAddress,
      last_seen_at: new Date().toISOString(),
    });

    return {
      isFraudulent: riskScore >= 70,
      riskScore,
      reasons,
    };
  }

  /**
   * Check referral velocity limits
   */
  async checkReferralVelocity(
    referrerId: string,
    timeWindowMinutes: number = 60
  ): Promise<FraudCheckResult> {
    const reasons: string[] = [];
    let riskScore = 0;

    const timeWindow = new Date();
    timeWindow.setMinutes(timeWindow.getMinutes() - timeWindowMinutes);

    const { data: recentReferrals, error } = await this.supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', referrerId)
      .gte('created_at', timeWindow.toISOString());

    if (error) {
      console.error('Error checking referral velocity:', error);
      return { isFraudulent: false, riskScore: 0, reasons: [] };
    }

    const referralCount = recentReferrals?.length || 0;

    // Velocity limits
    if (referralCount >= 10) {
      riskScore = 100;
      reasons.push(`Excessive referrals: ${referralCount} in ${timeWindowMinutes} minutes`);
      return { isFraudulent: true, riskScore, reasons };
    }

    if (referralCount >= 5) {
      riskScore += 40;
      reasons.push(`High referral velocity: ${referralCount} in ${timeWindowMinutes} minutes`);
    }

    if (referralCount >= 3) {
      riskScore += 20;
      reasons.push(`Moderate referral velocity: ${referralCount} in ${timeWindowMinutes} minutes`);
    }

    return {
      isFraudulent: riskScore >= 70,
      riskScore,
      reasons,
    };
  }

  /**
   * Detect referral abuse patterns
   */
  async detectReferralAbuse(referrerId: string): Promise<FraudCheckResult> {
    const reasons: string[] = [];
    let riskScore = 0;

    // Check for circular referrals
    const { data: referrals } = await this.supabase
      .from('referrals')
      .select('referred_id')
      .eq('referrer_id', referrerId);

    if (referrals) {
      const referredIds = referrals.map((r) => r.referred_id);
      
      // Check if any referred users have referred back
      const { data: circularRefs } = await this.supabase
        .from('referrals')
        .select('referrer_id')
        .in('referred_id', referredIds)
        .eq('referrer_id', referrerId);

      if (circularRefs && circularRefs.length > 0) {
        riskScore += 60;
        reasons.push('Circular referral pattern detected');
      }

      // Check for duplicate referrals
      const uniqueReferrals = new Set(referredIds);
      if (referredIds.length !== uniqueReferrals.size) {
        riskScore += 50;
        reasons.push('Duplicate referrals detected');
      }
    }

    // Check for rapid account creation pattern
    const { data: recentAccounts } = await this.supabase
      .from('referrals')
      .select('created_at')
      .eq('referrer_id', referrerId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (recentAccounts && recentAccounts.length >= 10) {
      const timeSpan = new Date(recentAccounts[0].created_at).getTime() - 
                      new Date(recentAccounts[recentAccounts.length - 1].created_at).getTime();
      const hours = timeSpan / (1000 * 60 * 60);

      if (hours < 24) {
        riskScore += 70;
        reasons.push(`Suspicious pattern: ${recentAccounts.length} referrals in ${hours.toFixed(1)} hours`);
      }
    }

    return {
      isFraudulent: riskScore >= 70,
      riskScore,
      reasons,
    };
  }

  /**
   * Comprehensive fraud check
   */
  async performFraudCheck(
    userId: string,
    fingerprint: string,
    fingerprintData: FingerprintData,
    isReferral: boolean = false
  ): Promise<FraudCheckResult> {
    const checks: FraudCheckResult[] = [];

    // Device fingerprint check
    checks.push(await this.checkDeviceFingerprint(userId, fingerprint, fingerprintData));

    // Referral-specific checks
    if (isReferral) {
      checks.push(await this.checkReferralVelocity(userId));
      checks.push(await this.detectReferralAbuse(userId));
    }

    // Aggregate results
    const totalRiskScore = checks.reduce((sum, check) => sum + check.riskScore, 0);
    const allReasons = checks.flatMap((check) => check.reasons);
    const isFraudulent = checks.some((check) => check.isFraudulent) || totalRiskScore >= 70;

    return {
      isFraudulent,
      riskScore: Math.min(totalRiskScore, 100),
      reasons: allReasons,
    };
  }
}

