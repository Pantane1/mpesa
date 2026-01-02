import { Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  supabase?: SupabaseClient;
}

/**
 * Middleware to extract user ID from request headers
 * In production, this should verify JWT tokens
 */
export const extractUserId = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    res.status(401).json({ error: 'User ID required' });
    return;
  }

  req.userId = userId;
  next();
};

/**
 * Middleware to require admin access
 */
export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.userId || (req.headers['x-user-id'] as string);
  
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // This should check against Supabase in production
  // For now, we'll check in the route handlers
  next();
};

