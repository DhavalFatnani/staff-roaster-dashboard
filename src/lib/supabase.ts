/**
 * Supabase client configuration
 * Using new Publishable and Secret API keys
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

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

/**
 * Create a server client with user session from request
 * Extracts access token from Authorization header or cookies
 */
export function createServerClientWithAuth(request: NextRequest) {
  const supabase = createServerClient();
  
  // Try to get access token from Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return supabase.auth.setSession({
      access_token: token,
      refresh_token: '', // Not needed for verification
    } as any);
  }
  
  // Try to get from cookies (Supabase stores session in cookies)
  const cookies = request.headers.get('cookie') || '';
  const cookieMap = new Map<string, string>();
  cookies.split(';').forEach(cookie => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) cookieMap.set(key, value);
  });
  
  // Look for Supabase auth token cookie
  for (const [key, value] of cookieMap.entries()) {
    if (key.includes('sb-') && key.includes('-auth-token')) {
      try {
        const tokenData = JSON.parse(decodeURIComponent(value));
        if (tokenData.access_token) {
          return supabase.auth.setSession({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || '',
          } as any);
        }
      } catch {
        // Invalid cookie format, continue
      }
    }
  }
  
  return { data: { session: null, user: null }, error: { message: 'No authentication found' } };
}
