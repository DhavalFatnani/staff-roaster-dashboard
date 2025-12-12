'use client';

import { useState } from 'react';
import { Role, CreateRoleRequest, UpdateRoleRequest, Permission } from '@/types';

interface RoleFormProps {
  role?: Role;
  onSubmit: (data: CreateRoleRequest | UpdateRoleRequest) => Promise<void>;
  onCancel: () => void;
  isOpen: boolean;
}

export default function RoleForm({ role, onSubmit, onCancel, isOpen }: RoleFormProps) {
  const [formData, setFormData] = useState<CreateRoleRequest>({
    name: role?.name || '',
    description: role?.description || '',
    permissions: role?.permissions || [],
    defaultTaskPreferences: role?.defaultTaskPreferences || [],
    defaultExperienceLevel: role?.defaultExperienceLevel,
    defaultPPType: role?.defaultPPType
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const togglePermission = (permission: Permission) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  const togglePermissionGroup = (groupPermissions: Permission[]) => {
    const allSelected = groupPermissions.every(perm => formData.permissions.includes(perm));
    
    if (allSelected) {
      // Deselect all in group
      setFormData(prev => ({
        ...prev,
        permissions: prev.permissions.filter(p => !groupPermissions.includes(p))
      }));
    } else {
      // Select all in group
      setFormData(prev => ({
        ...prev,
        permissions: [...new Set([...prev.permissions, ...groupPermissions])]
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      await onSubmit(formData);
    } catch (error: any) {
      setErrors({ submit: error.message || 'Failed to save role' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const permissionGroups = {
    'User & Role Management': [
      Permission.CRUD_USER,
      Permission.CRUD_ROLE,
      Permission.VIEW_ALL_STAFF,
      Permission.VIEW_OWN_STAFF
    ],
    'Roster Management': [
      Permission.ASSIGN_SHIFT,
      Permission.CREATE_ROSTER,
      Permission.MODIFY_ROSTER,
      Permission.PUBLISH_ROSTER,
      Permission.DELETE_ROSTER,
      Permission.VIEW_ROSTER
    ],
    'Task Management': [
      Permission.ASSIGN_TASK,
      Permission.MODIFY_TASK
    ],
    'Settings & Configuration': [
      Permission.MANAGE_SETTINGS,
      Permission.MANAGE_SHIFT_DEFINITIONS,
      Permission.MANAGE_ROSTER_TEMPLATES
    ],
    'Export & Share': [
      Permission.EXPORT_ROSTER,
      Permission.SHARE_ROSTER
    ],
    'Audit & Reports': [
      Permission.VIEW_AUDIT_LOG,
      Permission.VIEW_REPORTS
    ],
    'Special': [
      Permission.DELETE_SM_USER,
      Permission.DEMOTE_SM_USER,
      Permission.MANAGE_AD_HOC_PP
    ]
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">
            {role ? 'Edit Role' : 'Create New Role'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Role Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="input-base text-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="input-base text-gray-900"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">Permissions</label>
              <div className="border rounded-md p-4 space-y-4">
                {Object.entries(permissionGroups).map(([group, perms]) => {
                  const allSelected = perms.every(perm => formData.permissions.includes(perm));
                  const someSelected = perms.some(perm => formData.permissions.includes(perm));
                  
                  return (
                    <div key={group} className="border-b border-gray-200 pb-4 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900">{group}</h4>
                        <button
                          type="button"
                          onClick={() => togglePermissionGroup(perms)}
                          className={`text-xs px-3 py-1 rounded-md transition-colors ${
                            allSelected
                              ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                              : someSelected
                              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {allSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {perms.map(perm => (
                          <label key={perm} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={formData.permissions.includes(perm)}
                              onChange={() => togglePermission(perm)}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-700">{perm.replace(/_/g, ' ')}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {errors.submit && (
              <div className="text-red-600 text-sm">{errors.submit}</div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? 'Saving...' : role ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
