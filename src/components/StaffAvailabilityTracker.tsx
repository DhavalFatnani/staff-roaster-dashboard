'use client';

import { User } from '@/types';
import { useMemo, useState } from 'react';
import { getDay } from 'date-fns';
import { CalendarOff } from 'lucide-react';
import { shiftNamesMatch } from '@/utils/validators';

interface StaffAvailabilityTrackerProps {
  availableUsers: (User & { role?: any })[];
  allTaskAssignments: Array<{ taskId: string; assignedUserIds: string[] }>;
  currentShiftId?: string; // Shift ID for filtering
  currentShiftName?: string; // Shift name for filtering by preference
  currentShift?: 'morning' | 'evening'; // Deprecated: kept for backward compatibility
  selectedDate?: string; // YYYY-MM-DD format
}

// Roles that can be assigned to multiple tasks
const MULTI_TASK_ROLES = ['Shift In Charge', 'Inventory Executive'];

const canAssignMultipleTasks = (roleName: string | undefined): boolean => {
  if (!roleName) return false;
  return MULTI_TASK_ROLES.some(role => roleName.includes(role));
};

export default function StaffAvailabilityTracker({
  availableUsers,
  allTaskAssignments,
  currentShiftId,
  currentShiftName,
  currentShift, // Deprecated: kept for backward compatibility
  selectedDate
}: StaffAvailabilityTrackerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Get all assigned user IDs across all tasks
  const assignedUserIds = useMemo(() => {
    const assignedSet = new Set<string>();
    allTaskAssignments.forEach(assignment => {
      assignment.assignedUserIds.forEach(userId => {
        assignedSet.add(userId);
      });
    });
    return assignedSet;
  }, [allTaskAssignments]);

  // Calculate availability grouped by shift, then by role
  const availabilityByShift = useMemo(() => {
    // Filter users - exclude Store Manager and inactive users
    const shiftUsers = availableUsers.filter(user => {
      // Exclude inactive users
      if (!user.isActive) return false;
      
      // Exclude Store Manager
      const roleName = (user.role?.name || '').toLowerCase();
      if (roleName.includes('store manager')) {
        return false;
      }
      
      return true;
    });

    // Get day of week for weekoff check
    const dayOfWeek = selectedDate ? getDay(new Date(selectedDate)) : null;

    // Group by shift preference first, then by role
    const shiftMap = new Map<string, Map<string, {
      total: number;
      assigned: number;
      available: number;
      weekoff: number;
    }>>();

    shiftUsers.forEach(user => {
      // Determine which shift group this user belongs to
      const shiftGroup = user.defaultShiftPreference || 'No Preference';
      const roleName = user.role?.name || 'No Role';
      const isAssigned = assignedUserIds.has(user.id);
      const isOnWeekoff = dayOfWeek !== null && (user.weekOffDays || []).includes(dayOfWeek);
      const isAvailable = !isAssigned && !isOnWeekoff;

      // Initialize shift group if needed
      if (!shiftMap.has(shiftGroup)) {
        shiftMap.set(shiftGroup, new Map());
      }

      const roleMap = shiftMap.get(shiftGroup)!;

      // Initialize role within shift if needed
      if (!roleMap.has(roleName)) {
        roleMap.set(roleName, { total: 0, assigned: 0, available: 0, weekoff: 0 });
      }

      const roleData = roleMap.get(roleName)!;
      roleData.total++;
      if (isAssigned) {
        roleData.assigned++;
      }
      if (isAvailable) {
        roleData.available++;
      }
      if (isOnWeekoff) {
        roleData.weekoff++;
      }
    });

    // Convert to array format and sort
    return Array.from(shiftMap.entries())
      .map(([shiftName, roleMap]) => {
        const roles = Array.from(roleMap.entries())
          .map(([roleName, data]) => ({ roleName, ...data }))
          .sort((a, b) => {
            // Sort by priority: SI, IE, PP
            const priority: Record<string, number> = {
              'Shift In Charge': 1,
              'Inventory Executive': 2,
              'Picker Packer (Warehouse)': 3,
              'Picker Packer (Ad-Hoc)': 4,
            };
            return (priority[a.roleName] || 50) - (priority[b.roleName] || 50);
          });
        
        return { shiftName, roles };
      })
      .sort((a, b) => {
        // Sort shifts: current shift first, then "No Preference", then alphabetically
        if (currentShiftName) {
          if (a.shiftName === currentShiftName) return -1;
          if (b.shiftName === currentShiftName) return 1;
        }
        if (a.shiftName === 'No Preference') return 1;
        if (b.shiftName === 'No Preference') return -1;
        return a.shiftName.localeCompare(b.shiftName);
      });
  }, [availableUsers, assignedUserIds, selectedDate, currentShiftName]);

  // Calculate totals for CURRENT SHIFT ONLY (not all shifts)
  const currentShiftTotals = useMemo(() => {
    if (!currentShiftName) {
      // If no current shift, return totals from all shifts (fallback)
      const roleMap = new Map<string, { total: number; assigned: number; available: number; weekoff: number }>();
      availabilityByShift.forEach(({ roles }) => {
        roles.forEach(({ roleName, total, assigned, available, weekoff }) => {
          if (!roleMap.has(roleName)) {
            roleMap.set(roleName, { total: 0, assigned: 0, available: 0, weekoff: 0 });
          }
          const roleData = roleMap.get(roleName)!;
          roleData.total += total;
          roleData.assigned += assigned;
          roleData.available += available;
          roleData.weekoff += weekoff;
        });
      });
      return {
        totalAvailable: Array.from(roleMap.values()).reduce((sum, role) => sum + role.available, 0),
        totalAssigned: Array.from(roleMap.values()).reduce((sum, role) => sum + role.assigned, 0),
        totalStaff: Array.from(roleMap.values()).reduce((sum, role) => sum + role.total, 0),
        totalWeekoff: Array.from(roleMap.values()).reduce((sum, role) => sum + role.weekoff, 0)
      };
    }
    
    // Find the current shift's data and "No Preference" data
    // Users with no preference can work any shift, so include them in current shift totals
    const currentShiftData = availabilityByShift.find(({ shiftName }) => 
      shiftName === currentShiftName || shiftNamesMatch(shiftName, currentShiftName)
    );
    const noPreferenceData = availabilityByShift.find(({ shiftName }) => 
      shiftName === 'No Preference'
    );
    
    // Combine current shift + no preference users
    let totalAvailable = 0;
    let totalAssigned = 0;
    let totalStaff = 0;
    let totalWeekoff = 0;
    
    if (currentShiftData) {
      totalAvailable += currentShiftData.roles.reduce((sum, role) => sum + role.available, 0);
      totalAssigned += currentShiftData.roles.reduce((sum, role) => sum + role.assigned, 0);
      totalStaff += currentShiftData.roles.reduce((sum, role) => sum + role.total, 0);
      totalWeekoff += currentShiftData.roles.reduce((sum, role) => sum + role.weekoff, 0);
    }
    
    if (noPreferenceData) {
      totalAvailable += noPreferenceData.roles.reduce((sum, role) => sum + role.available, 0);
      totalAssigned += noPreferenceData.roles.reduce((sum, role) => sum + role.assigned, 0);
      totalStaff += noPreferenceData.roles.reduce((sum, role) => sum + role.total, 0);
      totalWeekoff += noPreferenceData.roles.reduce((sum, role) => sum + role.weekoff, 0);
    }
    
    return { totalAvailable, totalAssigned, totalStaff, totalWeekoff };
  }, [availabilityByShift, currentShiftName]);

  const { totalAvailable, totalAssigned, totalStaff, totalWeekoff } = currentShiftTotals;

  // Get staff on weekoff for the selected date (filtered by shift preference)
  const staffOnWeekoff = useMemo(() => {
    if (!selectedDate) return [];
    const dayOfWeek = getDay(new Date(selectedDate)); // 0 = Sunday, 6 = Saturday
    return availableUsers.filter(user => {
      const roleName = (user.role?.name || '').toLowerCase();
      if (roleName.includes('store manager')) return false;
      // Exclude Picker Packer (Ad-Hoc) users - they are not allowed weekoffs
      if (roleName.includes('picker packer') && roleName.includes('ad-hoc')) return false;
      if (!user.isActive) return false;
      
      // Filter by shift preference if shift name is provided
      if (currentShiftName) {
        // If user has a shift preference, only show if it matches the current shift
        // Use backward-compatible matching for old enum values ('morning', 'evening')
        if (user.defaultShiftPreference) {
          if (!shiftNamesMatch(user.defaultShiftPreference, currentShiftName)) return false;
        }
        // If user has no preference, show them for all shifts
      }
      
      // Check if user is on weekoff for this date
      return (user.weekOffDays || []).includes(dayOfWeek);
    });
  }, [availableUsers, selectedDate, currentShiftName]);

  // Always render the component, even if no staff available (show empty state)
  return (
    <div className={`sticky top-4 self-start ${isCollapsed ? 'w-12' : 'w-72'} transition-all duration-200 z-10`}>
      {isCollapsed ? (
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-full bg-white border-2 border-blue-300 rounded-lg shadow-lg p-2 hover:bg-blue-50 transition-colors"
          title="Show Staff Availability"
        >
          <div className="flex flex-col items-center gap-1">
            <span className="text-lg">👥</span>
            <span className="text-xs font-bold text-blue-600">{totalAvailable}</span>
          </div>
        </button>
      ) : (
        <div className="bg-white border-2 border-blue-300 rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
          {/* Header */}
          <div className="p-3 border-b border-blue-200 bg-blue-50 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900 text-sm">Staff Availability</h3>
              <button
                onClick={() => setIsCollapsed(true)}
                className="text-gray-400 hover:text-gray-600 text-sm"
                title="Collapse"
              >
                ×
              </button>
            </div>
            <div className="text-xs text-gray-600">
              {currentShiftName ? `${currentShiftName} - Staff Availability` : 'Staff Availability'}
            </div>
          </div>

          {/* Summary */}
          <div className="p-3 border-b border-gray-200 flex-shrink-0 bg-gray-50">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-xs text-gray-600">Available</div>
                <div className="text-lg font-bold text-blue-600">{totalAvailable}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Assigned</div>
                <div className="text-lg font-bold text-gray-700">{totalAssigned}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Weekoff</div>
                <div className="text-lg font-bold text-amber-600">{totalWeekoff}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Total</div>
                <div className="text-lg font-bold text-gray-900">{totalStaff}</div>
              </div>
            </div>
          </div>

          {/* Weekoff Warning */}
          {staffOnWeekoff.length > 0 && (
            <div className="p-3 border-b border-amber-200 bg-amber-50 flex-shrink-0">
              <div className="flex items-start gap-2">
                <CalendarOff className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-900 mb-1">
                    {staffOnWeekoff.length} staff on weekoff
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {staffOnWeekoff.map(user => (
                      <span
                        key={user.id}
                        className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"
                      >
                        {user.firstName} {user.lastName || ''}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* By Shift */}
          <div className="p-3 space-y-3 flex-1 overflow-y-auto min-h-0">
            {availabilityByShift.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                <p>No staff available</p>
                {currentShiftName && (
                  <p className="text-xs mt-1">for {currentShiftName}</p>
                )}
              </div>
            ) : (
              availabilityByShift.map(({ shiftName, roles }) => {
                const isCurrentShift = currentShiftName && (
                  shiftName === currentShiftName || shiftNamesMatch(shiftName, currentShiftName)
                );
                
                return (
                  <div
                    key={shiftName}
                    className={`rounded border ${
                      isCurrentShift 
                        ? 'bg-blue-50 border-blue-300' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    {/* Shift Header */}
                    <div className={`p-2 border-b ${
                      isCurrentShift ? 'border-blue-200 bg-blue-100' : 'border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${
                          isCurrentShift ? 'text-blue-900' : 'text-gray-700'
                        }`}>
                          {shiftName}
                        </span>
                        {isCurrentShift && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded">
                            Current
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Roles within Shift */}
                    <div className="p-2 space-y-2">
                      {roles.length === 0 ? (
                        <div className="text-xs text-gray-500 text-center py-2">
                          No staff in this shift
                        </div>
                      ) : (
                        roles.map(({ roleName, total, assigned, available, weekoff }) => {
                          const roleColors = getRoleColor(roleName);
                          const isLow = available === 0 && assigned > 0;
                          
                          return (
                            <div
                              key={roleName}
                              className={`p-2 rounded border ${
                                isLow ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-xs font-medium ${roleColors.text} ${roleColors.bg} px-1.5 py-0.5 rounded`}>
                                  {roleName}
                                </span>
                                <span className={`text-sm font-bold ${available > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                  {available}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>{total} total</span>
                                <div className="flex gap-2">
                                  <span>{assigned} assigned</span>
                                  {weekoff > 0 && (
                                    <span className="text-amber-600">{weekoff} weekoff</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Role color mapping
function getRoleColor(roleName: string) {
  const role = roleName.toLowerCase();
  if (role.includes('shift in charge') || role.includes('charge')) {
    return { bg: 'bg-blue-100', text: 'text-blue-700' };
  }
  if (role.includes('inventory executive') || role.includes('inventory')) {
    return { bg: 'bg-indigo-100', text: 'text-indigo-700' };
  }
  if (role.includes('picker packer') || role.includes('packer')) {
    if (role.includes('warehouse')) {
      return { bg: 'bg-green-100', text: 'text-green-700' };
    }
    return { bg: 'bg-orange-100', text: 'text-orange-700' };
  }
  return { bg: 'bg-gray-100', text: 'text-gray-700' };
}
