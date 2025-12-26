/**
 * API route for staff check-out
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, CheckOutRequest, AttendanceStatus } from '@/types';
import { format } from 'date-fns';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    // Get current user
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();
    const body: CheckOutRequest = await request.json();

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

    // Find the slot for this user on this roster
    let slotQuery = supabase
      .from('roster_slots')
      .select('*')
      .eq('roster_id', params.id)
      .eq('user_id', currentUser.id);

    if (body.slotId) {
      slotQuery = slotQuery.eq('id', body.slotId);
    }

    const { data: slotsData, error: slotsError } = await slotQuery;

    if (slotsError) {
      throw slotsError;
    }

    if (!slotsData || slotsData.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'SLOT_NOT_FOUND',
          message: 'No slot found for this user in this roster'
        }
      }, { status: 404 });
    }

    const slot = slotsData[0];

    // Check if checked in
    if (!slot.checked_in_at) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'NOT_CHECKED_IN',
          message: 'You must check in before checking out'
        }
      }, { status: 400 });
    }

    // Check if already checked out
    if (slot.checked_out_at) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'ALREADY_CHECKED_OUT',
          message: 'You have already checked out for this shift'
        }
      }, { status: 400 });
    }

    // Determine actual end time (use provided or current time)
    const now = new Date();
    const actualEndTime = body.actualEndTime || format(now, 'HH:mm');

    // Check if left early and update attendance status if needed
    let attendanceStatus = slot.attendance_status || AttendanceStatus.PRESENT;
    const plannedEndTime = slot.end_time;

    if (actualEndTime < plannedEndTime) {
      // Left early - calculate minutes difference
      const [plannedHours, plannedMins] = plannedEndTime.split(':').map(Number);
      const [actualHours, actualMins] = actualEndTime.split(':').map(Number);
      const plannedMinutes = plannedHours * 60 + plannedMins;
      const actualMinutes = actualHours * 60 + actualMins;
      const diffMinutes = plannedMinutes - actualMinutes;

      if (diffMinutes > 15) {
        // Update attendance status to left_early if not already late/absent
        if (attendanceStatus === AttendanceStatus.PRESENT) {
          attendanceStatus = AttendanceStatus.LEFT_EARLY;
        }
      }
    }

    // Update the slot with check-out information
    const updateData: any = {
      actual_end_time: actualEndTime,
      checked_out_at: now.toISOString(),
      checked_out_by: currentUser.id,
    };

    // Update attendance status if it changed
    if (attendanceStatus !== slot.attendance_status) {
      updateData.attendance_status = attendanceStatus;
    }

    // Append notes if provided
    if (body.notes) {
      const existingNotes = slot.actual_notes || '';
      updateData.actual_notes = existingNotes 
        ? `${existingNotes}\n[Check-out]: ${body.notes}`
        : `[Check-out]: ${body.notes}`;
    }

    const { data: updatedSlot, error: updateError } = await supabase
      .from('roster_slots')
      .update(updateData)
      .eq('id', slot.id)
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
      'CHECK_OUT',
      'roster',
      params.id,
      {
        entityName: `Check-out for ${rosterDate} - ${shiftName}`,
        metadata: {
          slotId: slot.id,
          actualEndTime,
          attendanceStatus,
          plannedEndTime: slot.end_time
        }
      }
    );

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: {
        slotId: updatedSlot.id,
        actualEndTime,
        attendanceStatus,
        checkedOutAt: updatedSlot.checked_out_at
      }
    });
  } catch (error: any) {
    console.error('Error in POST /api/rosters/[id]/check-out:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to check out'
      }
    }, { status: 500 });
  }
}

