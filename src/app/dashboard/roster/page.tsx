'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Roster, RosterSlot, User, Task, ShiftDefinition, CoverageMetrics } from '@/types';
import CoverageMeter from '@/components/CoverageMeter';
import TaskMemberSelector from '@/components/TaskMemberSelector';
import StaffAvailabilityTracker from '@/components/StaffAvailabilityTracker';
import ActualsRecordingModal from '@/components/ActualsRecordingModal';
import ActualsSummary from '@/components/ActualsSummary';
import CheckInOutButton from '@/components/CheckInOutButton';
import { usePermissions } from '@/hooks/usePermissions';
import { format, parseISO, getDay } from 'date-fns';
import { AlertCircle, CalendarOff, Eye, EyeOff, GitCompare } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import Modal, { ConfirmModal } from '@/components/Modal';
import { shiftNamesMatch } from '@/utils/validators';

interface TaskAssignment {
  taskId: string;
  taskName: string;
  category: string;
  assignedUserIds: string[];
}

type ViewMode = 'planned' | 'actuals' | 'compare';

export default function RosterBuilderPage() {
  const { canPublishRoster, canModifyRoster, canCreateRoster, currentUser } = usePermissions();
  const searchParams = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(
    searchParams?.get('date') || new Date().toISOString().split('T')[0]
  );
  const [availableShifts, setAvailableShifts] = useState<ShiftDefinition[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>(
    searchParams?.get('shiftId') || ''
  );
  const [roster, setRoster] = useState<Roster | null>(null);
  const [availableUsers, setAvailableUsers] = useState<(User & { role?: any })[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [shiftDefinition, setShiftDefinition] = useState<ShiftDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allRostersForDate, setAllRostersForDate] = useState<Roster[]>([]); // All rosters for selected date
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' }>({ isOpen: false, message: '' });
  const [viewMode, setViewMode] = useState<ViewMode>('planned');
  const [showActualsModal, setShowActualsModal] = useState(false);
  const [selectedSlotForActuals, setSelectedSlotForActuals] = useState<RosterSlot | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const rosterRef = useRef<Roster | null>(null);
  
  // Check if user can edit this roster
  const canEdit = useMemo(() => {
    if (!roster) return canCreateRoster();
    return canModifyRoster();
  }, [roster, canModifyRoster, canCreateRoster]);

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
  }, [selectedDate, selectedShiftId]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch shifts first (needed to determine default shiftId)
      const shiftsResult = await fetchShifts();
      
      // Use the fetched shifts directly instead of stale state
      let currentShiftId = selectedShiftId;
      if (!currentShiftId && shiftsResult && shiftsResult.length > 0) {
        currentShiftId = shiftsResult[0].id;
        setSelectedShiftId(currentShiftId);
      }
      
      // Fetch users and tasks in parallel (independent of shiftId)
      // Fetch shift definition and all rosters in parallel with users/tasks
      // (they depend on shiftId but can run concurrently with users/tasks)
      const fetchPromises: Promise<any>[] = [
        fetchUsers(),
        fetchTasks()
      ];
      
      if (currentShiftId) {
        // These can run in parallel with users/tasks once we have the shiftId
        fetchPromises.push(
          fetchShiftDefinition(currentShiftId),
          fetchAllRostersForDate()
        );
      }
      
      await Promise.all(fetchPromises);
      
      // Fetch roster last (depends on shift definition and all rosters for proper coverage calculation)
      if (currentShiftId) {
        await fetchRoster(currentShiftId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchShifts = async (): Promise<ShiftDefinition[]> => {
    try {
      const response = await authenticatedFetch('/api/shift-definitions?includeInactive=false');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        const shifts = result.data || [];
        setAvailableShifts(shifts);
        return shifts;
      }
      return [];
    } catch (err: any) {
      console.error('Failed to fetch shifts:', err);
      throw err;
    }
  };

  const fetchRoster = async (shiftId?: string) => {
    const shiftIdToUse = shiftId || selectedShiftId;
    if (!shiftIdToUse) return;
    try {
      const response = await authenticatedFetch(`/api/rosters?date=${selectedDate}&shiftId=${shiftIdToUse}`);
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
          shiftId: shiftIdToUse,
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
      const response = await authenticatedFetch('/api/users?page=0');
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
      const response = await authenticatedFetch('/api/tasks');
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

  const fetchShiftDefinition = async (shiftId?: string) => {
    const shiftIdToUse = shiftId || selectedShiftId;
    if (!shiftIdToUse) return;
    try {
      const shift = availableShifts.find(s => s.id === shiftIdToUse);
      if (shift) {
        setShiftDefinition(shift);
      } else {
        // Try to fetch it directly
        const response = await authenticatedFetch(`/api/shift-definitions`);
        const result = await response.json();
        if (result.success) {
          const foundShift = result.data.find((s: ShiftDefinition) => s.id === shiftIdToUse);
          if (foundShift) {
            setShiftDefinition(foundShift);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch shift definition:', err);
    }
  };

  // Fetch all rosters for the selected date to check for cross-shift assignments
  const fetchAllRostersForDate = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`/api/rosters?date=${selectedDate}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        setAllRostersForDate(result.data || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch all rosters for date:', err);
      setAllRostersForDate([]);
    }
  }, [selectedDate]);

  // Get users assigned to other shifts on the same date
  const getUsersInOtherShifts = useCallback((): Set<string> => {
    const userIdsInOtherShifts = new Set<string>();
    if (!selectedShiftId || !allRostersForDate.length) return userIdsInOtherShifts;

    allRostersForDate.forEach(roster => {
      // Skip the current shift's roster
      if (roster.shiftId === selectedShiftId) return;
      
      // Collect all user IDs assigned to this other shift
      roster.slots.forEach(slot => {
        if (slot.userId) {
          userIdsInOtherShifts.add(slot.userId);
        }
      });
    });

    return userIdsInOtherShifts;
  }, [allRostersForDate, selectedShiftId]);

  const calculateCoverage = useCallback((slots: RosterSlot[], currentShiftName?: string): CoverageMetrics => {
    const filledSlots = slots.filter(s => s.userId).length;
    const vacantSlots = slots.filter(s => !s.userId).length;
    
    // Calculate total available staff for THIS SHIFT ONLY
    // Only count users whose shift preference matches the current shift, or users with no preference
    const totalAvailableStaff = availableUsers.filter(user => {
      // Exclude Store Manager and inactive users
      const roleName = (user.role?.name || '').toLowerCase();
      if (roleName.includes('store manager')) return false;
      if (!user.isActive) return false;
      
      // If we have a current shift name, filter by shift preference
      if (currentShiftName) {
        // Users with no preference can work any shift
        if (!user.defaultShiftPreference) return true;
        // Users with a preference must match the current shift
        return shiftNamesMatch(user.defaultShiftPreference, currentShiftName);
      }
      
      // If no shift name, count all (shouldn't happen, but safe fallback)
      return true;
    }).length;

    // Calculate coverage based on engaged staff vs available staff for this shift
    const coveragePercentage = totalAvailableStaff > 0 
      ? (filledSlots / totalAvailableStaff) * 100 
      : 0;
    
    const warnings: string[] = [];

    return {
      totalSlots: slots.length,
      filledSlots,
      vacantSlots,
      coveragePercentage,
      minRequiredStaff: totalAvailableStaff, // Use total available for this shift as the "target"
      actualStaff: filledSlots,
      warnings
    };
  }, [availableUsers]);

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
        shiftId: selectedShiftId,
        date: selectedDate,
        assignedTasks: taskIds,
        startTime: shiftDefinition.startTime,
        endTime: shiftDefinition.endTime,
        status: existingSlot?.status || 'draft',
        notes: existingSlot?.notes
      });
    });

    return slots;
  }, [roster, shiftDefinition, selectedShiftId, selectedDate]);

  const saveRoster = useCallback(async (rosterToSave: Roster, showAlert = false) => {
    if (saving) return false; // Prevent concurrent saves
    
    setSaving(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/rosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rosterToSave,
          coverage: calculateCoverage(rosterToSave.slots, shiftDefinition?.name),
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
          setAlert({ isOpen: true, message: 'Roster saved successfully!', type: 'success' });
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
        setAlert({ isOpen: true, message: errorMsg, type: 'error' });
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
          shiftId: selectedShiftId,
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
        coverage: calculateCoverage(newSlots, shiftDefinition?.name)
      };

      // Update allRostersForDate to reflect the change
      setAllRostersForDate(prevAllRosters => {
        const updated = prevAllRosters.filter(r => r.id !== prevRoster.id);
        if (updatedRoster.id) {
          updated.push(updatedRoster);
        }
        return updated;
      });

      // Schedule auto-save with the updated roster
      setTimeout(() => {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setTimeout(() => {
          saveRoster(updatedRoster, false).then(() => {
            // Refresh all rosters after save to ensure cross-shift detection is accurate
            fetchAllRostersForDate();
          });
        }, 3000);
      }, 0);

      return updatedRoster;
    });
  }, [roster, shiftDefinition, availableTasks, selectedShiftId, selectedDate, saveRoster, calculateCoverage, fetchAllRostersForDate]);

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
          shiftId: selectedShiftId,
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
        coverage: calculateCoverage(newSlots, shiftDefinition?.name)
      };

      // Update allRostersForDate to reflect the change
      setAllRostersForDate(prevAllRosters => {
        const updated = prevAllRosters.filter(r => r.id !== prevRoster.id);
        if (updatedRoster.id) {
          updated.push(updatedRoster);
        }
        return updated;
      });

      // Schedule auto-save with the updated roster
      setTimeout(() => {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setTimeout(() => {
          saveRoster(updatedRoster, false).then(() => {
            // Refresh all rosters after save to ensure cross-shift detection is accurate
            fetchAllRostersForDate();
          });
        }, 3000);
      }, 0);

      return updatedRoster;
    });
  }, [roster, shiftDefinition, availableTasks, selectedShiftId, selectedDate, saveRoster, calculateCoverage, fetchAllRostersForDate]);

  const handlePublish = async () => {
    if (!roster) return;

    if (roster.coverage.filledSlots === 0) {
      setAlert({ isOpen: true, message: 'Cannot publish: No staff assigned to this shift.', type: 'error' });
      return;
    }

    setPublishing(true);
    try {
      if (!roster.id) {
        const saved = await saveRoster(roster, false);
        if (!saved) {
          setAlert({ isOpen: true, message: 'Failed to save roster before publishing', type: 'error' });
          return;
        }
        // Fetch updated roster with ID
        await fetchRoster();
        return;
      }

      const response = await authenticatedFetch(`/api/rosters/${roster.id}/publish`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setAlert({ isOpen: true, message: 'Roster published successfully!', type: 'success' });
        await fetchRoster();
      } else {
        throw new Error(result.error?.message || 'Failed to publish roster');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to publish roster';
      setError(errorMsg);
      setAlert({ isOpen: true, message: errorMsg, type: 'error' });
      console.error('Failed to publish roster:', err);
    } finally {
      setPublishing(false);
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
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="loader-spinner loader-spinner-lg"></div>
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

  if (!roster) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="loader-spinner loader-spinner-lg"></div>
      </div>
    );
  }

  const dateFormatted = format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy');

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold">Roster Builder</h1>
        <div className="flex flex-wrap gap-3 items-center">
          {error && (
            <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded whitespace-nowrap">
              {error}
            </span>
          )}
          {saving && <span className="text-sm text-gray-500 whitespace-nowrap">Saving...</span>}
          {canEdit && (
            <button
              onClick={handleManualSave}
              className="btn-secondary whitespace-nowrap"
              disabled={saving}
            >
              Save
            </button>
          )}
          {canPublishRoster() && (
            <button
              onClick={handlePublish}
              disabled={roster.status === 'published' || saving || publishing}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {publishing ? 'Publishing...' : roster.status === 'published' ? 'Published' : 'Publish Roster'}
            </button>
          )}
          {!canPublishRoster() && roster.status !== 'published' && (
            <span className="text-sm text-gray-500 whitespace-nowrap">Only Store Managers can publish rosters</span>
          )}
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
          value={selectedShiftId}
          onChange={(e) => {
            setSelectedShiftId(e.target.value);
            // Reset roster when shift changes
            setRoster(null);
          }}
          className="input-base w-48 text-gray-900"
        >
          {availableShifts.length === 0 ? (
            <option value="">No shifts available</option>
          ) : (
            availableShifts.map(shift => (
              <option key={shift.id} value={shift.id}>
                {shift.name}
              </option>
            ))
          )}
        </select>
        <div className="text-gray-600">
          {dateFormatted} - {shiftDefinition?.name || 'Select Shift'} ({shiftDefinition?.startTime || '--:--'} - {shiftDefinition?.endTime || '--:--'})
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
          {/* Coverage Metrics at Top - Shift-specific */}
          <div className="mb-6">
            {(() => {
              // Calculate shift-specific metrics
              const shiftAvailableStaff = availableUsers.filter(user => {
                const roleName = (user.role?.name || '').toLowerCase();
                if (roleName.includes('store manager')) return false;
                if (!user.isActive) return false;
                if (!shiftDefinition?.name) return true;
                if (!user.defaultShiftPreference) return true; // No preference = can work any shift
                return shiftNamesMatch(user.defaultShiftPreference, shiftDefinition.name);
              }).length;
              
              const engagedStaffCount = new Set(roster.slots.filter(s => s.userId).map(s => s.userId)).size;
              
              return (
                <CoverageMeter 
                  coverage={roster.coverage} 
                  totalAvailableStaff={shiftAvailableStaff}
                  engagedStaff={engagedStaffCount}
                  shiftId={selectedShiftId}
                />
              );
            })()}
          </div>

          {/* Weekoff Information */}
          {(() => {
            const selectedDateObj = parseISO(selectedDate);
            const dayOfWeek = getDay(selectedDateObj); // 0 = Sunday, 6 = Saturday
            const staffOnWeekoff = availableUsers.filter(user => {
              const roleName = (user.role?.name || '').toLowerCase();
              if (roleName.includes('store manager')) return false;
              if (!user.isActive) return false;
              return (user.weekOffDays || []).includes(dayOfWeek);
            });

            if (staffOnWeekoff.length > 0) {
              return (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200/60 rounded-xl">
                  <div className="flex items-start gap-3">
                    <CalendarOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-amber-900 mb-2">
                        Staff on Weekoff ({format(selectedDateObj, 'EEEE')})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {staffOnWeekoff.map(user => (
                          <span
                            key={user.id}
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
                          >
                            {user.firstName} {user.lastName}
                            {user.role?.name && (
                              <span className="ml-1.5 text-amber-600">
                                ({user.role.name})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

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
                        currentShiftId={selectedShiftId}
                        currentShiftName={shiftDefinition?.name}
                        availableShifts={availableShifts}
                        selectedDate={selectedDate}
                        isReadOnly={roster.status === 'published' || !canEdit}
                        usersInOtherShifts={getUsersInOtherShifts()}
                        allRostersForDate={allRostersForDate}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Slots View with Actuals - Only show for published rosters in actuals/compare mode */}
          {roster.status === 'published' && (viewMode === 'actuals' || viewMode === 'compare') && (
            <div className="card mt-6">
              <h2 className="text-xl font-semibold mb-4">Staff Slots & Actuals</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roster.slots.map(slot => {
                  const slotUser = slot.userId ? availableUsers.find(u => u.id === slot.userId) : null;
                  const actualUser = slot.actuals && slot.actuals.actualUserId ? availableUsers.find(u => u.id === slot.actuals!.actualUserId) : null;
                  const displayUser = viewMode === 'actuals' && actualUser ? actualUser : slotUser;
                  const isCurrentUserSlot = currentUser && slot.userId === currentUser.id;

                  return (
                    <div
                      key={slot.id}
                      className={`border rounded-lg p-4 relative ${
                        viewMode === 'compare' && slot.actuals
                          ? slot.actuals.attendanceStatus === 'absent'
                            ? 'bg-red-50 border-red-300'
                            : slot.actuals.actualUserId && slot.actuals.actualUserId !== slot.userId
                            ? 'bg-blue-50 border-blue-300'
                            : slot.actuals.attendanceStatus === 'late' || slot.actuals.attendanceStatus === 'left_early'
                            ? 'bg-yellow-50 border-yellow-300'
                            : slot.actuals.attendanceStatus === 'present'
                            ? 'bg-green-50 border-green-300'
                            : 'bg-gray-50 border-gray-300'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      {displayUser ? (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">
                              {displayUser.firstName} {displayUser.lastName}
                            </h4>
                            {canModifyRoster() && (
                              <button
                                onClick={() => {
                                  setSelectedSlotForActuals(slot);
                                  setShowActualsModal(true);
                                }}
                                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              >
                                Record
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{displayUser.employeeId}</p>
                          <p className="text-xs text-gray-500 mb-2">{displayUser.role?.name || 'No role'}</p>

                          {/* Check-in/Check-out button for current user */}
                          {isCurrentUserSlot && (
                            <div className="mb-2">
                              <CheckInOutButton
                                slot={slot}
                                rosterId={roster.id}
                                currentUserId={currentUser.id}
                                onUpdate={async () => {
                                  await fetchRoster(selectedShiftId);
                                }}
                              />
                            </div>
                          )}

                          {/* Time display */}
                          <div className="text-xs text-gray-600 mb-1">
                            {viewMode === 'compare' && slot.actuals?.actualStartTime && slot.actuals.actualStartTime !== slot.startTime ? (
                              <div>
                                <span className="line-through text-gray-400">{slot.startTime}</span>
                                <span className="ml-2 text-orange-600 font-medium">{slot.actuals.actualStartTime}</span>
                                {' - '}
                                <span className="line-through text-gray-400">{slot.endTime}</span>
                                <span className="ml-2 text-orange-600 font-medium">{slot.actuals.actualEndTime || slot.endTime}</span>
                              </div>
                            ) : (
                              <div>
                                {viewMode === 'actuals' && slot.actuals?.actualStartTime ? slot.actuals.actualStartTime : slot.startTime}
                                {' - '}
                                {viewMode === 'actuals' && slot.actuals?.actualEndTime ? slot.actuals.actualEndTime : slot.endTime}
                              </div>
                            )}
                          </div>

                          {/* Attendance status */}
                          {slot.actuals?.attendanceStatus && (
                            <div className="mt-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${
                                slot.actuals.attendanceStatus === 'present' ? 'bg-green-100 text-green-700' :
                                slot.actuals.attendanceStatus === 'absent' ? 'bg-red-100 text-red-700' :
                                slot.actuals.attendanceStatus === 'late' ? 'bg-yellow-100 text-yellow-700' :
                                slot.actuals.attendanceStatus === 'left_early' ? 'bg-orange-100 text-orange-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {slot.actuals.attendanceStatus.charAt(0).toUpperCase() + slot.actuals.attendanceStatus.slice(1).replace('_', ' ')}
                              </span>
                            </div>
                          )}

                          {/* Tasks */}
                          {slot.assignedTasks.length > 0 && (
                            <div className="mt-2">
                              <div className="flex flex-wrap gap-1">
                                {slot.assignedTasks.map(taskId => {
                                  const task = availableTasks.find(t => t.id === taskId);
                                  return task ? (
                                    <span key={taskId} className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">
                                      {task.name}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                            </div>
                          )}

                          {/* User substitution indicator */}
                          {slot.actuals?.actualUserId && slot.actuals.actualUserId !== slot.userId && viewMode === 'compare' && (
                            <div className="mt-2 text-xs text-blue-600">
                              Substituted: {actualUser?.firstName} {actualUser?.lastName}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <h4 className="font-semibold text-gray-500">Vacant Slot</h4>
                          <p className="text-sm text-gray-400">No staff assigned</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Sidebar - Staff Availability Tracker */}
        <StaffAvailabilityTracker
          availableUsers={availableUsers}
          allTaskAssignments={taskAssignments}
          currentShiftId={selectedShiftId}
          currentShiftName={shiftDefinition?.name}
          selectedDate={selectedDate}
        />
      </div>

      {/* Actuals Recording Modal */}
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
          onUpdate={async () => {
            // Refresh roster data after updating actuals
            await fetchRoster(selectedShiftId);
          }}
        />
      )}

      {/* Alert Modal */}
      <Modal
        isOpen={alert.isOpen}
        onClose={() => setAlert({ isOpen: false, message: '' })}
        message={alert.message}
        type={alert.type || 'info'}
        title={alert.type === 'success' ? 'Success' : alert.type === 'error' ? 'Error' : 'Information'}
      />
    </div>
  );
}
