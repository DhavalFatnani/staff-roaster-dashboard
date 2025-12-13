'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Roster } from '@/types';
import { format } from 'date-fns';
import { Plus, FileDown, Trash2, Edit, Calendar as CalendarIcon } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';

export default function RostersListPage() {
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'published' | 'archived'>('all');
  const [filterShift, setFilterShift] = useState<'all' | 'morning' | 'evening'>('all');
  const [searchDate, setSearchDate] = useState('');

  useEffect(() => {
    fetchRosters();
  }, [filterStatus, filterShift]);

  const fetchRosters = async () => {
    try {
      const response = await authenticatedFetch('/api/rosters');
      const result = await response.json();
      if (result.success) {
        let filtered = result.data || [];
        
        if (filterStatus !== 'all') {
          filtered = filtered.filter((r: Roster) => r.status === filterStatus);
        }
        if (filterShift !== 'all') {
          filtered = filtered.filter((r: Roster) => r.shiftType === filterShift);
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

  const handleDelete = async (rosterId: string) => {
    if (!confirm('Are you sure you want to delete this roster? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await authenticatedFetch(`/api/rosters/${rosterId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      if (result.success) {
        fetchRosters();
      } else {
        alert(result.error?.message || 'Failed to delete roster');
      }
    } catch (error) {
      console.error('Failed to delete roster:', error);
      alert('Failed to delete roster');
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
      alert('Failed to export roster');
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

  const getShiftColor = (shift: string) => {
    return shift === 'morning' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800';
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">All Rosters</h1>
          <p className="text-sm text-gray-500">View, edit, export, and manage all rosters</p>
        </div>
        <Link
          href="/dashboard/roster"
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors text-sm shadow-sm"
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
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
          >
            <option value="all">All Shifts</option>
            <option value="morning">Morning</option>
            <option value="evening">Evening</option>
          </select>
        </div>
      </div>

      {/* Rosters Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading rosters...</p>
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
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Shift</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Staff</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Coverage</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Created</th>
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
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getShiftColor(roster.shiftType)}`}>
                      {roster.shiftType === 'morning' ? '🌅' : '🌙'} {roster.shiftType}
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
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/dashboard/roster?date=${roster.date}&shift=${roster.shiftType}`}
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleExport(roster.id, 'csv')}
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Export CSV"
                      >
                        <FileDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleExport(roster.id, 'pdf')}
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Export PDF"
                      >
                        <FileDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(roster.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
