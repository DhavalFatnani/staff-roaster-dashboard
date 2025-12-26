'use client';

import { useState, useEffect, useMemo } from 'react';
import { User, ShiftDefinition } from '@/types';
import { CheckCircle2 } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import Modal from '@/components/Modal';
import { shiftNamesMatch } from '@/utils/validators';

type ShiftPreference = string | null; // Stores shift name instead of just 'morning' | 'evening'
type ViewMode = 'templates' | 'all-staff';

// Helper to get shift color based on name
const getShiftColor = (shiftName: string) => {
  const name = shiftName.toLowerCase();
  if (name.includes('morning')) return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', headerBg: 'bg-amber-50', headerBorder: 'border-amber-200', headerText: 'text-amber-900', button: 'bg-amber-500', buttonHover: 'hover:bg-amber-600', buttonLight: 'bg-amber-50', buttonText: 'text-amber-700', buttonBorder: 'border-amber-300', buttonHoverLight: 'hover:bg-amber-100' };
  if (name.includes('evening')) return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900', headerBg: 'bg-indigo-50', headerBorder: 'border-indigo-200', headerText: 'text-indigo-900', button: 'bg-indigo-500', buttonHover: 'hover:bg-indigo-600', buttonLight: 'bg-indigo-50', buttonText: 'text-indigo-700', buttonBorder: 'border-indigo-300', buttonHoverLight: 'hover:bg-indigo-100' };
  // Default colors for other shifts
  return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', headerBg: 'bg-blue-50', headerBorder: 'border-blue-200', headerText: 'text-blue-900', button: 'bg-blue-500', buttonHover: 'hover:bg-blue-600', buttonLight: 'bg-blue-50', buttonText: 'text-blue-700', buttonBorder: 'border-blue-300', buttonHoverLight: 'hover:bg-blue-100' };
};

