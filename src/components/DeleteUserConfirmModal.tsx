'use client';

import { useState } from 'react';
import { User, DeleteUserResult, ShiftType } from '@/types';

interface DeleteUserConfirmModalProps {
  isOpen: boolean;
  user: User | null;
  deleteResult: DeleteUserResult | null;
  onConfirm: (reassignTo?: string, confirmVacancy?: boolean) => void;
  onCancel: () => void;
}

export default function DeleteUserConfirmModal({
  isOpen,
  user,
  deleteResult,
  onConfirm,
  onCancel
}: DeleteUserConfirmModalProps) {
  const [reassignTo, setReassignTo] = useState('');
  const [confirmVacancy, setConfirmVacancy] = useState(false);

  if (!isOpen || !user) return null;

  const hasImpactedRosters = deleteResult?.impactedRosters && deleteResult.impactedRosters.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4 text-red-600">Confirm User Deletion</h2>
          <p className="mb-4">
            Are you sure you want to delete <strong>{user.firstName} {user.lastName}</strong> ({user.employeeId})?
          </p>

          {deleteResult && !deleteResult.allowed && (
            <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
              <p className="text-red-800">{deleteResult.reason}</p>
            </div>
          )}

          {hasImpactedRosters && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
              <p className="font-semibold mb-2">
                This user has {deleteResult!.impactedRosters.length} future roster assignment(s):
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {deleteResult!.impactedRosters.slice(0, 5).map((roster, idx) => (
                  <li key={idx}>
                    {roster.date} - {roster.shiftType} shift
                  </li>
                ))}
                {deleteResult!.impactedRosters.length > 5 && (
                  <li>...and {deleteResult!.impactedRosters.length - 5} more</li>
                )}
              </ul>
              <div className="mt-4 space-y-2">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">Reassign to user ID (optional):</label>
                  <input
                    type="text"
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    className="input-base text-gray-900"
                    placeholder="Enter user ID to reassign slots"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="confirmVacancy"
                    checked={confirmVacancy}
                    onChange={(e) => setConfirmVacancy(e.target.checked)}
                    className="mr-2"
                  />
                  <label htmlFor="confirmVacancy" className="text-sm">
                    Mark slots as vacant instead of reassigning
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={onCancel}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(reassignTo || undefined, confirmVacancy)}
              disabled={deleteResult && !deleteResult.allowed || (hasImpactedRosters && !reassignTo && !confirmVacancy)}
              className="btn-danger"
            >
              Delete User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
