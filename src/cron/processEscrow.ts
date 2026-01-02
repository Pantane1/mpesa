import { createClient } from '@supabase/supabase-js';
import { ReferralEscrowService } from '../services/referralEscrow';
import { LedgerService } from '../services/ledger';

/**
 * Cron job script to process escrow releases
 * Run this script periodically (e.g., every hour) to release escrowed referral payouts
 * 
 * Usage:
 *   node dist/cron/processEscrow.js
 * 
 * Or set up a cron job:
 *   0 * * * * node /path/to/dist/cron/processEscrow.js
 */

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const ledgerService = new LedgerService(supabase);

  // Get escrow delay from admin controls (default to 7 days)
  let escrowDelayDays = 7;
  const { data: escrowControl } = await supabase
    .from('admin_controls')
    .select('value')
    .eq('key', 'escrow_delay_days')
    .single();

  if (escrowControl?.value) {
    escrowDelayDays = escrowControl.value;
  }

  const referralEscrowService = new ReferralEscrowService(
    supabase,
    ledgerService,
    escrowDelayDays
  );

  try {
    console.log(`[${new Date().toISOString()}] Starting escrow processing...`);
    
    const processed = await referralEscrowService.processEscrowReleases();
    
    console.log(`[${new Date().toISOString()}] Processed ${processed} escrow releases`);
    
    if (processed > 0) {
      console.log(`[${new Date().toISOString()}] Successfully released ${processed} referral payouts`);
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Error processing escrow:`, error);
    process.exit(1);
  }
}

main();

