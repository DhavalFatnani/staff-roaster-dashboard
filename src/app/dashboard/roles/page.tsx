'use client';

import { useState, useEffect } from 'react';
import { Role, CreateRoleRequest, UpdateRoleRequest, Permission } from '@/types';
import RoleForm from '@/components/RoleForm';
import PermissionGuard from '@/components/PermissionGuard';
import { usePermissions } from '@/hooks/usePermissions';
import { Plus, Shield } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';

export default function RoleManagementPage() {
  const { canManageRoles } = usePermissions();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  useEffect(() => {
    fetchRoles();
  }, []);

  async function fetchRoles() {
    try {
      const response = await authenticatedFetch('/api/roles');
      const result = await response.json();
      if (result.success) {
        setRoles(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateRole = async (data: CreateRoleRequest) => {
    try {
      const response = await authenticatedFetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchRoles();
        setShowRoleForm(false);
      } else {
        alert(result.error?.message || 'Failed to create role');
      }
    } catch (error) {
      console.error('Failed to create role:', error);
      alert('Failed to create role');
    }
  };

  const handleUpdateRole = async (data: UpdateRoleRequest) => {
    if (!selectedRole) return;
    try {
      const response = await authenticatedFetch(`/api/roles/${selectedRole.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result.success) {
        await fetchRoles();
        setShowRoleForm(false);
        setSelectedRole(null);
      } else {
        alert(result.error?.message || 'Failed to update role');
      }
    } catch (error) {
      console.error('Failed to update role:', error);
      alert('Failed to update role');
    }
  };

  const handleSubmit = async (data: CreateRoleRequest | UpdateRoleRequest) => {
    if (selectedRole) {
      await handleUpdateRole(data as UpdateRoleRequest);
    } else {
      await handleCreateRole(data as CreateRoleRequest);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (!window.confirm(`Delete role "${role.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const response = await authenticatedFetch(`/api/roles/${role.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        await fetchRoles();
      } else {
        alert(result.error?.message || 'Failed to delete role');
      }
    } catch (error) {
      console.error('Failed to delete role:', error);
      alert('Failed to delete role');
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <PermissionGuard permission={Permission.CRUD_ROLE}>
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Role Management</h1>
          <p className="text-sm text-gray-500">Create and manage user roles</p>
        </div>
        {canManageRoles() && (
          <button
            onClick={() => {
              setSelectedRole(null);
              setShowRoleForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Role
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map(role => (
          <div key={role.id} className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-6 hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-slate-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-base text-gray-900">{role.name}</h3>
                  {role.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{role.description}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
              </p>
              {canManageRoles() && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedRole(role);
                      setShowRoleForm(true);
                    }}
                    className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                  >
                    Edit
                  </button>
                  {!role.isSystemRole && (
                    <button
                      onClick={() => handleDeleteRole(role)}
                      className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showRoleForm && (
        <RoleForm
          role={selectedRole || undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowRoleForm(false);
            setSelectedRole(null);
          }}
          isOpen={showRoleForm}
        />
      )}
      </div>
    </PermissionGuard>
  );
}
