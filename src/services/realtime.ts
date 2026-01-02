import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export class RealtimeService {
  private channels: Map<string, RealtimeChannel> = new Map();

  constructor(private supabase: SupabaseClient) {}

  /**
   * Subscribe to user-specific realtime updates
   * Optimized to only subscribe to the current user's data
   */
  subscribeToUser(
    userId: string,
    callbacks: {
      onBalanceUpdate?: (balance: any) => void;
      onTransactionUpdate?: (transaction: any) => void;
      onReferralUpdate?: (referral: any) => void;
    }
  ): () => void {
    // Unsubscribe from any existing channel for this user
    this.unsubscribeFromUser(userId);

    // Create optimized channel for this user only
    const channelName = `user:${userId}`;
    const channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_balances',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (callbacks.onBalanceUpdate) {
            callbacks.onBalanceUpdate(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (callbacks.onTransactionUpdate) {
            callbacks.onTransactionUpdate(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referrals',
          filter: `referrer_id=eq.${userId}`,
        },
        (payload) => {
          if (callbacks.onReferralUpdate) {
            callbacks.onReferralUpdate(payload.new);
          }
        }
      )
      .subscribe();

    this.channels.set(userId, channel);

    // Return unsubscribe function
    return () => this.unsubscribeFromUser(userId);
  }

  /**
   * Subscribe to admin realtime updates (for admin dashboard)
   */
  subscribeToAdmin(
    adminId: string,
    callbacks: {
      onSystemUpdate?: (update: any) => void;
      onFraudAlert?: (alert: any) => void;
    }
  ): () => void {
    const channelName = `admin:${adminId}`;
    const channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_controls',
        },
        (payload) => {
          if (callbacks.onSystemUpdate) {
            callbacks.onSystemUpdate(payload.new);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audit_logs',
          filter: `action=like.%fraud%`,
        },
        (payload) => {
          if (callbacks.onFraudAlert) {
            callbacks.onFraudAlert(payload.new);
          }
        }
      )
      .subscribe();

    this.channels.set(`admin:${adminId}`, channel);

    return () => {
      channel.unsubscribe();
      this.channels.delete(`admin:${adminId}`);
    };
  }

  /**
   * Unsubscribe from user updates
   */
  unsubscribeFromUser(userId: string): void {
    const channel = this.channels.get(userId);
    if (channel) {
      channel.unsubscribe();
      this.channels.delete(userId);
    }
  }

  /**
   * Unsubscribe from all channels
   */
  unsubscribeAll(): void {
    this.channels.forEach((channel) => channel.unsubscribe());
    this.channels.clear();
  }

  /**
   * Get active subscriptions count (for monitoring)
   */
  getActiveSubscriptionsCount(): number {
    return this.channels.size;
  }
}

