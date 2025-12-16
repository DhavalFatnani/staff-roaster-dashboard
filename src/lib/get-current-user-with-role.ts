/**
 * Helper to get current user with their role from database
 * Used for permission checks in API routes
 */

import { NextRequest } from 'next/server';
import { createServerClient } from './supabase';
import { requireAuth } from './auth-helpers';
import { User, Role } from '@/types';
import { transformUser } from '@/utils/supabase-helpers';

export async function getCurrentUserWithRole(
  request: NextRequest
): Promise<
  | { user: User & { role?: Role }; error: null }
  | { user: null; error: Response }
> {
  // First verify authentication
  const authResult = await requireAuth(request);
  if (authResult.error) {
    return { user: null, error: authResult.error };
  }

  const supabase = createServerClient();

  // Fetch user with role from database
  const { data, error } = await supabase
    .from('users')
    .select('*, roles(*)')
    .eq('id', authResult.user.id)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return {
      user: null,
      error: new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found in database'
          }
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    };
  }

  const transformedUser = transformUser(data);
  return { user: transformedUser, error: null };
}

