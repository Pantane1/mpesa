import { z } from 'zod';

export const createReferralSchema = z.object({
  referrerId: z.string().uuid(),
  referredId: z.string().uuid(),
  amount: z.number().positive().max(1000000),
});

export const checkWithdrawalSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive(),
});

export const updateAdminControlSchema = z.object({
  value: z.any(),
  description: z.string().optional(),
});

export const auditLogFiltersSchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
});

