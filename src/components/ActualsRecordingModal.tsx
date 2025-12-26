'use client';

import { useState, useEffect } from 'react';
import { RosterSlot, User, Task, AttendanceStatus, RecordActualsRequest } from '@/types';
import { authenticatedFetch } from '@/lib/api-client';
import { Clock, User as UserIcon, CheckSquare, FileText, X } from 'lucide-react';

interface ActualsRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  slot: RosterSlot;
  rosterId: string;
  availableUsers: User[];
  availableTasks: Task[];
  onUpdate: () => void;
}

export default function ActualsRecordingModal({
  isOpen,
  onClose,
  slot,
  rosterId,
  availableUsers,
  availableTasks,
  onUpdate
}: ActualsRecordingModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [actualUserId, setActualUserId] = useState<string>(slot.actuals?.actualUserId || slot.userId || '');
  const [actualStartTime, setActualStartTime] = useState<string>(slot.actuals?.actualStartTime || slot.startTime || '');
  const [actualEndTime, setActualEndTime] = useState<string>(slot.actuals?.actualEndTime || slot.endTime || '');
  const [actualTasksCompleted, setActualTasksCompleted] = useState<string[]>(slot.actuals?.actualTasksCompleted || slot.assignedTasks || []);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | ''>(slot.actuals?.attendanceStatus || '');
  const [substitutionReason, setSubstitutionReason] = useState<string>(slot.actuals?.substitutionReason || '');
  const [actualNotes, setActualNotes] = useState<string>(slot.actuals?.actualNotes || '');

  // Reset form when slot changes
  useEffect(() => {
    if (slot) {
      setActualUserId(slot.actuals?.actualUserId || slot.userId || '');
      setActualStartTime(slot.actuals?.actualStartTime || slot.startTime || '');
      setActualEndTime(slot.actuals?.actualEndTime || slot.endTime || '');
      setActualTasksCompleted(slot.actuals?.actualTasksCompleted || slot.assignedTasks || []);
      setAttendanceStatus(slot.actuals?.attendanceStatus || '');
      setSubstitutionReason(slot.actuals?.substitutionReason || '');
      setActualNotes(slot.actuals?.actualNotes || '');
    }
  }, [slot]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const request: RecordActualsRequest = {
        slotId: slot.id,
        actualUserId: actualUserId || undefined,
        actualStartTime: actualStartTime || undefined,
        actualEndTime: actualEndTime || undefined,
        actualTasksCompleted: actualTasksCompleted.length > 0 ? actualTasksCompleted : undefined,
        attendanceStatus: attendanceStatus || undefined,
        substitutionReason: substitutionReason || undefined,
        actualNotes: actualNotes || undefined
      };

      const response = await authenticatedFetch(`/api/rosters/${rosterId}/actuals`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to record actuals');
      }

      onUpdate();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record actuals');
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = (taskId: string) => {
    setActualTasksCompleted(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const plannedUser = slot.user;
  const actualUser = actualUserId ? availableUsers.find(u => u.id === actualUserId) : null;
  const userChanged = actualUserId && actualUserId !== slot.userId;

  const taskMap = new Map(availableTasks.map(t => [t.id, t]));
  const plannedTasks = slot.assignedTasks.map(id => taskMap.get(id)).filter(Boolean) as Task[];

  return (
    <div className={isOpen ? 'fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4' : 'hidden'}>
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Record Actuals</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Comparison Section */}
        <div className="grid grid-cols-2 gap-4 pb-4 border-b">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Planned</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">User: </span>
                <span className="font-medium">{plannedUser ? `${plannedUser.firstName} ${plannedUser.lastName} (${plannedUser.employeeId})` : 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-gray-600">Time: </span>
                <span className="font-medium">{slot.startTime} - {slot.endTime}</span>
              </div>
              <div>
                <span className="text-gray-600">Tasks: </span>
                <span className="font-medium">{plannedTasks.map(t => t.name).join(', ') || 'None'}</span>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Actual</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">User: </span>
                <span className={`font-medium ${userChanged ? 'text-orange-600' : ''}`}>
                  {actualUser ? `${actualUser.firstName} ${actualUser.lastName} (${actualUser.employeeId})` : (plannedUser ? `${plannedUser.firstName} ${plannedUser.lastName} (${plannedUser.employeeId})` : 'Unassigned')}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Time: </span>
                <span className="font-medium">{actualStartTime} - {actualEndTime}</span>
              </div>
              <div>
                <span className="text-gray-600">Tasks: </span>
                <span className="font-medium">
                  {actualTasksCompleted.map(id => taskMap.get(id)?.name).filter(Boolean).join(', ') || 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Actual User (for substitutions) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <UserIcon className="inline w-4 h-4 mr-1" />
              Actual User {userChanged && <span className="text-orange-600">(Changed)</span>}
            </label>
            <select
              value={actualUserId}
              onChange={(e) => setActualUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={slot.userId}>
                {plannedUser ? `${plannedUser.firstName} ${plannedUser.lastName} (${plannedUser.employeeId})` : 'Unassigned'}
              </option>
              {availableUsers.filter(u => u.id !== slot.userId).map(user => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName} ({user.employeeId})
                </option>
              ))}
            </select>
            {userChanged && (
              <input
                type="text"
                placeholder="Reason for substitution..."
                value={substitutionReason}
                onChange={(e) => setSubstitutionReason(e.target.value)}
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>

          {/* Actual Times */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="inline w-4 h-4 mr-1" />
                Actual Start Time
              </label>
              <input
                type="time"
                value={actualStartTime}
                onChange={(e) => setActualStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="inline w-4 h-4 mr-1" />
                Actual End Time
              </label>
              <input
                type="time"
                value={actualEndTime}
                onChange={(e) => setActualEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Attendance Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Attendance Status
            </label>
            <select
              value={attendanceStatus}
              onChange={(e) => setAttendanceStatus(e.target.value as AttendanceStatus | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select status...</option>
              <option value={AttendanceStatus.PRESENT}>Present</option>
              <option value={AttendanceStatus.ABSENT}>Absent</option>
              <option value={AttendanceStatus.LATE}>Late</option>
              <option value={AttendanceStatus.LEFT_EARLY}>Left Early</option>
              <option value={AttendanceStatus.SUBSTITUTED}>Substituted</option>
            </select>
          </div>

          {/* Tasks Completed */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <CheckSquare className="inline w-4 h-4 mr-1" />
              Tasks Completed
            </label>
            <div className="border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto">
              {availableTasks.length === 0 ? (
                <p className="text-sm text-gray-500">No tasks available</p>
              ) : (
                <div className="space-y-2">
                  {availableTasks.map(task => (
                    <label key={task.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={actualTasksCompleted.includes(task.id)}
                        onChange={() => toggleTask(task.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{task.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="inline w-4 h-4 mr-1" />
              Notes
            </label>
            <textarea
              value={actualNotes}
              onChange={(e) => setActualNotes(e.target.value)}
              rows={3}
              placeholder="Additional notes about what actually happened..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving...' : 'Save Actuals'}
          </button>
        </div>
      </form>
        </div>
      </div>
    </div>
  );
}

