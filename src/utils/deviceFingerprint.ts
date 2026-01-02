import crypto from 'crypto';

export interface FingerprintData {
  userAgent: string;
  language: string;
  timezone: string;
  screenResolution: string;
  platform: string;
  cookieEnabled: boolean;
  canvasFingerprint?: string;
  webglFingerprint?: string;
  ipAddress?: string;
}

export class DeviceFingerprintService {
  /**
   * Generate a device fingerprint hash from client data
   */
  static generateFingerprint(data: FingerprintData): string {
    const fingerprintString = [
      data.userAgent,
      data.language,
      data.timezone,
      data.screenResolution,
      data.platform,
      data.cookieEnabled.toString(),
      data.canvasFingerprint || '',
      data.webglFingerprint || '',
      data.ipAddress || '',
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(fingerprintString)
      .digest('hex');
  }

  /**
   * Validate fingerprint consistency
   */
  static validateFingerprint(
    storedFingerprint: string,
    currentFingerprint: string,
    threshold: number = 0.8
  ): boolean {
    // Simple exact match for now - can be enhanced with fuzzy matching
    return storedFingerprint === currentFingerprint;
  }

  /**
   * Extract fingerprint data from request headers
   */
  static extractFromRequest(req: any): Partial<FingerprintData> {
    return {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      language: req.headers['accept-language'] || '',
    };
  }
}

