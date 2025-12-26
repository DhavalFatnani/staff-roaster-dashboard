'use client';

import { CoverageMetrics } from '@/types';

interface CoverageMeterProps {
  coverage: CoverageMetrics;
  totalAvailableStaff?: number; // Total staff with this shift as default preference
  engagedStaff?: number; // Number of unique users engaged (overrides coverage.actualStaff if provided)
  shiftId?: string; // Shift ID for display context
  shiftType?: 'morning' | 'evening'; // Deprecated: kept for backward compatibility
}

export default function CoverageMeter({ coverage, totalAvailableStaff, engagedStaff, shiftId, shiftType }: CoverageMeterProps) {
  const engaged = engagedStaff ?? coverage.actualStaff; // Use unique user count if provided, else fallback to slots
  const totalAvailable = totalAvailableStaff ?? coverage.minRequiredStaff; // Use prop if provided, fallback to coverage
  const available = totalAvailable - engaged;
  const percentage = totalAvailable > 0 ? Math.min(100, (engaged / totalAvailable) * 100) : 0;

  const getStatusColor = () => {
    if (totalAvailable === 0) {
      return { 
        bg: 'bg-gray-50', 
        border: 'border-gray-200', 
        text: 'text-gray-700', 
        icon: 'ℹ️',
        progressBar: 'bg-gray-600' // Darker for better contrast
      };
    }
    if (percentage < 50) {
      return { 
        bg: 'bg-yellow-50', 
        border: 'border-yellow-200', 
        text: 'text-yellow-700', 
        icon: '📊',
        progressBar: 'bg-yellow-600' // Darker yellow for better contrast
      };
    }
    if (percentage < 80) {
      return { 
        bg: 'bg-blue-50', 
        border: 'border-blue-200', 
        text: 'text-blue-700', 
        icon: '📈',
        progressBar: 'bg-blue-600' // Darker blue for better contrast
      };
    }
    return { 
      bg: 'bg-green-50', 
      border: 'border-green-200', 
      text: 'text-green-700', 
      icon: '✓',
      progressBar: 'bg-green-600' // Darker green for better contrast
    };
  };

  const status = getStatusColor();

  return (
    <div className={`border rounded-lg p-3 ${status.bg} ${status.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{status.icon}</span>
          <div>
            <span className="text-sm font-medium text-gray-700">
              {engaged} of {totalAvailable} engaged
            </span>
            {totalAvailable > 0 && (
              <span className={`text-xs ml-2 ${status.text} font-semibold`}>
                {percentage.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        {totalAvailable > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span>Engaged: <strong className="text-gray-900">{engaged}</strong></span>
            <span>Available: <strong className={available > 0 ? 'text-blue-600' : 'text-gray-900'}>{available}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
