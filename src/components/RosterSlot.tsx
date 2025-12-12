'use client';

import { User, RosterSlot, Task } from '@/types';
import { useState } from 'react';

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
  shiftEndTime
}: RosterSlotProps) {
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState(slot.notes || '');

  const assignedUser = slot.userId
    ? availableUsers.find(u => u.id === slot.userId)
    : null;

  const assignedTaskNames = slot.assignedTasks
    .map(taskId => availableTasks.find(t => t.id === taskId)?.name)
    .filter(Boolean);

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

  return (
    <>
      <div className={`border rounded-lg p-4 ${slot.userId ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            {assignedUser ? (
              <div>
                <h4 className="font-semibold text-gray-900">
                  {assignedUser.firstName} {assignedUser.lastName}
                </h4>
                <p className="text-sm text-gray-600">{assignedUser.employeeId}</p>
                <p className="text-xs text-gray-500">{assignedUser.role?.name || 'No role'}</p>
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

        <div className="mt-2 text-xs text-gray-500">
          {slot.startTime} - {slot.endTime}
        </div>
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
