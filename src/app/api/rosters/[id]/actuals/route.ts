/**
 * API route for recording/updating actuals for roster slots (manager)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { canPerformAction } from '@/utils/validators';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, RecordActualsRequest, BulkRecordActualsRequest, AttendanceStatus, Permission } from '@/types';
import { format } from 'date-fns';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
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
    const body: RecordActualsRequest | BulkRecordActualsRequest = await request.json();

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

    // Handle bulk update
    if ('actuals' in body && Array.isArray(body.actuals)) {
      const bulkRequest = body as BulkRecordActualsRequest;
      const updatedSlots = [];

      for (const actualsReq of bulkRequest.actuals) {
        const { data: slotData, error: slotError } = await supabase
          .from('roster_slots')
          .select('*')
          .eq('id', actualsReq.slotId)
          .eq('roster_id', params.id)
          .single();

        if (slotError || !slotData) {
          console.error(`Slot ${actualsReq.slotId} not found:`, slotError);
          continue;
        }

        const updateData: any = {};

        if (actualsReq.actualUserId !== undefined) {
          updateData.actual_user_id = actualsReq.actualUserId || null;
        }
        if (actualsReq.actualStartTime !== undefined) {
          updateData.actual_start_time = actualsReq.actualStartTime || null;
        }
        if (actualsReq.actualEndTime !== undefined) {
          updateData.actual_end_time = actualsReq.actualEndTime || null;
        }
        if (actualsReq.actualTasksCompleted !== undefined) {
          updateData.actual_tasks_completed = actualsReq.actualTasksCompleted || [];
        }
        if (actualsReq.attendanceStatus !== undefined) {
          updateData.attendance_status = actualsReq.attendanceStatus || null;
        }
        if (actualsReq.substitutionReason !== undefined) {
          updateData.substitution_reason = actualsReq.substitutionReason || null;
        }
        if (actualsReq.actualNotes !== undefined) {
          updateData.actual_notes = actualsReq.actualNotes || null;
        }

        // Set check-in/out times if not already set and times are provided
        if (actualsReq.actualStartTime && !slotData.checked_in_at) {
          updateData.checked_in_at = new Date().toISOString();
          updateData.checked_in_by = currentUser.id;
        }
        if (actualsReq.actualEndTime && !slotData.checked_out_at) {
          updateData.checked_out_at = new Date().toISOString();
          updateData.checked_out_by = currentUser.id;
        }

        const { data: updatedSlot, error: updateError } = await supabase
          .from('roster_slots')
          .update(updateData)
          .eq('id', actualsReq.slotId)
          .select()
          .single();

        if (updateError) {
          console.error(`Error updating slot ${actualsReq.slotId}:`, updateError);
          continue;
        }

        updatedSlots.push(updatedSlot);
      }

      // Create audit log for bulk update
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
          entityName: `Bulk actuals update for ${rosterDate} - ${shiftName}`,
          metadata: {
            slotsUpdated: updatedSlots.length,
            totalRequested: bulkRequest.actuals.length
          }
        }
      );

      return NextResponse.json<ApiResponse<any>>({
        success: true,
        data: {
          slotsUpdated: updatedSlots.length,
          slots: updatedSlots
        }
      });
    }

    // Handle single slot update
    const actualsReq = body as RecordActualsRequest;

    const { data: slotData, error: slotError } = await supabase
      .from('roster_slots')
      .select('*')
      .eq('id', actualsReq.slotId)
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

    if (actualsReq.actualUserId !== undefined) {
      updateData.actual_user_id = actualsReq.actualUserId || null;
    }
    if (actualsReq.actualStartTime !== undefined) {
      updateData.actual_start_time = actualsReq.actualStartTime || null;
      // Set check-in time if not already set
      if (!slotData.checked_in_at) {
        updateData.checked_in_at = new Date().toISOString();
        updateData.checked_in_by = currentUser.id;
      }
    }
    if (actualsReq.actualEndTime !== undefined) {
      updateData.actual_end_time = actualsReq.actualEndTime || null;
      // Set check-out time if not already set
      if (!slotData.checked_out_at) {
        updateData.checked_out_at = new Date().toISOString();
        updateData.checked_out_by = currentUser.id;
      }
    }
    if (actualsReq.actualTasksCompleted !== undefined) {
      updateData.actual_tasks_completed = actualsReq.actualTasksCompleted || [];
    }
    if (actualsReq.attendanceStatus !== undefined) {
      updateData.attendance_status = actualsReq.attendanceStatus || null;
    }
    if (actualsReq.substitutionReason !== undefined) {
      updateData.substitution_reason = actualsReq.substitutionReason || null;
    }
    if (actualsReq.actualNotes !== undefined) {
      updateData.actual_notes = actualsReq.actualNotes || null;
    }

    const { data: updatedSlot, error: updateError } = await supabase
      .from('roster_slots')
      .update(updateData)
      .eq('id', actualsReq.slotId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Create audit log
    const shiftName = rosterData.shift_type || 'Unknown Shift';
    const rosterDate = format(new Date(rosterData.date), 'MMM d, yyyy');
    
    const changes: Record<string, any> = {};
    if (actualsReq.actualUserId !== undefined && actualsReq.actualUserId !== slotData.user_id) {
      changes.user = { old: slotData.user_id, new: actualsReq.actualUserId };
    }
    if (actualsReq.actualStartTime !== undefined) {
      changes.actualStartTime = { old: slotData.actual_start_time, new: actualsReq.actualStartTime };
    }
    if (actualsReq.actualEndTime !== undefined) {
      changes.actualEndTime = { old: slotData.actual_end_time, new: actualsReq.actualEndTime };
    }
    if (actualsReq.attendanceStatus !== undefined) {
      changes.attendanceStatus = { old: slotData.attendance_status, new: actualsReq.attendanceStatus };
    }

    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      'RECORD_ACTUALS',
      'roster',
      params.id,
      {
        entityName: `Actuals recorded for ${rosterDate} - ${shiftName}`,
        changes: Object.keys(changes).length > 0 ? changes : undefined,
        metadata: {
          slotId: actualsReq.slotId,
          ...changes
        }
      }
    );

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: updatedSlot
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/rosters/[id]/actuals:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to record actuals'
      }
    }, { status: 500 });
  }
}

