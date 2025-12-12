'use client';

import { useState } from 'react';
import { User, Role, CreateUserRequest, UpdateUserRequest, ExperienceLevel, PPType, ShiftType } from '@/types';

interface UserFormProps {
  user?: User;
  roles: Role[];
  onSubmit: (data: CreateUserRequest | UpdateUserRequest) => Promise<void>;
  onCancel: () => void;
  isOpen: boolean;
}

export default function UserForm({ user, roles, onSubmit, onCancel, isOpen }: UserFormProps) {
  const [formData, setFormData] = useState<CreateUserRequest>({
    employeeId: user?.employeeId || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    roleId: user?.roleId || '',
    experienceLevel: user?.experienceLevel || ExperienceLevel.FRESHER,
    ppType: user?.ppType,
    weekOffsCount: user?.weekOffsCount ?? 0,
    defaultShiftPreference: user?.defaultShiftPreference,
    isActive: user?.isActive !== undefined ? user.isActive : true
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRole = roles.find(r => r.id === formData.roleId);
  // Check if role is a Picker Packer role (warehouse, ad-hoc, or generic)
  const isPPRole = selectedRole?.name.toLowerCase().includes('picker packer') || 
                   selectedRole?.name.toLowerCase().includes('pp');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      await onSubmit(formData);
    } catch (error: any) {
      setErrors({ submit: error.message || 'Failed to save user' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWeekOffsCountChange = (value: number) => {
    setFormData(prev => ({
      ...prev,
      weekOffsCount: Math.max(0, Math.min(7, value))
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4 text-gray-900">
            {user ? 'Edit User' : 'Create New User'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Employee ID *</label>
                <input
                  type="text"
                  value={formData.employeeId}
                  onChange={(e) => setFormData(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="input-base text-gray-900"
                  required
                  disabled={!!user}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Role *</label>
                <select
                  value={formData.roleId}
                  onChange={(e) => setFormData(prev => ({ ...prev, roleId: e.target.value }))}
                  className="input-base text-gray-900"
                  required
                >
                  <option value="">Select role</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">First Name *</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  className="input-base text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Last Name *</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  className="input-base text-gray-900"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="input-base text-gray-900"
                  placeholder="Optional - can be added later"
                />
                <p className="text-xs text-gray-500 mt-1">Optional. SM, SI, IE can add/update emails for any user.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="input-base text-gray-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">Experience Level *</label>
                <select
                  value={formData.experienceLevel}
                  onChange={(e) => setFormData(prev => ({ ...prev, experienceLevel: e.target.value as ExperienceLevel }))}
                  className="input-base text-gray-900"
                  required
                >
                  <option value={ExperienceLevel.FRESHER}>Fresher</option>
                  <option value={ExperienceLevel.EXPERIENCED}>Experienced</option>
                </select>
              </div>

              {isPPRole && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">PP Type *</label>
                  <select
                    value={formData.ppType || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, ppType: e.target.value as PPType }))}
                    className="input-base text-gray-900"
                    required
                  >
                    <option value="">Select type</option>
                    <option value={PPType.WAREHOUSE}>Warehouse</option>
                    <option value={PPType.AD_HOC}>Ad-Hoc</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Week Offs Count (Days per Week)</label>
              <input
                type="number"
                min="0"
                max="7"
                value={formData.weekOffsCount}
                onChange={(e) => handleWeekOffsCountChange(parseInt(e.target.value) || 0)}
                className="input-base text-gray-900"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Number of days off per week (0-7). Days are rotational.</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Default Shift Preference</label>
              <select
                value={formData.defaultShiftPreference || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, defaultShiftPreference: e.target.value as ShiftType || undefined }))}
                className="input-base text-gray-900"
              >
                <option value="">No preference</option>
                <option value={ShiftType.MORNING}>Morning</option>
                <option value={ShiftType.EVENING}>Evening</option>
              </select>
            </div>

            {user && (
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Active Staff Member
                  </span>
                </label>
                <p className="text-xs text-gray-500">
                  Inactive staff will not appear in task assignment sections
                </p>
              </div>
            )}

            {errors.submit && (
              <div className="text-red-600 text-sm">{errors.submit}</div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium shadow-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all text-sm font-medium shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : user ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
