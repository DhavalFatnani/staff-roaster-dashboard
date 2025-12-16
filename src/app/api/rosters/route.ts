/**
 * API route for roster CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { ApiResponse, Roster, RosterSlot, CoverageMetrics, ShiftType, Permission } from '@/types';
import { canPerformAction } from '@/utils/validators';
import { transformUsers, transformUser } from '@/utils/supabase-helpers';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const shiftType = searchParams.get('shiftType');
    const storeId = searchParams.get('storeId');

    // Get store_id from first user if not provided
    let finalStoreId = storeId;
    if (!finalStoreId) {
      const { data: firstUser, error: userError } = await supabase
        .from('users')
        .select('store_id')
        .limit(1)
        .maybeSingle();
      
      if (userError && userError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" which is fine
        throw userError;
      }
      
      if (firstUser) {
        finalStoreId = firstUser.store_id;
      }
    }

    if (!finalStoreId) {
      return NextResponse.json<ApiResponse<Roster[]>>({
        success: true,
        data: []
      });
    }

    let query = supabase
      .from('rosters')
      .select('*')
      .eq('store_id', finalStoreId)
      .order('date', { ascending: false });

    if (date) {
      query = query.eq('date', date);
    }
    if (shiftType) {
      query = query.eq('shift_type', shiftType);
    }

    const { data: rostersData, error: rostersError } = await query;

    if (rostersError) throw rostersError;

    // Fetch slots for each roster
    const rosters: Roster[] = [];
    for (const rosterData of rostersData || []) {
      const { data: slotsData, error: slotsError } = await supabase
        .from('roster_slots')
        .select('*, users(*, roles(*))')
        .eq('roster_id', rosterData.id);

      if (slotsError) throw slotsError;

      const slots: RosterSlot[] = (slotsData || []).map((slot: any) => {
        let user;
        try {
          user = slot.users ? transformUser(slot.users) : undefined;
        } catch (err) {
          console.error('Error transforming user in slot:', err, slot);
          user = undefined;
        }
        
        return {
          id: slot.id,
          rosterId: slot.roster_id,
          userId: slot.user_id || '',
          user,
          shiftType: slot.shift_type as ShiftType,
          date: slot.date || '',
          assignedTasks: slot.assigned_tasks || [],
          startTime: slot.start_time || '',
          endTime: slot.end_time || '',
          status: (slot.status || 'draft') as 'draft' | 'published' | 'cancelled',
          notes: slot.notes || undefined
        };
      });

      const coverage: CoverageMetrics = rosterData.coverage || {
        totalSlots: slots.length,
        filledSlots: slots.filter(s => s.userId).length,
        vacantSlots: slots.filter(s => !s.userId).length,
        coveragePercentage: 0,
        minRequiredStaff: 3,
        actualStaff: slots.filter(s => s.userId).length,
        warnings: []
      };

      try {
        rosters.push({
          id: rosterData.id,
          storeId: rosterData.store_id || '',
          date: rosterData.date || '',
          shiftType: (rosterData.shift_type || ShiftType.MORNING) as ShiftType,
          slots,
          coverage,
          status: (rosterData.status || 'draft') as 'draft' | 'published' | 'archived',
          publishedAt: rosterData.published_at ? new Date(rosterData.published_at) : undefined,
          publishedBy: rosterData.published_by || undefined,
          createdAt: rosterData.created_at ? new Date(rosterData.created_at) : new Date(),
          createdBy: rosterData.created_by || '',
          updatedAt: rosterData.updated_at ? new Date(rosterData.updated_at) : new Date(),
          updatedBy: rosterData.updated_by || undefined,
          templateId: rosterData.template_id || undefined
        });
      } catch (err) {
        console.error('Error processing roster:', err, rosterData);
        // Skip this roster if there's an error
      }
    }

    return NextResponse.json<ApiResponse<Roster[]>>({
      success: true,
      data: rosters
    });
  } catch (error: any) {
    console.error('Error in GET /api/rosters:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch rosters'
      }
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get current user with role for permission check
    const currentUserResult = await getCurrentUserWithRole(request);
    if (currentUserResult.error) {
      return currentUserResult.error;
    }
    const currentUser = currentUserResult.user;

    const supabase = createServerClient();
    const body = await request.json();

    // Check if roster exists to determine if this is create or modify
    const { data: existingRoster } = await supabase
      .from('rosters')
      .select('id')
      .eq('store_id', body.storeId || currentUser.storeId)
      .eq('date', body.date)
      .eq('shift_type', body.shiftType)
      .maybeSingle();

    // Check permission: CREATE_ROSTER for new, MODIFY_ROSTER for existing
    const requiredPermission = existingRoster ? Permission.MODIFY_ROSTER : Permission.CREATE_ROSTER;
    const permissionCheck = canPerformAction(
      currentUser.id,
      requiredPermission,
      { type: 'roster', id: existingRoster?.id },
      currentUser
    );

    if (!permissionCheck.allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: permissionCheck.reason || `You do not have permission to ${existingRoster ? 'modify' : 'create'} rosters`
        }
      }, { status: 403 });
    }

    // Use the existingRoster we already checked above

    let rosterId: string;
    if (existingRoster) {
      // Update existing roster
      rosterId = existingRoster.id;
      const { error: updateError } = await supabase
        .from('rosters')
        .update({
          coverage: body.coverage,
          status: body.status,
          updated_by: currentUser.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', rosterId);

      if (updateError) throw updateError;

      // Delete existing slots
      await supabase
        .from('roster_slots')
        .delete()
        .eq('roster_id', rosterId);
    } else {
      // Create new roster
      const { data: newRoster, error: createError } = await supabase
        .from('rosters')
        .insert({
          store_id: body.storeId || currentUser.storeId,
          date: body.date,
          shift_type: body.shiftType,
          coverage: body.coverage,
          status: body.status || 'draft',
          created_by: currentUser.id
        })
        .select()
        .single();

      if (createError) throw createError;
      rosterId = newRoster.id;
    }

    // Insert slots
    if (body.slots && body.slots.length > 0) {
      const slotsToInsert = body.slots.map((slot: RosterSlot) => ({
        roster_id: rosterId,
        user_id: slot.userId || null,
        shift_type: slot.shiftType,
        date: body.date,
        assigned_tasks: slot.assignedTasks || [],
        start_time: slot.startTime,
        end_time: slot.endTime,
        status: slot.status || 'draft',
        notes: slot.notes || null
      }));

      const { error: slotsError } = await supabase
        .from('roster_slots')
        .insert(slotsToInsert);

      if (slotsError) throw slotsError;
    }

    // Fetch the complete roster
    const { data: rosterData, error: rosterFetchError } = await supabase
      .from('rosters')
      .select('*')
      .eq('id', rosterId)
      .single();
    
    if (rosterFetchError || !rosterData) {
      throw new Error('Failed to fetch created roster');
    }

    const { data: slotsData, error: slotsFetchError } = await supabase
      .from('roster_slots')
      .select('*, users(*, roles(*))')
      .eq('roster_id', rosterId);

    if (slotsFetchError) {
      throw slotsFetchError;
    }

    const slots: RosterSlot[] = (slotsData || []).map((slot: any) => {
      let user;
      try {
        user = slot.users ? transformUser(slot.users) : undefined;
      } catch (err) {
        console.error('Error transforming user in slot:', err, slot);
        user = undefined;
      }
      
      return {
        id: slot.id,
        rosterId: slot.roster_id,
        userId: slot.user_id || '',
        user,
        shiftType: slot.shift_type as ShiftType,
        date: slot.date || '',
        assignedTasks: slot.assigned_tasks || [],
        startTime: slot.start_time || '',
        endTime: slot.end_time || '',
        status: (slot.status || 'draft') as 'draft' | 'published' | 'cancelled',
        notes: slot.notes || undefined
      };
    });

    const roster: Roster = {
      id: rosterData.id,
      storeId: rosterData.store_id || '',
      date: rosterData.date || '',
      shiftType: (rosterData.shift_type || ShiftType.MORNING) as ShiftType,
      slots,
      coverage: rosterData.coverage || {
        totalSlots: slots.length,
        filledSlots: slots.filter(s => s.userId).length,
        vacantSlots: slots.filter(s => !s.userId).length,
        coveragePercentage: 0,
        minRequiredStaff: 3,
        actualStaff: slots.filter(s => s.userId).length,
        warnings: []
      },
      status: (rosterData.status || 'draft') as 'draft' | 'published' | 'archived',
      publishedAt: rosterData.published_at ? new Date(rosterData.published_at) : undefined,
      publishedBy: rosterData.published_by || undefined,
      createdAt: rosterData.created_at ? new Date(rosterData.created_at) : new Date(),
      createdBy: rosterData.created_by || '',
      updatedAt: rosterData.updated_at ? new Date(rosterData.updated_at) : new Date(),
      updatedBy: rosterData.updated_by || undefined,
      templateId: rosterData.template_id || undefined
    };

    return NextResponse.json<ApiResponse<Roster>>({
      success: true,
      data: roster
    });
  } catch (error: any) {
    console.error('Error in POST /api/rosters:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to save roster'
      }
    }, { status: 500 });
  }
}
