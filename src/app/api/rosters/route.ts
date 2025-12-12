/**
 * API route for roster CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { ApiResponse, Roster, RosterSlot, CoverageMetrics, ShiftType } from '@/types';
import { transformUsers } from '@/utils/supabase-helpers';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const shiftType = searchParams.get('shiftType');
    const storeId = searchParams.get('storeId');

    // Get store_id from first user if not provided
    let finalStoreId = storeId;
    if (!finalStoreId) {
      const { data: firstUser } = await supabase
        .from('users')
        .select('store_id')
        .limit(1)
        .single();
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

      const slots: RosterSlot[] = (slotsData || []).map((slot: any) => ({
        id: slot.id,
        rosterId: slot.roster_id,
        userId: slot.user_id || '',
        user: slot.users ? transformUsers([slot.users])[0] : undefined,
        shiftType: slot.shift_type as ShiftType,
        date: slot.date,
        assignedTasks: slot.assigned_tasks || [],
        startTime: slot.start_time,
        endTime: slot.end_time,
        status: slot.status as 'draft' | 'published' | 'cancelled',
        notes: slot.notes
      }));

      const coverage: CoverageMetrics = rosterData.coverage || {
        totalSlots: slots.length,
        filledSlots: slots.filter(s => s.userId).length,
        vacantSlots: slots.filter(s => !s.userId).length,
        coveragePercentage: 0,
        minRequiredStaff: 3,
        actualStaff: slots.filter(s => s.userId).length,
        warnings: []
      };

      rosters.push({
        id: rosterData.id,
        storeId: rosterData.store_id,
        date: rosterData.date,
        shiftType: rosterData.shift_type as ShiftType,
        slots,
        coverage,
        status: rosterData.status as 'draft' | 'published' | 'archived',
        publishedAt: rosterData.published_at ? new Date(rosterData.published_at) : undefined,
        publishedBy: rosterData.published_by,
        createdAt: new Date(rosterData.created_at),
        createdBy: rosterData.created_by,
        updatedAt: new Date(rosterData.updated_at),
        updatedBy: rosterData.updated_by,
        templateId: rosterData.template_id
      });
    }

    return NextResponse.json<ApiResponse<Roster[]>>({
      success: true,
      data: rosters
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

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    // Get current user and store
    const { data: currentUser } = await supabase
      .from('users')
      .select('id, store_id')
      .limit(1)
      .single();

    if (!currentUser) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'No user found'
        }
      }, { status: 401 });
    }

    // Get or create roster
    const { data: existingRoster } = await supabase
      .from('rosters')
      .select('id')
      .eq('store_id', body.storeId || currentUser.store_id)
      .eq('date', body.date)
      .eq('shift_type', body.shiftType)
      .single();

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
          store_id: body.storeId || currentUser.store_id,
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
    const { data: rosterData } = await supabase
      .from('rosters')
      .select('*')
      .eq('id', rosterId)
      .single();

    const { data: slotsData } = await supabase
      .from('roster_slots')
      .select('*, users(*, roles(*))')
      .eq('roster_id', rosterId);

    const slots: RosterSlot[] = (slotsData || []).map((slot: any) => ({
      id: slot.id,
      rosterId: slot.roster_id,
      userId: slot.user_id || '',
      user: slot.users ? transformUsers([slot.users])[0] : undefined,
        shiftType: slot.shift_type as ShiftType,
      date: slot.date,
      assignedTasks: slot.assigned_tasks || [],
      startTime: slot.start_time,
      endTime: slot.end_time,
      status: slot.status as 'draft' | 'published' | 'cancelled',
      notes: slot.notes
    }));

    const roster: Roster = {
      id: rosterData.id,
      storeId: rosterData.store_id,
      date: rosterData.date,
      shiftType: rosterData.shift_type as ShiftType,
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
      status: rosterData.status as 'draft' | 'published' | 'archived',
      publishedAt: rosterData.published_at ? new Date(rosterData.published_at) : undefined,
      publishedBy: rosterData.published_by,
      createdAt: new Date(rosterData.created_at),
      createdBy: rosterData.created_by,
      updatedAt: new Date(rosterData.updated_at),
      updatedBy: rosterData.updated_by,
      templateId: rosterData.template_id
    };

    return NextResponse.json<ApiResponse<Roster>>({
      success: true,
      data: roster
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
