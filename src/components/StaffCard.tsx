'use client';

import { User, Role, ExperienceLevel } from '@/types';
import { Edit, Trash2, Power, PowerOff, CheckCircle2, XCircle } from 'lucide-react';

interface StaffCardProps {
  user: User & { role?: Role };
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onToggleActive?: (user: User) => void;
  canEdit: boolean;
  canDelete: boolean;
}

export default function StaffCard({ user, onEdit, onDelete, onToggleActive, canEdit, canDelete }: StaffCardProps) {

  return (
    <div className={`bg-white rounded-xl border border-gray-200/60 shadow-sm p-4 hover:shadow-md transition-all ${!user.isActive ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-base text-gray-900">
              {user.firstName} {user.lastName}
            </h3>
            {!user.isActive ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                <XCircle className="w-3 h-3" />
                Inactive
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-green-50 text-green-700 border border-green-200">
                <CheckCircle2 className="w-3 h-3" />
                Active
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">{user.employeeId}</p>
          <p className="text-sm text-gray-500">{user.role?.name || 'No role'}</p>
          <div className="mt-2 flex gap-2">
            <span className={`px-2 py-1 text-xs rounded-md border ${
              user.experienceLevel === ExperienceLevel.EXPERIENCED
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              {user.experienceLevel}
            </span>
            {user.ppType && (
              <span className="px-2 py-1 text-xs rounded-md bg-slate-50 text-slate-700 border border-slate-200">
                {user.ppType}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {onToggleActive && (
            <button
              onClick={() => onToggleActive(user)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                user.isActive
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
              }`}
              title={user.isActive ? 'Mark as inactive' : 'Mark as active'}
            >
              {user.isActive ? (
                <>
                  <PowerOff className="w-3 h-3" />
                  <span>Deactivate</span>
                </>
              ) : (
                <>
                  <Power className="w-3 h-3" />
                  <span>Activate</span>
                </>
              )}
            </button>
          )}
          <div className="flex gap-1.5">
            {canEdit && (
              <button
                onClick={() => onEdit(user)}
                className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete(user)}
                className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-500 space-y-0.5">
        {user.email && <p>Email: {user.email}</p>}
        {user.phone && <p>Phone: {user.phone}</p>}
        <p>Week Offs: {user.weekOffsCount} day{user.weekOffsCount !== 1 ? 's' : ''} per week (rotational)</p>
      </div>
    </div>
  );
}
