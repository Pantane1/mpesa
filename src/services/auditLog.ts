import { SupabaseClient } from '@supabase/supabase-js';
import { AuditLog } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class AuditLogService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create audit log entry
   */
  async log(
    action: string,
    resourceType: string,
    resourceId: string,
    userId?: string,
    changes?: Record<string, any>,
    requestInfo?: { ipAddress?: string; userAgent?: string; deviceFingerprint?: string }
  ): Promise<AuditLog> {
    const auditLog: Omit<AuditLog, 'createdAt'> = {
      id: uuidv4(),
      userId,
      action,
      resourceType,
      resourceId,
      changes,
      ipAddress: requestInfo?.ipAddress,
      userAgent: requestInfo?.userAgent,
      deviceFingerprint: requestInfo?.deviceFingerprint,
      createdAt: new Date(),
    };

    const { data, error } = await this.supabase
      .from('audit_logs')
      .insert({
        id: auditLog.id,
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        changes,
        ip_address: requestInfo?.ipAddress,
        user_agent: requestInfo?.userAgent,
        device_fingerprint: requestInfo?.deviceFingerprint,
        created_at: auditLog.createdAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw - audit logging should not break the main flow
      return auditLog;
    }

    return {
      ...auditLog,
      createdAt: new Date(data.created_at),
    };
  }

  /**
   * Get audit logs with filters
   */
  async getLogs(
    filters?: {
      userId?: string;
      action?: string;
      resourceType?: string;
      resourceId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLog[]> {
    let query = this.supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters?.userId) {
      query = query.eq('user_id', filters.userId);
    }

    if (filters?.action) {
      query = query.eq('action', filters.action);
    }

    if (filters?.resourceType) {
      query = query.eq('resource_type', filters.resourceType);
    }

    if (filters?.resourceId) {
      query = query.eq('resource_id', filters.resourceId);
    }

    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }

    return (data || []).map((item) => ({
      id: item.id,
      userId: item.user_id,
      action: item.action,
      resourceType: item.resource_type,
      resourceId: item.resource_id,
      changes: item.changes,
      ipAddress: item.ip_address,
      userAgent: item.user_agent,
      deviceFingerprint: item.device_fingerprint,
      createdAt: new Date(item.created_at),
    }));
  }

  /**
   * Get audit logs for a specific resource
   */
  async getResourceLogs(
    resourceType: string,
    resourceId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    return this.getLogs({ resourceType, resourceId }, limit);
  }

  /**
   * Get audit logs for a user
   */
  async getUserLogs(userId: string, limit: number = 50): Promise<AuditLog[]> {
    return this.getLogs({ userId }, limit);
  }
}

