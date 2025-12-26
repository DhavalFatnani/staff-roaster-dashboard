'use client';

import { RosterSlot, AttendanceStatus } from '@/types';
import { CheckCircle2, XCircle, Clock, AlertCircle, Users, Download, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';

interface ActualsSummaryProps {
  slots: RosterSlot[];
  rosterDate?: string;
  shiftName?: string;
}

// Helper function to parse time string (HH:mm) to minutes for comparison
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Helper function to format time difference
function formatTimeDifference(planned: string, actual: string): string {
  const plannedMin = parseTimeToMinutes(planned);
  const actualMin = parseTimeToMinutes(actual);
  const diff = actualMin - plannedMin;
  
  if (diff === 0) return '';
  if (diff > 0) return `+${diff} min`;
  return `${diff} min`;
}

// Export function to generate CSV comparison report (simplified and cleaner)
function exportActualsComparisonCSV(slots: RosterSlot[], rosterDate?: string, shiftName?: string): void {
  const lines: string[] = [];
  
  // Header with metadata
  const dateStr = rosterDate 
    ? format(parseISO(rosterDate), 'MMMM d, yyyy')
    : format(new Date(), 'MMMM d, yyyy');
  const shiftStr = shiftName || 'Unknown Shift';
  
  lines.push(`Roster vs Actuals Comparison Report`);
  lines.push(`Date: ${dateStr}`);
  lines.push(`Shift: ${shiftStr}`);
  lines.push(`Generated: ${format(new Date(), 'MMMM d, yyyy HH:mm:ss')}`);
  lines.push(''); // Empty line
  
  // Summary Metrics
  const totalSlots = slots.length;
  const slotsWithActuals = slots.filter(s => s.actuals?.checkedInAt || s.actuals?.attendanceStatus).length;
  const presentCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.PRESENT).length;
  const absentCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.ABSENT).length;
  const lateCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.LATE).length;
  const leftEarlyCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.LEFT_EARLY).length;
  const attendanceRate = totalSlots > 0 ? ((presentCount + lateCount + leftEarlyCount) / totalSlots) * 100 : 0;
  
  lines.push('Summary');
  lines.push(`Total Slots,${totalSlots}`);
  lines.push(`Recorded,${slotsWithActuals}`);
  lines.push(`Attendance Rate,${attendanceRate.toFixed(0)}%`);
  lines.push(`Present,${presentCount}`);
  lines.push(`Absent,${absentCount}`);
  lines.push(`Late,${lateCount}`);
  lines.push(`Left Early,${leftEarlyCount}`);
  lines.push(''); // Empty line
  
  // Column headers
  const headers = [
    'Name',
    'Role',
    'Planned Start',
    'Actual Start',
    'Difference',
    'Planned End',
    'Actual End',
    'Difference',
    'Status'
  ];
  
  lines.push(headers.map(h => `"${h}"`).join(','));
  
  // Process each slot
  slots.forEach(slot => {
    const user = slot.user;
    const actuals = slot.actuals;
    
    // Calculate time differences
    const startDiff = actuals?.actualStartTime && slot.startTime
      ? formatTimeDifference(slot.startTime, actuals.actualStartTime)
      : '';
    const endDiff = actuals?.actualEndTime && slot.endTime
      ? formatTimeDifference(slot.endTime, actuals.actualEndTime)
      : '';
    
    const row: string[] = [
      user ? `"${user.firstName} ${user.lastName}"` : 'Vacant Slot',
      user?.role?.name || 'N/A',
      slot.startTime || '-',
      actuals?.actualStartTime || '-',
      startDiff || '-',
      slot.endTime || '-',
      actuals?.actualEndTime || '-',
      endDiff || '-',
      actuals?.attendanceStatus || 'Not Recorded'
    ];
    
    lines.push(row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('\n') || cell.includes('"'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(','));
  });
  
  // Download CSV
  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  const filename = `actuals-comparison-${dateStr.replace(/\s+/g, '-')}-${shiftStr.replace(/\s+/g, '-')}.csv`;
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

// Export function to generate PDF comparison report
async function exportActualsComparisonPDF(slots: RosterSlot[], rosterDate?: string, shiftName?: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  
  const doc = new jsPDF('landscape'); // Landscape orientation
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  let yPosition = margin;
  
  // Helper to add new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
  };
  
  // Header
  const dateStr = rosterDate 
    ? format(parseISO(rosterDate), 'MMMM d, yyyy')
    : format(new Date(), 'MMMM d, yyyy');
  const shiftStr = shiftName || 'Unknown Shift';
  
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Roster vs Actuals Comparison', margin, yPosition);
  yPosition += 8;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${dateStr}`, margin, yPosition);
  doc.text(`Shift: ${shiftStr}`, margin + 80, yPosition);
  yPosition += 6;
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy HH:mm')}`, margin, yPosition);
  yPosition += 10;
  
  // Summary Metrics Box
  checkPageBreak(30);
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, yPosition, contentWidth, 25, 2, 2, 'FD');
  
  const presentCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.PRESENT).length;
  const absentCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.ABSENT).length;
  const lateCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.LATE).length;
  const leftEarlyCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.LEFT_EARLY).length;
  const totalSlots = slots.length;
  const slotsWithActuals = slots.filter(s => s.actuals?.checkedInAt || s.actuals?.attendanceStatus).length;
  const attendanceRate = totalSlots > 0 ? ((presentCount + lateCount + leftEarlyCount) / totalSlots) * 100 : 0;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', margin + 5, yPosition + 7);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Total Slots: ${totalSlots}`, margin + 5, yPosition + 13);
  doc.text(`Recorded: ${slotsWithActuals}`, margin + 50, yPosition + 13);
  doc.text(`Attendance Rate: ${attendanceRate.toFixed(0)}%`, margin + 100, yPosition + 13);
  
  doc.text(`Present: ${presentCount}`, margin + 5, yPosition + 19);
  doc.text(`Absent: ${absentCount}`, margin + 50, yPosition + 19);
  doc.text(`Late: ${lateCount}`, margin + 100, yPosition + 19);
  doc.text(`Left Early: ${leftEarlyCount}`, margin + 140, yPosition + 19);
  
  yPosition += 32;
  
  // Table Header
  checkPageBreak(15);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition, contentWidth, 8, 'F');
  
  // Adjusted column widths for landscape orientation (more horizontal space)
  const colWidths = [40, 60, 25, 25, 25, 25, 25, 35];
  const headers = ['Name', 'Role', 'Planned Start', 'Actual Start', 'Diff', 'Planned End', 'Actual End', 'Status'];
  let xPos = margin + 2;
  
  headers.forEach((header, idx) => {
    doc.text(header, xPos, yPosition + 6);
    xPos += colWidths[idx];
  });
  
  yPosition += 10;
  
  // Table Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  
  slots.forEach((slot, index) => {
    checkPageBreak(12);
    
    const user = slot.user;
    const actuals = slot.actuals;
    const displayName = user 
      ? `${user.firstName} ${user.lastName}`.substring(0, 20)
      : 'Vacant';
    
    // Alternate row colors
    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, yPosition - 2, contentWidth, 10, 'F');
    }
    
    xPos = margin + 2;
    
    // Name
    doc.text(displayName, xPos, yPosition + 4);
    xPos += colWidths[0];
    
    // Role
    doc.text((user?.role?.name || 'N/A').substring(0, 15), xPos, yPosition + 4);
    xPos += colWidths[1];
    
    // Planned Start
    doc.text(slot.startTime || '-', xPos, yPosition + 4);
    xPos += colWidths[2];
    
    // Actual Start
    const actualStart = actuals?.actualStartTime || '-';
    doc.text(actualStart, xPos, yPosition + 4);
    xPos += colWidths[3];
    
    // Start Difference
    const startDiff = actuals?.actualStartTime && slot.startTime
      ? formatTimeDifference(slot.startTime, actuals.actualStartTime)
      : '';
    if (startDiff) {
      // Check if difference is negative (early) - formatTimeDifference returns "-38 min" or "+5 min"
      const isNegative = startDiff.startsWith('-');
      if (isNegative) {
        doc.setTextColor(255, 0, 0); // Red for negative (early)
      }
      doc.text(startDiff, xPos, yPosition + 4);
      doc.setTextColor(0, 0, 0); // Reset to black
    } else {
      doc.text('-', xPos, yPosition + 4);
    }
    xPos += colWidths[4];
    
    // Planned End
    doc.text(slot.endTime || '-', xPos, yPosition + 4);
    xPos += colWidths[5];
    
    // Actual End
    const actualEnd = actuals?.actualEndTime || '-';
    doc.text(actualEnd, xPos, yPosition + 4);
    xPos += colWidths[6];
    
    // Status
    let statusText = actuals?.attendanceStatus || 'Not Recorded';
    if (statusText.length > 12) statusText = statusText.substring(0, 12);
    doc.text(statusText, xPos, yPosition + 4);
    
    yPosition += 10;
  });
  
  // Deviations Section (if any)
  const deviations = slots.filter(slot => {
    const actuals = slot.actuals;
    if (!actuals) return false;
    
    return (actuals.attendanceStatus === AttendanceStatus.ABSENT ||
            actuals.attendanceStatus === AttendanceStatus.LATE ||
            actuals.attendanceStatus === AttendanceStatus.LEFT_EARLY ||
            (actuals.actualStartTime && actuals.actualStartTime !== slot.startTime) ||
            (actuals.actualEndTime && actuals.actualEndTime !== slot.endTime) ||
            (actuals.actualUserId && actuals.actualUserId !== slot.userId));
  });
  
  if (deviations.length > 0) {
    checkPageBreak(30);
    yPosition += 5;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Deviations', margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    deviations.slice(0, 10).forEach(deviation => {
      checkPageBreak(8);
      const user = deviation.user;
      const actuals = deviation.actuals;
      const name = user ? `${user.firstName} ${user.lastName}` : 'Vacant';
      
      const reasons: string[] = [];
      if (actuals?.attendanceStatus === AttendanceStatus.ABSENT) reasons.push('Absent');
      if (actuals?.attendanceStatus === AttendanceStatus.LATE) reasons.push('Late');
      if (actuals?.attendanceStatus === AttendanceStatus.LEFT_EARLY) reasons.push('Left Early');
      if (actuals?.actualStartTime && actuals.actualStartTime !== deviation.startTime) {
        reasons.push(`Start: ${formatTimeDifference(deviation.startTime, actuals.actualStartTime)}`);
      }
      if (actuals?.actualEndTime && actuals.actualEndTime !== deviation.endTime) {
        reasons.push(`End: ${formatTimeDifference(deviation.endTime, actuals.actualEndTime)}`);
      }
      
      doc.text(`• ${name}: ${reasons.join(', ')}`, margin + 5, yPosition);
      yPosition += 6;
    });
    
    if (deviations.length > 10) {
      doc.text(`... and ${deviations.length - 10} more`, margin + 5, yPosition);
    }
  }
  
  // Footer
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin - 20,
      pageHeight - 10
    );
    doc.setTextColor(0, 0, 0);
  }
  
  // Download PDF
  const filename = `actuals-comparison-${dateStr.replace(/\s+/g, '-')}-${shiftStr.replace(/\s+/g, '-')}.pdf`;
  doc.save(filename);
}