export default function ShiftPreferencesPage() {
  const [users, setUsers] = useState<(User & { role?: any })[]>([]);
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('templates');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedPreference, setSelectedPreference] = useState<ShiftPreference | 'all'>('all');
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [lastUpdatedUser, setLastUpdatedUser] = useState<string>('');
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'role' | 'preference' | 'employeeId'>('preference');
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' }>({ isOpen: false, message: '' });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      // Parallelize API calls for faster loading
      const [usersRes, shiftsRes] = await Promise.all([
        authenticatedFetch('/api/users?page=0'),
        authenticatedFetch('/api/shift-definitions?includeInactive=false')
      ]);

      // Process users response
      const usersResult = await usersRes.json();
      if (usersResult.success) {
        const activeUsers = usersResult.data.data.filter((u: User) => u.isActive && !u.deletedAt);
        setUsers(activeUsers);
      } else {
        console.error('Failed to fetch users:', usersResult.error);
      }

      // Process shifts response
      const shiftsResult = await shiftsRes.json();
      if (shiftsResult.success) {
        // Sort by displayOrder if available, otherwise by name
        const sortedShifts = (shiftsResult.data || []).sort((a: ShiftDefinition, b: ShiftDefinition) => {
          if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
            return a.displayOrder - b.displayOrder;
          }
          return a.name.localeCompare(b.name);
        });
        setShifts(sortedShifts);
      } else {
        console.error('Failed to fetch shifts:', shiftsResult.error);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShiftPreferenceChange = async (userId: string, preference: ShiftPreference) => {
    setSaving(prev => ({ ...prev, [userId]: true }));
    try {
      const response = await authenticatedFetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultShiftPreference: preference })
      });

      const result = await response.json();
      if (result.success) {
        setUsers(prev => prev.map(u => 
          u.id === userId 
            ? { ...u, defaultShiftPreference: preference as any }
            : u
        ));
        setLastUpdatedUser(userId);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 2000);
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to update shift preference', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to update shift preference:', error);
      setAlert({ isOpen: true, message: 'Failed to update shift preference', type: 'error' });
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleBulkUpdate = async (preference: ShiftPreference) => {
    if (selectedUserIds.size === 0) return;
    
    const userIds = Array.from(selectedUserIds);
    setSaving(prev => {
      const newState = { ...prev };
      userIds.forEach(id => newState[id] = true);
      return newState;
    });

    try {
      const promises = userIds.map(userId =>
        authenticatedFetch(`/api/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ defaultShiftPreference: preference })
        })
      );

      const results = await Promise.all(promises);
      const jsonResults = await Promise.all(results.map(r => r.json()));
      
      if (jsonResults.every(r => r.success)) {
        setUsers(prev => prev.map(u => 
          selectedUserIds.has(u.id)
            ? { ...u, defaultShiftPreference: preference as any }
            : u
        ));
        setSelectedUserIds(new Set());
        setBulkSelectMode(false);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 2000);
      } else {
        setAlert({ isOpen: true, message: 'Some updates failed. Please try again.', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to bulk update:', error);
      setAlert({ isOpen: true, message: 'Failed to update preferences', type: 'error' });
    } finally {
      setSaving(prev => {
        const newState = { ...prev };
        userIds.forEach(id => delete newState[id]);
        return newState;
      });
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  // Role priority for sorting
  const ROLE_PRIORITY: Record<string, number> = {
    'Shift In Charge': 1,
    'Inventory Executive': 2,
    'Picker Packer (Warehouse)': 3,
    'Picker Packer (Ad-Hoc)': 4,
    'Store Manager': 5,
  };

  const usersByRole = useMemo(() => {
    const grouped = users.reduce((acc, user) => {
      const roleName = user.role?.name || 'No Role';
      if (!acc[roleName]) {
        acc[roleName] = [];
      }
      acc[roleName].push(user);
      return acc;
    }, {} as Record<string, (User & { role?: any })[]>);

    // Sort roles by priority
    return Object.keys(grouped)
      .sort((a, b) => (ROLE_PRIORITY[a] || 99) - (ROLE_PRIORITY[b] || 99))
      .reduce((acc, roleName) => {
        acc[roleName] = grouped[roleName];
        return acc;
      }, {} as Record<string, (User & { role?: any })[]>);
  }, [users]);

  // Helper to normalize old shift preferences to new format
  const normalizeShiftPreference = (preference: string | null | undefined, availableShifts: ShiftDefinition[]): string | null => {
    if (!preference) return null;
    
    // If it already matches a shift name exactly, return it
    const exactMatch = availableShifts.find(s => s.name === preference);
    if (exactMatch) return preference;
    
    // Try to find a match using shiftNamesMatch
    const matchedShift = availableShifts.find(s => shiftNamesMatch(preference, s.name));
    if (matchedShift) return matchedShift.name;
    
    // If no match found, return null (will be counted as "none")
    return null;
  };

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let filtered = users.filter(user => {
      const matchesSearch = 
        (user.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.lastName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = !selectedRole || user.roleId === selectedRole;
      const normalizedUserPref = normalizeShiftPreference(user.defaultShiftPreference, shifts);
      const matchesPreference = 
        selectedPreference === 'all' || 
        (selectedPreference === 'none' ? !normalizedUserPref : normalizedUserPref === selectedPreference);
      return matchesSearch && matchesRole && matchesPreference;
    });

    // Sort users
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
          const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
          return nameA.localeCompare(nameB);
        case 'role':
          const roleA = (a.role?.name || '').toLowerCase();
          const roleB = (b.role?.name || '').toLowerCase();
          const priorityA = ROLE_PRIORITY[a.role?.name || ''] || 99;
          const priorityB = ROLE_PRIORITY[b.role?.name || ''] || 99;
          if (priorityA !== priorityB) return priorityA - priorityB;
          return roleA.localeCompare(roleB);
        case 'preference':
          const prefA = a.defaultShiftPreference || 'none';
          const prefB = b.defaultShiftPreference || 'none';
          // Create order map from shifts
          // Shifts with explicit displayOrder come first, then shifts without (sorted by name)
          const prefOrder: Record<string, number> = { 'none': 9999 };
          
          // First, sort shifts: those with displayOrder first (by displayOrder), then those without (by name)
          const sortedShifts = [...shifts].sort((s1, s2) => {
            if (s1.displayOrder !== undefined && s2.displayOrder !== undefined) {
              return s1.displayOrder - s2.displayOrder;
            }
            if (s1.displayOrder !== undefined) return -1; // s1 has order, s2 doesn't - s1 comes first
            if (s2.displayOrder !== undefined) return 1;  // s2 has order, s1 doesn't - s2 comes first
            // Both don't have order, sort by name
            return s1.name.localeCompare(s2.name);
          });
          
          // Assign order values: shifts with displayOrder use their value,
          // shifts without get a high base value (1000) + their position in the sorted array
          const baseOrderForUnordered = 1000;
          sortedShifts.forEach((shift, index) => {
            if (shift.displayOrder !== undefined) {
              prefOrder[shift.name] = shift.displayOrder;
            } else {
              prefOrder[shift.name] = baseOrderForUnordered + index;
            }
          });
          
          const orderA = prefOrder[prefA] ?? 9999;
          const orderB = prefOrder[prefB] ?? 9999;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          // Secondary sort by name
          const nameA2 = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
          const nameB2 = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
          return nameA2.localeCompare(nameB2);
        case 'employeeId':
          return (a.employeeId || '').localeCompare(b.employeeId || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [users, searchTerm, selectedRole, selectedPreference, sortBy, shifts]);

  // Get unique roles for filter
  const roles = useMemo(() => {
    return Array.from(new Set(users.map(u => ({ id: u.roleId, name: u.role?.name || 'No Role' }))))
      .filter((role, index, self) => index === self.findIndex(r => r.id === role.id))
      .sort((a, b) => (ROLE_PRIORITY[a.name] || 99) - (ROLE_PRIORITY[b.name] || 99));
  }, [users]);

  // Statistics - count users by shift preference (normalized)
  const stats = useMemo(() => {
    const shiftCounts: Record<string, number> = {};
    shifts.forEach(shift => {
      // Count both exact matches and normalized matches
      shiftCounts[shift.name] = users.filter(u => {
        const normalized = normalizeShiftPreference(u.defaultShiftPreference, shifts);
        return normalized === shift.name;
      }).length;
    });
    const none = users.filter(u => {
      const normalized = normalizeShiftPreference(u.defaultShiftPreference, shifts);
      return !normalized;
    }).length;
    const total = users.length;
    return { shiftCounts, none, total };
  }, [users, shifts]);

  // Get role color with subtle colors
  const getRoleColor = (roleName: string) => {
    const role = roleName.toLowerCase();
    if (role.includes('store manager')) return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    if (role.includes('shift in charge')) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    if (role.includes('inventory executive')) return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    if (role.includes('picker packer')) {
      if (role.includes('warehouse')) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
      return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' };
    }
    return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  };

  const toggleRoleExpansion = (roleName: string, shiftName: string) => {
    const key = `${shiftName}-${roleName}`;
    setExpandedRoles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Migration function to update old shift preferences to new format
  const migrateShiftPreferences = async () => {
    const usersToMigrate = users.filter(u => {
      const normalized = normalizeShiftPreference(u.defaultShiftPreference, shifts);
      return u.defaultShiftPreference && normalized && u.defaultShiftPreference !== normalized;
    });

    if (usersToMigrate.length === 0) {
      setAlert({ isOpen: true, message: 'No users need migration. All preferences are already in the new format.', type: 'info' });
      return;
    }

    try {
      let migrated = 0;
      let failed = 0;

      for (const user of usersToMigrate) {
        const normalized = normalizeShiftPreference(user.defaultShiftPreference, shifts);
        if (!normalized) continue;

        try {
          const response = await authenticatedFetch(`/api/users/${user.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultShiftPreference: normalized })
          });

          const result = await response.json();
          if (result.success) {
            migrated++;
            // Update local state
            setUsers(prev => prev.map(u => 
              u.id === user.id 
                ? { ...u, defaultShiftPreference: normalized as any }
                : u
            ));
          } else {
            failed++;
          }
        } catch (error) {
          console.error(`Failed to migrate user ${user.id}:`, error);
          failed++;
        }
      }

      setAlert({ 
        isOpen: true, 
        message: `Migration complete: ${migrated} users migrated, ${failed} failed.`, 
        type: migrated > 0 ? 'success' : 'error' 
      });
    } catch (error) {
      console.error('Migration error:', error);
      setAlert({ isOpen: true, message: 'Failed to migrate shift preferences', type: 'error' });
    }
  };

  // Check if migration is needed
  const needsMigration = useMemo(() => {
    return users.some(u => {
      const normalized = normalizeShiftPreference(u.defaultShiftPreference, shifts);
      return u.defaultShiftPreference && normalized && u.defaultShiftPreference !== normalized;
    });
  }, [users, shifts]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="loader-spinner loader-spinner-lg"></div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Shift Preferences</h1>
            <p className="text-sm text-gray-500">Manage default shift assignments</p>
          </div>
          <div className="flex gap-2 items-center">
            {needsMigration && (
              <button
                onClick={migrateShiftPreferences}
                className="px-3 py-1.5 text-sm rounded-md font-medium transition-colors bg-amber-500 text-white hover:bg-amber-600 whitespace-nowrap"
                title="Migrate old shift preferences (morning/evening) to new format (Morning Shift/Evening Shift)"
              >
                Migrate Preferences
              </button>
            )}
            <button
              onClick={() => setViewMode('templates')}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                viewMode === 'templates'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => setViewMode('all-staff')}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                viewMode === 'all-staff'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              All Staff
            </button>
          </div>
        </div>

        {/* Statistics Cards - Dynamic based on shifts */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {shifts.map((shift, index) => {
            const count = stats.shiftCounts[shift.name] || 0;
            const colors = getShiftColor(shift.name);
            return (
              <div key={shift.id} className={`bg-white border-l-4 ${colors.border} border border-gray-200 rounded-lg p-3`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">{shift.name}</p>
                    <p className="text-lg font-semibold text-gray-900">{count}</p>
                    <p className={`text-xs ${colors.text} mt-0.5`}>
                      {stats.total > 0 ? Math.round((count / stats.total) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="bg-white border-l-4 border-l-gray-400 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">No Preference</p>
                <p className="text-lg font-semibold text-gray-900">{stats.none}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {stats.total > 0 ? Math.round((stats.none / stats.total) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white border-l-4 border-l-blue-400 border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Total Staff</p>
                <p className="text-lg font-semibold text-gray-900">{stats.total}</p>
                <p className="text-xs text-blue-600 mt-0.5">Active</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Templates View - Dynamic based on shifts */}
      {viewMode === 'templates' && (
        <div className={`grid grid-cols-1 ${shifts.length <= 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-4`}>
          {shifts.map((shift) => {
            // Use backward-compatible matching for shift preferences
            // Handles old enum values ('morning', 'evening') matching new shift names ('Morning Shift', etc.)
            const shiftUsers = users.filter(u => 
              u.defaultShiftPreference && shiftNamesMatch(u.defaultShiftPreference, shift.name)
            );
            const colors = getShiftColor(shift.name);
            return (
              <div key={shift.id} className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
                <div className={`${colors.headerBg} border-b ${colors.headerBorder} px-4 py-3`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className={`text-sm font-semibold ${colors.headerText}`}>{shift.name}</h2>
                      <p className={`text-xs ${colors.text} mt-0.5`}>{shiftUsers.length} staff</p>
                    </div>
                    <span className={`text-xs font-medium ${colors.headerText} ${colors.bg} px-2 py-1 rounded`}>
                      {shiftUsers.length}
                    </span>
                  </div>
                </div>
                <div className="p-3 max-h-[600px] overflow-y-auto">
                  {shiftUsers.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-sm text-gray-500">No staff assigned</p>
                      <p className="text-xs text-gray-400 mt-1">Assign from "All Staff" view</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(usersByRole).map(([roleName, roleUsers]) => {
                        const shiftRoleUsers = roleUsers.filter(u => {
                          const normalized = normalizeShiftPreference(u.defaultShiftPreference, shifts);
                          return normalized === shift.name;
                        });
                        if (shiftRoleUsers.length === 0) return null;
                        const isExpanded = expandedRoles.has(`${shift.name}-${roleName}`);
                        return (
                          <div key={roleName} className="mb-3">
                            <button
                              onClick={() => toggleRoleExpansion(roleName, shift.name)}
                              className={`w-full ${colors.bg} border ${colors.border} rounded px-3 py-2 mb-1.5 flex items-center justify-between ${colors.buttonHoverLight} transition-colors`}
                            >
                              <h3 className={`text-sm font-bold ${colors.text}`}>{roleName}</h3>
                              <span className={`text-xs ${colors.text} ml-2`}>
                                {isExpanded ? '−' : '+'} {shiftRoleUsers.length}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="space-y-1">
                                {shiftRoleUsers.map(user => (
                                  <div
                                    key={user.id}
                                    className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 hover:bg-gray-50 transition-colors group"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {user.firstName || ''} {user.lastName || ''}
                                      </p>
                                      <p className="text-xs text-gray-500 truncate">
                                        {user.employeeId}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => handleShiftPreferenceChange(user.id, null)}
                                      disabled={saving[user.id]}
                                      className="ml-2 px-2 py-1 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-all opacity-0 group-hover:opacity-100"
                                      title="Remove"
                                    >
                                      {saving[user.id] ? '...' : '×'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* All Staff View */}
      {viewMode === 'all-staff' && (
        <div className="bg-white rounded-xl border border-gray-200/60 overflow-hidden">
          {/* Filters and Bulk Actions */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            {/* Search and Filters Row */}
            <div className="flex flex-col lg:flex-row gap-3 mb-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search by name or employee ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white placeholder-gray-600"
                />
              </div>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white w-full lg:w-40"
              >
                <option value="">All Roles</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedPreference === null ? 'none' : selectedPreference === 'all' ? 'all' : selectedPreference}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedPreference(value === 'all' ? 'all' : value === 'none' ? null : value as ShiftPreference);
                }}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white w-full lg:w-40"
              >
                <option value="all">All Preferences</option>
                {shifts.map(shift => (
                  <option key={shift.id} value={shift.name}>
                    {shift.name}
                  </option>
                ))}
                <option value="none">No Preference</option>
              </select>
            </div>

            {/* Sort Options */}
            <div className="flex flex-col sm:flex-row gap-3 mb-3 pb-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-gray-900 bg-white"
                >
                  <option value="preference">Preference</option>
                  <option value="name">Name</option>
                  <option value="role">Role</option>
                  <option value="employeeId">Employee ID</option>
                </select>
              </div>
            </div>

            {/* Bulk Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setBulkSelectMode(!bulkSelectMode);
                    setSelectedUserIds(new Set());
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                    bulkSelectMode
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {bulkSelectMode ? 'Cancel' : 'Bulk Select'}
                </button>
                {bulkSelectMode && selectedUserIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">
                      {selectedUserIds.size} selected
                    </span>
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-gray-700 hover:text-gray-900 font-medium"
                    >
                      {selectedUserIds.size === filteredUsers.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                )}
              </div>
              {bulkSelectMode && selectedUserIds.size > 0 && (
                <div className="flex flex-wrap gap-2">
                  {shifts.map(shift => {
                    const colors = getShiftColor(shift.name);
                    return (
                      <button
                        key={shift.id}
                        onClick={() => handleBulkUpdate(shift.name)}
                        disabled={Object.values(saving).some(v => v)}
                        className={`px-3 py-1.5 ${colors.button} text-white rounded-md ${colors.buttonHover} disabled:opacity-50 font-medium text-xs`}
                      >
                        {shift.name} ({selectedUserIds.size})
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handleBulkUpdate(null)}
                    disabled={Object.values(saving).some(v => v)}
                    className="px-3 py-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50 font-medium text-xs"
                  >
                    Clear ({selectedUserIds.size})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Staff List - Table View */}
          <div className="p-4">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm text-gray-500">No staff found</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {bulkSelectMode && (
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 text-gray-900 rounded focus:ring-gray-400"
                          />
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Employee ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Preference</th>
                      {!bulkSelectMode && (
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map(user => {
                      const isSelected = selectedUserIds.has(user.id);
                      const isSaving = saving[user.id];
                      const normalizedPreference = normalizeShiftPreference(user.defaultShiftPreference, shifts);
                      const userShift = normalizedPreference ? shifts.find(s => s.name === normalizedPreference) : null;
                      const shiftColors = userShift ? getShiftColor(userShift.name) : null;
                      return (
                        <tr
                          key={user.id}
                          className={`hover:bg-gray-50 transition-colors ${
                            isSelected ? 'bg-blue-50' : ''
                          } ${isSaving ? 'opacity-50' : ''}`}
                        >
                          {bulkSelectMode && (
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleUserSelection(user.id)}
                                className="w-4 h-4 text-gray-900 rounded focus:ring-gray-400"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">
                              {user.firstName || ''} {user.lastName || ''}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-gray-600">{user.employeeId}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                              user.role?.name?.toLowerCase().includes('store manager') ? 'bg-red-100 text-red-700' :
                              user.role?.name?.toLowerCase().includes('shift in charge') ? 'bg-blue-100 text-blue-700' :
                              user.role?.name?.toLowerCase().includes('inventory executive') ? 'bg-purple-100 text-purple-700' :
                              user.role?.name?.toLowerCase().includes('warehouse') ? 'bg-green-100 text-green-700' :
                              user.role?.name?.toLowerCase().includes('picker packer') ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {user.role?.name || 'No Role'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {normalizedPreference && userShift ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${shiftColors?.bg} ${shiftColors?.text}`}>
                                {userShift.name.toLowerCase().includes('morning') ? '🌅' : userShift.name.toLowerCase().includes('evening') ? '🌙' : '⏰'} {normalizedPreference}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500">
                                No preference
                              </span>
                            )}
                          </td>
                          {!bulkSelectMode && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2 flex-wrap">
                                {shifts.map(shift => {
                                  const colors = getShiftColor(shift.name);
                                  const isSelected = normalizedPreference === shift.name;
                                  return (
                                    <button
                                      key={shift.id}
                                      onClick={() => handleShiftPreferenceChange(user.id, shift.name)}
                                      disabled={isSaving}
                                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                        isSelected
                                          ? `${colors.button} text-white shadow-sm`
                                          : `${colors.buttonLight} ${colors.buttonText} border ${colors.buttonBorder} ${colors.buttonHoverLight}`
                                      } disabled:opacity-50`}
                                      title={`Set ${shift.name}`}
                                    >
                                      {shift.name}
                                    </button>
                                  );
                                })}
                                {user.defaultShiftPreference && (
                                  <button
                                    onClick={() => handleShiftPreferenceChange(user.id, null)}
                                    disabled={isSaving}
                                    className="px-2 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 disabled:opacity-50 text-xs font-medium"
                                    title="Clear preference"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-up z-50">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm font-medium">Updated successfully</span>
        </div>
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
