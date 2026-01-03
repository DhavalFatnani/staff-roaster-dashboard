'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useTestEnvironment } from '@/hooks/useTestEnvironment';
import { format } from 'date-fns';

export default function TestModeBanner() {
  const { isTestMode, testSessionData, endTestSession } = useTestEnvironment();

  if (!isTestMode) return null;

  const startTime = testSessionData?.startTime 
    ? format(new Date(testSessionData.startTime), 'MMM d, yyyy HH:mm')
    : 'Unknown';

  return (
    <div className="bg-yellow-500 text-white px-4 py-3 flex items-center justify-between shadow-md z-50">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1">
          <div className="font-semibold text-sm">
            Test Environment Active
          </div>
          <div className="text-xs opacity-90">
            Started: {startTime} • {testSessionData?.userIds?.length || 0} test users created
          </div>
        </div>
      </div>
      <button
        onClick={endTestSession}
        className="ml-4 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded text-sm font-medium transition-colors flex items-center gap-2"
        title="End test session (Ctrl + Option + Cmd + T)"
      >
        End Test Session
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

