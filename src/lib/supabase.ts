/**
 * Supabase client configuration
 * Using new Publishable and Secret API keys
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

// Client-side client (uses publishable key - safe for browser)
export const supabase = createClient(supabaseUrl, supabasePublishableKey);

// Server-side client for API routes (uses secret key for admin access)
export function createServerClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY || '';
  
  if (!secretKey) {
    console.warn('SUPABASE_SECRET_KEY not found, falling back to publishable key (limited access)');
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    secretKey || supabasePublishableKey
  );
}
