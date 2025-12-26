/**
 * API route for roster CRUD operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { getCurrentUserWithRole } from '@/lib/get-current-user-with-role';
import { logAuditAction } from '@/lib/audit-logger';
import { ApiResponse, Roster, RosterSlot, CoverageMetrics, Permission } from '@/types';
import { canPerformAction } from '@/utils/validators';
import { transformUsers, transformUser, transformSlotActuals } from '@/utils/supabase-helpers';
import { format } from 'date-fns';

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
    const shiftId = searchParams.get('shiftId');
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
    if (shiftId) {
      // Try to filter by shift_id first, fallback to shift_type if column doesn't exist
      query = query.eq('shift_id', shiftId);
    }

    let { data: rostersData, error: rostersError } = await query;

    // If error is about shift_id column not existing, try fallback to shift_type
    if (rostersError && shiftId && (rostersError.message?.includes('shift_id') || rostersError.code === '42703')) {
      // Fetch shift definition to get name (shift_type column no longer exists)
      const { data: shiftData } = await supabase
        .from('shift_definitions')
        .select('name')
        .eq('id', shiftId)
        .maybeSingle();
      
      if (shiftData?.name) {
        // Retry query with shift_type (for backward compatibility with old rosters)
        // Note: This will only work if rosters still have shift_type populated
        let fallbackQuery = supabase
          .from('rosters')
          .select('*')
          .eq('store_id', finalStoreId)
          .order('date', { ascending: false });
        
        // Try to match by shift_type if it exists in rosters table
        // This is a fallback for migration period
        try {
          fallbackQuery = fallbackQuery.eq('shift_type', shiftData.name);
        } catch (e) {
          // If shift_type column doesn't exist, we can't filter by it
          // The query will return all rosters for this store
        }
        
        if (date) {
          fallbackQuery = fallbackQuery.eq('date', date);
        }
        
        const fallbackResult = await fallbackQuery;
        rostersData = fallbackResult.data;
        rostersError = fallbackResult.error;
      }
    }

    if (rostersError) throw rostersError;

    // Collect all user IDs (createdBy, updatedBy, publishedBy) to fetch user names
    const userIds = new Set<string>();
    (rostersData || []).forEach((r: any) => {
      if (r.created_by) userIds.add(r.created_by);
      if (r.updated_by) userIds.add(r.updated_by);
      if (r.published_by) userIds.add(r.published_by);
    });

    // Fetch user information for all user IDs
    let usersMap = new Map();
    if (userIds.size > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, employee_id')
        .in('id', Array.from(userIds));
      
      if (usersData) {
        usersMap = new Map(usersData.map((u: any) => [u.id, {
          firstName: u.first_name || '',
          lastName: u.last_name || '',
          employeeId: u.employee_id || ''
        }]));
      }
    }

    // Fetch shift definitions for all rosters
    const { data: allShifts } = await supabase
      .from('shift_definitions')
      .select('*')
      .eq('store_id', finalStoreId);
    
    const shiftsMap = new Map((allShifts || []).map((s: any) => [s.id, s]));

    // Fetch slots for each roster
    const rosters: Roster[] = [];
    for (const rosterData of rostersData || []) {
      const { data: slotsData, error: slotsError } = await supabase
        .from('roster_slots')
        .select('*, users!roster_slots_user_id_fkey(*, roles(*))')
        .eq('roster_id', rosterData.id);

      if (slotsError) throw slotsError;

      // Fetch actual users if needed
      const actualUserIds = new Set<string>();
      (slotsData || []).forEach((slot: any) => {
        if (slot.actual_user_id && slot.actual_user_id !== slot.user_id) {
          actualUserIds.add(slot.actual_user_id);
        }
      });

      let actualUsersMap = new Map();
      if (actualUserIds.size > 0) {
        const { data: actualUsersData } = await supabase
          .from('users')
          .select('*, roles(*)')
          .in('id', Array.from(actualUserIds));
        
        if (actualUsersData) {
          actualUsersMap = new Map(actualUsersData.map((u: any) => [u.id, u]));
        }
      }

      const slots: RosterSlot[] = (slotsData || []).map((slot: any) => {
        let user;
        try {
          user = slot.users ? transformUser(slot.users) : undefined;
        } catch (err) {
          console.error('Error transforming user in slot:', err, slot);
          user = undefined;
        }

        // Transform actuals if present
        let actuals = undefined;
        if (slot.actual_user_id || slot.actual_start_time || slot.actual_end_time || 
            slot.attendance_status || slot.checked_in_at || slot.checked_out_at) {
          const actualUserData = slot.actual_user_id && actualUsersMap.get(slot.actual_user_id);
          actuals = transformSlotActuals(slot, actualUserData);
        }
        
        return {
          id: slot.id,
          rosterId: slot.roster_id,
          userId: slot.user_id || '',
          user,
          shiftId: slot.shift_id || slot.shift_type || '', // Support both during migration
          date: slot.date || '',
          assignedTasks: slot.assigned_tasks || [],
          startTime: slot.start_time || '',
          endTime: slot.end_time || '',
          status: (slot.status || 'draft') as 'draft' | 'published' | 'cancelled',
          notes: slot.notes || undefined,
          actuals
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

      // Get shift ID - support both shift_id and shift_type during migration
      // Note: shift_definitions table uses 'name' column, not 'shift_type'
      // Handle case-insensitive matching for old shift_type values (e.g., 'morning' vs 'Morning Shift')
      const shiftId = rosterData.shift_id || (rosterData.shift_type ? 
        (allShifts || []).find((s: any) => {
          const shiftName = (s.name || '').toLowerCase();
          const rosterShiftType = (rosterData.shift_type || '').toLowerCase();
          // Exact match or shift name contains the old shift_type value
          return shiftName === rosterShiftType || 
                 shiftName.includes(rosterShiftType) || 
                 rosterShiftType.includes(shiftName);
        })?.id : null) || '';
      const shift = shiftId ? shiftsMap.get(shiftId) : null;

      try {
        rosters.push({
          id: rosterData.id,
          storeId: rosterData.store_id || '',
          date: rosterData.date || '',
          shiftId: shiftId,
          shift: shift ? {
            id: shift.id,
            storeId: shift.store_id,
            name: shift.name || shift.shift_type || 'Unnamed Shift',
            startTime: shift.start_time,
            endTime: shift.end_time,
            durationHours: shift.duration_hours,
            isActive: shift.is_active,
            createdAt: new Date(shift.created_at),
            updatedAt: new Date(shift.updated_at)
          } : undefined,
          slots,
          coverage,
          status: (rosterData.status || 'draft') as 'draft' | 'published' | 'archived',
          publishedAt: rosterData.published_at ? new Date(rosterData.published_at) : undefined,
          publishedBy: rosterData.published_by || undefined,
          createdAt: rosterData.created_at ? new Date(rosterData.created_at) : new Date(),
          createdBy: rosterData.created_by || '',
          updatedAt: rosterData.updated_at ? new Date(rosterData.updated_at) : new Date(),
          updatedBy: rosterData.updated_by || undefined,
          updatedByUser: rosterData.updated_by ? usersMap.get(rosterData.updated_by) : undefined,
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
    // Support both shiftId and shiftType during migration
    let existingRosterQuery = supabase
      .from('rosters')
      .select('id')
      .eq('store_id', body.storeId || currentUser.storeId)
      .eq('date', body.date);
    
    if (body.shiftId) {
      existingRosterQuery = existingRosterQuery.eq('shift_id', body.shiftId);
    } else if (body.shiftType) {
      // Fallback for old API calls
      existingRosterQuery = existingRosterQuery.eq('shift_type', body.shiftType);
    }
    
    const { data: existingRoster } = await existingRosterQuery.maybeSingle();

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
    let oldSlots: any[] = [];
    let oldSlotsWithUsers: any[] = [];
    
    if (existingRoster) {
      // Update existing roster
      rosterId = existingRoster.id;
      
      // Fetch old slots with user information for comparison
      const { data: oldSlotsData } = await supabase
        .from('roster_slots')
        .select('*, users!roster_slots_user_id_fkey(id, first_name, last_name, employee_id)')
        .eq('roster_id', rosterId);
      
      oldSlots = oldSlotsData || [];
      oldSlotsWithUsers = oldSlots.map((slot: any) => ({
        userId: slot.user_id,
        userName: slot.users ? `${slot.users.first_name} ${slot.users.last_name} (${slot.users.employee_id})` : null,
        assignedTasks: slot.assigned_tasks || [],
        taskCount: (slot.assigned_tasks || []).length
      }));
      
      // Prepare update data
      const updateData: any = {
        coverage: body.coverage,
        status: body.status,
        updated_by: currentUser.id,
        updated_at: new Date().toISOString()
      };
      
      // Update shift_id and shift_type if provided
      if (body.shiftId) {
        updateData.shift_id = body.shiftId;
        // Look up the shift to derive shift_type for backward compatibility (rosters table)
        // Note: shift_definitions table uses 'name' column, not 'shift_type'
        const { data: shiftDef } = await supabase
          .from('shift_definitions')
          .select('name')
          .eq('id', body.shiftId)
          .maybeSingle();
        if (shiftDef?.name) {
          // Derive shift_type from name for backward compatibility with rosters table
          const name = shiftDef.name.toLowerCase();
          updateData.shift_type = name.includes('morning') ? 'morning' : 
                                  name.includes('evening') ? 'evening' : 
                                  'morning';
        }
      }
      
      const { error: updateError } = await supabase
        .from('rosters')
        .update(updateData)
        .eq('id', rosterId);

      if (updateError) throw updateError;

      // Delete existing slots
      await supabase
        .from('roster_slots')
        .delete()
        .eq('roster_id', rosterId);
    } else {
      // Create new roster
      // Support both shiftId and shiftType during migration
      const insertData: any = {
          store_id: body.storeId || currentUser.storeId,
          date: body.date,
          coverage: body.coverage,
          status: body.status || 'draft',
          created_by: currentUser.id
      };
      
      // Fetch shifts for slot mapping and shift_type lookup
      const { data: shiftsForStore } = await supabase
        .from('shift_definitions')
        .select('*')
        .eq('store_id', body.storeId || currentUser.storeId);
      const shiftsMapForSlots = new Map((shiftsForStore || []).map((s: any) => [s.id, s]));
      
      // Handle shift_id and shift_type - both are needed for backward compatibility
      if (body.shiftId) {
        insertData.shift_id = body.shiftId;
        // Look up the shift to get shift_type for backward compatibility
        const shiftDef = shiftsMapForSlots.get(body.shiftId);
        if (shiftDef) {
          // Derive shift_type from name for backward compatibility with rosters table
          // shift_definitions table uses 'name' column, not 'shift_type'
          const name = (shiftDef.name || '').toLowerCase();
          insertData.shift_type = name.includes('morning') ? 'morning' : 
                                   name.includes('evening') ? 'evening' : 
                                   name.includes('night') ? 'night' : 
                                   'morning'; // Default fallback
        } else {
          // If shift not found, derive from name or use default
          insertData.shift_type = 'morning'; // Default fallback
          console.warn(`Shift ${body.shiftId} not found, using default shift_type`);
        }
      } else if (body.shiftType) {
        // Fallback: try to find shift by name (shift_definitions uses 'name', not 'shift_type')
        const { data: shiftByType } = await supabase
          .from('shift_definitions')
          .select('id')
          .eq('store_id', body.storeId || currentUser.storeId)
          .eq('name', body.shiftType)
          .maybeSingle();
        if (shiftByType) {
          insertData.shift_id = shiftByType.id;
        }
        // Also set shift_type for backward compatibility
        insertData.shift_type = body.shiftType;
      } else {
        // If neither shiftId nor shiftType is provided, use shift_type as fallback
        // This handles the case where the migration hasn't been run yet
        insertData.shift_type = 'morning'; // Default fallback
        console.warn('No shiftId or shiftType provided, using default shift_type');
      }
      
      // Try to insert with shift_id, but if it fails due to missing column, try without it
      let newRoster: any;
      let createError: any;
      
      const { data: rosterData, error: rosterErr } = await supabase
        .from('rosters')
        .insert(insertData)
        .select()
        .single();

      newRoster = rosterData;
      createError = rosterErr;
      
      // If error is due to missing shift_id column, try again without it
      if (createError && (createError.code === '42703' || createError.message?.includes('shift_id') || createError.message?.includes('column') && createError.message?.includes('does not exist'))) {
        console.warn('shift_id column not found, falling back to shift_type only');
        const fallbackData = { ...insertData };
        delete fallbackData.shift_id;
        
        const { data: fallbackRoster, error: fallbackError } = await supabase
          .from('rosters')
          .insert(fallbackData)
          .select()
          .single();
        
        if (!fallbackError) {
          newRoster = fallbackRoster;
          createError = null;
        } else {
          createError = fallbackError;
        }
      }
      
      if (createError) {
        console.error('Error creating roster:', createError);
        console.error('Insert data:', JSON.stringify(insertData, null, 2));
        throw createError;
      }
      
      rosterId = newRoster?.id;
      
      if (!rosterId) {
        throw new Error('Failed to create roster: no ID returned');
      }
    }

    // Insert slots
    if (body.slots && body.slots.length > 0) {
      // Fetch shifts for slot mapping (fetch if not already available from roster creation)
      let shiftsMapForSlots: Map<string, any>;
      // Check if we're in the create path and shifts were already fetched
      // Otherwise, fetch them now
      const { data: shiftsForStore } = await supabase
        .from('shift_definitions')
        .select('*')
        .eq('store_id', body.storeId || currentUser.storeId);
      shiftsMapForSlots = new Map((shiftsForStore || []).map((s: any) => [s.id, s]));
      
      const slotsToInsert = body.slots.map((slot: RosterSlot) => {
        const slotData: any = {
        roster_id: rosterId,
        user_id: slot.userId || null,
        date: body.date,
        assigned_tasks: slot.assignedTasks || [],
        start_time: slot.startTime,
        end_time: slot.endTime,
        status: slot.status || 'draft',
        notes: slot.notes || null
        };
        
        // Support both shiftId and shiftType during migration
        if (slot.shiftId) {
          slotData.shift_id = slot.shiftId;
          // Look up the shift to get shift_type for backward compatibility
          const shiftDef = shiftsMapForSlots.get(slot.shiftId);
          if (shiftDef) {
            // Derive shift_type from name for backward compatibility
            // shift_definitions table uses 'name' column, not 'shift_type'
            const name = (shiftDef.name || '').toLowerCase();
            slotData.shift_type = name.includes('morning') ? 'morning' : 
                                  name.includes('evening') ? 'evening' : 
                                  name.includes('night') ? 'night' : 
                                  'morning'; // Default fallback
          } else {
            // If shift not found, derive from body.shiftId or use default
            if (body.shiftId && shiftsMapForSlots.has(body.shiftId)) {
              const bodyShift = shiftsMapForSlots.get(body.shiftId);
              const name = (bodyShift?.name || '').toLowerCase();
              slotData.shift_type = name.includes('morning') ? 'morning' : 
                                    name.includes('evening') ? 'evening' : 
                                    name.includes('night') ? 'night' : 
                                    'morning'; // Default fallback
            } else {
              slotData.shift_type = 'morning'; // Default fallback
            }
          }
        } else if ((slot as any).shiftType) {
          // Fallback for old data - match by shift name using backward compatibility
          slotData.shift_type = (slot as any).shiftType;
          // Try to find shift_id by matching old shiftType value with shift name
          // shift_definitions table uses 'name' column, not 'shift_type'
          const slotShiftType = (slot as any).shiftType;
          const shift = Array.from(shiftsMapForSlots.values()).find((s: any) => 
            shiftNamesMatch(s.name, slotShiftType)
          );
          if (shift && shift.id) {
            slotData.shift_id = shift.id;
          }
        } else if (body.shiftId) {
          slotData.shift_id = body.shiftId;
          // Look up shift_type from body.shiftId
          const bodyShift = shiftsMapForSlots.get(body.shiftId);
          if (bodyShift) {
            slotData.shift_type = bodyShift.shift_type || 
              (bodyShift.name?.toLowerCase().includes('morning') ? 'morning' : 
               bodyShift.name?.toLowerCase().includes('evening') ? 'evening' : 
               'morning');
          } else {
            slotData.shift_type = 'morning'; // Default fallback
          }
        } else if (body.shiftType) {
          // Final fallback
          slotData.shift_type = body.shiftType;
        } else {
          // Last resort: use default
          slotData.shift_type = 'morning';
        }
        
        return slotData;
      });

      // Filter out slots without shiftId or shift_type
      const validSlotsToInsert = slotsToInsert.filter((slot: any) => slot.shift_id || slot.shift_type);
      
      if (validSlotsToInsert.length > 0) {
        // Try to insert with shift_id, but fallback to shift_type only if column doesn't exist
        let slotsError: any;
        const { error: insertError } = await supabase
          .from('roster_slots')
          .insert(validSlotsToInsert);

        slotsError = insertError;
        
        // If error is due to missing shift_id column, try again without it
        if (slotsError && (slotsError.code === '42703' || slotsError.message?.includes('shift_id') || (slotsError.message?.includes('column') && slotsError.message?.includes('does not exist')))) {
          console.warn('shift_id column not found in roster_slots, falling back to shift_type only');
          const fallbackSlots = validSlotsToInsert.map((slot: any) => {
            const { shift_id, ...rest } = slot;
            return rest;
          });
          
          const { error: fallbackError } = await supabase
        .from('roster_slots')
            .insert(fallbackSlots);
          
          if (!fallbackError) {
            slotsError = null;
          }
        }
        
        if (slotsError) {
          console.error('Error inserting slots:', slotsError);
          throw slotsError;
        }
      }
    }

    // Fetch the complete roster (without join first, in case shift_id column doesn't exist)
    let { data: rosterData, error: rosterFetchError } = await supabase
      .from('rosters')
      .select('*')
      .eq('id', rosterId)
      .single();
    
    if (rosterFetchError || !rosterData) {
      throw new Error('Failed to fetch created roster');
    }
    
    // Try to fetch shift definition separately
    let shift = null;
    const shiftId = rosterData.shift_id || '';
    const shiftType = rosterData.shift_type || '';
    
    if (shiftId) {
      // Try to fetch by shift_id
      const { data: shiftData } = await supabase
        .from('shift_definitions')
        .select('*')
        .eq('id', shiftId)
        .maybeSingle();
      
      if (shiftData) {
        shift = {
          id: shiftData.id,
          storeId: shiftData.store_id,
          name: shiftData.name || shiftData.shift_type || 'Unnamed Shift',
          startTime: shiftData.start_time,
          endTime: shiftData.end_time,
          durationHours: shiftData.duration_hours,
          isActive: shiftData.is_active,
          displayOrder: shiftData.display_order ?? undefined,
          createdAt: new Date(shiftData.created_at),
          updatedAt: new Date(shiftData.updated_at)
        };
      }
    } else if (shiftType) {
      // Fallback: try to find shift by name (shift_definitions uses 'name', not 'shift_type')
      // Handle case-insensitive matching for old shift_type values
      const { data: allShiftsData } = await supabase
        .from('shift_definitions')
        .select('*')
        .eq('store_id', rosterData.store_id);
      
      const shiftData = allShiftsData?.find((s: any) => {
        const shiftName = (s.name || '').toLowerCase();
        const rosterShiftType = (shiftType || '').toLowerCase();
        // Exact match or shift name contains the old shift_type value
        return shiftName === rosterShiftType || 
               shiftName.includes(rosterShiftType) || 
               rosterShiftType.includes(shiftName);
      });
      
      if (shiftData) {
        shift = {
          id: shiftData.id,
          storeId: shiftData.store_id,
          name: shiftData.name || shiftData.shift_type || 'Unnamed Shift',
          startTime: shiftData.start_time,
          endTime: shiftData.end_time,
          durationHours: shiftData.duration_hours,
          isActive: shiftData.is_active,
          displayOrder: shiftData.display_order ?? undefined,
          createdAt: new Date(shiftData.created_at),
          updatedAt: new Date(shiftData.updated_at)
        };
      }
    }

    const { data: slotsData, error: slotsFetchError } = await supabase
      .from('roster_slots')
      .select('*, users!roster_slots_user_id_fkey(*, roles(*))')
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
        shiftId: slot.shift_id || slot.shift_type || '',
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
      shiftId: shiftId || rosterData.shift_id || '',
      shift: shift || undefined,
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

    // Create audit log with detailed changes
    const action = existingRoster ? 'UPDATE_ROSTER' : 'CREATE_ROSTER';
    const shiftName = shift?.name || body.shiftType || 'Unknown Shift';
    
    // Build detailed changes for updates
    let detailedChanges: Record<string, { old: any; new: any }> = {};
    let taskAssignmentDetails: string[] = [];
    
    if (existingRoster && oldSlotsWithUsers.length > 0) {
      // Compare old vs new slots to detect changes
      const newSlotsMap = new Map(slots.map(s => [s.userId, s]));
      const oldSlotsMap = new Map(oldSlotsWithUsers.map(s => [s.userId, s]));
      
      // Get all task names for better display
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('id, name')
        .eq('is_active', true);
      const taskNameMap = new Map((allTasks || []).map((t: any) => [t.id, t.name]));
      
      // Detect user assignments/removals/unassignments
      const newUserIds = new Set(slots.filter(s => s.userId).map(s => s.userId));
      const oldUserIds = new Set(oldSlotsWithUsers.filter(s => s.userId).map(s => s.userId));
      
      const addedUsers = Array.from(newUserIds).filter(id => !oldUserIds.has(id));
      const removedUsers = Array.from(oldUserIds).filter(id => !newUserIds.has(id)); // Users completely unassigned from roster
      const modifiedUsers = Array.from(newUserIds).filter(id => oldUserIds.has(id)); // Users still assigned but task assignments may have changed
      
      // Track user assignments
      if (addedUsers.length > 0) {
        addedUsers.forEach(userId => {
          const slot = slots.find(s => s.userId === userId);
          const user = slot?.user;
          const userName = user ? `${user.firstName} ${user.lastName} (${user.employeeId})` : userId.substring(0, 8);
          const taskNames = (slot?.assignedTasks || []).map((tid: string) => taskNameMap.get(tid) || tid).join(', ');
          taskAssignmentDetails.push(`Assigned ${userName}${taskNames ? ` to tasks: ${taskNames}` : ' (no tasks)'}`);
        });
      }
      
      if (removedUsers.length > 0) {
        removedUsers.forEach(userId => {
          const oldSlot = oldSlotsWithUsers.find(s => s.userId === userId);
          const user = oldSlot?.user;
          const userName = user ? `${user.firstName} ${user.lastName} (${user.employeeId})` : (oldSlot?.userName || userId.substring(0, 8));
          // Check if user had tasks assigned
          const oldTasks = oldSlot?.assignedTasks || [];
          if (oldTasks.length > 0) {
            const taskNames = oldTasks.map((tid: string) => taskNameMap.get(tid) || tid).join(', ');
            taskAssignmentDetails.push(`Unassigned ${userName} from roster (was assigned to tasks: ${taskNames})`);
          } else {
            taskAssignmentDetails.push(`Unassigned ${userName} from roster`);
          }
        });
      }
      
      // Track task changes for existing users (including task unassignments)
      modifiedUsers.forEach(userId => {
        const newSlot = slots.find(s => s.userId === userId);
        const oldSlot = oldSlotsWithUsers.find(s => s.userId === userId);
        
        if (newSlot && oldSlot) {
          const newTasks = new Set(newSlot.assignedTasks || []);
          const oldTasks = new Set(oldSlot.assignedTasks || []);
          
          const addedTasks = Array.from(newTasks).filter(t => !oldTasks.has(t));
          const removedTasks = Array.from(oldTasks).filter(t => !newTasks.has(t));
          
          if (addedTasks.length > 0 || removedTasks.length > 0) {
            const user = newSlot.user;
            const userName = user ? `${user.firstName} ${user.lastName} (${user.employeeId})` : userId.substring(0, 8);
            const changes: string[] = [];
            
            if (addedTasks.length > 0) {
              const taskNames = addedTasks.map(tid => taskNameMap.get(tid) || tid).join(', ');
              changes.push(`assigned to tasks: ${taskNames}`);
            }
            if (removedTasks.length > 0) {
              const taskNames = removedTasks.map(tid => taskNameMap.get(tid) || tid).join(', ');
              changes.push(`unassigned from tasks: ${taskNames}`);
            }
            
            taskAssignmentDetails.push(`${userName}: ${changes.join(', ')}`);
          }
        }
      });
      
      // Build changes object
      if (rosterData.status !== roster.status) {
        detailedChanges.status = { old: rosterData.status || 'draft', new: roster.status };
      }
      
      const oldSlotCount = oldSlots.length;
      const newSlotCount = slots.length;
      if (oldSlotCount !== newSlotCount) {
        detailedChanges.slots = { old: oldSlotCount, new: newSlotCount };
      }
      
      const oldFilledSlots = oldSlots.filter(s => s.user_id).length;
      const newFilledSlots = slots.filter(s => s.userId).length;
      if (oldFilledSlots !== newFilledSlots) {
        detailedChanges.filledSlots = { old: oldFilledSlots, new: newFilledSlots };
      }
      
      // If only task assignments changed (no other changes), add a summary change
      if (taskAssignmentDetails.length > 0 && Object.keys(detailedChanges).length === 0) {
        detailedChanges.taskAssignments = { 
          old: 'Previous assignments', 
          new: `${taskAssignmentDetails.length} change(s) made` 
        };
      }
    } else if (!existingRoster) {
      // For new rosters
      detailedChanges = {
        date: { old: null, new: roster.date },
        shift: { old: null, new: shiftName }, // Store shift name instead of ID
        slots: { old: null, new: slots.length }
      };
      
      // Get task names for new roster
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('id, name')
        .eq('is_active', true);
      const taskNameMap = new Map((allTasks || []).map((t: any) => [t.id, t.name]));
      
      // Track initial assignments
      slots.filter(s => s.userId).forEach(slot => {
        const user = slot.user;
        const userName = user ? `${user.firstName} ${user.lastName} (${user.employeeId})` : slot.userId.substring(0, 8);
        const taskNames = (slot.assignedTasks || []).map((tid: string) => taskNameMap.get(tid) || tid).join(', ');
        taskAssignmentDetails.push(`Assigned ${userName}${taskNames ? ` to tasks: ${taskNames}` : ' (no tasks)'}`);
      });
    }
    
    await logAuditAction(
      request,
      currentUser.id,
      currentUser.storeId,
      action,
      'roster',
      roster.id,
      {
        entityName: `Roster for ${format(new Date(roster.date), 'MMM d, yyyy')} - ${shiftName}`,
        changes: Object.keys(detailedChanges).length > 0 ? detailedChanges : undefined,
        metadata: {
          filledSlots: roster.coverage.filledSlots,
          totalSlots: roster.coverage.totalSlots,
          coveragePercentage: roster.coverage.coveragePercentage,
          ...(taskAssignmentDetails.length > 0 && { taskAssignments: taskAssignmentDetails.join('; ') })
        }
      }
    );

    return NextResponse.json<ApiResponse<Roster>>({
      success: true,
      data: roster
    });
  } catch (error: any) {
    console.error('Error in POST /api/rosters:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack
    });
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || error.details || error.hint || 'Failed to save roster'
      }
    }, { status: 500 });
  }
}
