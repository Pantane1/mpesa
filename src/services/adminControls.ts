import { SupabaseClient } from '@supabase/supabase-js';
import { AdminControl } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class AdminControlsService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Check if user is admin
   */
  async isAdmin(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.is_admin === true;
  }

  /**
   * Get admin control value
   */
  async getControl(key: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('admin_controls')
      .select('*')
      .eq('key', key)
      .single();

    if (error || !data) {
      return null;
    }

    return data.value;
  }

  /**
   * Set admin control value
   */
  async setControl(
    key: string,
    value: any,
    description: string,
    adminId: string
  ): Promise<AdminControl> {
    // Verify admin
    const isAdmin = await this.isAdmin(adminId);
    if (!isAdmin) {
      throw new Error('Unauthorized: Admin access required');
    }

    const control: Omit<AdminControl, 'updatedAt'> = {
      id: uuidv4(),
      key,
      value,
      description,
      updatedBy: adminId,
      updatedAt: new Date(),
    };

    const { data, error } = await this.supabase
      .from('admin_controls')
      .upsert({
        id: control.id,
        key,
        value,
        description,
        updated_by: adminId,
        updated_at: control.updatedAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to set admin control: ${error.message}`);
    }

    return {
      ...control,
      updatedAt: new Date(data.updated_at),
    };
  }

  /**
   * Get all admin controls
   */
  async getAllControls(): Promise<AdminControl[]> {
    const { data, error } = await this.supabase
      .from('admin_controls')
      .select('*')
      .order('key', { ascending: true });

    if (error) {
      throw new Error(`Failed to get admin controls: ${error.message}`);
    }

    return (data || []).map((item) => ({
      id: item.id,
      key: item.key,
      value: item.value,
      description: item.description,
      updatedBy: item.updated_by,
      updatedAt: new Date(item.updated_at),
    }));
  }

  /**
   * Get system-wide settings
   */
  async getSystemSettings(): Promise<{
    escrowDelayDays: number;
    referralVelocityLimit: number;
    fraudCheckEnabled: boolean;
    maintenanceMode: boolean;
    minWithdrawalAmount: number;
    maxWithdrawalAmount: number;
  }> {
    const [
      escrowDelayDays,
      referralVelocityLimit,
      fraudCheckEnabled,
      maintenanceMode,
      minWithdrawalAmount,
      maxWithdrawalAmount,
    ] = await Promise.all([
      this.getControl('escrow_delay_days'),
      this.getControl('referral_velocity_limit'),
      this.getControl('fraud_check_enabled'),
      this.getControl('maintenance_mode'),
      this.getControl('min_withdrawal_amount'),
      this.getControl('max_withdrawal_amount'),
    ]);

    return {
      escrowDelayDays: escrowDelayDays ?? 7,
      referralVelocityLimit: referralVelocityLimit ?? 5,
      fraudCheckEnabled: fraudCheckEnabled ?? true,
      maintenanceMode: maintenanceMode ?? false,
      minWithdrawalAmount: minWithdrawalAmount ?? 100,
      maxWithdrawalAmount: maxWithdrawalAmount ?? 1000000,
    };
  }

  /**
   * Toggle maintenance mode
   */
  async toggleMaintenanceMode(adminId: string, enabled: boolean): Promise<void> {
    await this.setControl(
      'maintenance_mode',
      enabled,
      'System maintenance mode',
      adminId
    );
  }

  /**
   * Update escrow delay
   */
  async updateEscrowDelay(adminId: string, days: number): Promise<void> {
    if (days < 0 || days > 30) {
      throw new Error('Escrow delay must be between 0 and 30 days');
    }

    await this.setControl(
      'escrow_delay_days',
      days,
      'Number of days before referral payouts are released from escrow',
      adminId
    );
  }

  /**
   * Update referral velocity limit
   */
  async updateReferralVelocityLimit(adminId: string, limit: number): Promise<void> {
    if (limit < 1 || limit > 100) {
      throw new Error('Referral velocity limit must be between 1 and 100');
    }

    await this.setControl(
      'referral_velocity_limit',
      limit,
      'Maximum number of referrals allowed per hour',
      adminId
    );
  }
}

