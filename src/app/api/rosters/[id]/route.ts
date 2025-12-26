import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse } from '@/types';
import { format } from 'date-fns';

// Track in-flight delete operations to prevent duplicate processing
const deleteOperationsInProgress = new Set<string>();

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Prevent duplicate processing for the same roster deletion
  if (deleteOperationsInProgress.has(params.id)) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'OPERATION_IN_PROGRESS',
        message: 'Delete operation already in progress for this roster'
      }
    }, { status: 409 });
  }

  try {
    deleteOperationsInProgress.add(params.id);

    // Get current user with role for audit logging
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      deleteOperationsInProgress.delete(params.id);
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();
    
    // Check if audit log already exists for this deletion (prevent duplicates)
    // This handles cases where the request is called twice (e.g., React StrictMode)
    const { data: existingLog } = await supabase
      .from('audit_logs')
      .select('id')
      .eq('entity_type', 'roster')
      .eq('entity_id', params.id)
      .eq('action', 'DELETE_ROSTER')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If audit log already exists, skip deletion (already processed)
    if (existingLog) {
      deleteOperationsInProgress.delete(params.id);
      return NextResponse.json<ApiResponse<null>>({
        success: true,
        data: null
      });
    }
    
    // Fetch roster details before deletion for audit log
    const { data: rosterData } = await supabase
      .from('rosters')
      .select('*, shift_definitions(name)')
      .eq('id', params.id)
      .eq('store_id', currentUser.storeId)
      .single();

    if (!rosterData) {
      deleteOperationsInProgress.delete(params.id);
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Roster not found'
        }
      }, { status: 404 });
    }

    // Get slot count for audit log
    const { data: slotsData } = await supabase
      .from('roster_slots')
      .select('id, user_id')
      .eq('roster_id', params.id);
    
    const slotCount = slotsData?.length || 0;
    const filledSlots = slotsData?.filter(s => s.user_id).length || 0;
    
    // Delete roster slots first
    await supabase
      .from('roster_slots')
      .delete()
      .eq('roster_id', params.id);

    // Delete roster
    const { error } = await supabase
      .from('rosters')
      .delete()
      .eq('id', params.id);

    if (error) {
      deleteOperationsInProgress.delete(params.id);
      throw error;
    }

    // Create audit log (only if it doesn't already exist)
    const shiftName = (rosterData.shift_definitions as any)?.name || rosterData.shift_type || 'Unknown Shift';
    const rosterDate = format(new Date(rosterData.date), 'MMM d, yyyy');
    
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'DELETE_ROSTER',
      'roster',
      params.id,
      {
        entityName: `Roster for ${rosterDate} - ${shiftName}`,
        metadata: {
          date: rosterData.date,
          shiftName,
          totalSlots: slotCount,
          filledSlots,
          status: rosterData.status
        }
      }
    );

    deleteOperationsInProgress.delete(params.id);

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      data: null
    });
  } catch (error: any) {
    deleteOperationsInProgress.delete(params.id);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    }, { status: 500 });
  }
}
