'use client';

import { useState, useEffect, useMemo } from 'react';
import { Roster, RosterSlot, User, ShiftDefinition, AttendanceStatus } from '@/types';
import { authenticatedFetch } from '@/lib/api-client';
import { usePermissions } from '@/hooks/usePermissions';
import { format, parseISO, isToday, isPast } from 'date-fns';
import { Calendar, Clock, Users, CheckCircle2, AlertCircle, Search, Filter, CheckSquare, XCircle, X, ChevronDown, ChevronUp, Copy, RefreshCw, Timer } from 'lucide-react';
import ActualsRecordingModal from '@/components/ActualsRecordingModal';
import BulkActualsRecordingModal from '@/components/BulkActualsRecordingModal';
import ActualsSummary from '@/components/ActualsSummary';

type StatusFilter = 'all' | 'recorded' | 'not_recorded' | 'present' | 'absent' | 'late' | 'left_early' | 'substituted';

export default function ActualsPage() {
  const { currentUser, canModifyRoster } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [availableShifts, setAvailableShifts] = useState<ShiftDefinition[]>([]);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [availableUsers, setAvailableUsers] = useState<(User & { role?: any })[]>([]);
  const [availableTasks, setAvailableTasks] = useState<any[]>([]);
  const [showActualsModal, setShowActualsModal] = useState(false);
  const [selectedSlotForActuals, setSelectedSlotForActuals] = useState<RosterSlot | null>(null);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  
  // Enhanced UX state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'time'>('name');
  const [groupBy, setGroupBy] = useState<'role' | 'tasks' | 'none'>('role');

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedDate && selectedShiftId) {
      fetchRoster();
      setSelectedSlotIds(new Set()); // Clear selection when roster changes
    }
  }, [selectedDate, selectedShiftId]);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [shiftsRes, usersRes, tasksRes] = await Promise.all([
        authenticatedFetch('/api/shift-definitions?includeInactive=false'),
        authenticatedFetch('/api/users?page=0'),
        authenticatedFetch('/api/tasks')
      ]);

      const shiftsResult = await shiftsRes.json();
      if (shiftsResult.success) {
        const shifts = shiftsResult.data || [];
        setAvailableShifts(shifts);
        if (shifts.length > 0 && !selectedShiftId) {
          setSelectedShiftId(shifts[0].id);
        }
      }

      const usersResult = await usersRes.json();
      if (usersResult.success) {
        setAvailableUsers(usersResult.data.data || []);
      }

      const tasksResult = await tasksRes.json();
      if (tasksResult.success) {
        setAvailableTasks(tasksResult.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      console.error('Failed to fetch initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoster = async () => {
    if (!selectedShiftId) return;
    
    try {
      const response = await authenticatedFetch(`/api/rosters?date=${selectedDate}&shiftId=${selectedShiftId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success && result.data.length > 0) {
        setRoster(result.data[0]);
      } else {
        setRoster(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load roster');
      console.error('Failed to fetch roster:', err);
    }
  };

  const handleRecordActuals = (slot: RosterSlot) => {
    setSelectedSlotForActuals(slot);
    setShowActualsModal(true);
  };

  const handleActualsUpdated = async () => {
    await fetchRoster();
    setShowActualsModal(false);
    setSelectedSlotForActuals(null);
  };

  // Filter to show only published rosters
  const isRosterValid = roster && roster.status === 'published';
  const isRosterDateValid = useMemo(() => {
    if (!selectedDate) return false;
    const date = parseISO(selectedDate);
    return isToday(date) || isPast(date);
  }, [selectedDate]);

  // Role priority for sorting
  const ROLE_PRIORITY: Record<string, number> = {
    'Shift In Charge': 1,
    'Inventory Executive': 2,
    'Picker Packer (Warehouse)': 3,
    'Picker Packer (Ad-Hoc)': 4,
    'Store Manager': 5,
  };

  // Enhanced filtering and sorting
  const filteredAndSortedSlots = useMemo(() => {
    if (!roster || !isRosterValid) return [];

    let slots = [...roster.slots];

    // Apply status filter
    if (statusFilter !== 'all') {
      slots = slots.filter(slot => {
        const actuals = slot.actuals;
        switch (statusFilter) {
          case 'recorded':
            return actuals && (actuals.checkedInAt || actuals.attendanceStatus);
          case 'not_recorded':
            return !actuals || (!actuals.checkedInAt && !actuals.attendanceStatus);
          case 'present':
            return actuals?.attendanceStatus === AttendanceStatus.PRESENT;
          case 'absent':
            return actuals?.attendanceStatus === AttendanceStatus.ABSENT;
          case 'late':
            return actuals?.attendanceStatus === AttendanceStatus.LATE;
          case 'left_early':
            return actuals?.attendanceStatus === AttendanceStatus.LEFT_EARLY;
          case 'substituted':
            return actuals?.actualUserId && actuals.actualUserId !== slot.userId;
          default:
            return true;
        }
      });
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      slots = slots.filter(slot => {
        const user = slot.userId ? availableUsers.find(u => u.id === slot.userId) : null;
        if (!user) return false;
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        const employeeId = user.employeeId.toLowerCase();
        return fullName.includes(term) || employeeId.includes(term);
      });
    }

    // Apply sorting
    slots.sort((a, b) => {
      const userA = a.userId ? availableUsers.find(u => u.id === a.userId) : null;
      const userB = b.userId ? availableUsers.find(u => u.id === b.userId) : null;
      
      switch (sortBy) {
        case 'name':
          if (!userA && !userB) return 0;
          if (!userA) return 1;
          if (!userB) return -1;
          const nameA = `${userA.firstName} ${userA.lastName}`.toLowerCase();
          const nameB = `${userB.firstName} ${userB.lastName}`.toLowerCase();
          return nameA.localeCompare(nameB);
        case 'status':
          const statusA = a.actuals?.attendanceStatus || 'not_recorded';
          const statusB = b.actuals?.attendanceStatus || 'not_recorded';
          return statusA.localeCompare(statusB);
        case 'time':
          const timeA = a.actuals?.actualStartTime || a.startTime;
          const timeB = b.actuals?.actualStartTime || b.startTime;
          return timeA.localeCompare(timeB);
        default:
          return 0;
      }
    });

    return slots;
  }, [roster, isRosterValid, statusFilter, searchTerm, sortBy, availableUsers]);

  // Group slots by selected grouping option
  const groupedSlotsByRole = useMemo(() => {
    if (groupBy === 'none') {
      const map = new Map<string, RosterSlot[]>();
      map.set('All', filteredAndSortedSlots);
      return map;
    }

    if (groupBy === 'tasks') {
      const grouped = new Map<string, RosterSlot[]>();
      
      filteredAndSortedSlots.forEach(slot => {
        if (slot.assignedTasks && slot.assignedTasks.length > 0) {
          slot.assignedTasks.forEach(taskId => {
            const task = availableTasks.find(t => t.id === taskId);
            const taskName = task?.name || 'Unknown Task';
            
            if (!grouped.has(taskName)) {
              grouped.set(taskName, []);
            }
            const taskSlots = grouped.get(taskName)!;
            if (!taskSlots.find(s => s.id === slot.id)) {
              taskSlots.push(slot);
            }
          });
        } else {
          const noTasksGroup = 'No Tasks';
          if (!grouped.has(noTasksGroup)) {
            grouped.set(noTasksGroup, []);
          }
          grouped.get(noTasksGroup)!.push(slot);
        }
      });

      const sortedGroups = new Map<string, RosterSlot[]>();
      Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([taskName, slots]) => {
          sortedGroups.set(taskName, slots);
        });

      return sortedGroups;
    }

    // Group by role
    const grouped = new Map<string, RosterSlot[]>();
    
    filteredAndSortedSlots.forEach(slot => {
      const user = slot.userId ? availableUsers.find(u => u.id === slot.userId) : null;
      const roleName = user?.role?.name || 'No Role';
      
      if (!grouped.has(roleName)) {
        grouped.set(roleName, []);
      }
      grouped.get(roleName)!.push(slot);
    });

    const sortedGroups = new Map<string, RosterSlot[]>();
    Array.from(grouped.entries())
      .sort((a, b) => {
        const priorityA = ROLE_PRIORITY[a[0]] || 99;
        const priorityB = ROLE_PRIORITY[b[0]] || 99;
        return priorityA - priorityB;
      })
      .forEach(([roleName, slots]) => {
        sortedGroups.set(roleName, slots);
      });

    return sortedGroups;
  }, [filteredAndSortedSlots, groupBy, availableUsers, availableTasks]);

  // Calculate total filtered slots count
  const totalFilteredSlots = useMemo(() => {
    return filteredAndSortedSlots.length;
  }, [filteredAndSortedSlots]);

  // Quick actions handlers
  const handleSelectAll = () => {
    if (!roster) return;
    const allIds = new Set<string>();
    groupedSlotsByRole.forEach(slots => {
      slots.forEach(slot => allIds.add(slot.id));
    });
    setSelectedSlotIds(allIds);
  };

  const handleSelectByStatus = (status: StatusFilter) => {
    if (!roster || status === 'all') return;
    const filtered: RosterSlot[] = [];
    groupedSlotsByRole.forEach(slots => {
      filtered.push(...slots);
    });
    const statusFiltered = filtered.filter(slot => {
      const actuals = slot.actuals;
      switch (status) {
        case 'recorded':
          return actuals && (actuals.checkedInAt || actuals.attendanceStatus);
        case 'not_recorded':
          return !actuals || (!actuals.checkedInAt && !actuals.attendanceStatus);
        case 'present':
          return actuals?.attendanceStatus === AttendanceStatus.PRESENT;
        case 'absent':
          return actuals?.attendanceStatus === AttendanceStatus.ABSENT;
        case 'late':
          return actuals?.attendanceStatus === AttendanceStatus.LATE;
        case 'left_early':
          return actuals?.attendanceStatus === AttendanceStatus.LEFT_EARLY;
        case 'substituted':
          return actuals?.actualUserId && actuals.actualUserId !== slot.userId;
        default:
          return false;
      }
    });
    setSelectedSlotIds(new Set(statusFiltered.map(slot => slot.id)));
  };

  const handleBulkMarkPresent = async () => {
    if (!roster || selectedSlotIds.size === 0) return;
    
    try {
      const actualsRequests = Array.from(selectedSlotIds).map(slotId => ({
        slotId,
        attendanceStatus: AttendanceStatus.PRESENT
      }));

      const response = await authenticatedFetch(`/api/rosters/${roster.id}/actuals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actuals: actualsRequests })
      });

      const result = await response.json();
      if (result.success) {
        await fetchRoster();
        setSelectedSlotIds(new Set());
      } else {
        throw new Error(result.error?.message || 'Failed to mark as present');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to mark as present');
    }
  };

  const handleBulkCopyPlannedTimes = async () => {
    if (!roster || selectedSlotIds.size === 0) return;
    
    try {
      const actualsRequests = Array.from(selectedSlotIds).map(slotId => {
        const slot = roster.slots.find(s => s.id === slotId);
        if (!slot) return null;
        return {
          slotId,
          actualStartTime: slot.startTime,
          actualEndTime: slot.endTime
        };
      }).filter(Boolean) as any[];

      const response = await authenticatedFetch(`/api/rosters/${roster.id}/actuals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actuals: actualsRequests })
      });

      const result = await response.json();
      if (result.success) {
        await fetchRoster();
        setSelectedSlotIds(new Set());
      } else {
        throw new Error(result.error?.message || 'Failed to copy times');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to copy times');
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="loader-spinner loader-spinner-lg"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Left: Title and Date/Shift Selection */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
              <h1 className="text-2xl font-bold text-gray-900">Record Actuals</h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="bg-transparent border-none text-sm text-gray-900 focus:outline-none cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <select
                    value={selectedShiftId}
                    onChange={(e) => setSelectedShiftId(e.target.value)}
                    className="bg-transparent border-none text-sm text-gray-900 focus:outline-none cursor-pointer"
                  >
                    {availableShifts.length === 0 ? (
                      <option value="">No shifts</option>
                    ) : (
                      availableShifts.map(shift => (
                        <option key={shift.id} value={shift.id}>
                          {shift.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                {roster && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold border border-green-200">
                    Published
                  </span>
                )}
              </div>
            </div>

            {/* Right: Quick Actions Button */}
            {isRosterValid && canModifyRoster() && (
              <button
                onClick={() => setShowQuickActions(!showQuickActions)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
                  showQuickActions 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'bg-white text-blue-600 border-2 border-blue-200 hover:bg-blue-50'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
                Quick Actions
                {showQuickActions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Quick Actions Panel */}
        {showQuickActions && isRosterValid && canModifyRoster() && (
          <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-blue-600" />
                Quick Actions
              </h3>
              {selectedSlotIds.size > 0 && (
                <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-semibold">
                  {selectedSlotIds.size} selected
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSelectAll}
                className="px-4 py-2 text-sm font-medium bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
              >
                Select All ({totalFilteredSlots})
              </button>
              <button
                onClick={() => handleSelectByStatus('not_recorded')}
                className="px-4 py-2 text-sm font-medium bg-white border-2 border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 hover:border-orange-400 transition-all shadow-sm"
              >
                Select Not Recorded
              </button>
              {selectedSlotIds.size > 0 && (
                <>
                  <button
                    onClick={handleBulkMarkPresent}
                    className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-md flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark {selectedSlotIds.size} as Present
                  </button>
                  <button
                    onClick={handleBulkCopyPlannedTimes}
                    className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all shadow-md flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Planned Times
                  </button>
                  <button
                    onClick={() => setShowBulkModal(true)}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md"
                  >
                    Bulk Record ({selectedSlotIds.size})
                  </button>
                  <button
                    onClick={() => setSelectedSlotIds(new Set())}
                    className="px-4 py-2 text-sm font-medium bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-r-lg p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* No Roster / Not Published Messages */}
        {!roster && selectedDate && selectedShiftId && (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center shadow-sm">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Published Roster Found</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              There is no published roster for {format(parseISO(selectedDate), 'MMMM d, yyyy')} - {availableShifts.find(s => s.id === selectedShiftId)?.name || 'this shift'}.
            </p>
            <p className="text-sm text-gray-500 mt-3">Only published rosters can have actuals recorded.</p>
          </div>
        )}

        {roster && roster.status !== 'published' && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900 mb-1">Roster Not Published</h3>
                <p className="text-yellow-800 text-sm">
                  This roster is in "{roster.status}" status. Only published rosters can have actuals recorded.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actuals Summary */}
        {isRosterValid && (
          <div className="mb-6">
            <ActualsSummary 
              slots={roster.slots} 
              rosterDate={selectedDate}
              shiftName={availableShifts.find(s => s.id === selectedShiftId)?.name}
              tasks={availableTasks}
            />
          </div>
        )}

        {/* Filters Bar */}
        {isRosterValid && (
          <div className="mb-6 bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or employee ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="all">All Status</option>
                    <option value="recorded">Recorded</option>
                    <option value="not_recorded">Not Recorded</option>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                    <option value="left_early">Left Early</option>
                    <option value="substituted">Substituted</option>
                  </select>
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'name' | 'status' | 'time')}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                >
                  <option value="name">Sort by Name</option>
                  <option value="status">Sort by Status</option>
                  <option value="time">Sort by Time</option>
                </select>

                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <select
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as 'role' | 'tasks' | 'none')}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="role">Group by Role</option>
                    <option value="tasks">Group by Tasks</option>
                    <option value="none">No Grouping</option>
                  </select>
                </div>
              </div>

              {/* Results Count */}
              <div className="text-sm text-gray-600 font-medium">
                {totalFilteredSlots} of {roster.slots.length} shown
              </div>
            </div>
          </div>
        )}

        {/* Staff Slots */}
        {isRosterValid && (
          <div>
            {totalFilteredSlots === 0 ? (
              <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center shadow-sm">
                <Filter className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No slots match your filters</h3>
                <p className="text-gray-600 mb-4">Try adjusting your search or filter criteria</p>
                {(searchTerm || statusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                    }}
                    className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {Array.from(groupedSlotsByRole.entries()).map(([groupName, slots]) => {
                  // Check if all slots in this group are selected
                  const allSelected = slots.every(slot => selectedSlotIds.has(slot.id));
                  const someSelected = slots.some(slot => selectedSlotIds.has(slot.id));
                  
                  const handleSelectGroup = () => {
                    const newSet = new Set(selectedSlotIds);
                    if (allSelected) {
                      // Deselect all in this group
                      slots.forEach(slot => newSet.delete(slot.id));
                    } else {
                      // Select all in this group
                      slots.forEach(slot => newSet.add(slot.id));
                    }
                    setSelectedSlotIds(newSet);
                  };
                  
                  return (
                    <div key={groupName} className="space-y-4">
                      {/* Group Header */}
                      {groupBy !== 'none' && (
                        <div className="flex items-center justify-between pb-3 border-b-2 border-gray-200">
                          <h2 className="text-xl font-bold text-gray-900">{groupName}</h2>
                          <div className="flex items-center gap-3">
                            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                              {slots.length} slot{slots.length !== 1 ? 's' : ''}
                            </span>
                            {canModifyRoster() && (
                              <button
                                onClick={handleSelectGroup}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                                  allSelected
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : someSelected
                                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
                                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                                }`}
                                title={allSelected ? 'Deselect all in this group' : 'Select all in this group'}
                              >
                                <CheckSquare className="w-3.5 h-3.5" />
                                {allSelected ? 'All Selected' : someSelected ? `${slots.filter(s => selectedSlotIds.has(s.id)).length}/${slots.length}` : 'Select All'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                    {/* Slots Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {slots.map(slot => {
                        const slotUser = slot.userId ? availableUsers.find(u => u.id === slot.userId) : null;
                        const actualUser = slot.actuals && slot.actuals.actualUserId ? availableUsers.find(u => u.id === slot.actuals!.actualUserId) : null;
                        const displayUser = actualUser || slotUser;
                        const hasActuals = slot.actuals && (slot.actuals.checkedInAt || slot.actuals.attendanceStatus);
                        const isSelected = selectedSlotIds.has(slot.id);
                        
                        // Status-based styling
                        const getStatusStyles = () => {
                          if (!hasActuals) {
                            return {
                              border: 'border-2 border-gray-300',
                              bg: 'bg-white',
                              headerBg: 'bg-gray-50',
                              statusColor: 'text-gray-500',
                              statusBg: 'bg-gray-100'
                            };
                          }
                          
                          if (slot.actuals!.attendanceStatus === AttendanceStatus.ABSENT) {
                            return {
                              border: 'border-2 border-red-400',
                              bg: 'bg-red-50',
                              headerBg: 'bg-red-100',
                              statusColor: 'text-red-700',
                              statusBg: 'bg-red-200'
                            };
                          }
                          
                          if (slot.actuals!.attendanceStatus === AttendanceStatus.LATE || slot.actuals!.attendanceStatus === AttendanceStatus.LEFT_EARLY) {
                            return {
                              border: 'border-2 border-yellow-400',
                              bg: 'bg-yellow-50',
                              headerBg: 'bg-yellow-100',
                              statusColor: 'text-yellow-700',
                              statusBg: 'bg-yellow-200'
                            };
                          }
                          
                          if (slot.actuals!.actualUserId && slot.actuals!.actualUserId !== slot.userId) {
                            return {
                              border: 'border-2 border-blue-400',
                              bg: 'bg-blue-50',
                              headerBg: 'bg-blue-100',
                              statusColor: 'text-blue-700',
                              statusBg: 'bg-blue-200'
                            };
                          }
                          
                          if (slot.actuals!.attendanceStatus === AttendanceStatus.PRESENT) {
                            return {
                              border: 'border-2 border-green-400',
                              bg: 'bg-green-50',
                              headerBg: 'bg-green-100',
                              statusColor: 'text-green-700',
                              statusBg: 'bg-green-200'
                            };
                          }
                          
                          return {
                            border: 'border-2 border-gray-300',
                            bg: 'bg-white',
                            headerBg: 'bg-gray-50',
                            statusColor: 'text-gray-500',
                            statusBg: 'bg-gray-100'
                          };
                        };

                        const styles = getStatusStyles();

                        return (
                          <div
                            key={slot.id}
                            className={`rounded-xl shadow-sm transition-all cursor-pointer ${styles.bg} ${styles.border} ${
                              isSelected ? 'ring-4 ring-blue-500 ring-offset-2 shadow-lg scale-[1.02]' : 'hover:shadow-md'
                            }`}
                            onClick={() => {
                              if (canModifyRoster()) {
                                const newSet = new Set(selectedSlotIds);
                                if (newSet.has(slot.id)) {
                                  newSet.delete(slot.id);
                                } else {
                                  newSet.add(slot.id);
                                }
                                setSelectedSlotIds(newSet);
                              }
                            }}
                          >
                            {/* Header */}
                            <div className={`${styles.headerBg} px-4 py-3 rounded-t-xl border-b ${styles.border.replace('border-2', 'border')}`}>
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  {canModifyRoster() && (
                                    <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          const newSet = new Set(selectedSlotIds);
                                          if (e.target.checked) {
                                            newSet.add(slot.id);
                                          } else {
                                            newSet.delete(slot.id);
                                          }
                                          setSelectedSlotIds(newSet);
                                        }}
                                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                      />
                                    </div>
                                  )}
                                  {displayUser ? (
                                    <>
                                      <h3 className="font-bold text-gray-900 text-lg truncate">
                                        {displayUser.firstName} {displayUser.lastName}
                                      </h3>
                                      <p className="text-xs text-gray-600 mt-0.5">{displayUser.employeeId}</p>
                                      <p className="text-xs text-gray-500 mt-1">{displayUser.role?.name || 'No role'}</p>
                                    </>
                                  ) : (
                                    <div>
                                      <h3 className="font-bold text-gray-500">Vacant Slot</h3>
                                      <p className="text-xs text-gray-400">No staff assigned</p>
                                    </div>
                                  )}
                                </div>
                                {hasActuals && (
                                  <div className={`w-3 h-3 rounded-full ${styles.statusBg} ml-2 flex-shrink-0 mt-1`} />
                                )}
                              </div>
                            </div>

                            {/* Body */}
                            {displayUser && (
                              <div className="p-4 space-y-3">
                                {/* Times */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 font-medium">Planned:</span>
                                    <span className="text-gray-700 font-semibold">{slot.startTime} - {slot.endTime}</span>
                                  </div>
                                  {hasActuals && slot.actuals!.actualStartTime && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-gray-500 font-medium">Actual:</span>
                                      <span className={`font-semibold ${slot.actuals!.actualStartTime !== slot.startTime ? 'text-orange-600' : 'text-gray-700'}`}>
                                        {slot.actuals!.actualStartTime} - {slot.actuals!.actualEndTime || slot.endTime}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Attendance Status */}
                                {slot.actuals?.attendanceStatus && (
                                  <div>
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ${styles.statusBg} ${styles.statusColor}`}>
                                      {slot.actuals.attendanceStatus === AttendanceStatus.PRESENT && <CheckCircle2 className="w-3.5 h-3.5" />}
                                      {slot.actuals.attendanceStatus === AttendanceStatus.ABSENT && <XCircle className="w-3.5 h-3.5" />}
                                      {slot.actuals.attendanceStatus === AttendanceStatus.LATE && <Timer className="w-3.5 h-3.5" />}
                                      {slot.actuals.attendanceStatus.charAt(0).toUpperCase() + slot.actuals.attendanceStatus.slice(1).replace('_', ' ')}
                                    </span>
                                  </div>
                                )}

                                {/* Check-in/Check-out */}
                                {(slot.actuals?.checkedInAt || slot.actuals?.checkedOutAt) && (
                                  <div className="space-y-1 text-xs">
                                    {slot.actuals?.checkedInAt && (
                                      <div className="flex items-center gap-1.5 text-green-600">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>In: {format(new Date(slot.actuals.checkedInAt), 'HH:mm')}</span>
                                      </div>
                                    )}
                                    {slot.actuals?.checkedOutAt && (
                                      <div className="flex items-center gap-1.5 text-gray-600">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>Out: {format(new Date(slot.actuals.checkedOutAt), 'HH:mm')}</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Substitution */}
                                {slot.actuals?.actualUserId && slot.actuals.actualUserId !== slot.userId && (
                                  <div className="text-xs text-blue-600 font-medium">
                                    Sub: {actualUser?.firstName} {actualUser?.lastName}
                                  </div>
                                )}

                                {/* Tasks */}
                                {slot.assignedTasks.length > 0 && (
                                  <div className="pt-2 border-t border-gray-200">
                                    <div className="flex flex-wrap gap-1.5">
                                      {slot.assignedTasks.slice(0, 2).map(taskId => {
                                        const task = availableTasks.find(t => t.id === taskId);
                                        return task ? (
                                          <span key={taskId} className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-md">
                                            {task.name}
                                          </span>
                                        ) : null;
                                      })}
                                      {slot.assignedTasks.length > 2 && (
                                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-md">
                                          +{slot.assignedTasks.length - 2}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Action Button */}
                                {canModifyRoster() && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRecordActuals(slot);
                                    }}
                                    className="w-full mt-2 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                  >
                                    {hasActuals ? 'Edit Actuals' : 'Record Actuals'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Individual Actuals Recording Modal */}
      {selectedSlotForActuals && roster && (
        <ActualsRecordingModal
          isOpen={showActualsModal}
          onClose={() => {
            setShowActualsModal(false);
            setSelectedSlotForActuals(null);
          }}
          slot={selectedSlotForActuals}
          rosterId={roster.id}
          availableUsers={availableUsers}
          availableTasks={availableTasks}
          onUpdate={handleActualsUpdated}
        />
      )}

      {/* Bulk Actuals Recording Modal */}
      {showBulkModal && roster && selectedSlotIds.size > 0 && (
        <BulkActualsRecordingModal
          isOpen={showBulkModal}
          onClose={() => {
            setShowBulkModal(false);
            setSelectedSlotIds(new Set());
          }}
          slots={roster.slots.filter(slot => selectedSlotIds.has(slot.id))}
          rosterId={roster.id}
          availableUsers={availableUsers}
          availableTasks={availableTasks}
          onUpdate={() => {
            handleActualsUpdated();
            setSelectedSlotIds(new Set());
          }}
        />
      )}
    </div>
  );
}