export default function ActualsSummary({ slots, rosterDate, shiftName }: ActualsSummaryProps) {
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Calculate metrics
  const totalSlots = slots.length;
  const slotsWithActuals = slots.filter(s => s.actuals?.checkedInAt || s.actuals?.attendanceStatus).length;
  const slotsWithoutActuals = totalSlots - slotsWithActuals;
  
  const presentCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.PRESENT).length;
  const absentCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.ABSENT).length;
  const lateCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.LATE).length;
  const leftEarlyCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.LEFT_EARLY).length;
  const substitutedCount = slots.filter(s => s.actuals?.actualUserId && s.actuals.actualUserId !== s.userId).length;
  
  // Calculate time-based deviations
  let earlyArrivalCount = 0;
  let lateArrivalCount = 0;
  let earlyDepartureCount = 0;
  let lateDepartureCount = 0;
  let timeChangeCount = 0;

  slots.forEach(slot => {
    const actuals = slot.actuals;
    if (!actuals) return;

    if (actuals.actualStartTime && actuals.actualStartTime !== slot.startTime) {
      timeChangeCount++;
      const plannedStart = parseTimeToMinutes(slot.startTime);
      const actualStart = parseTimeToMinutes(actuals.actualStartTime);
      if (actualStart < plannedStart) {
        earlyArrivalCount++;
      } else {
        lateArrivalCount++;
      }
    }

    if (actuals.actualEndTime && actuals.actualEndTime !== slot.endTime) {
      timeChangeCount++;
      const plannedEnd = parseTimeToMinutes(slot.endTime);
      const actualEnd = parseTimeToMinutes(actuals.actualEndTime);
      if (actualEnd < plannedEnd) {
        earlyDepartureCount++;
      } else {
        lateDepartureCount++;
      }
    }
  });

  // On-time: present without late/left early status AND no time deviations
  const onTimeCount = slots.filter(s => {
    const actuals = s.actuals;
    if (!actuals || actuals.attendanceStatus !== AttendanceStatus.PRESENT) return false;
    // Check if there are any time deviations
    const hasStartDeviation = actuals.actualStartTime && actuals.actualStartTime !== s.startTime;
    const hasEndDeviation = actuals.actualEndTime && actuals.actualEndTime !== s.endTime;
    return !hasStartDeviation && !hasEndDeviation;
  }).length;
  
  // Total deviations: count unique slots with any deviation
  const slotsWithDeviations = new Set<string>();
  slots.forEach(slot => {
    const actuals = slot.actuals;
    if (!actuals) return;

    // Attendance status deviations
    if (actuals.attendanceStatus === AttendanceStatus.ABSENT ||
        actuals.attendanceStatus === AttendanceStatus.LATE ||
        actuals.attendanceStatus === AttendanceStatus.LEFT_EARLY) {
      slotsWithDeviations.add(slot.id);
    }

    // Time deviations
    if ((actuals.actualStartTime && actuals.actualStartTime !== slot.startTime) ||
        (actuals.actualEndTime && actuals.actualEndTime !== slot.endTime)) {
      slotsWithDeviations.add(slot.id);
    }

    // Substitution
    if (actuals.actualUserId && actuals.actualUserId !== slot.userId) {
      slotsWithDeviations.add(slot.id);
    }
  });

  const deviationsCount = slotsWithDeviations.size;
  
  // Calculate attendance rate
  const attendanceRate = totalSlots > 0 ? ((presentCount + lateCount + leftEarlyCount) / totalSlots) * 100 : 0;
  const onTimeRate = totalSlots > 0 ? (onTimeCount / totalSlots) * 100 : 0;

  // Find deviations - group by person to avoid duplicates
  const deviationsByPerson = new Map<string, {
    slot: RosterSlot;
    reasons: string[];
  }>();

  slots.forEach(slot => {
    const actuals = slot.actuals;
    if (!actuals) return;

    const userKey = slot.userId || slot.id; // Use slot.id as fallback for vacant slots
    if (!deviationsByPerson.has(userKey)) {
      deviationsByPerson.set(userKey, { slot, reasons: [] });
    }

    const deviation = deviationsByPerson.get(userKey)!;

    // User substitution
    if (actuals.actualUserId && actuals.actualUserId !== slot.userId) {
      deviation.reasons.push('User substituted');
    }

    // Time deviations - combine start and end into one message if both exist
    const hasStartChange = actuals.actualStartTime && actuals.actualStartTime !== slot.startTime;
    const hasEndChange = actuals.actualEndTime && actuals.actualEndTime !== slot.endTime;

    if (hasStartChange && hasEndChange) {
      deviation.reasons.push(`Time changed: ${slot.startTime} → ${actuals.actualStartTime}, ${slot.endTime} → ${actuals.actualEndTime}`);
    } else if (hasStartChange) {
      deviation.reasons.push(`Start time changed: ${slot.startTime} → ${actuals.actualStartTime}`);
    } else if (hasEndChange) {
      deviation.reasons.push(`End time changed: ${slot.endTime} → ${actuals.actualEndTime}`);
    }

    // Attendance status deviations
    if (actuals.attendanceStatus === AttendanceStatus.ABSENT) {
      deviation.reasons.push('Absent');
    } else if (actuals.attendanceStatus === AttendanceStatus.LATE) {
      deviation.reasons.push('Late arrival');
    } else if (actuals.attendanceStatus === AttendanceStatus.LEFT_EARLY) {
      deviation.reasons.push('Left early');
    }
  });

  // Convert to array and filter out entries with no reasons
  const deviations = Array.from(deviationsByPerson.values())
    .filter(d => d.reasons.length > 0)
    .map(d => ({
      slot: d.slot,
      reason: d.reasons.join('; ')
    }));

  // Build deviation breakdown text
  const deviationBreakdown: string[] = [];
  if (lateCount > 0) deviationBreakdown.push(`${lateCount} late`);
  if (leftEarlyCount > 0) deviationBreakdown.push(`${leftEarlyCount} left early`);
  if (earlyArrivalCount > 0) deviationBreakdown.push(`${earlyArrivalCount} early arrival`);
  if (lateArrivalCount > 0) deviationBreakdown.push(`${lateArrivalCount} late arrival`);
  if (earlyDepartureCount > 0) deviationBreakdown.push(`${earlyDepartureCount} early departure`);
  if (lateDepartureCount > 0) deviationBreakdown.push(`${lateDepartureCount} late departure`);
  if (substitutedCount > 0) deviationBreakdown.push(`${substitutedCount} substituted`);
  if (absentCount > 0) deviationBreakdown.push(`${absentCount} absent`);

  const deviationText = deviationBreakdown.length > 0 
    ? deviationBreakdown.join(', ') 
    : '0';

  const handleExport = async (format: 'csv' | 'pdf'): Promise<void> => {
    setIsExporting(true);
    setShowDownloadMenu(false);
    
    try {
      if (format === 'csv') {
        exportActualsComparisonCSV(slots, rosterDate, shiftName);
      } else {
        await exportActualsComparisonPDF(slots, rosterDate, shiftName);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Actuals Summary
        </h3>
        <div className="relative">
          <button
            onClick={() => setShowDownloadMenu(!showDownloadMenu)}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download comparison report"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'Download Summary'}
          </button>
          
          {showDownloadMenu && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowDownloadMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-t-lg transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Download as CSV
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-b-lg border-t border-gray-200 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Download as PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-900">Attendance Rate</span>
          </div>
          <div className="text-2xl font-bold text-green-700">{attendanceRate.toFixed(0)}%</div>
          <div className="text-xs text-green-600">{presentCount + lateCount + leftEarlyCount} / {totalSlots}</div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">On-Time Rate</span>
          </div>
          <div className="text-2xl font-bold text-blue-700">{onTimeRate.toFixed(0)}%</div>
          <div className="text-xs text-blue-600">{onTimeCount} / {totalSlots}</div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-900">Deviations</span>
          </div>
          <div className="text-2xl font-bold text-yellow-700">{deviationsCount}</div>
          <div className="text-xs text-yellow-600 break-words">{deviationText}</div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-900">Absent</span>
          </div>
          <div className="text-2xl font-bold text-red-700">{absentCount}</div>
          <div className="text-xs text-red-600">of {totalSlots} slots</div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Status Breakdown</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-gray-700">Present: {presentCount}</span>
          </div>
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span className="text-xs text-gray-700">Late: {lateCount}</span>
          </div>
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
            <span className="text-xs text-gray-700">Left Early: {leftEarlyCount}</span>
          </div>
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-xs text-gray-700">Absent: {absentCount}</span>
          </div>
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="text-xs text-gray-700">Substituted: {substitutedCount}</span>
          </div>
        </div>
      </div>

      {/* Time Deviations Breakdown */}
      {(timeChangeCount > 0 || earlyArrivalCount > 0 || lateArrivalCount > 0 || earlyDepartureCount > 0 || lateDepartureCount > 0) && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Time Deviations</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {earlyArrivalCount > 0 && (
              <div className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-200">
                <Clock className="w-3 h-3 text-green-600" />
                <span className="text-xs text-gray-700">Early Arrival: {earlyArrivalCount}</span>
              </div>
            )}
            {lateArrivalCount > 0 && (
              <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                <Clock className="w-3 h-3 text-yellow-600" />
                <span className="text-xs text-gray-700">Late Arrival: {lateArrivalCount}</span>
              </div>
            )}
            {earlyDepartureCount > 0 && (
              <div className="flex items-center gap-2 p-2 bg-orange-50 rounded border border-orange-200">
                <Clock className="w-3 h-3 text-orange-600" />
                <span className="text-xs text-gray-700">Early Departure: {earlyDepartureCount}</span>
              </div>
            )}
            {lateDepartureCount > 0 && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded border border-blue-200">
                <Clock className="w-3 h-3 text-blue-600" />
                <span className="text-xs text-gray-700">Late Departure: {lateDepartureCount}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deviations List */}
      {deviations.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Deviations from Plan</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {deviations.map((deviation, index) => {
              const user = deviation.slot.user;
              const displayName = user 
                ? `${user.firstName} ${user.lastName}${user.ppType ? ` ${user.ppType}` : ''}`
                : 'Vacant Slot';
              
              return (
                <div key={index} className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                  <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{displayName}</span>
                    <span className="text-gray-600"> - {deviation.reason}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No Actuals Warning */}
      {slotsWithoutActuals > 0 && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <AlertCircle className="w-4 h-4" />
            <span>{slotsWithoutActuals} slot{slotsWithoutActuals !== 1 ? 's' : ''} without actuals recorded</span>
          </div>
        </div>
      )}
    </div>
  );
}
