'use client';

import { User, Roster, ShiftDefinition } from '@/types';
import { useState, useMemo } from 'react';
import { getDay } from 'date-fns';
import { AlertCircle } from 'lucide-react';
import Modal, { ConfirmModal } from '@/components/Modal';
import { shiftNamesMatch } from '@/utils/validators';

interface TaskAssignment {
  taskId: string;
  assignedUserIds: string[];
}

interface TaskMemberSelectorProps {
  taskId: string;
  taskName: string;
  availableUsers: (User & { role?: any })[];
  assignedUserIds: string[];
  allTaskAssignments: TaskAssignment[]; // All task assignments in the current shift
  onAssign: (taskId: string, userId: string) => void;
  onUnassign: (taskId: string, userId: string) => void;
  currentShiftId?: string; // Shift ID for filtering
  currentShiftName?: string; // Current shift name for grouping
  currentShift?: 'morning' | 'evening'; // Deprecated: kept for backward compatibility
  availableShifts?: ShiftDefinition[]; // All available shifts for matching preferences
  selectedDate?: string; // YYYY-MM-DD format for weekoff checking
  isReadOnly?: boolean;
  usersInOtherShifts?: Set<string>; // Users already assigned to other shifts on the same date
  allRostersForDate?: Roster[]; // All rosters for the selected date
}

// Role priority order for sorting
const ROLE_PRIORITY: Record<string, number> = {
  'Shift In Charge': 1,
  'Inventory Executive': 2,
  'Picker Packer (Warehouse)': 3,
  'Picker Packer (Ad-Hoc)': 4,
  'Store Manager': 99, // Show last
};

// Role color mapping for visual distinction
const getRoleColor = (roleName: string | undefined) => {
  if (!roleName) return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };
  
  const role = roleName.toLowerCase();
  if (role.includes('store manager') || role.includes('manager')) {
    return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' };
  }
  if (role.includes('shift in charge') || role.includes('charge')) {
    return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' };
  }
  if (role.includes('inventory executive') || role.includes('inventory')) {
    return { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-300' };
  }
  if (role.includes('picker packer') || role.includes('packer')) {
    if (role.includes('warehouse')) {
      return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' };
    }
    return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' };
  }
  return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };
};

// Sort roles by priority
const sortRoles = (roleNames: string[]): string[] => {
  return roleNames.sort((a, b) => {
    const priorityA = ROLE_PRIORITY[a] || 50;
    const priorityB = ROLE_PRIORITY[b] || 50;
    return priorityA - priorityB;
  });
};

// Roles that can be assigned to multiple tasks (Store Manager excluded from task assignment)
const MULTI_TASK_ROLES = ['Shift In Charge', 'Inventory Executive'];

// Check if a role allows multiple task assignments
const canAssignMultipleTasks = (roleName: string | undefined): boolean => {
  if (!roleName) return false;
  return MULTI_TASK_ROLES.some(role => roleName.includes(role));
};

