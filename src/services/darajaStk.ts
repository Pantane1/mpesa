import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface StkPushRequest {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export class DarajaStkService {
  private consumerKey: string;
  private consumerSecret: string;
  private passKey: string;
  private shortCode: string;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    this.consumerKey = process.env.DARAJA_CONSUMER_KEY || '';
    this.consumerSecret = process.env.DARAJA_CONSUMER_SECRET || '';
    this.passKey = process.env.DARAJA_PASS_KEY || '';
    this.shortCode = process.env.DARAJA_SHORT_CODE || '';
    this.baseUrl = process.env.DARAJA_BASE_URL || 'https://sandbox.safaricom.co.ke';
  }

  /**
   * Get OAuth access token
   */
  private async getAccessToken(): Promise<string> {
    // Check if token is still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date(Date.now() + 5 * 60 * 1000)) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

    try {
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });

      this.accessToken = response.data.access_token;
      // Tokens expire in 1 hour
      this.tokenExpiry = new Date(Date.now() + 3600 * 1000);

      return this.accessToken;
    } catch (error: any) {
      throw new Error(`Failed to get access token: ${error.message}`);
    }
  }

  /**
   * Generate password for STK push
   */
  private generatePassword(): string {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const password = Buffer.from(`${this.shortCode}${this.passKey}${timestamp}`).toString('base64');
    return password;
  }

  /**
   * Generate timestamp
   */
  private generateTimestamp(): string {
    return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  }

  /**
   * Initiate STK push
   */
  async initiateStkPush(request: StkPushRequest): Promise<StkPushResponse> {
    const accessToken = await this.getAccessToken();
    const timestamp = this.generateTimestamp();
    const password = this.generatePassword();

    // Format phone number (remove + and ensure it starts with 254)
    let phoneNumber = request.phoneNumber.replace(/\D/g, '');
    if (phoneNumber.startsWith('0')) {
      phoneNumber = '254' + phoneNumber.substring(1);
    } else if (!phoneNumber.startsWith('254')) {
      phoneNumber = '254' + phoneNumber;
    }

    const payload = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: request.amount,
      PartyA: phoneNumber,
      PartyB: this.shortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: process.env.DARAJA_CALLBACK_URL || `${process.env.BASE_URL}/webhooks/daraja`,
      AccountReference: request.accountReference,
      TransactionDesc: request.transactionDesc,
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to initiate STK push: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  /**
   * Initiate signup payment (250 KES)
   */
  async initiateSignupPayment(phoneNumber: string, email: string, checkoutRequestId?: string): Promise<StkPushResponse> {
    const requestId = checkoutRequestId || uuidv4();
    
    return this.initiateStkPush({
      phoneNumber,
      amount: 250, // Signup fee
      accountReference: `SIGNUP-${requestId}`,
      transactionDesc: `Account signup fee for ${email}`,
    });
  }
}

