'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Roster, ShiftDefinition } from '@/types';
import { format } from 'date-fns';
import { Plus, FileDown, Trash2, Edit, Calendar as CalendarIcon, Table, FileText } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import Modal, { ConfirmModal } from '@/components/Modal';

export default function RostersListPage() {
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'published' | 'archived'>('all');
  const [filterShiftId, setFilterShiftId] = useState<string>('all');
  const [searchDate, setSearchDate] = useState('');
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' }>({ isOpen: false, message: '' });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; rosterId: string | null }>({ isOpen: false, rosterId: null });

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (shifts.length > 0) {
      fetchRosters();
    }
  }, [filterStatus, filterShiftId, searchDate, shifts]);

  const fetchAllData = async () => {
    try {
      // Parallelize initial data fetching for faster load
      const [shiftsRes, rostersRes] = await Promise.all([
        authenticatedFetch('/api/shift-definitions?includeInactive=false'),
        authenticatedFetch('/api/rosters')
      ]);

      // Process shifts
      const shiftsResult = await shiftsRes.json();
      if (shiftsResult.success) {
        setShifts(shiftsResult.data || []);
      }

      // Process rosters
      const rostersResult = await rostersRes.json();
      if (rostersResult.success) {
        let filtered = rostersResult.data || [];
        
        if (filterStatus !== 'all') {
          filtered = filtered.filter((r: Roster) => r.status === filterStatus);
        }
        if (filterShiftId !== 'all') {
          filtered = filtered.filter((r: Roster) => r.shiftId === filterShiftId);
        }
        if (searchDate) {
          filtered = filtered.filter((r: Roster) => r.date === searchDate);
        }
        
        setRosters(filtered);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRosters = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch('/api/rosters');
      const result = await response.json();
      if (result.success) {
        let filtered = result.data || [];
        
        if (filterStatus !== 'all') {
          filtered = filtered.filter((r: Roster) => r.status === filterStatus);
        }
        if (filterShiftId !== 'all') {
          filtered = filtered.filter((r: Roster) => r.shiftId === filterShiftId);
        }
        if (searchDate) {
          filtered = filtered.filter((r: Roster) => r.date === searchDate);
        }
        
        setRosters(filtered);
      }
    } catch (error) {
      console.error('Failed to fetch rosters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (rosterId: string) => {
    setConfirmModal({ isOpen: true, rosterId });
  };

  const confirmDelete = async () => {
    const rosterId = confirmModal.rosterId;
    if (!rosterId) return;

    try {
      const response = await authenticatedFetch(`/api/rosters/${rosterId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      if (result.success) {
        fetchRosters();
        setAlert({ isOpen: true, message: 'Roster deleted successfully!', type: 'success' });
        setConfirmModal({ isOpen: false, rosterId: null });
      } else {
        setAlert({ isOpen: true, message: result.error?.message || 'Failed to delete roster', type: 'error' });
        setConfirmModal({ isOpen: false, rosterId: null });
      }
    } catch (error) {
      console.error('Failed to delete roster:', error);
      setAlert({ isOpen: true, message: 'Failed to delete roster', type: 'error' });
      setConfirmModal({ isOpen: false, rosterId: null });
    }
  };

  const handleExport = async (rosterId: string, format: 'csv' | 'pdf') => {
    try {
      const response = await authenticatedFetch(`/api/rosters/${rosterId}/export?format=${format}`);
      if (!response.ok) throw new Error('Export failed');
      
      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roster-${rosterId}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // For PDF, open in new window for printing
        const htmlContent = await response.text();
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          printWindow.onload = () => {
            printWindow.print();
          };
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      setAlert({ isOpen: true, message: 'Failed to export roster', type: 'error' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getShiftColor = (shiftName: string | undefined) => {
    if (!shiftName) return 'bg-gray-100 text-gray-800';
    const name = shiftName.toLowerCase();
    return name.includes('morning') ? 'bg-amber-100 text-amber-800' : 
           name.includes('evening') ? 'bg-indigo-100 text-indigo-800' :
           'bg-blue-100 text-blue-800';
  };

  const getShiftName = (roster: Roster) => {
    return roster.shift?.name || (roster as any).shiftType || 'Unknown Shift';
  };

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">All Rosters</h1>
          <p className="text-sm text-gray-500">View, edit, export, and manage all rosters</p>
        </div>
        <Link
          href="/dashboard/roster"
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors text-sm shadow-sm whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Create New Roster
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
              <input
                type="date"
                value={searchDate}
                onChange={(e) => {
                  setSearchDate(e.target.value);
                  fetchRosters();
                }}
                placeholder="Filter by date"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
              />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={filterShiftId}
            onChange={(e) => setFilterShiftId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
          >
            <option value="all">All Shifts</option>
            {shifts.map(shift => (
              <option key={shift.id} value={shift.id}>
                {shift.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Rosters Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="loader-spinner loader-spinner-lg"></div>
        </div>
      ) : rosters.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">No rosters found</p>
          <Link
            href="/dashboard/roster"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Create your first roster →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Shift</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Staff</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Coverage</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Created</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Updated By</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rosters.map((roster) => (
                <tr key={roster.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {roster.date ? format(new Date(roster.date), 'MMM d, yyyy') : '-'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {roster.date ? format(new Date(roster.date), 'EEEE') : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getShiftColor(getShiftName(roster))}`}>
                      {getShiftName(roster).toLowerCase().includes('morning') ? '🌅' : '🌙'} {getShiftName(roster)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(roster.status)}`}>
                      {roster.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {roster.coverage.actualStaff} / {roster.coverage.minRequiredStaff}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {roster.coverage.coveragePercentage.toFixed(0)}%
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {roster.createdAt ? format(new Date(roster.createdAt), 'MMM d, yyyy') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {roster.status === 'draft' && roster.updatedByUser ? (
                      <div>
                        <div className="font-medium text-gray-900">
                          {roster.updatedByUser.firstName} {roster.updatedByUser.lastName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {roster.updatedByUser.employeeId}
                        </div>
                      </div>
                    ) : roster.status === 'draft' && roster.updatedBy ? (
                      <span className="text-gray-400 text-xs">User ID: {roster.updatedBy.substring(0, 8)}...</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-1">
                      {roster.status === 'draft' && (
                        <Link
                          href={`/dashboard/roster?date=${roster.date}&shiftId=${roster.shiftId || (roster as any).shiftType}`}
                          className="group relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                            Edit
                          </span>
                        </Link>
                      )}
                      <button
                        onClick={() => handleExport(roster.id, 'csv')}
                        className="group relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Table className="w-4 h-4" />
                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          Export as CSV
                        </span>
                      </button>
                      <button
                        onClick={() => handleExport(roster.id, 'pdf')}
                        className="group relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          Export as PDF
                        </span>
                      </button>
                      <button
                        onClick={() => handleDelete(roster.id)}
                        className="group relative p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          Delete
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, rosterId: null })}
        onConfirm={confirmDelete}
        title="Delete Roster"
        message={confirmModal.rosterId ? 'Are you sure you want to delete this roster? This action cannot be undone.' : ''}
        type="warning"
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonStyle="danger"
      />
    </div>
  );
}
