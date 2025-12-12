'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Activity, Filter, X } from 'lucide-react';

interface AuditLog {
  id: string;
  store_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string | null;
  changes: any;
  metadata: any;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
  user?: {
    firstName: string;
    lastName: string;
    employeeId: string;
  };
}

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    dateFrom: '',
    dateTo: '',
    userId: ''
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchLogs();
  }, [page, filters]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
        ...(filters.dateTo && { dateTo: filters.dateTo }),
        ...(filters.userId && { userId: filters.userId })
      });

      const response = await fetch(`/api/activity-logs?${params}`);
      const result = await response.json();
      if (result.success) {
        setLogs(result.data.logs || []);
        setTotalPages(result.data.totalPages || 1);
      } else {
        console.error('Failed to fetch logs:', result.error);
        setLogs([]);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATE')) return 'bg-green-100 text-green-800';
    if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-800';
    if (action.includes('DELETE')) return 'bg-red-100 text-red-800';
    if (action.includes('PUBLISH')) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
            <p className="text-sm text-gray-500">Detailed system activity and audit trail</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <input
            type="text"
            placeholder="Action (e.g., CREATE, UPDATE)"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 placeholder-gray-600"
          />
          <input
            type="text"
            placeholder="Entity Type"
            value={filters.entityType}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 placeholder-gray-600"
          />
          <input
            type="date"
            placeholder="From Date"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
          />
          <input
            type="date"
            placeholder="To Date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900"
          />
          <button
            onClick={() => setFilters({ action: '', entityType: '', dateFrom: '', dateTo: '', userId: '' })}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium shadow-sm"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-lg mb-2">No activity logs found</p>
          <p className="text-gray-400 text-sm">Try adjusting your filters or check back later</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Timestamp</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Entity</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(parseISO(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {log.user?.employeeId || log.user_id.substring(0, 8)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{log.entity_type}</div>
                      {log.entity_name && (
                        <div className="text-xs text-gray-500">{log.entity_name}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {log.changes && Object.keys(log.changes).length > 0 && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                            View Changes
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-auto max-w-md">
                            {JSON.stringify(log.changes, null, 2)}
                          </pre>
                        </details>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details className="text-xs mt-1">
                          <summary className="cursor-pointer text-purple-600 hover:text-purple-800">
                            View Metadata
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-auto max-w-md">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.ip_address || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 disabled:opacity-50 disabled:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-900 disabled:opacity-50 disabled:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
