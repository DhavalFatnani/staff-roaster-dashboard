/**
 * API route for staff check-in
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, CheckInRequest, AttendanceStatus } from '@/types';
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
    const body: CheckInRequest = await request.json();

    // Get the roster to verify it exists and get the date
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

    // Check if already checked in
    if (slot.checked_in_at) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'ALREADY_CHECKED_IN',
          message: 'You have already checked in for this shift'
        }
      }, { status: 400 });
    }

    // Determine actual start time (use provided or current time)
    const now = new Date();
    const actualStartTime = body.actualStartTime || format(now, 'HH:mm');

    // Determine attendance status based on planned vs actual time
    const plannedStartTime = slot.start_time;
    let attendanceStatus = AttendanceStatus.PRESENT;

    // Parse times to compare (simple string comparison for HH:mm format)
    if (actualStartTime > plannedStartTime) {
      // Late - calculate minutes difference (simple comparison)
      const [plannedHours, plannedMins] = plannedStartTime.split(':').map(Number);
      const [actualHours, actualMins] = actualStartTime.split(':').map(Number);
      const plannedMinutes = plannedHours * 60 + plannedMins;
      const actualMinutes = actualHours * 60 + actualMins;
      const diffMinutes = actualMinutes - plannedMinutes;

      if (diffMinutes > 15) {
        attendanceStatus = AttendanceStatus.LATE;
      }
    }

    // Update the slot with check-in information
    const updateData: any = {
      actual_start_time: actualStartTime,
      attendance_status: attendanceStatus,
      checked_in_at: now.toISOString(),
      checked_in_by: currentUser.id,
      actual_user_id: currentUser.id, // Default to same user (can be changed by manager for substitutions)
    };

    // Update actual notes if provided
    if (body.notes) {
      updateData.actual_notes = body.notes;
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
      'CHECK_IN',
      'roster',
      params.id,
      {
        entityName: `Check-in for ${rosterDate} - ${shiftName}`,
        metadata: {
          slotId: slot.id,
          actualStartTime,
          attendanceStatus,
          plannedStartTime: slot.start_time
        }
      }
    );

    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: {
        slotId: updatedSlot.id,
        actualStartTime,
        attendanceStatus,
        checkedInAt: updatedSlot.checked_in_at
      }
    });
  } catch (error: any) {
    console.error('Error in POST /api/rosters/[id]/check-in:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to check in'
      }
    }, { status: 500 });
  }
}

