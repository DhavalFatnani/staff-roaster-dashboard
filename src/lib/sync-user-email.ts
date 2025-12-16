/**
 * Utility function to sync email from users table to auth.users table
 * This ensures password reset emails work correctly
 */

import { createServerClient } from './supabase';

/**
 * Syncs email from users table to auth.users table
 * @param userId - The user ID (UUID) that exists in both tables
 * @param email - The email address to sync (can be null to remove email)
 * @returns Promise with success status and error message if any
 */
export async function syncUserEmailToAuth(
  userId: string,
  email: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServerClient();

    // Check if user exists in auth.users
    const { data: authUser, error: fetchError } = await supabase.auth.admin.getUserById(userId);

    if (fetchError) {
      // User might not exist in auth.users yet, which is okay
      console.warn(`User ${userId} not found in auth.users:`, fetchError.message);
      return { success: false, error: `User not found in auth.users: ${fetchError.message}` };
    }

    if (!authUser?.user) {
      return { success: false, error: 'User not found in auth.users' };
    }

    // Only update if email is different
    if (authUser.user.email === email) {
      return { success: true }; // Already in sync
    }

    // Update email in auth.users
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      email: email || undefined, // Use undefined instead of null for Supabase
      email_confirm: email ? true : false, // Auto-confirm if email is set
    });

    if (updateError) {
      console.error(`Failed to sync email for user ${userId}:`, updateError.message);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error(`Exception syncing email for user ${userId}:`, error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Syncs all user emails from users table to auth.users table
 * Useful for one-time migration or fixing mismatched emails
 * @returns Promise with sync results
 */
export async function syncAllUserEmails(): Promise<{
  success: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  try {
    const supabase = createServerClient();
    const results = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ userId: string; error: string }>,
    };

    // Get all users with emails
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, email')
      .not('email', 'is', null)
      .is('deleted_at', null);

    if (fetchError) {
      throw fetchError;
    }

    if (!users || users.length === 0) {
      return results;
    }

    // Sync each user's email
    for (const user of users) {
      const syncResult = await syncUserEmailToAuth(user.id, user.email);
      if (syncResult.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({
          userId: user.id,
          error: syncResult.error || 'Unknown error',
        });
      }
    }

    return results;
  } catch (error: any) {
    console.error('Exception syncing all user emails:', error);
    throw error;
  }
}

