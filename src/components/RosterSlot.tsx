'use client';

import { User, RosterSlot, Task, AttendanceStatus } from '@/types';
import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, AlertCircle, UserSwap } from 'lucide-react';
import { format } from 'date-fns';

interface RosterSlotProps {
  slot: RosterSlot;
  availableUsers: (User & { role?: any })[];
  availableTasks: Task[];
  onAssignUser: (slotId: string, userId: string) => void;
  onUnassignUser: (slotId: string) => void;
  onAssignTasks: (slotId: string, taskIds: string[]) => void;
  onAddNote: (slotId: string, note: string) => void;
  shiftStartTime: string;
  shiftEndTime: string;
  viewMode?: 'planned' | 'actuals' | 'compare';
  onRecordActuals?: (slot: RosterSlot) => void;
}

export default function RosterSlotComponent({
  slot,
  availableUsers,
  availableTasks,
  onAssignUser,
  onUnassignUser,
  onAssignTasks,
  onAddNote,
  shiftStartTime,
  shiftEndTime,
  viewMode = 'planned',
  onRecordActuals
}: RosterSlotProps) {
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState(slot.notes || '');

  const assignedUser = slot.userId
    ? availableUsers.find(u => u.id === slot.userId)
    : null;

  const actuals = slot.actuals;
  const actualUser = actuals?.actualUserId
    ? availableUsers.find(u => u.id === actuals.actualUserId)
    : assignedUser;

  const assignedTaskNames = slot.assignedTasks
    .map(taskId => availableTasks.find(t => t.id === taskId)?.name)
    .filter(Boolean);

  // Determine visual indicator based on actuals vs planned
  const getActualsIndicator = () => {
    if (!actuals || viewMode === 'planned') return null;

    const hasActuals = actuals.checkedInAt || actuals.attendanceStatus;
    if (!hasActuals && viewMode === 'compare') {
      return <div className="absolute top-2 right-2 w-2 h-2 bg-gray-400 rounded-full" title="No actuals recorded" />;
    }

    if (actuals.attendanceStatus === AttendanceStatus.ABSENT) {
      return <div className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white" title="Absent" />;
    }

    const userChanged = actuals.actualUserId && actuals.actualUserId !== slot.userId;
    const timeChanged = (actuals.actualStartTime && actuals.actualStartTime !== slot.startTime) ||
                       (actuals.actualEndTime && actuals.actualEndTime !== slot.endTime);

    if (userChanged || actuals.attendanceStatus === AttendanceStatus.SUBSTITUTED) {
      return <div className="absolute top-2 right-2 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" title="Substituted" />;
    }

    if (actuals.attendanceStatus === AttendanceStatus.LATE || actuals.attendanceStatus === AttendanceStatus.LEFT_EARLY) {
      return <div className="absolute top-2 right-2 w-3 h-3 bg-yellow-500 rounded-full border-2 border-white" title="Time deviation" />;
    }

    if (actuals.attendanceStatus === AttendanceStatus.PRESENT && !userChanged && !timeChanged) {
      return <div className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full border-2 border-white" title="Matches plan" />;
    }

    return <div className="absolute top-2 right-2 w-3 h-3 bg-yellow-500 rounded-full border-2 border-white" title="Deviation" />;
  };

  const getBorderColor = () => {
    if (viewMode === 'planned' || !actuals) {
      return slot.userId ? 'border-blue-200' : 'border-gray-200';
    }

    const hasActuals = actuals.checkedInAt || actuals.attendanceStatus;
    if (!hasActuals) return 'border-gray-300';

    if (actuals.attendanceStatus === AttendanceStatus.ABSENT) return 'border-red-400';
    if (actuals.attendanceStatus === AttendanceStatus.LATE || actuals.attendanceStatus === AttendanceStatus.LEFT_EARLY) return 'border-yellow-400';
    if (actuals.actualUserId && actuals.actualUserId !== slot.userId) return 'border-blue-400';
    if (actuals.attendanceStatus === AttendanceStatus.PRESENT) return 'border-green-400';
    
    return 'border-yellow-400';
  };

  const getBackgroundColor = () => {
    if (viewMode === 'planned' || !actuals) {
      return slot.userId ? 'bg-blue-50' : 'bg-gray-50';
    }

    const hasActuals = actuals.checkedInAt || actuals.attendanceStatus;
    if (!hasActuals) return 'bg-gray-100';

    if (actuals.attendanceStatus === AttendanceStatus.ABSENT) return 'bg-red-50';
    if (actuals.attendanceStatus === AttendanceStatus.LATE || actuals.attendanceStatus === AttendanceStatus.LEFT_EARLY) return 'bg-yellow-50';
    if (actuals.actualUserId && actuals.actualUserId !== slot.userId) return 'bg-blue-50';
    if (actuals.attendanceStatus === AttendanceStatus.PRESENT) return 'bg-green-50';
    
    return 'bg-yellow-50';
  };

  const handleTaskToggle = (taskId: string) => {
    const currentTasks = slot.assignedTasks || [];
    const newTasks = currentTasks.includes(taskId)
      ? currentTasks.filter(id => id !== taskId)
      : [...currentTasks, taskId];
    onAssignTasks(slot.id, newTasks);
  };

  const handleSaveNote = () => {
    onAddNote(slot.id, noteText);
    setShowNoteModal(false);
  };

  const displayUser = viewMode === 'actuals' && actualUser ? actualUser : assignedUser;
  const displayStartTime = viewMode === 'actuals' && actuals?.actualStartTime ? actuals.actualStartTime : slot.startTime;
  const displayEndTime = viewMode === 'actuals' && actuals?.actualEndTime ? actuals.actualEndTime : slot.endTime;
  const userChanged = actuals?.actualUserId && actuals.actualUserId !== slot.userId;

  return (
    <>
      <div className={`border rounded-lg p-4 relative ${getBackgroundColor()} ${getBorderColor()}`}>
        {getActualsIndicator()}
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            {displayUser ? (
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-gray-900">
                    {displayUser.firstName} {displayUser.lastName}
                  </h4>
                  {userChanged && viewMode === 'compare' && (
                    <UserSwap className="w-4 h-4 text-blue-600" title="User substituted" />
                  )}
                </div>
                <p className="text-sm text-gray-600">{displayUser.employeeId}</p>
                <p className="text-xs text-gray-500">{displayUser.role?.name || 'No role'}</p>
                {viewMode === 'compare' && userChanged && (
                  <p className="text-xs text-orange-600 mt-1">Substituted</p>
                )}
              </div>
            ) : (
              <div>
                <h4 className="font-semibold text-gray-500">Vacant Slot</h4>
                <p className="text-sm text-gray-400">No staff assigned</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {slot.notes && (
              <button
                onClick={() => setShowNoteModal(true)}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                title="View/Edit Note"
              >
                📝
              </button>
            )}
            <button
              onClick={() => setShowTaskModal(true)}
              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Tasks ({slot.assignedTasks.length})
            </button>
          </div>
        </div>

        <div className="mt-2">
          <select
            value={slot.userId || ''}
            onChange={(e) => {
              if (e.target.value) {
                onAssignUser(slot.id, e.target.value);
              } else {
                onUnassignUser(slot.id);
              }
            }}
            className="input-base text-gray-900 w-full text-sm"
          >
            <option value="">-- Select Staff --</option>
            {availableUsers.map(user => (
              <option key={user.id} value={user.id}>
                {user.employeeId} - {user.firstName} {user.lastName} ({user.role?.name || 'No role'})
              </option>
            ))}
          </select>
        </div>

        {assignedTaskNames.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-gray-600 mb-1">Tasks:</p>
            <div className="flex flex-wrap gap-1">
              {assignedTaskNames.map((name, idx) => (
                <span key={idx} className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {viewMode === 'compare' && actuals?.actualStartTime && actuals.actualStartTime !== slot.startTime ? (
                <div>
                  <span className="line-through text-gray-400">{slot.startTime}</span>
                  <span className="ml-2 text-orange-600 font-medium">{displayStartTime}</span>
                  {' - '}
                  <span className="line-through text-gray-400">{slot.endTime}</span>
                  <span className="ml-2 text-orange-600 font-medium">{displayEndTime}</span>
                </div>
              ) : (
                <div>
                  {displayStartTime} - {displayEndTime}
                </div>
              )}
            </div>
            {actuals?.checkedInAt && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <CheckCircle2 className="w-3 h-3 text-green-600" />
                <span>Checked in: {format(new Date(actuals.checkedInAt), 'HH:mm')}</span>
              </div>
            )}
            {actuals?.checkedOutAt && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <XCircle className="w-3 h-3 text-gray-600" />
                <span>Checked out: {format(new Date(actuals.checkedOutAt), 'HH:mm')}</span>
              </div>
            )}
          </div>
          {actuals?.attendanceStatus && viewMode !== 'planned' && (
            <div className="mt-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${
                actuals.attendanceStatus === AttendanceStatus.PRESENT ? 'bg-green-100 text-green-700' :
                actuals.attendanceStatus === AttendanceStatus.ABSENT ? 'bg-red-100 text-red-700' :
                actuals.attendanceStatus === AttendanceStatus.LATE ? 'bg-yellow-100 text-yellow-700' :
                actuals.attendanceStatus === AttendanceStatus.LEFT_EARLY ? 'bg-orange-100 text-orange-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {actuals.attendanceStatus === AttendanceStatus.PRESENT && <CheckCircle2 className="w-3 h-3" />}
                {actuals.attendanceStatus === AttendanceStatus.ABSENT && <XCircle className="w-3 h-3" />}
                {(actuals.attendanceStatus === AttendanceStatus.LATE || actuals.attendanceStatus === AttendanceStatus.LEFT_EARLY) && <Clock className="w-3 h-3" />}
                {actuals.attendanceStatus === AttendanceStatus.SUBSTITUTED && <UserSwap className="w-3 h-3" />}
                {actuals.attendanceStatus.charAt(0).toUpperCase() + actuals.attendanceStatus.slice(1).replace('_', ' ')}
              </span>
            </div>
          )}
        </div>
        {onRecordActuals && viewMode !== 'planned' && (
          <div className="mt-2">
            <button
              onClick={() => onRecordActuals(slot)}
              className="w-full text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Record Actuals
            </button>
          </div>
        )}
      </div>

      {/* Task Assignment Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold mb-4">Assign Tasks</h3>
            <div className="space-y-2">
              {availableTasks.map(task => (
                <label key={task.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={slot.assignedTasks.includes(task.id)}
                    onChange={() => handleTaskToggle(task.id)}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <span className="font-medium">{task.name}</span>
                    {task.description && (
                      <p className="text-xs text-gray-500">{task.description}</p>
                    )}
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{task.category}</span>
                      {task.requiredExperience && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 rounded">{task.requiredExperience}</span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowTaskModal(false)}
                className="btn-secondary"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4">Slot Notes</h3>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="input-base text-gray-900 w-full h-32"
              placeholder="Add notes for this slot..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowNoteModal(false);
                  setNoteText(slot.notes || '');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNote}
                className="btn-primary"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
