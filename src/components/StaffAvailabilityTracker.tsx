'use client';

import { User } from '@/types';
import { useMemo, useState } from 'react';
import { getDay } from 'date-fns';
import { CalendarOff } from 'lucide-react';

interface StaffAvailabilityTrackerProps {
  availableUsers: (User & { role?: any })[];
  allTaskAssignments: Array<{ taskId: string; assignedUserIds: string[] }>;
  currentShift: 'morning' | 'evening';
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
  currentShift,
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

  // Calculate availability by role (excluding Store Manager)
  const availabilityByRole = useMemo(() => {
    // Filter users by shift preference and exclude Store Manager and inactive users
    const shiftUsers = availableUsers.filter(user => {
      // Exclude inactive users
      if (!user.isActive) return false;
      
      // Exclude Store Manager
      const roleName = (user.role?.name || '').toLowerCase();
      if (roleName.includes('store manager')) {
        return false;
      }
      
      if (!user.defaultShiftPreference) return false;
      return user.defaultShiftPreference === currentShift;
    });

    // Get day of week for weekoff check
    const dayOfWeek = selectedDate ? getDay(new Date(selectedDate)) : null;

    // Group by role
    const roleMap = new Map<string, { total: number; assigned: number; available: number; weekoff: number }>();

    shiftUsers.forEach(user => {
      const roleName = user.role?.name || 'No Role';
      const isAssigned = assignedUserIds.has(user.id);
      const isOnWeekoff = dayOfWeek !== null && (user.weekOffDays || []).includes(dayOfWeek);
      const canMultiTask = canAssignMultipleTasks(roleName);

      // "Available" means not assigned to any task yet AND not on weekoff
      // Multi-task roles can be assigned to multiple tasks, but once assigned,
      // they should be counted as "assigned" not "available"
      // The fact they can do multiple tasks is handled in the UI (they can still be selected)
      const isAvailable = !isAssigned && !isOnWeekoff;

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

    return Array.from(roleMap.entries())
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
  }, [availableUsers, assignedUserIds, currentShift, selectedDate]);

  const totalAvailable = availabilityByRole.reduce((sum, role) => sum + role.available, 0);
  const totalAssigned = availabilityByRole.reduce((sum, role) => sum + role.assigned, 0);
  const totalStaff = availabilityByRole.reduce((sum, role) => sum + role.total, 0);
  const totalWeekoff = availabilityByRole.reduce((sum, role) => sum + role.weekoff, 0);

  // Get staff on weekoff for the selected date
  const staffOnWeekoff = useMemo(() => {
    if (!selectedDate) return [];
    const dayOfWeek = getDay(new Date(selectedDate)); // 0 = Sunday, 6 = Saturday
    return availableUsers.filter(user => {
      const roleName = (user.role?.name || '').toLowerCase();
      if (roleName.includes('store manager')) return false;
      if (!user.isActive) return false;
      if (!user.defaultShiftPreference) return false;
      if (user.defaultShiftPreference !== currentShift) return false;
      return (user.weekOffDays || []).includes(dayOfWeek);
    });
  }, [availableUsers, selectedDate, currentShift]);

  if (totalStaff === 0) {
    return null; // Don't show if no staff available
  }

  return (
    <div className={`sticky top-4 h-fit ${isCollapsed ? 'w-12' : 'w-72'} transition-all duration-200`}>
      {isCollapsed ? (
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-full bg-white border-2 border-blue-300 rounded-lg shadow-lg p-2 hover:bg-blue-50 transition-colors"
          title="Show Staff Availability"
        >
          <div className="flex flex-col items-center gap-1">
            <span className="text-lg">{currentShift === 'morning' ? '🌅' : '🌙'}</span>
            <span className="text-xs font-bold text-blue-600">{totalAvailable}</span>
          </div>
        </button>
      ) : (
        <div className="bg-white border-2 border-blue-300 rounded-lg shadow-lg overflow-hidden flex flex-col">
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
              {currentShift === 'morning' ? '🌅' : '🌙'} {currentShift} shift
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
                    {staffOnWeekoff.slice(0, 3).map(user => (
                      <span
                        key={user.id}
                        className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded"
                      >
                        {user.firstName} {user.lastName?.charAt(0)}.
                      </span>
                    ))}
                    {staffOnWeekoff.length > 3 && (
                      <span className="text-xs text-amber-600">
                        +{staffOnWeekoff.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* By Role */}
          <div className="p-3 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
            {availabilityByRole.map(({ roleName, total, assigned, available, weekoff }) => {
              const roleColors = getRoleColor(roleName);
              const isLow = available === 0 && assigned > 0;
              
              return (
                <div
                  key={roleName}
                  className={`p-2 rounded border ${
                    isLow ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
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
            })}
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
