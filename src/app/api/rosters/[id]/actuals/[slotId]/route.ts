/**
 * API route for updating/deleting actuals for a specific slot
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { canPerformAction } from '@/utils/validators';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, RecordActualsRequest, Permission } from '@/types';
import { format } from 'date-fns';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; slotId: string } }
) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    // Get current user with role
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    // Check permission
    const permissionCheck = canPerformAction(
      currentUser.id,
      Permission.MODIFY_ROSTER,
      null,
      currentUser
    );
    if (!permissionCheck.allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: permissionCheck.reason || 'You do not have permission to record actuals'
        }
      }, { status: 403 });
    }

    const supabase = createServerClient();
    const body: Omit<RecordActualsRequest, 'slotId'> = await request.json();

    // Get the roster to verify it exists
    const { data: rosterData, error: rosterError } = await supabase
      .from('rosters')
      .select('id, date, shift_id, shift_type')
      .eq('id', params.id)
      .single();

    if (rosterError || !rosterData) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'ROSTER_NOT_FOUND',
          message: 'Roster not found'
        }
      }, { status: 404 });
    }

    // Get the slot
    const { data: slotData, error: slotError } = await supabase
      .from('roster_slots')
      .select('*')
      .eq('id', params.slotId)
      .eq('roster_id', params.id)
      .single();

    if (slotError || !slotData) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'SLOT_NOT_FOUND',
          message: 'Slot not found'
        }
      }, { status: 404 });
    }

    const updateData: any = {};

    if (body.actualUserId !== undefined) {
      updateData.actual_user_id = body.actualUserId || null;
    }
    if (body.actualStartTime !== undefined) {
      updateData.actual_start_time = body.actualStartTime || null;
      if (!slotData.checked_in_at) {
        updateData.checked_in_at = new Date().toISOString();
        updateData.checked_in_by = currentUser.id;
      }
    }
    if (body.actualEndTime !== undefined) {
      updateData.actual_end_time = body.actualEndTime || null;
      if (!slotData.checked_out_at) {
        updateData.checked_out_at = new Date().toISOString();
        updateData.checked_out_by = currentUser.id;
      }
    }
    if (body.actualTasksCompleted !== undefined) {
      updateData.actual_tasks_completed = body.actualTasksCompleted || [];
    }
    if (body.attendanceStatus !== undefined) {
      updateData.attendance_status = body.attendanceStatus || null;
    }
    if (body.substitutionReason !== undefined) {
      updateData.substitution_reason = body.substitutionReason || null;
    }
    if (body.actualNotes !== undefined) {
      updateData.actual_notes = body.actualNotes || null;
    }

    const { data: updatedSlot, error: updateError } = await supabase
      .from('roster_slots')
      .update(updateData)
      .eq('id', params.slotId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Create audit log
    const shiftName = rosterData.shift_type || 'Unknown Shift';
    const rosterDate = format(new Date(rosterData.date), 'MMM d, yyyy');
    
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'RECORD_ACTUALS',
      'roster',
      params.id,
      {
        entityName: `Actuals updated for slot in ${rosterDate} - ${shiftName}`,
        metadata: {
          slotId: params.slotId,
          changes: updateData
        }
      }
    );

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: updatedSlot
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/rosters/[id]/actuals/[slotId]:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to update actuals'
      }
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; slotId: string } }
) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    // Get current user with role
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    // Check permission
    const permissionCheck = canPerformAction(
      currentUser.id,
      Permission.MODIFY_ROSTER,
      null,
      currentUser
    );
    if (!permissionCheck.allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: permissionCheck.reason || 'You do not have permission to clear actuals'
        }
      }, { status: 403 });
    }

    const supabase = createServerClient();

    // Get the roster to verify it exists
    const { data: rosterData, error: rosterError } = await supabase
      .from('rosters')
      .select('id, date, shift_id, shift_type')
      .eq('id', params.id)
      .single();

    if (rosterError || !rosterData) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'ROSTER_NOT_FOUND',
          message: 'Roster not found'
        }
      }, { status: 404 });
    }

    // Clear actuals fields (set to null/empty)
    const { data: updatedSlot, error: updateError } = await supabase
      .from('roster_slots')
      .update({
        actual_user_id: null,
        actual_start_time: null,
        actual_end_time: null,
        actual_tasks_completed: [],
        attendance_status: null,
        substitution_reason: null,
        actual_notes: null,
        checked_in_at: null,
        checked_out_at: null,
        checked_in_by: null,
        checked_out_by: null
      })
      .eq('id', params.slotId)
      .eq('roster_id', params.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Create audit log
    const shiftName = rosterData.shift_type || 'Unknown Shift';
    const rosterDate = format(new Date(rosterData.date), 'MMM d, yyyy');
    
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'RECORD_ACTUALS',
      'roster',
      params.id,
      {
        entityName: `Actuals cleared for slot in ${rosterDate} - ${shiftName}`,
        metadata: {
          slotId: params.slotId,
          action: 'clear_actuals'
        }
      }
    );

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: updatedSlot
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/rosters/[id]/actuals/[slotId]:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to clear actuals'
      }
    }, { status: 500 });
  }
}

