/**
 * API route to publish a roster
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, Roster, Permission } from '@/types';
import { canPerformAction } from '@/utils/validators';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get current user with role for permission check
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    // Check permission to publish rosters (only Store Manager)
    const permissionCheck = canPerformAction(
      currentUser.id,
      Permission.PUBLISH_ROSTER,
      { type: 'roster', id: params.id },
      currentUser
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: permissionCheck.reason || 'Only Store Managers can publish rosters'
        }
      }, { status: 403 });
    }

    const supabase = createServerClient();

    // Update roster status to published
    const { data, error } = await supabase
      .from('rosters')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: currentUser.id,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    // Update all slots to published
    await supabase
      .from('roster_slots')
      .update({ status: 'published' })
      .eq('roster_id', params.id)
      .eq('status', 'draft');

    // Create audit log
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'PUBLISH_ROSTER',
      'roster',
      params.id,
      {
        entityName: `Roster for ${data.date}`,
        metadata: {
          publishedAt: data.published_at,
          status: 'published'
        }
      }
    );

    return NextResponse.json<ApiResponse<Roster>>({
      success: true,
      data: data as any
    });
  } catch (error: any) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    }, { status: 500 });
  }
}
