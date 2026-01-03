'use client';

import { useState } from 'react';
import { RosterSlot, User, Task, AttendanceStatus, BulkRecordActualsRequest } from '@/types';
import { authenticatedFetch } from '@/lib/api-client';
import { Clock, User as UserIcon, CheckSquare, FileText, X, AlertCircle, Users } from 'lucide-react';
import Loader from './Loader';

interface BulkActualsRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  slots: RosterSlot[];
  rosterId: string;
  availableUsers: User[];
  availableTasks: Task[];
  onUpdate: () => void;
}

export default function BulkActualsRecordingModal({
  isOpen,
  onClose,
  slots,
  rosterId,
  availableUsers,
  availableTasks,
  onUpdate
}: BulkActualsRecordingModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state - will be applied to all selected slots
  const [actualUserId, setActualUserId] = useState<string>('');
  const [actualStartTime, setActualStartTime] = useState<string>('');
  const [actualEndTime, setActualEndTime] = useState<string>('');
  const [actualTasksCompleted, setActualTasksCompleted] = useState<string[]>([]);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus | '' | 'no_record'>('');
  const [substitutionReason, setSubstitutionReason] = useState<string>('');
  const [actualNotes, setActualNotes] = useState<string>('');

  // Options for form fields
  const attendanceStatusOptions: Array<{ value: AttendanceStatus | 'no_record'; label: string }> = [
    { value: AttendanceStatus.PRESENT, label: 'Present' },
    { value: AttendanceStatus.ABSENT, label: 'Absent' },
    { value: AttendanceStatus.LATE, label: 'Late' },
    { value: AttendanceStatus.LEFT_EARLY, label: 'Left Early' },
    { value: 'no_record' as const, label: 'No Record' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Build bulk request - only include fields that have values
      const actualsRequests = slots.map(slot => {
        const request: any = { slotId: slot.id };
        
        // Handle "no_record" - clear the attendance status
        if (attendanceStatus === 'no_record') {
          request.attendanceStatus = null; // Clear attendance status
        } else if (attendanceStatus) {
          request.attendanceStatus = attendanceStatus;
        }
        
        // Only include fields that have values (not empty)
        if (actualUserId) request.actualUserId = actualUserId;
        if (actualStartTime) request.actualStartTime = actualStartTime;
        if (actualEndTime) request.actualEndTime = actualEndTime;
        if (actualTasksCompleted.length > 0) request.actualTasksCompleted = actualTasksCompleted;
        if (substitutionReason) request.substitutionReason = substitutionReason;
        if (actualNotes) request.actualNotes = actualNotes;
        
        return request;
      });

      const bulkRequest: BulkRecordActualsRequest = {
        actuals: actualsRequests
      };

      const response = await authenticatedFetch(`/api/rosters/${rosterId}/actuals`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bulkRequest)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to record bulk actuals');
      }

      onUpdate();
      onClose();
      // Reset form
      setActualUserId('');
      setActualStartTime('');
      setActualEndTime('');
      setActualTasksCompleted([]);
      setAttendanceStatus('');
      setSubstitutionReason('');
      setActualNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to record bulk actuals');
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

  // Get common planned values from slots (for display)
  const firstSlot = slots[0];
  const plannedStartTime = firstSlot?.startTime || '';
  const plannedEndTime = firstSlot?.endTime || '';
  const plannedUser = firstSlot?.userId ? availableUsers.find(u => u.id === firstSlot.userId) : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        {loading && (
          <Loader overlay message={`Recording actuals for ${slots.length} slot${slots.length !== 1 ? 's' : ''}...`} />
        )}
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-6 h-6 text-blue-600" />
                Bulk Record Actuals
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Recording for {slots.length} slot{slots.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-white rounded-full p-1 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-r-lg p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            )}

            {/* Info Banner */}
            <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-900 mb-2">Bulk Recording Instructions</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                    <li>Leave fields empty to keep existing values unchanged</li>
                    <li>All filled fields will be applied to all {slots.length} selected slot(s)</li>
                    <li>Select "No Record" in Attendance Status to clear existing attendance records</li>
                    <li>You can record individual actuals later if needed</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Selected Slots Preview */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-4 shadow-sm">
              <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-600" />
                Selected Slots ({slots.length})
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {slots.map(slot => {
                    const user = slot.userId ? availableUsers.find(u => u.id === slot.userId) : null;
                    return (
                      <div key={slot.id} className="text-sm text-gray-700 bg-white px-3 py-2 rounded border border-gray-200">
                        • {user ? `${user.firstName} ${user.lastName} (${user.employeeId})` : 'Vacant Slot'}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Staff & Attendance Section */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200">
                Staff & Attendance
              </h3>
              
              <div className="space-y-5">
                {/* Actual User (for substitutions) */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-gray-600" />
                    Actual Staff (if different from planned)
                  </label>
                  <select
                    value={actualUserId}
                    onChange={(e) => setActualUserId(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white transition-colors"
                  >
                    <option value="">Keep planned staff (no change)</option>
                    {availableUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} ({user.employeeId}) - {user.role?.name || 'No role'}
                      </option>
                    ))}
                  </select>
                  {plannedUser && (
                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                      <span className="font-medium">Planned:</span> {plannedUser.firstName} {plannedUser.lastName} ({plannedUser.employeeId})
                    </p>
                  )}
                </div>

                {/* Attendance Status */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Attendance Status
                  </label>
                  <select
                    value={attendanceStatus}
                    onChange={(e) => setAttendanceStatus(e.target.value as AttendanceStatus | '' | 'no_record')}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white transition-colors"
                  >
                    <option value="">Keep existing status</option>
                    {attendanceStatusOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    Select "No Record" to clear existing attendance records
                  </p>
                </div>

                {/* Substitution Reason - Only show if substitution is selected */}
                {actualUserId && actualUserId !== plannedUser?.id && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Substitution Reason
                    </label>
                    <input
                      type="text"
                      value={substitutionReason}
                      onChange={(e) => setSubstitutionReason(e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white transition-colors"
                      placeholder="Reason for substitution (optional)"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Time Section */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-600" />
                Time
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Actual Start Time */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Actual Start Time
                  </label>
                  <input
                    type="time"
                    value={actualStartTime}
                    onChange={(e) => setActualStartTime(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white transition-colors"
                    placeholder="Leave empty to keep existing"
                  />
                  {plannedStartTime && (
                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                      <span className="font-medium">Planned:</span> {plannedStartTime}
                    </p>
                  )}
                </div>

                {/* Actual End Time */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Actual End Time
                  </label>
                  <input
                    type="time"
                    value={actualEndTime}
                    onChange={(e) => setActualEndTime(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white transition-colors"
                    placeholder="Leave empty to keep existing"
                  />
                  {plannedEndTime && (
                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                      <span className="font-medium">Planned:</span> {plannedEndTime}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Tasks Section */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-gray-600" />
                Tasks Completed
              </h3>
              
              <div className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50 max-h-48 overflow-y-auto">
                {availableTasks.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No tasks available</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableTasks.map(task => (
                      <label 
                        key={task.id} 
                        className="flex items-center space-x-3 cursor-pointer p-2 rounded-lg hover:bg-white transition-colors border border-transparent hover:border-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={actualTasksCompleted.includes(task.id)}
                          onChange={() => toggleTask(task.id)}
                          className="w-5 h-5 rounded border-2 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">{task.name}</span>
                          {task.category && (
                            <span className="text-xs text-gray-500 ml-2">({task.category})</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Leave unchecked to keep existing tasks. Check tasks to update the completed tasks list.
              </p>
            </div>

            {/* Notes Section */}
            <div className="bg-white border-2 border-gray-200 rounded-lg p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-600" />
                Additional Notes
              </h3>
              
              <textarea
                value={actualNotes}
                onChange={(e) => setActualNotes(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white transition-colors resize-none"
                rows={4}
                placeholder="Add any additional notes or comments (optional)"
              />
            </div>
          </form>
        </div>

        {/* Footer - Action Buttons */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all shadow-sm"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 border-2 border-blue-600 rounded-lg hover:bg-blue-700 hover:border-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {loading ? 'Recording...' : `Record for ${slots.length} Slot${slots.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
