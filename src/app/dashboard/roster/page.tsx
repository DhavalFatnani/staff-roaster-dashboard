'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Roster, RosterSlot, User, Task, ShiftDefinition, CoverageMetrics, ShiftType } from '@/types';
import CoverageMeter from '@/components/CoverageMeter';
import TaskMemberSelector from '@/components/TaskMemberSelector';
import StaffAvailabilityTracker from '@/components/StaffAvailabilityTracker';
import { format, parseISO } from 'date-fns';
import { AlertCircle } from 'lucide-react';

interface TaskAssignment {
  taskId: string;
  taskName: string;
  category: string;
  assignedUserIds: string[];
}

export default function RosterBuilderPage() {
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(
    searchParams?.get('date') || new Date().toISOString().split('T')[0]
  );
  const [selectedShift, setSelectedShift] = useState<ShiftType>(
    (searchParams?.get('shift') as ShiftType) || ShiftType.MORNING
  );
  const [roster, setRoster] = useState<Roster | null>(null);
  const [availableUsers, setAvailableUsers] = useState<(User & { role?: any })[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [shiftDefinition, setShiftDefinition] = useState<ShiftDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const rosterRef = useRef<Roster | null>(null);

  // Fetch data only when date/shift changes (not on every render)
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      fetchAllData();
    } else {
      // Debounce date/shift changes
      const timer = setTimeout(() => {
        fetchAllData();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedDate, selectedShift]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchRoster(),
        fetchUsers(),
        fetchTasks(),
        fetchShiftDefinition()
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoster = async () => {
    try {
      const response = await fetch(`/api/rosters?date=${selectedDate}&shiftType=${selectedShift}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success && result.data.length > 0) {
        const fetchedRoster = result.data[0];
        setRoster(fetchedRoster);
        rosterRef.current = fetchedRoster;
      } else {
        // Create empty roster structure
        const newRoster: Roster = {
          id: '',
          storeId: '',
          date: selectedDate,
          shiftType: selectedShift,
          slots: [],
          coverage: {
            totalSlots: 0,
            filledSlots: 0,
            vacantSlots: 0,
            coveragePercentage: 0,
            minRequiredStaff: 3,
            actualStaff: 0,
            warnings: []
          },
          status: 'draft',
          createdAt: new Date(),
          createdBy: '',
          updatedAt: new Date()
        };
        setRoster(newRoster);
        rosterRef.current = newRoster;
      }
    } catch (err: any) {
      console.error('Failed to fetch roster:', err);
      throw err;
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users?page=0');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        const activeUsers = result.data.data.filter((u: User) => u.isActive && !u.deletedAt);
        setAvailableUsers(activeUsers);
      }
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
      throw err;
    }
  };

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        setAvailableTasks(result.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch tasks:', err);
      throw err;
    }
  };

  const fetchShiftDefinition = async () => {
    try {
      const response = await fetch('/api/shift-definitions');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        const shift = result.data.find((s: ShiftDefinition) => s.shiftType === selectedShift);
        if (shift) {
          setShiftDefinition(shift);
        } else {
          // Default shift times
          setShiftDefinition({
            id: '',
            storeId: '',
            shiftType: selectedShift,
            startTime: selectedShift === ShiftType.MORNING ? '08:00' : '17:00',
            endTime: selectedShift === ShiftType.MORNING ? '17:00' : '02:00',
            durationHours: 9,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch shift definition:', err);
      // Default shift times
      setShiftDefinition({
        id: '',
        storeId: '',
        shiftType: selectedShift,
        startTime: selectedShift === ShiftType.MORNING ? '08:00' : '17:00',
        endTime: selectedShift === ShiftType.MORNING ? '17:00' : '02:00',
        durationHours: 9,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  };

  const calculateCoverage = useCallback((slots: RosterSlot[]): CoverageMetrics => {
    const filledSlots = slots.filter(s => s.userId).length;
    const vacantSlots = slots.filter(s => !s.userId).length;
    
    // Calculate total available staff for this shift (those with matching default preference, excluding Store Manager)
    const totalAvailableStaff = availableUsers.filter(user => {
      // Exclude Store Manager from count
      const roleName = (user.role?.name || '').toLowerCase();
      if (roleName.includes('store manager')) return false;
      if (!user.defaultShiftPreference) return false;
      return user.defaultShiftPreference === selectedShift;
    }).length;

    // Calculate coverage based on engaged staff vs available staff
    const coveragePercentage = totalAvailableStaff > 0 
      ? (filledSlots / totalAvailableStaff) * 100 
      : 0;
    
    const warnings: string[] = [];

    return {
      totalSlots: slots.length,
      filledSlots,
      vacantSlots,
      coveragePercentage,
      minRequiredStaff: totalAvailableStaff, // Use total available as the "target"
      actualStaff: filledSlots,
      warnings
    };
  }, [availableUsers, selectedShift]);

  // Convert roster slots to task-based assignments
  const getTaskAssignments = useCallback((): TaskAssignment[] => {
    if (!roster || !availableTasks.length) return [];

    const taskMap = new Map<string, TaskAssignment>();
    
    // Initialize all tasks
    availableTasks.forEach(task => {
      if (!taskMap.has(task.id)) {
        taskMap.set(task.id, {
          taskId: task.id,
          taskName: task.name,
          category: task.category,
          assignedUserIds: []
        });
      }
    });

    // Populate assigned users from slots
    roster.slots.forEach(slot => {
      if (slot.userId) {
        // If slot has assigned tasks, add user to those tasks
        if (slot.assignedTasks && slot.assignedTasks.length > 0) {
          slot.assignedTasks.forEach(taskId => {
            const assignment = taskMap.get(taskId);
            if (assignment && !assignment.assignedUserIds.includes(slot.userId)) {
              assignment.assignedUserIds.push(slot.userId);
            }
          });
        }
        // If slot has no tasks but has a user, we should still show the user exists
        // (This handles legacy data or slots created without tasks)
      }
    });

    return Array.from(taskMap.values());
  }, [roster, availableTasks]);

  // Convert task assignments back to roster slots
  // Each user gets one slot with all their assigned tasks
  const taskAssignmentsToSlots = useCallback((assignments: TaskAssignment[]): RosterSlot[] => {
    if (!shiftDefinition || !roster) return [];

    const userTaskMap = new Map<string, string[]>(); // userId -> taskIds
    const existingSlotMap = new Map<string, RosterSlot>(); // userId -> existing slot

    // Preserve existing slot IDs and notes
    roster.slots.forEach(slot => {
      if (slot.userId) {
        existingSlotMap.set(slot.userId, slot);
      }
    });

    // Build task assignments per user
    assignments.forEach(assignment => {
      assignment.assignedUserIds.forEach(userId => {
        if (!userTaskMap.has(userId)) {
          userTaskMap.set(userId, []);
        }
        userTaskMap.get(userId)!.push(assignment.taskId);
      });
    });

    const slots: RosterSlot[] = [];
    userTaskMap.forEach((taskIds, userId) => {
      const existingSlot = existingSlotMap.get(userId);
      slots.push({
        id: existingSlot?.id || `slot-${userId}-${Date.now()}`,
        rosterId: roster.id || '',
        userId,
        shiftType: selectedShift,
        date: selectedDate,
        assignedTasks: taskIds,
        startTime: shiftDefinition.startTime,
        endTime: shiftDefinition.endTime,
        status: existingSlot?.status || 'draft',
        notes: existingSlot?.notes
      });
    });

    return slots;
  }, [roster, shiftDefinition, selectedShift, selectedDate]);

  const saveRoster = useCallback(async (rosterToSave: Roster, showAlert = false) => {
    if (saving) return false; // Prevent concurrent saves
    
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/rosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rosterToSave,
          coverage: calculateCoverage(rosterToSave.slots),
          // Recalculate coverage on save to ensure it's up to date
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        const savedRoster = result.data;
        setRoster(savedRoster);
        rosterRef.current = savedRoster;
        if (showAlert) {
          alert('Roster saved successfully!');
        }
        return true;
      } else {
        throw new Error(result.error?.message || 'Failed to save roster');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to save roster';
      setError(errorMsg);
      console.error('Failed to save roster:', err);
      if (showAlert) {
        alert(errorMsg);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [saving]);

  // Auto-save with debounce
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      if (roster && roster.slots.length > 0 && !saving) {
        saveRoster(roster, false);
      }
    }, 3000); // Auto-save after 3 seconds of inactivity
  }, [roster, saveRoster, saving]);

  const handleAssignUserToTask = useCallback((taskId: string, userId: string) => {
    if (!roster || !shiftDefinition) return;

    // Use functional update to ensure we have the latest roster state
    setRoster(prevRoster => {
      if (!prevRoster) return prevRoster;

      // Get current task assignments from the latest roster state
      const taskMap = new Map<string, TaskAssignment>();
      
      // Initialize all tasks
      availableTasks.forEach(task => {
        if (!taskMap.has(task.id)) {
          taskMap.set(task.id, {
            taskId: task.id,
            taskName: task.name,
            category: task.category,
            assignedUserIds: []
          });
        }
      });

      // Populate assigned users from slots
      prevRoster.slots.forEach(slot => {
        if (slot.userId) {
          slot.assignedTasks.forEach(taskId => {
            const assignment = taskMap.get(taskId);
            if (assignment && !assignment.assignedUserIds.includes(slot.userId)) {
              assignment.assignedUserIds.push(slot.userId);
            }
          });
        }
      });

      // Add the new assignment
      const assignment = taskMap.get(taskId);
      if (assignment && !assignment.assignedUserIds.includes(userId)) {
        assignment.assignedUserIds.push(userId);
      }

      // Convert to slots
      const assignments = Array.from(taskMap.values());
      const userTaskMap = new Map<string, string[]>();
      const existingSlotMap = new Map<string, RosterSlot>();

      // Preserve existing slot IDs and notes
      prevRoster.slots.forEach(slot => {
        if (slot.userId) {
          existingSlotMap.set(slot.userId, slot);
        }
      });

      // Build task assignments per user
      assignments.forEach(assignment => {
        assignment.assignedUserIds.forEach(userId => {
          if (!userTaskMap.has(userId)) {
            userTaskMap.set(userId, []);
          }
          userTaskMap.get(userId)!.push(assignment.taskId);
        });
      });

      const newSlots: RosterSlot[] = [];
      userTaskMap.forEach((taskIds, userId) => {
        const existingSlot = existingSlotMap.get(userId);
        newSlots.push({
          id: existingSlot?.id || `slot-${userId}-${Date.now()}`,
          rosterId: prevRoster.id || '',
          userId,
          shiftType: selectedShift,
          date: selectedDate,
          assignedTasks: taskIds,
          startTime: shiftDefinition.startTime,
          endTime: shiftDefinition.endTime,
          status: existingSlot?.status || 'draft',
          notes: existingSlot?.notes
        });
      });

      const updatedRoster = {
        ...prevRoster,
        slots: newSlots,
        coverage: calculateCoverage(newSlots)
      };

      // Schedule auto-save with the updated roster
      setTimeout(() => {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setTimeout(() => {
          saveRoster(updatedRoster, false);
        }, 3000);
      }, 0);

      return updatedRoster;
    });
  }, [roster, shiftDefinition, availableTasks, selectedShift, selectedDate, saveRoster, calculateCoverage]);

  const handleUnassignUserFromTask = useCallback((taskId: string, userId: string) => {
    if (!roster || !shiftDefinition) return;

    // Use functional update to ensure we have the latest roster state
    setRoster(prevRoster => {
      if (!prevRoster) return prevRoster;

      // Get current task assignments from the latest roster state
      const taskMap = new Map<string, TaskAssignment>();
      
      // Initialize all tasks
      availableTasks.forEach(task => {
        if (!taskMap.has(task.id)) {
          taskMap.set(task.id, {
            taskId: task.id,
            taskName: task.name,
            category: task.category,
            assignedUserIds: []
          });
        }
      });

      // Populate assigned users from slots
      prevRoster.slots.forEach(slot => {
        if (slot.userId) {
          slot.assignedTasks.forEach(taskId => {
            const assignment = taskMap.get(taskId);
            if (assignment && !assignment.assignedUserIds.includes(slot.userId)) {
              assignment.assignedUserIds.push(slot.userId);
            }
          });
        }
      });

      // Remove the assignment
      const assignment = taskMap.get(taskId);
      if (assignment) {
        assignment.assignedUserIds = assignment.assignedUserIds.filter(id => id !== userId);
      }

      // Convert to slots
      const assignments = Array.from(taskMap.values());
      const userTaskMap = new Map<string, string[]>();
      const existingSlotMap = new Map<string, RosterSlot>();

      // Preserve existing slot IDs and notes
      prevRoster.slots.forEach(slot => {
        if (slot.userId) {
          existingSlotMap.set(slot.userId, slot);
        }
      });

      // Build task assignments per user
      assignments.forEach(assignment => {
        assignment.assignedUserIds.forEach(userId => {
          if (!userTaskMap.has(userId)) {
            userTaskMap.set(userId, []);
          }
          userTaskMap.get(userId)!.push(assignment.taskId);
        });
      });

      const newSlots: RosterSlot[] = [];
      userTaskMap.forEach((taskIds, userId) => {
        const existingSlot = existingSlotMap.get(userId);
        newSlots.push({
          id: existingSlot?.id || `slot-${userId}-${Date.now()}`,
          rosterId: prevRoster.id || '',
          userId,
          shiftType: selectedShift,
          date: selectedDate,
          assignedTasks: taskIds,
          startTime: shiftDefinition.startTime,
          endTime: shiftDefinition.endTime,
          status: existingSlot?.status || 'draft',
          notes: existingSlot?.notes
        });
      });

      const updatedRoster = {
        ...prevRoster,
        slots: newSlots,
        coverage: calculateCoverage(newSlots)
      };

      // Schedule auto-save with the updated roster
      setTimeout(() => {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setTimeout(() => {
          saveRoster(updatedRoster, false);
        }, 3000);
      }, 0);

      return updatedRoster;
    });
  }, [roster, shiftDefinition, availableTasks, selectedShift, selectedDate, saveRoster, calculateCoverage]);

  const handlePublish = async () => {
    if (!roster) return;

    if (roster.coverage.filledSlots === 0) {
      alert('Cannot publish: No staff assigned to this shift.');
      return;
    }

    if (!roster.id) {
      const saved = await saveRoster(roster, false);
      if (!saved) {
        alert('Failed to save roster before publishing');
        return;
      }
      // Fetch updated roster with ID
      await fetchRoster();
      return;
    }

    try {
      const response = await fetch(`/api/rosters/${roster.id}/publish`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        alert('Roster published successfully!');
        await fetchRoster();
      } else {
        throw new Error(result.error?.message || 'Failed to publish roster');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to publish roster';
      setError(errorMsg);
      alert(errorMsg);
      console.error('Failed to publish roster:', err);
    }
  };

  const handleManualSave = async () => {
    if (roster) {
      await saveRoster(roster, true);
    }
  };

  // Get all tasks (no categorization)
  const allTasks = availableTasks;
  const taskAssignments = getTaskAssignments();

  // Find users assigned to slots but with no tasks (for debugging/display)
  const usersWithoutTasks = useMemo(() => {
    if (!roster) return [];
    return roster.slots
      .filter(slot => slot.userId && (!slot.assignedTasks || slot.assignedTasks.length === 0))
      .map(slot => {
        const user = availableUsers.find(u => u.id === slot.userId);
        return user ? { user, slot } : null;
      })
      .filter(Boolean) as Array<{ user: User & { role?: any }, slot: RosterSlot }>;
  }, [roster, availableUsers]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (error && !roster) {
    return (
      <div className="p-8">
        <div className="card bg-red-50 border-red-200">
          <h2 className="text-red-800 font-semibold mb-2">Error Loading Data</h2>
          <p className="text-red-600">{error}</p>
          <button onClick={fetchAllData} className="btn-primary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!roster || !shiftDefinition) {
    return (
      <div className="p-8">
        <div className="text-center">Loading roster data...</div>
      </div>
    );
  }

  const dateFormatted = format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy');

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Roster Builder</h1>
        <div className="flex gap-3 items-center">
          {error && (
            <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded">
              {error}
            </span>
          )}
          {saving && <span className="text-sm text-gray-500">Saving...</span>}
          <button
            onClick={handleManualSave}
            className="btn-secondary"
            disabled={saving}
          >
            Save
          </button>
          <button
            onClick={handlePublish}
            disabled={roster.status === 'published' || saving}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {roster.status === 'published' ? 'Published' : 'Publish Roster'}
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4 items-center flex-wrap">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="input-base w-48 text-gray-900"
        />
        <select
          value={selectedShift}
          onChange={(e) => setSelectedShift(e.target.value as ShiftType)}
          className="input-base w-48 text-gray-900"
        >
          <option value={ShiftType.MORNING}>Morning Shift</option>
          <option value={ShiftType.EVENING}>Evening Shift</option>
        </select>
        <div className="text-gray-600">
          {dateFormatted} - {selectedShift === ShiftType.MORNING ? 'Morning' : 'Evening'} Shift ({shiftDefinition.startTime} - {shiftDefinition.endTime})
        </div>
        {roster.status === 'published' && (
          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
            Published
          </span>
        )}
      </div>

      {/* Main Content Layout with Sidebar */}
      <div className="flex gap-6 items-start">
        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          {/* Coverage Metrics at Top */}
          <div className="mb-6">
            <CoverageMeter 
              coverage={roster.coverage} 
              totalAvailableStaff={availableUsers.filter(user => {
                // Exclude Store Manager from count
                const roleName = (user.role?.name || '').toLowerCase();
                if (roleName.includes('store manager')) return false;
                if (!user.defaultShiftPreference) return false;
                return user.defaultShiftPreference === selectedShift;
              }).length}
              engagedStaff={new Set(roster.slots.filter(s => s.userId).map(s => s.userId)).size}
              shiftType={selectedShift}
            />
          </div>

          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Task Assignment</h2>

            {/* Warning for users assigned but with no tasks */}
            {usersWithoutTasks.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200/60 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-amber-800">
                  {usersWithoutTasks.length} staff need task assignment
                </span>
              </div>
            )}

            {allTasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No tasks available. Please create tasks first.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allTasks.map(task => {
                  const assignment = taskAssignments.find(a => a.taskId === task.id);
                  const assignedUserIds = assignment?.assignedUserIds || [];

                  return (
                    <div key={task.id} className="bg-white rounded p-3 border">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{task.name}</h4>
                        <span className="text-xs text-gray-500">
                          {assignedUserIds.length}
                        </span>
                      </div>

                      {/* Improved Staff Selection Component */}
                      <TaskMemberSelector
                        taskId={task.id}
                        taskName={task.name}
                        availableUsers={availableUsers}
                        assignedUserIds={assignedUserIds}
                        allTaskAssignments={taskAssignments}
                        onAssign={handleAssignUserToTask}
                        onUnassign={handleUnassignUserFromTask}
                        currentShift={selectedShift}
                        isReadOnly={roster.status === 'published'}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Sidebar - Staff Availability Tracker */}
        <StaffAvailabilityTracker
          availableUsers={availableUsers}
          allTaskAssignments={taskAssignments}
          currentShift={selectedShift}
        />
      </div>
    </div>
  );
}
