import { SupabaseClient } from '@supabase/supabase-js';
import { Transaction, LedgerEntry, UserBalance } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class LedgerService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a ledger entry for a transaction
   */
  async createLedgerEntry(
    transactionId: string,
    userId: string,
    debit: number,
    credit: number,
    description: string
  ): Promise<LedgerEntry> {
    // Get current balance
    const currentBalance = await this.getUserBalance(userId);
    const newBalance = currentBalance.totalBalance - debit + credit;

    const ledgerEntry: Omit<LedgerEntry, 'createdAt'> = {
      id: uuidv4(),
      transactionId,
      userId,
      debit,
      credit,
      balance: newBalance,
      description,
      createdAt: new Date(),
    };

    const { data, error } = await this.supabase
      .from('ledger_entries')
      .insert({
        id: ledgerEntry.id,
        transaction_id: transactionId,
        user_id: userId,
        debit,
        credit,
        balance: newBalance,
        description,
        created_at: ledgerEntry.createdAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create ledger entry: ${error.message}`);
    }

    // Update user balance cache
    await this.updateUserBalanceCache(userId);

    return {
      ...ledgerEntry,
      createdAt: new Date(data.created_at),
    };
  }

  /**
   * Compute balance from all ledger entries
   */
  async computeBalanceFromTransactions(userId: string): Promise<UserBalance> {
    const { data: entries, error } = await this.supabase
      .from('ledger_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to compute balance: ${error.message}`);
    }

    let totalBalance = 0;
    let escrowBalance = 0;

    // Compute from transactions
    const { data: transactions } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['completed', 'pending']);

    if (transactions) {
      for (const tx of transactions) {
        if (tx.type === 'referral_payout' && tx.status === 'pending') {
          escrowBalance += tx.amount;
        } else if (tx.status === 'completed') {
          if (['deposit', 'referral_payout', 'escrow_release'].includes(tx.type)) {
            totalBalance += tx.amount;
          } else if (['withdrawal', 'fee'].includes(tx.type)) {
            totalBalance -= tx.amount;
          }
        }
      }
    }

    const availableBalance = totalBalance - escrowBalance;

    const balance: UserBalance = {
      userId,
      availableBalance,
      escrowBalance,
      totalBalance,
      lastComputedAt: new Date(),
    };

    // Update balance cache
    await this.updateUserBalanceCache(userId, balance);

    return balance;
  }

  /**
   * Get user balance (from cache or compute)
   */
  async getUserBalance(userId: string, forceRecompute: boolean = false): Promise<UserBalance> {
    if (forceRecompute) {
      return this.computeBalanceFromTransactions(userId);
    }

    const { data, error } = await this.supabase
      .from('user_balances')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return this.computeBalanceFromTransactions(userId);
    }

    return {
      userId: data.user_id,
      availableBalance: data.available_balance,
      escrowBalance: data.escrow_balance,
      totalBalance: data.total_balance,
      lastComputedAt: new Date(data.last_computed_at),
    };
  }

  /**
   * Update user balance cache
   */
  private async updateUserBalanceCache(
    userId: string,
    balance?: UserBalance
  ): Promise<void> {
    const balanceToStore = balance || await this.computeBalanceFromTransactions(userId);

    await this.supabase.from('user_balances').upsert({
      user_id: userId,
      available_balance: balanceToStore.availableBalance,
      escrow_balance: balanceToStore.escrowBalance,
      total_balance: balanceToStore.totalBalance,
      last_computed_at: balanceToStore.lastComputedAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  /**
   * Record transaction in ledger
   */
  async recordTransaction(transaction: Transaction): Promise<LedgerEntry> {
    let debit = 0;
    let credit = 0;

    switch (transaction.type) {
      case 'deposit':
      case 'referral_payout':
      case 'escrow_release':
        credit = transaction.amount;
        break;
      case 'withdrawal':
      case 'fee':
        debit = transaction.amount;
        break;
    }

    const description = `${transaction.type} - ${transaction.reference}`;

    return this.createLedgerEntry(
      transaction.id,
      transaction.userId,
      debit,
      credit,
      description
    );
  }

  /**
   * Get transaction history with ledger entries
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ transactions: Transaction[]; ledgerEntries: LedgerEntry[] }> {
    const { data: transactions } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: ledgerEntries } = await this.supabase
      .from('ledger_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return {
      transactions: (transactions || []).map(this.mapTransaction),
      ledgerEntries: (ledgerEntries || []).map(this.mapLedgerEntry),
    };
  }

  private mapTransaction(data: any): Transaction {
    return {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      amount: data.amount,
      status: data.status,
      reference: data.reference,
      metadata: data.metadata,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      processedAt: data.processed_at ? new Date(data.processed_at) : undefined,
    };
  }

  private mapLedgerEntry(data: any): LedgerEntry {
    return {
      id: data.id,
      transactionId: data.transaction_id,
      userId: data.user_id,
      debit: data.debit,
      credit: data.credit,
      balance: data.balance,
      description: data.description,
      createdAt: new Date(data.created_at),
    };
  }
}

