/**
 * Client-side API helper that automatically includes authentication
 */

import { supabase } from './supabase';

/**
 * Get the current access token from Supabase session
 */
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Fetch wrapper that automatically includes authentication token
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  
  const headers = new Headers(options.headers);
  
  // Add Authorization header if we have a token
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Ensure credentials are included for cookies (as fallback)
  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Include cookies in case token extraction fails
  };
  
  return fetch(url, fetchOptions);
}
