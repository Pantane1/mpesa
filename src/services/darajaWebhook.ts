import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { DarajaWebhook, Transaction } from '../types';
import { LedgerService } from './ledger';
import { AuditLogService } from './auditLog';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export class DarajaWebhookService {
  private processedWebhooks = new Map<string, Date>(); // In-memory cache for idempotency
  private readonly IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private supabase: SupabaseClient,
    private ledgerService: LedgerService,
    private auditLogService?: AuditLogService
  ) {}

  /**
   * Process Daraja STK push webhook with idempotency
   */
  async processWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhook: DarajaWebhook = req.body;
      const checkoutRequestId = webhook.Body.stkCallback.CheckoutRequestID;
      const merchantRequestId = webhook.Body.stkCallback.MerchantRequestID;

      // Generate idempotency key
      const idempotencyKey = this.generateIdempotencyKey(
        checkoutRequestId,
        merchantRequestId
      );

      // Check if webhook was already processed (idempotency check)
      const isDuplicate = await this.checkIdempotency(idempotencyKey);
      if (isDuplicate) {
        console.log(`Duplicate webhook detected: ${idempotencyKey}`);
        
        // Audit log for duplicate webhook
        if (this.auditLogService) {
          await this.auditLogService.log(
            'webhook_duplicate',
            'webhook',
            checkoutRequestId,
            undefined,
            { idempotencyKey, merchantRequestId },
            {
              ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
              userAgent: req.headers['user-agent'],
            }
          );
        }
        
        res.status(200).json({ message: 'Webhook already processed' });
        return;
      }

      // Mark as processing
      await this.markAsProcessing(idempotencyKey);

      const resultCode = webhook.Body.stkCallback.ResultCode;
      const resultDesc = webhook.Body.stkCallback.ResultDesc;

      if (resultCode === 0) {
        // Success - extract payment details
        const callbackMetadata = webhook.Body.stkCallback.CallbackMetadata;
        if (callbackMetadata && callbackMetadata.Item) {
          const metadata: Record<string, any> = {};
          callbackMetadata.Item.forEach((item) => {
            metadata[item.Name] = item.Value;
          });

          const amount = parseFloat(metadata.Amount || '0');
          const mpesaReceiptNumber = metadata.MpesaReceiptNumber || '';
          const phoneNumber = metadata.PhoneNumber || '';

          // Find pending transaction by checkout request ID
          const { data: pendingTx } = await this.supabase
            .from('transactions')
            .select('*')
            .eq('reference', checkoutRequestId)
            .eq('status', 'pending')
            .single();

          if (pendingTx) {
            // Check if this is a signup payment
            const isSignup = pendingTx.metadata?.isSignup === true;

            if (isSignup) {
              // Handle signup payment
              await this.handleSignupPayment(
                pendingTx.id,
                phoneNumber,
                amount,
                mpesaReceiptNumber
              );
            } else {
              // Update transaction status
              await this.updateTransaction(
                pendingTx.id,
                'completed',
                {
                  mpesaReceiptNumber,
                  phoneNumber,
                  amount,
                  processedAt: new Date(),
                }
              );

              // Record in ledger
              const updatedTx: Transaction = {
                ...this.mapTransaction(pendingTx),
                status: 'completed',
                processedAt: new Date(),
              };
              await this.ledgerService.recordTransaction(updatedTx);
            }
          }
        }
      } else {
        // Failure - update transaction status
        const { data: pendingTx } = await this.supabase
          .from('transactions')
          .select('*')
          .eq('reference', checkoutRequestId)
          .eq('status', 'pending')
          .single();

        if (pendingTx) {
          await this.updateTransaction(pendingTx.id, 'failed', {
            error: resultDesc,
            resultCode,
          });
        }
      }

      // Mark as completed
      await this.markAsCompleted(idempotencyKey, {
        resultCode,
        resultDesc,
        processedAt: new Date(),
      });

      // Audit log webhook processing
      if (this.auditLogService) {
        await this.auditLogService.log(
          'webhook_processed',
          'webhook',
          checkoutRequestId,
          undefined,
          { resultCode, resultDesc, merchantRequestId },
          {
            ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
            userAgent: req.headers['user-agent'],
          }
        );
      }

      res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error: any) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Generate idempotency key from webhook data
   */
  private generateIdempotencyKey(
    checkoutRequestId: string,
    merchantRequestId: string
  ): string {
    const combined = `${checkoutRequestId}:${merchantRequestId}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Check if webhook was already processed (idempotency check)
   */
  private async checkIdempotency(idempotencyKey: string): Promise<boolean> {
    // Check in-memory cache first
    const cached = this.processedWebhooks.get(idempotencyKey);
    if (cached) {
      const age = Date.now() - cached.getTime();
      if (age < this.IDEMPOTENCY_WINDOW_MS) {
        return true;
      }
      this.processedWebhooks.delete(idempotencyKey);
    }

    // Check database
    const { data, error } = await this.supabase
      .from('webhook_idempotency')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (error || !data) {
      return false;
    }

    const processedAt = new Date(data.processed_at);
    const age = Date.now() - processedAt.getTime();

    if (age < this.IDEMPOTENCY_WINDOW_MS) {
      // Cache it
      this.processedWebhooks.set(idempotencyKey, processedAt);
      return true;
    }

    // Expired - clean up
    await this.supabase
      .from('webhook_idempotency')
      .delete()
      .eq('idempotency_key', idempotencyKey);

    return false;
  }

  /**
   * Mark webhook as processing
   */
  private async markAsProcessing(idempotencyKey: string): Promise<void> {
    await this.supabase.from('webhook_idempotency').upsert({
      idempotency_key: idempotencyKey,
      status: 'processing',
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Mark webhook as completed
   */
  private async markAsCompleted(
    idempotencyKey: string,
    metadata: Record<string, any>
  ): Promise<void> {
    this.processedWebhooks.set(idempotencyKey, new Date());

    await this.supabase.from('webhook_idempotency').upsert({
      idempotency_key: idempotencyKey,
      status: 'completed',
      processed_at: new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Update transaction
   */
  private async updateTransaction(
    transactionId: string,
    status: Transaction['status'],
    updates: Record<string, any>
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
      ...updates,
    };

    if (status === 'completed' && !updateData.processed_at) {
      updateData.processed_at = new Date().toISOString();
    }

    await this.supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transactionId);
  }

  /**
   * Handle signup payment completion
   */
  async handleSignupPayment(
    transactionId: string,
    phoneNumber: string,
    amount: number,
    mpesaReceiptNumber: string
  ): Promise<void> {
    // Get transaction metadata to find email
    const { data: transaction } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (!transaction || !transaction.metadata) {
      throw new Error('Transaction not found or missing metadata');
    }

    const email = transaction.metadata.email;
    const deviceFingerprint = transaction.metadata.deviceFingerprint;

    if (!email) {
      throw new Error('Email not found in transaction metadata');
    }

    // Check if user already exists
    const { data: existingUser } = await this.supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existingUser) {
      // User already exists, just update transaction
      await this.updateTransaction(
        transactionId,
        'completed',
        {
          mpesaReceiptNumber,
          phoneNumber,
          amount,
          processedAt: new Date(),
        }
      );

      // Update transaction with user_id
      await this.supabase
        .from('transactions')
        .update({
          user_id: existingUser.id,
          metadata: {
            ...transaction.metadata,
            userId: existingUser.id,
            mpesaReceiptNumber,
          },
        })
        .eq('id', transactionId);

      // Record in ledger
      const updatedTx: Transaction = {
        ...this.mapTransaction(transaction),
        userId: existingUser.id,
        status: 'completed',
        processedAt: new Date(),
      };
      await this.ledgerService.recordTransaction(updatedTx);
      return;
    }

    // Create new user
    const { data: newUser, error: userError } = await this.supabase
      .from('users')
      .insert({
        email,
        phone_number: phoneNumber,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (userError) {
      throw new Error(`Failed to create user: ${userError.message}`);
    }

    // Update transaction with user_id
    await this.supabase
      .from('transactions')
      .update({
        user_id: newUser.id,
        status: 'completed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          ...transaction.metadata,
          userId: newUser.id,
          mpesaReceiptNumber,
        },
      })
      .eq('id', transactionId);

    // Store device fingerprint
    if (deviceFingerprint) {
      await this.supabase.from('user_devices').upsert({
        user_id: newUser.id,
        fingerprint_hash: deviceFingerprint,
        last_seen_at: new Date().toISOString(),
      });
    }

    // Record in ledger
    const updatedTx: Transaction = {
      ...this.mapTransaction(transaction),
      userId: newUser.id,
      status: 'completed',
      processedAt: new Date(),
    };
    await this.ledgerService.recordTransaction(updatedTx);
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
}

