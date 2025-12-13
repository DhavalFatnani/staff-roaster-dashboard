/**
 * Authentication helpers for API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from './supabase';
import { ApiResponse } from '@/types';
import { User as SupabaseUser } from '@supabase/supabase-js';

/**
 * Extract access token from request (Authorization header or cookies)
 */
function extractAccessToken(request: NextRequest): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try cookies (Supabase stores session in cookies)
  const cookies = request.headers.get('cookie') || '';
  const cookieMap = new Map<string, string>();
  
  cookies.split(';').forEach(cookie => {
    const trimmed = cookie.trim();
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();
      if (key && value) {
        try {
          // Try URL decoding
          cookieMap.set(key, decodeURIComponent(value));
        } catch {
          cookieMap.set(key, value);
        }
      }
    }
  });

  // Look for Supabase auth token cookie
  // Format: sb-<project-ref>-auth-token or sb-<project-ref>-auth-token-code-verifier
  // Also check for any cookie containing 'auth' and 'token'
  for (const [key, value] of cookieMap.entries()) {
    const lowerKey = key.toLowerCase();
    if ((lowerKey.includes('sb-') && (lowerKey.includes('-auth-token') || lowerKey.includes('access_token'))) ||
        (lowerKey.includes('supabase') && lowerKey.includes('auth'))) {
      try {
        // Try parsing as JSON (Supabase stores session as JSON)
        let tokenData: any;
        try {
          tokenData = JSON.parse(value);
        } catch {
          // If not JSON, try parsing as URL-encoded JSON
          try {
            tokenData = JSON.parse(decodeURIComponent(value));
          } catch {
            // Not JSON at all
            tokenData = null;
          }
        }
        
        if (tokenData) {
          if (tokenData?.access_token) {
            return tokenData.access_token;
          }
          // Sometimes it's nested
          if (tokenData?.session?.access_token) {
            return tokenData.session.access_token;
          }
        } else {
          // Not JSON, might be direct token value (unlikely but possible)
          if (value && value.length > 20 && !value.includes('{') && !value.includes('%')) {
            return value;
          }
        }
      } catch {
        // Continue to next cookie
        continue;
      }
    }
  }

  return null;
}

/**
 * Get authenticated user from request
 * Returns the user if authenticated, null otherwise
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<{ user: SupabaseUser | null; error: NextResponse | null }> {
  const supabase = createServerClient();
  const accessToken = extractAccessToken(request);

  if (!accessToken) {
    return {
      user: null,
      error: NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        },
        { status: 401 }
      )
    };
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return {
        user: null,
        error: NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: error?.message || 'Invalid or expired session'
            }
          },
          { status: 401 }
        )
      };
    }

    return { user, error: null };
  } catch (err: any) {
    return {
      user: null,
      error: NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Failed to verify authentication'
          }
        },
        { status: 401 }
      )
    };
  }
}

/**
 * Require authentication for API route
 * Returns the authenticated user or sends 401 response
 */
export async function requireAuth(request: NextRequest): Promise<
  | { user: SupabaseUser; error: null }
  | { user: null; error: NextResponse }
> {
  const result = await getAuthenticatedUser(request);
  if (result.error) {
    return { user: null, error: result.error };
  }
  if (!result.user) {
    return {
      user: null,
      error: NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        },
        { status: 401 }
      )
    };
  }
  return { user: result.user, error: null };
}
