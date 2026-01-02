import { SupabaseClient } from '@supabase/supabase-js';
import { Referral, Transaction } from '../types';
import { LedgerService } from './ledger';
import { v4 as uuidv4 } from 'uuid';

export class ReferralEscrowService {
  constructor(
    private supabase: SupabaseClient,
    private ledgerService: LedgerService,
    private escrowDelayDays: number = 7
  ) {}

  /**
   * Create referral with escrow delay
   */
  async createReferral(
    referrerId: string,
    referredId: string,
    amount: number
  ): Promise<Referral> {
    const escrowReleaseDate = new Date();
    escrowReleaseDate.setDate(escrowReleaseDate.getDate() + this.escrowDelayDays);

    const referral: Omit<Referral, 'createdAt'> = {
      id: uuidv4(),
      referrerId,
      referredId,
      amount,
      status: 'escrow',
      escrowReleaseDate,
      createdAt: new Date(),
    };

    const { data, error } = await this.supabase
      .from('referrals')
      .insert({
        id: referral.id,
        referrer_id: referrerId,
        referred_id: referredId,
        amount,
        status: 'escrow',
        escrow_release_date: escrowReleaseDate.toISOString(),
        created_at: referral.createdAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create referral: ${error.message}`);
    }

    // Create pending transaction
    const transaction: Omit<Transaction, 'createdAt' | 'updatedAt'> = {
      id: uuidv4(),
      userId: referrerId,
      type: 'referral_payout',
      amount,
      status: 'pending',
      reference: `REF-${referral.id}`,
      metadata: {
        referralId: referral.id,
        referredId,
        escrowReleaseDate: escrowReleaseDate.toISOString(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.supabase.from('transactions').insert({
      id: transaction.id,
      user_id: transaction.userId,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      reference: transaction.reference,
      metadata: transaction.metadata,
      created_at: transaction.createdAt.toISOString(),
      updated_at: transaction.updatedAt.toISOString(),
    });

    return {
      ...referral,
      createdAt: new Date(data.created_at),
    };
  }

  /**
   * Process escrow releases (should be called by a cron job)
   */
  async processEscrowReleases(): Promise<number> {
    const now = new Date();
    const { data: readyReferrals, error } = await this.supabase
      .from('referrals')
      .select('*')
      .eq('status', 'escrow')
      .lte('escrow_release_date', now.toISOString());

    if (error) {
      throw new Error(`Failed to fetch escrow referrals: ${error.message}`);
    }

    let processedCount = 0;

    for (const referralData of readyReferrals || []) {
      try {
        await this.releaseEscrow(referralData.id);
        processedCount++;
      } catch (error) {
        console.error(`Failed to release escrow for referral ${referralData.id}:`, error);
      }
    }

    return processedCount;
  }

  /**
   * Release escrow for a specific referral
   */
  async releaseEscrow(referralId: string): Promise<void> {
    const { data: referral, error: fetchError } = await this.supabase
      .from('referrals')
      .select('*')
      .eq('id', referralId)
      .eq('status', 'escrow')
      .single();

    if (fetchError || !referral) {
      throw new Error(`Referral not found or not in escrow: ${referralId}`);
    }

    // Check if escrow date has passed
    const escrowReleaseDate = new Date(referral.escrow_release_date);
    if (escrowReleaseDate > new Date()) {
      throw new Error(`Escrow release date not reached: ${escrowReleaseDate}`);
    }

    // Update referral status
    await this.supabase
      .from('referrals')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', referralId);

    // Find and update transaction
    const { data: transaction } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('reference', `REF-${referralId}`)
      .eq('status', 'pending')
      .single();

    if (transaction) {
      // Update transaction to completed
      await this.supabase
        .from('transactions')
        .update({
          status: 'completed',
          type: 'escrow_release',
          updated_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);

      // Record in ledger
      const updatedTx: Transaction = {
        id: transaction.id,
        userId: transaction.user_id,
        type: 'escrow_release',
        amount: transaction.amount,
        status: 'completed',
        reference: transaction.reference,
        metadata: transaction.metadata,
        createdAt: new Date(transaction.created_at),
        updatedAt: new Date(),
        processedAt: new Date(),
      };

      await this.ledgerService.recordTransaction(updatedTx);
    }
  }

  /**
   * Get escrow balance for a user
   */
  async getEscrowBalance(userId: string): Promise<number> {
    const { data: referrals } = await this.supabase
      .from('referrals')
      .select('amount')
      .eq('referrer_id', userId)
      .eq('status', 'escrow');

    return (referrals || []).reduce((sum, ref) => sum + ref.amount, 0);
  }

  /**
   * Cancel referral (if needed)
   */
  async cancelReferral(referralId: string, reason: string): Promise<void> {
    const { data: referral } = await this.supabase
      .from('referrals')
      .select('*')
      .eq('id', referralId)
      .single();

    if (!referral) {
      throw new Error(`Referral not found: ${referralId}`);
    }

    // Update referral status
    await this.supabase
      .from('referrals')
      .update({
        status: 'cancelled',
        metadata: { cancellationReason: reason },
        updated_at: new Date().toISOString(),
      })
      .eq('id', referralId);

    // Cancel associated transaction
    await this.supabase
      .from('transactions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('reference', `REF-${referralId}`);
  }
}