// Get shift icon and colors based on shift name
const getShiftDisplayInfo = (shiftName: string) => {
  const lower = shiftName.toLowerCase();
  if (lower.includes('morning')) {
    return { icon: '🌅', color: 'border-yellow-200', bg: 'bg-yellow-50', text: 'text-yellow-700' };
  } else if (lower.includes('evening')) {
    return { icon: '🌙', color: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700' };
  } else if (lower.includes('night')) {
    return { icon: '🌙', color: 'border-indigo-200', bg: 'bg-indigo-50', text: 'text-indigo-700' };
  }
  return { icon: '⏰', color: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700' };
};

export default function TaskMemberSelector({
  taskId,
  taskName,
  availableUsers,
  assignedUserIds,
  allTaskAssignments,
  onAssign,
  onUnassign,
  currentShiftId,
  currentShiftName,
  currentShift,
  availableShifts = [],
  selectedDate,
  isReadOnly = false,
  usersInOtherShifts = new Set<string>(),
  allRostersForDate = []
}: TaskMemberSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false); // Toggle to show users from other shifts
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
    userId?: string;
    isWeekoff?: boolean;
    isOtherShift?: boolean;
    otherShiftName?: string;
  }>({
    isOpen: false,
    message: ''
  });

  // Find users already assigned to other tasks in this shift
  const usersAssignedToOtherTasks = useMemo(() => {
    const assignedUserSet = new Set<string>();
    allTaskAssignments.forEach(assignment => {
      // Skip the current task
      if (assignment.taskId !== taskId) {
        assignment.assignedUserIds.forEach(userId => {
          assignedUserSet.add(userId);
        });
      }
    });
    return assignedUserSet;
  }, [allTaskAssignments, taskId]);

  // Get shift name for users in other shifts (for display in confirmation)
  const getShiftNameForUser = (userId: string): string => {
    for (const roster of allRostersForDate) {
      const userSlot = roster.slots.find(slot => slot.userId === userId);
      if (userSlot) {
        return roster.shift?.name || (roster as any).shiftType || 'Unknown Shift';
      }
    }
    return 'Unknown Shift';
  };

  // Get day of week for weekoff check
  const dayOfWeek = selectedDate ? getDay(new Date(selectedDate)) : null;

  // Helper to find which shift group a user's preference matches
  const getShiftGroupForUser = (userPreference: string | null | undefined): string | null => {
    if (!userPreference || !availableShifts.length) return null;
    
    // First, try to find exact match
    const exactMatch = availableShifts.find(s => s.name === userPreference);
    if (exactMatch) return exactMatch.name;
    
    // Then try to find match using shiftNamesMatch
    const matchedShift = availableShifts.find(s => shiftNamesMatch(userPreference, s.name));
    if (matchedShift) return matchedShift.name;
    
    return null;
  };

  // Group users by shift preference, then by role
  const groupedUsers = useMemo(() => {
    // Create a map of shift name -> role -> users
    const shiftGroups = new Map<string, Record<string, (User & { role?: any })[]>>();
    const noPreference: Record<string, (User & { role?: any })[]> = {};

    availableUsers.forEach(user => {
      // Exclude inactive users
      if (!user.isActive) return;
      
      // Exclude Store Manager from task assignment
      const roleNameLower = (user.role?.name || '').toLowerCase();
      if (roleNameLower.includes('store manager')) return;
      
      // Skip if already assigned to this task
      if (assignedUserIds.includes(user.id)) return;

      // For regular users (not SI, IE), skip if already assigned to another task in this shift
      const roleName = user.role?.name || 'No Role';
      if (!canAssignMultipleTasks(roleName) && usersAssignedToOtherTasks.has(user.id)) {
        return; // Skip this user - they're already assigned to another task in this shift
      }

      // Filter out users assigned to other shifts (unless searching or showAllUsers is true)
      // Allow exceptions through search functionality
      const isInOtherShift = usersInOtherShifts.has(user.id);
      if (isInOtherShift && !showAllUsers && !searchTerm) {
        return; // Skip users in other shifts unless searching or explicitly showing all
      }

      // Note: We don't filter out weekoff staff - they can still be assigned but will be highlighted

      // Determine which shift group this user belongs to
      const userShiftGroup = getShiftGroupForUser(user.defaultShiftPreference);
      const targetGroup = userShiftGroup ? (() => {
        if (!shiftGroups.has(userShiftGroup)) {
          shiftGroups.set(userShiftGroup, {});
        }
        return shiftGroups.get(userShiftGroup)!;
      })() : noPreference;

      if (!targetGroup[roleName]) {
        targetGroup[roleName] = [];
      }
      targetGroup[roleName].push(user);
    });

    // Convert Map to object format for easier rendering, sorted with current shift first
    const shiftGroupsObj: Record<string, Record<string, (User & { role?: any })[]>> = {};
    const shiftEntries = Array.from(shiftGroups.entries());
    
    // Sort: current shift first, then alphabetically
    shiftEntries.sort((a, b) => {
      const [shiftNameA] = a;
      const [shiftNameB] = b;
      
      // If currentShiftName matches one, prioritize it
      if (currentShiftName) {
        const matchesA = shiftNamesMatch(shiftNameA, currentShiftName);
        const matchesB = shiftNamesMatch(shiftNameB, currentShiftName);
        
        if (matchesA && !matchesB) return -1; // A is current shift, put it first
        if (!matchesA && matchesB) return 1;  // B is current shift, put it first
      }
      
      // Otherwise sort alphabetically
      return shiftNameA.localeCompare(shiftNameB);
    });
    
    shiftEntries.forEach(([shiftName, roles]) => {
      shiftGroupsObj[shiftName] = roles;
    });

    return { shiftGroups: shiftGroupsObj, noPreference };
  }, [availableUsers, assignedUserIds, usersAssignedToOtherTasks, usersInOtherShifts, showAllUsers, searchTerm, availableShifts]);

  // Filter users by search term
  const filterUsers = (users: (User & { role?: any })[]) => {
    if (!searchTerm) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(user =>
      (user.firstName || '').toLowerCase().includes(term) ||
      (user.lastName || '').toLowerCase().includes(term) ||
      (user.employeeId || '').toLowerCase().includes(term) ||
      (user.role?.name || '').toLowerCase().includes(term)
    );
  };

  // Filter grouped users by role
  const filterGroupedUsers = (group: Record<string, (User & { role?: any })[]>) => {
    const filtered: Record<string, (User & { role?: any })[]>= {};
    Object.keys(group).forEach(roleName => {
      const filteredUsers = filterUsers(group[roleName]);
      if (filteredUsers.length > 0) {
        filtered[roleName] = filteredUsers;
      }
    });
    return filtered;
  };

  // Filter all shift groups
  const filteredShiftGroups = useMemo(() => {
    const filtered: Record<string, Record<string, (User & { role?: any })[]>> = {};
    Object.keys(groupedUsers.shiftGroups).forEach(shiftName => {
      const filteredGroup = filterGroupedUsers(groupedUsers.shiftGroups[shiftName]);
      if (Object.keys(filteredGroup).length > 0) {
        filtered[shiftName] = filteredGroup;
      }
    });
    return filtered;
  }, [groupedUsers.shiftGroups, searchTerm]);

  const filteredNoPreference = filterGroupedUsers(groupedUsers.noPreference);

  const assignedUsers = assignedUserIds
    .map(id => availableUsers.find(u => u.id === id))
    .filter(Boolean) as (User & { role?: any })[];

  const handleAssign = (userId: string) => {
    const user = availableUsers.find(u => u.id === userId);
    const isOnWeekoff = dayOfWeek !== null && user && (user.weekOffDays || []).includes(dayOfWeek);
    const isInOtherShift = usersInOtherShifts.has(userId);
    
    // Check for weekoff first
    if (isOnWeekoff) {
      setConfirmModal({
        isOpen: true,
        message: `${user?.firstName} ${user?.lastName} is scheduled for weekoff on this date. Do you still want to assign them to this task?`,
        title: 'Weekoff Warning',
        userId,
        isWeekoff: true,
        isOtherShift: false
      });
      return;
    }
    
    // Check if user is in another shift - require confirmation
    if (isInOtherShift) {
      const otherShiftName = getShiftNameForUser(userId);
      setConfirmModal({
        isOpen: true,
        message: `${user?.firstName} ${user?.lastName} is already assigned to the "${otherShiftName}" shift on this date.\n\nAssigning them to this shift means they will be working multiple shifts on the same day.\n\nDo you want to proceed?`,
        title: 'Multiple Shifts Warning',
        userId,
        isWeekoff: false,
        isOtherShift: true,
        otherShiftName
      });
      return;
    }
    
    // No confirmation needed - assign directly
    onAssign(taskId, userId);
  };

  const handleConfirmAssign = () => {
    if (confirmModal.userId) {
      onAssign(taskId, confirmModal.userId);
      setConfirmModal({ isOpen: false, message: '' });
    }
  };

  const handleUnassign = (userId: string) => {
    onUnassign(taskId, userId);
  };

  const handleClose = () => {
    setShowSelector(false);
    setSearchTerm('');
  };

  // Render role group
  const renderRoleGroup = (
    roleName: string,
    users: (User & { role?: any })[],
    shiftColor: string,
    shiftBg: string
  ) => {
    const roleColors = getRoleColor(roleName);
    const totalCount = users.length;

    return (
      <div key={roleName} className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-semibold ${roleColors.bg} ${roleColors.text} px-2 py-1 rounded border ${roleColors.border}`}>
            {roleName}
          </span>
          <span className="text-xs text-gray-500">({totalCount})</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {users.map(user => {
            const isOnWeekoff = dayOfWeek !== null && (user.weekOffDays || []).includes(dayOfWeek);
            const isInOtherShift = usersInOtherShifts.has(user.id);
            return (
              <button
                key={user.id}
                onClick={() => handleAssign(user.id)}
                className={`text-left px-3 py-2 border rounded hover:opacity-80 hover:shadow-sm transition-all ${
                  isOnWeekoff
                    ? `${shiftBg} border-amber-400 border-2 bg-amber-50`
                    : isInOtherShift
                    ? `${shiftBg} border-orange-400 border-2 bg-orange-50`
                    : `${shiftBg} border ${shiftColor}`
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.firstName || ''} {user.lastName || ''}
                      </p>
                      {isOnWeekoff && (
                        <span className="text-xs text-amber-600 font-semibold" title="On weekoff">
                          📅
                        </span>
                      )}
                      {isInOtherShift && (
                        <span className="text-xs text-orange-600 font-semibold" title={`Assigned to ${getShiftNameForUser(user.id)} shift`}>
                          ⚠️
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 truncate">
                      {user.employeeId || 'N/A'}
                      {user.experienceLevel && (
                        <span className="ml-2 px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                          {user.experienceLevel}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-lg ml-2 flex-shrink-0">+</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Render shift section
  const renderShiftSection = (
    title: string,
    icon: string,
    filteredGroup: Record<string, (User & { role?: any })[]>,
    shiftColor: string,
    shiftBg: string,
    shiftTextColor: string
  ) => {
    const roleNames = sortRoles(Object.keys(filteredGroup));
    if (roleNames.length === 0) return null;

    const totalCount = Object.values(filteredGroup).reduce((sum, users) => sum + users.length, 0);

    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-sm font-semibold ${shiftTextColor} ${shiftBg} px-3 py-1.5 rounded`}>
            {icon} {title}
          </span>
          <span className="text-xs text-gray-500">({totalCount} total)</span>
        </div>
        <div className="space-y-4 pl-3 border-l-2 border-gray-200">
          {roleNames.map(roleName => 
            renderRoleGroup(roleName, filteredGroup[roleName], shiftColor, shiftBg)
          )}
        </div>
      </div>
    );
  };

  // Check if user's preference matches current shift
  const userMatchesCurrentShift = (userPreference: string | null | undefined): boolean => {
    if (!currentShiftName || !userPreference) return false;
    return shiftNamesMatch(userPreference, currentShiftName);
  };

  return (
    <div className="space-y-3">
      {/* Assigned Staff Display */}
      {assignedUsers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">Assigned Staff ({assignedUsers.length}):</p>
          <div className="flex flex-wrap gap-2">
            {assignedUsers.map(user => {
              const isPreferredShift = userMatchesCurrentShift(user.defaultShiftPreference);
              const isOnWeekoff = dayOfWeek !== null && (user.weekOffDays || []).includes(dayOfWeek);
              
              const roleColors = getRoleColor(user.role?.name);
              
              return (
                <div
                  key={user.id}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border ${
                    isOnWeekoff
                      ? 'bg-amber-50 border-amber-400 border-2'
                      : isPreferredShift
                      ? 'bg-green-50 border-green-300'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <span className="text-sm font-medium text-gray-900">
                    {user.firstName || ''} {user.lastName || ''}
                  </span>
                  {isOnWeekoff && (
                    <span className="text-xs text-amber-600 font-semibold" title="On weekoff">
                      📅
                    </span>
                  )}
                  <span className="text-xs text-gray-600">
                    ({user.employeeId || 'N/A'})
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${roleColors.bg} ${roleColors.text}`}>
                    {user.role?.name || 'No role'}
                  </span>
                  {user.defaultShiftPreference && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                      {user.defaultShiftPreference}
                    </span>
                  )}
                  {!isReadOnly && (
                    <button
                      onClick={() => handleUnassign(user.id)}
                      className="text-red-600 hover:text-red-800 text-sm ml-1 font-bold"
                      title="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Staff Button / Selector */}
      {!isReadOnly && (
        <div>
          {!showSelector ? (
            <button
              onClick={() => setShowSelector(true)}
              className="w-full text-left px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm font-medium text-gray-700"
            >
              + Add Staff to {taskName}
            </button>
          ) : (
            <div className="border-2 border-blue-300 rounded-lg bg-white shadow-lg">
              {/* Header - Fixed */}
              <div className="flex justify-between items-center p-4 border-b bg-gray-50 rounded-t-lg">
                <div>
                  <h5 className="font-semibold text-gray-900">Select Staff for {taskName}</h5>
                  <p className="text-xs text-gray-500 mt-1">Click on staff members to assign them</p>
                </div>
                <button
                  onClick={handleClose}
                  className="text-gray-500 hover:text-gray-700 text-lg font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200"
                  title="Close"
                >
                  ×
                </button>
              </div>

              {/* Search Input - Fixed */}
              <div className="p-4 border-b bg-white space-y-2">
                <input
                  type="text"
                  placeholder="Search by name, ID, or role..."
                  value={searchTerm}
                  className="input-base text-gray-900 w-full text-sm"
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    // When searching, automatically show all users including those in other shifts
                    if (e.target.value.trim()) {
                      setShowAllUsers(true);
                    } else {
                      setShowAllUsers(false);
                    }
                  }}
                  autoFocus
                />
                {usersInOtherShifts.size > 0 && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`show-all-users-${taskId}`}
                      checked={showAllUsers}
                      onChange={(e) => setShowAllUsers(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label 
                      htmlFor={`show-all-users-${taskId}`}
                      className="text-xs text-gray-600 cursor-pointer"
                    >
                      Show staff assigned to other shifts ({usersInOtherShifts.size} available)
                    </label>
                  </div>
                )}
              </div>

              {/* Content - Scrollable */}
              <div className="p-4 max-h-[500px] overflow-y-auto">
                {/* Render each shift group - sorted with current shift first */}
                {(() => {
                  const shiftNames = Object.keys(filteredShiftGroups);
                  
                  // Sort: current shift first, then alphabetically
                  const sortedShiftNames = shiftNames.sort((a, b) => {
                    if (currentShiftName) {
                      const matchesA = shiftNamesMatch(a, currentShiftName);
                      const matchesB = shiftNamesMatch(b, currentShiftName);
                      
                      if (matchesA && !matchesB) return -1; // A is current shift, put it first
                      if (!matchesA && matchesB) return 1;  // B is current shift, put it first
                    }
                    
                    // Otherwise sort alphabetically
                    return a.localeCompare(b);
                  });
                  
                  return sortedShiftNames.map(shiftName => {
                    const displayInfo = getShiftDisplayInfo(shiftName);
                    const isCurrentShift = currentShiftName ? shiftNamesMatch(shiftName, currentShiftName) : false;
                    return renderShiftSection(
                      `${shiftName} Members${isCurrentShift ? ' (Current Shift)' : ''}`,
                      displayInfo.icon,
                      filteredShiftGroups[shiftName],
                      displayInfo.color,
                      displayInfo.bg,
                      displayInfo.text
                    );
                  });
                })()}

                {/* No Preference Members - Grouped by Role */}
                {renderShiftSection(
                  'No Shift Preference',
                  '⚪',
                  filteredNoPreference,
                  'border-gray-200',
                  'bg-gray-50',
                  'text-gray-700'
                )}

              {/* No Results */}
              {Object.keys(filteredShiftGroups).length === 0 && 
               Object.keys(filteredNoPreference).length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {searchTerm ? (
                    <div>
                      <p>No staff found matching your search</p>
                      {usersInOtherShifts.size > 0 && !showAllUsers && (
                        <p className="text-xs mt-2 text-orange-600">
                          Tip: Enable "Show staff assigned to other shifts" to see all staff
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p>All available staff are already assigned</p>
                      <p className="text-xs mt-1 text-gray-400">
                        Note: Regular staff can only be assigned to one task per shift. SI, IE, and SM can be assigned to multiple tasks.
                      </p>
                      {usersInOtherShifts.size > 0 && !showAllUsers && (
                        <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <p className="text-xs text-orange-800 font-medium">
                            {usersInOtherShifts.size} staff member{usersInOtherShifts.size !== 1 ? 's' : ''} {usersInOtherShifts.size !== 1 ? 'are' : 'is'} assigned to other shifts
                          </p>
                          <p className="text-xs text-orange-600 mt-1">
                            Enable "Show staff assigned to other shifts" above to see and assign them (requires confirmation)
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>

              {/* Footer - Fixed with Done Button */}
              <div className="flex justify-end items-center gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
                <span className="text-xs text-gray-500">
                  {assignedUserIds.length} staff assigned
                </span>
                <button
                  onClick={handleClose}
                  className="btn-primary text-sm px-4 py-2"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, message: '' })}
        onConfirm={handleConfirmAssign}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.isOtherShift ? 'warning' : confirmModal.isWeekoff ? 'warning' : 'info'}
        confirmText="Yes, Proceed"
        cancelText="Cancel"
      />
    </div>
  );
}
