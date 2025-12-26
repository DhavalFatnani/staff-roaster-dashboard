'use client';

import { useState } from 'react';
import { RosterSlot, AttendanceStatus } from '@/types';
import { authenticatedFetch } from '@/lib/api-client';
import { format } from 'date-fns';
import { Clock, CheckCircle2, XCircle } from 'lucide-react';

interface CheckInOutButtonProps {
  slot: RosterSlot;
  rosterId: string;
  currentUserId: string;
  onUpdate?: () => void;
}

export default function CheckInOutButton({
  slot,
  rosterId,
  currentUserId,
  onUpdate
}: CheckInOutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if this slot belongs to the current user
  if (slot.userId !== currentUserId) {
    return null;
  }

  const actuals = slot.actuals;
  const isCheckedIn = !!actuals?.checkedInAt;
  const isCheckedOut = !!actuals?.checkedOutAt;
  const attendanceStatus = actuals?.attendanceStatus;

  const handleCheckIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch(`/api/rosters/${rosterId}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slotId: slot.id
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to check in');
      }

      onUpdate?.();
    } catch (err: any) {
      setError(err.message || 'Failed to check in');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch(`/api/rosters/${rosterId}/check-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slotId: slot.id
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to check out');
      }

      onUpdate?.();
    } catch (err: any) {
      setError(err.message || 'Failed to check out');
    } finally {
      setLoading(false);
    }
  };

  // Status badge
  const getStatusBadge = () => {
    if (isCheckedOut) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
          <CheckCircle2 className="w-3 h-3" />
          Checked Out
        </span>
      );
    }

    if (isCheckedIn) {
      const statusColors: Record<AttendanceStatus, string> = {
        [AttendanceStatus.PRESENT]: 'bg-green-100 text-green-700',
        [AttendanceStatus.LATE]: 'bg-yellow-100 text-yellow-700',
        [AttendanceStatus.LEFT_EARLY]: 'bg-orange-100 text-orange-700',
        [AttendanceStatus.ABSENT]: 'bg-red-100 text-red-700',
        [AttendanceStatus.SUBSTITUTED]: 'bg-blue-100 text-blue-700'
      };

      const statusLabels: Record<AttendanceStatus, string> = {
        [AttendanceStatus.PRESENT]: 'Present',
        [AttendanceStatus.LATE]: 'Late',
        [AttendanceStatus.LEFT_EARLY]: 'Left Early',
        [AttendanceStatus.ABSENT]: 'Absent',
        [AttendanceStatus.SUBSTITUTED]: 'Substituted'
      };

      const colorClass = attendanceStatus ? statusColors[attendanceStatus] || statusColors[AttendanceStatus.PRESENT] : statusColors[AttendanceStatus.PRESENT];
      const label = attendanceStatus ? statusLabels[attendanceStatus] || 'Present' : 'Present';

      return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${colorClass}`}>
          <Clock className="w-3 h-3" />
          {label}
        </span>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col gap-2">
      {getStatusBadge()}
      
      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
          {error}
        </div>
      )}

      {!isCheckedIn && (
        <button
          onClick={handleCheckIn}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Checking In...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Check In
            </>
          )}
        </button>
      )}

      {isCheckedIn && !isCheckedOut && (
        <button
          onClick={handleCheckOut}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Checking Out...
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4" />
              Check Out
            </>
          )}
        </button>
      )}

      {actuals?.checkedInAt && (
        <div className="text-xs text-gray-600">
          Checked in: {format(new Date(actuals.checkedInAt), 'HH:mm')}
        </div>
      )}

      {actuals?.checkedOutAt && (
        <div className="text-xs text-gray-600">
          Checked out: {format(new Date(actuals.checkedOutAt), 'HH:mm')}
        </div>
      )}
    </div>
  );
}

