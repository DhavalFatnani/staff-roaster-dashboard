'use client';

import { RosterSlot, AttendanceStatus, Task } from '@/types';
import { CheckCircle2, XCircle, Clock, AlertCircle, Users, Download, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Loader from './Loader';
import { useState } from 'react';

interface ActualsSummaryProps {
  slots: RosterSlot[];
  rosterDate?: string;
  shiftName?: string;
  tasks?: Task[];
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

// Helper function to calculate duration in hours between check in and check out
function calculateDurationHours(checkInAt: Date | string | null | undefined, checkOutAt: Date | string | null | undefined): number | null {
  if (!checkInAt || !checkOutAt) return null;
  
  try {
    const checkIn = checkInAt instanceof Date ? checkInAt : new Date(checkInAt);
    const checkOut = checkOutAt instanceof Date ? checkOutAt : new Date(checkOutAt);
    const diffMs = checkOut.getTime() - checkIn.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours;
  } catch {
    return null;
  }
}

// Helper function to escape CSV cell
function escapeCSVCell(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Export function to generate CSV comparison report with enhanced details
function exportActualsComparisonCSV(
  slots: RosterSlot[], 
  rosterDate?: string, 
  shiftName?: string,
  tasks?: Task[]
): void {
  const lines: string[] = [];
  const taskMap = new Map(tasks?.map(t => [t.id, t.name]) || []);
  
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
  
  // Enhanced column headers
  const headers = [
    'Employee ID',
    'Name',
    'Role',
    'Phone',
    'Email',
    'Planned Start Time',
    'Actual Start Time',
    'Start Time Difference',
    'Planned End Time',
    'Actual End Time',
    'End Time Difference',
    'Planned Tasks',
    'Actual Tasks Completed',
    'Attendance Status',
    'Check-in Time',
    'Check-out Time',
    'Substituted?',
    'Substituted By',
    'Substitution Reason',
    'Notes/Remarks'
  ];
  
  lines.push(headers.map(h => escapeCSVCell(h)).join(','));
  
  // Process each slot
  slots.forEach(slot => {
    const user = slot.user;
    const actuals = slot.actuals;
    const actualUser = actuals?.actualUser;
    
    // Calculate time differences
    const startDiff = actuals?.actualStartTime && slot.startTime
      ? formatTimeDifference(slot.startTime, actuals.actualStartTime)
      : '';
    const endDiff = actuals?.actualEndTime && slot.endTime
      ? formatTimeDifference(slot.endTime, actuals.actualEndTime)
      : '';
    
    // Map task IDs to names
    const plannedTasksNames = (slot.assignedTasks || [])
      .map(id => taskMap.get(id) || id)
      .join('; ');
    const actualTasksNames = (actuals?.actualTasksCompleted || [])
      .map(id => taskMap.get(id) || id)
      .join('; ');
    
    // Check if substituted
    const isSubstituted = actuals?.actualUserId && actuals.actualUserId !== slot.userId;
    const substitutedByName = actualUser 
      ? `${actualUser.firstName} ${actualUser.lastName}`
      : '';
    
    // Format check-in/out times
    const checkInTime = actuals?.checkedInAt 
      ? format(new Date(actuals.checkedInAt), 'yyyy-MM-dd HH:mm:ss')
      : '';
    const checkOutTime = actuals?.checkedOutAt 
      ? format(new Date(actuals.checkedOutAt), 'yyyy-MM-dd HH:mm:ss')
      : '';
    
    const row: string[] = [
      user?.employeeId || '',
      user ? `${user.firstName} ${user.lastName}` : 'Vacant Slot',
      user?.role?.name || 'N/A',
      user?.phone || '',
      user?.email || '',
      slot.startTime || '-',
      actuals?.actualStartTime || '-',
      startDiff || '-',
      slot.endTime || '-',
      actuals?.actualEndTime || '-',
      endDiff || '-',
      plannedTasksNames || '-',
      actualTasksNames || '-',
      actuals?.attendanceStatus || 'Not Recorded',
      checkInTime,
      checkOutTime,
      isSubstituted ? 'Yes' : 'No',
      substitutedByName,
      actuals?.substitutionReason || '',
      actuals?.actualNotes || ''
    ];
    
    lines.push(row.map(cell => escapeCSVCell(cell)).join(','));
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

// Export function to generate clean, professional PDF report for managers
async function exportActualsComparisonPDF(
  slots: RosterSlot[], 
  rosterDate?: string, 
  shiftName?: string,
  tasks?: Task[]
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - (margin * 2);
  let yPosition = margin;
  const taskMap = new Map(tasks?.map(t => [t.id, t.name]) || []);
  const footerSpace = 25;
  const usableHeight = pageHeight - margin - footerSpace;
  
  // Helper to add new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > usableHeight) {
      doc.addPage();
      yPosition = margin;
      return true;
    }
    return false;
  };
  
  // Calculate summary statistics
  const presentCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.PRESENT).length;
  const absentCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.ABSENT).length;
  const lateCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.LATE).length;
  const leftEarlyCount = slots.filter(s => s.actuals?.attendanceStatus === AttendanceStatus.LEFT_EARLY).length;
  const totalSlots = slots.length;
  const slotsWithActuals = slots.filter(s => s.actuals?.checkedInAt || s.actuals?.attendanceStatus).length;
  const attendanceRate = totalSlots > 0 ? ((presentCount + lateCount + leftEarlyCount) / totalSlots) * 100 : 0;
  const substitutedCount = slots.filter(s => s.actuals?.actualUserId && s.actuals.actualUserId !== s.userId).length;
  const notRecordedCount = totalSlots - slotsWithActuals;
  
  const dateStr = rosterDate 
    ? format(parseISO(rosterDate), 'MMMM d, yyyy')
    : format(new Date(), 'MMMM d, yyyy');
  const shiftStr = shiftName || 'Unknown Shift';
  
  // ===== PREMIUM HEADER =====
  const headerHeight = 28;
  const headerPadding = 12;
  // Premium blue gradient effect
  doc.setFillColor(30, 64, 175); // Deeper professional blue
  doc.roundedRect(margin, yPosition, contentWidth, headerHeight, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  
  // Title - premium typography (better vertical centering)
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  const headerTitleY = yPosition + 10;
  doc.text('Actuals Report', margin + headerPadding, headerTitleY);
  
  // Subtitle - refined spacing
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // Lighter gray for better contrast
  const headerSubtitleY = yPosition + 20;
  doc.text(`${dateStr} • ${shiftStr}`, margin + headerPadding, headerSubtitleY);
  doc.setTextColor(255, 255, 255);
  
  yPosition += headerHeight + 15;
  
  // ===== SUMMARY SECTION WITH CARDS =====
  checkPageBreak(50);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', margin, yPosition);
  yPosition += 12;
  
  // Card dimensions
  const cardWidth = (contentWidth - 15) / 4; // 4 cards per row with spacing
  const cardHeight = 22;
  const cardGap = 5;
  const cardPadding = 8;
  
  // First row of cards
  let cardX = margin;
  const cardsRow1 = [
    { label: 'Total', value: totalSlots },
    { label: 'Recorded', value: slotsWithActuals },
    { label: 'Not Recorded', value: notRecordedCount },
    { label: 'Attendance Rate', value: `${attendanceRate.toFixed(1)}%` }
  ];
  
  cardsRow1.forEach((card, idx) => {
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.5);
    doc.roundedRect(cardX, yPosition, cardWidth, cardHeight, 3, 3, 'FD');
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(card.label, cardX + cardPadding, yPosition + 7);
    
  doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(String(card.value), cardX + cardPadding, yPosition + 16);
    
    cardX += cardWidth + cardGap;
  });
  
  yPosition += cardHeight + cardGap;
  
  // Second row of cards
  cardX = margin;
  const cardsRow2 = [
    { label: 'Present', value: presentCount },
    { label: 'Absent', value: absentCount },
    { label: 'Late', value: lateCount },
    { label: 'Left Early', value: leftEarlyCount }
  ];
  
  cardsRow2.forEach((card, idx) => {
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.5);
    doc.roundedRect(cardX, yPosition, cardWidth, cardHeight, 3, 3, 'FD');
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(card.label, cardX + cardPadding, yPosition + 7);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(String(card.value), cardX + cardPadding, yPosition + 16);
    
    cardX += cardWidth + cardGap;
  });
  
  yPosition += cardHeight;
  
  // Third row (Substitutions) if needed
  if (substitutedCount > 0) {
    yPosition += cardGap;
    cardX = margin;
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.5);
    doc.roundedRect(cardX, yPosition, cardWidth, cardHeight, 3, 3, 'FD');
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text('Substitutions', cardX + cardPadding, yPosition + 7);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(String(substitutedCount), cardX + cardPadding, yPosition + 16);
    
    yPosition += cardHeight;
  }
  
  yPosition += 16;
  
  // ===== PREMIUM LEGEND/DESCRIPTION =====
  checkPageBreak(28);
  yPosition += 8;
  
  // Premium legend box
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, yPosition, contentWidth, 24, 4, 4, 'FD');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Legend', margin + 10, yPosition + 9);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  
  const legendY = yPosition + 9;
  const legendX1 = margin + 55;
  const legendX2 = margin + 220;
  
  // Status colors with circles instead of bullet characters
  doc.setFillColor(22, 163, 74);
  doc.circle(legendX1 + 3, legendY - 2, 2, 'F');
  doc.setTextColor(107, 114, 128);
  doc.text('Present', legendX1 + 8, legendY);
  
  doc.setFillColor(220, 38, 38);
  doc.circle(legendX1 + 53, legendY - 2, 2, 'F');
  doc.setTextColor(107, 114, 128);
  doc.text('Absent', legendX1 + 58, legendY);
  
  doc.setFillColor(245, 158, 11);
  doc.circle(legendX1 + 103, legendY - 2, 2, 'F');
  doc.setTextColor(107, 114, 128);
  doc.text('Late/Left Early', legendX1 + 108, legendY);
  
  // Abbreviations with better formatting - split to prevent overflow
  doc.text('P: Planned | A: Actual', legendX2, legendY);
  doc.text('D: Difference | C: Completed', legendX2, legendY + 6);
  
  yPosition += 28;
  
  yPosition += 10;
  
  // ===== PREMIUM STAFF DETAILS =====
  checkPageBreak(30);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('Staff Details', margin, yPosition);
  yPosition += 13;
  
  // Group slots by role
  const slotsByRole = new Map<string, typeof slots>();
  slots.forEach(slot => {
    const roleName = slot.user?.role?.name || 'Unassigned';
    if (!slotsByRole.has(roleName)) {
      slotsByRole.set(roleName, []);
    }
    slotsByRole.get(roleName)!.push(slot);
  });
  
  // Define custom role order (matching exact database role names)
  const roleOrder = [
    'Shift In Charge',
    'Dispatcher',
    'Inventory Executive',
    'Picker Packer (Warehouse)',
    'Picker Packer (Ad-Hoc)'
  ];
  
  // Sort role groups: predefined order first, then alphabetical for remaining
  const sortedRoles = Array.from(slotsByRole.entries()).sort(([a], [b]) => {
    const indexA = roleOrder.indexOf(a);
    const indexB = roleOrder.indexOf(b);
    
    // If both are in the predefined order, sort by their index
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // If only A is in predefined order, A comes first
    if (indexA !== -1) return -1;
    // If only B is in predefined order, B comes first
    if (indexB !== -1) return 1;
    // If neither is in predefined order, sort alphabetically
    return a.localeCompare(b);
  });
  
  // Process each role group
  sortedRoles.forEach(([roleName, roleSlots]) => {
    // Calculate table dimensions first (increased for better readability)
    const rowHeight = 18; // Increased from 15
    const headerHeight = 13;
    const tablePadding = 10;
    const availableWidth = contentWidth - tablePadding;
    const tableHeight = headerHeight + (roleSlots.length * rowHeight);
    const roleHeaderHeight = 6; // Space after role header
    const spaceAfterTable = 12; // Space before next role
    
    // Calculate total space needed: role header + table + spacing
    const totalSpaceNeeded = roleHeaderHeight + tableHeight + spaceAfterTable;
    
    // Smart page break: check if we need a new page BEFORE drawing
    if (yPosition + totalSpaceNeeded > usableHeight && yPosition > margin + 30) {
      // Not enough space, move to new page
      checkPageBreak(totalSpaceNeeded);
    }
    
    // Role header with reduced spacing
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const roleHeaderText = `${roleName} (${roleSlots.length} staff)`;
    doc.text(roleHeaderText, margin, yPosition);
    yPosition += roleHeaderHeight; // Reduced spacing (6px)
    
    // Increased column widths for better readability (must total <= 251)
    // Reduced Contact Info, Schedule, Status to give more space to Substitution and Notes
    const colWidths = [
      57,  // Contact Info (reduced from 60)
      38,  // Schedule (reduced from 40)
      24,  // Status (reduced from 26)
      28,  // Check In/Out
      20,  // Duration
      48,  // Tasks
      22,  // Substitution (increased from 18)
      14   // Notes (increased from 11)
    ];
    
    const headers = ['Contact Info', 'Schedule', 'Status', 'Check In/Out', 'Duration', 'Tasks', 'Substitution', 'Notes'];
    
    // Draw table container
    doc.setDrawColor(203, 213, 219);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, yPosition, contentWidth, tableHeight, 3, 3, 'S');
    
    // Header row with increased font size
    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(203, 213, 219);
    doc.roundedRect(margin, yPosition, contentWidth, headerHeight, 3, 3, 'FD');
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 41, 55);
    
    let xPos = margin + 6;
    headers.forEach((header, idx) => {
      if (idx < colWidths.length) {
        const textWidth = doc.getTextWidth(header);
        const centerX = xPos + (colWidths[idx] / 2) - (textWidth / 2);
        doc.text(header, centerX, yPosition + 9);
        if (idx < colWidths.length - 1) {
          doc.setDrawColor(229, 231, 235);
          doc.setLineWidth(0.5);
          doc.line(xPos + colWidths[idx], yPosition, xPos + colWidths[idx], yPosition + headerHeight);
        }
        xPos += colWidths[idx];
      }
    });
  
    yPosition += headerHeight;
  
    // Table rows with increased font sizes for better readability
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    roleSlots.forEach((slot, index) => {
      checkPageBreak(rowHeight + 2);
      
      const user = slot.user;
      const actuals = slot.actuals;
      const actualUser = actuals?.actualUser;
      const plannedTasks = (slot.assignedTasks || []).map(id => taskMap.get(id) || id);
      const actualTasks = (actuals?.actualTasksCompleted || []).map(id => taskMap.get(id) || id);
      
      // Alternating row background
      if (index % 2 === 0) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(249, 250, 251);
      }
      doc.rect(margin, yPosition, contentWidth, rowHeight, 'F');
      
      // Row border
      doc.setDrawColor(243, 244, 246);
      doc.setLineWidth(0.5);
      doc.line(margin, yPosition + rowHeight, margin + contentWidth, yPosition + rowHeight);
      
      xPos = margin + 6; // Start position with padding
      
      // Column 1: Contact Info - Increased font sizes
      const name = user ? `${user.firstName} ${user.lastName}` : 'Vacant';
      const employeeId = user?.employeeId || '';
      const phone = user?.phone || 'N/A';
      const email = user?.email || 'Not provided';
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5); // Increased from 8.5
      doc.setTextColor(15, 23, 42);
      doc.text(name, xPos, yPosition + 6);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(107, 114, 128);
      
      // ID and Phone on same line (adjusted for taller cells)
      const idPhoneText = `ID: ${employeeId} | ${phone}`;
      const idPhoneLines = doc.splitTextToSize(idPhoneText, colWidths[0] - 8);
      doc.text(idPhoneLines, xPos, yPosition + 11);
      
      // Email on next line (adjusted for taller cells)
      const emailLines = doc.splitTextToSize(email, colWidths[0] - 8);
      doc.text(emailLines, xPos, yPosition + 15.5);
      doc.setTextColor(15, 23, 42);
      
      // Vertical separator
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.6);
      doc.line(xPos + colWidths[0], yPosition, xPos + colWidths[0], yPosition + rowHeight);
      xPos += colWidths[0];
      
      // Column 2: Schedule - Center aligned, increased font size
      doc.setFontSize(8);
      let scheduleText = `P: ${slot.startTime || '-'}-${slot.endTime || '-'}`;
      if (actuals?.actualStartTime || actuals?.actualEndTime) {
        scheduleText += `\nA: ${actuals.actualStartTime || '-'}-${actuals.actualEndTime || '-'}`;
        const startDiff = actuals?.actualStartTime && slot.startTime
          ? formatTimeDifference(slot.startTime, actuals.actualStartTime)
          : '';
        const endDiff = actuals?.actualEndTime && slot.endTime
          ? formatTimeDifference(slot.endTime, actuals.actualEndTime)
          : '';
        if (startDiff || endDiff) {
          scheduleText += `\nD:${startDiff || '-'}/${endDiff || '-'}`;
        }
      }
      const scheduleLines = doc.splitTextToSize(scheduleText, colWidths[1] - 6);
      const scheduleHeight = scheduleLines.length * 4.5;
      const scheduleStartY = yPosition + (rowHeight - scheduleHeight) / 2 + 4;
      scheduleLines.forEach((line: string, idx: number) => {
        const lineWidth = doc.getTextWidth(line);
        const centerX = xPos + (colWidths[1] / 2) - (lineWidth / 2);
        doc.text(line, centerX, scheduleStartY + (idx * 4.5));
      });
      doc.line(xPos + colWidths[1], yPosition, xPos + colWidths[1], yPosition + rowHeight);
      xPos += colWidths[1];
      
      // Column 3: Status - Center aligned, increased font size
      const status = actuals?.attendanceStatus || 'Not Recorded';
      let statusColor = [71, 85, 105];
      if (status === 'present') statusColor = [22, 163, 74];
      else if (status === 'absent') statusColor = [220, 38, 38];
      else if (status === 'late' || status === 'left_early') statusColor = [245, 158, 11];
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      const statusText = status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
      const statusWidth = doc.getTextWidth(statusText);
      const statusCenterX = xPos + (colWidths[2] / 2) - (statusWidth / 2);
      doc.text(statusText, statusCenterX, yPosition + 9);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.line(xPos + colWidths[2], yPosition, xPos + colWidths[2], yPosition + rowHeight);
      xPos += colWidths[2];
      
      // Column 4: Check In/Out - Center aligned, increased font size
      doc.setFontSize(8.5);
      let checkText = '-';
      if (actuals?.checkedInAt || actuals?.checkedOutAt) {
        const checkIn = actuals?.checkedInAt ? format(new Date(actuals.checkedInAt), 'HH:mm') : '-';
        const checkOut = actuals?.checkedOutAt ? format(new Date(actuals.checkedOutAt), 'HH:mm') : '-';
        checkText = `${checkIn}/${checkOut}`;
      }
      const checkWidth = doc.getTextWidth(checkText);
      const checkCenterX = xPos + (colWidths[3] / 2) - (checkWidth / 2);
      doc.text(checkText, checkCenterX, yPosition + 9);
      doc.line(xPos + colWidths[3], yPosition, xPos + colWidths[3], yPosition + rowHeight);
      xPos += colWidths[3];
      
      // Column 5: Duration - Center aligned, color coded
      const durationHours = calculateDurationHours(actuals?.checkedInAt, actuals?.checkedOutAt);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      let durationText = '-';
      let durationColor = [71, 85, 105];
      if (durationHours !== null) {
        const hours = Math.floor(durationHours);
        const minutes = Math.round((durationHours - hours) * 60);
        durationText = `${hours}h${minutes > 0 ? `${minutes}m` : ''}`;
        // Green if > 9 hours, red if < 9 hours
        if (durationHours > 9) {
          durationColor = [22, 163, 74]; // Green
        } else if (durationHours < 9) {
          durationColor = [220, 38, 38]; // Red
        } else {
          durationColor = [71, 85, 105]; // Gray for exactly 9 hours
        }
      }
      doc.setTextColor(durationColor[0], durationColor[1], durationColor[2]);
      const durationWidth = doc.getTextWidth(durationText);
      const durationCenterX = xPos + (colWidths[4] / 2) - (durationWidth / 2);
      doc.text(durationText, durationCenterX, yPosition + 9);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.line(xPos + colWidths[4], yPosition, xPos + colWidths[4], yPosition + rowHeight);
      xPos += colWidths[4];
      
      // Column 6: Tasks - Center aligned, increased font size
      doc.setFontSize(7.5);
      let tasksText = '-';
      if (plannedTasks.length > 0 || actualTasks.length > 0) {
        const plannedText = plannedTasks.length > 0 ? plannedTasks.slice(0, 2).join(', ') : 'None';
        const actualText = actualTasks.length > 0 ? actualTasks.slice(0, 2).join(', ') : 'None';
        tasksText = `P:${plannedText}${plannedTasks.length > 2 ? '...' : ''}\nC:${actualText}${actualTasks.length > 2 ? '...' : ''}`;
      }
      const tasksLines = doc.splitTextToSize(tasksText, colWidths[5] - 6);
      const tasksHeight = tasksLines.length * 4.5;
      const tasksStartY = yPosition + (rowHeight - tasksHeight) / 2 + 4;
      tasksLines.forEach((line: string, idx: number) => {
        const lineWidth = doc.getTextWidth(line);
        const centerX = xPos + (colWidths[5] / 2) - (lineWidth / 2);
        doc.text(line, centerX, tasksStartY + (idx * 4.5));
      });
      doc.line(xPos + colWidths[5], yPosition, xPos + colWidths[5], yPosition + rowHeight);
      xPos += colWidths[5];
      
      // Column 7: Substitution - Center aligned, increased font size
      doc.setFontSize(7.5);
      let subText = '-';
      if (actuals?.actualUserId && actuals.actualUserId !== slot.userId && actualUser) {
        subText = `${actualUser.firstName.substring(0, 6)} ${actualUser.lastName.substring(0, 1)}.`;
      }
      const subLines = doc.splitTextToSize(subText, colWidths[6] - 4);
      const subHeight = subLines.length * 4.5;
      const subStartY = yPosition + (rowHeight - subHeight) / 2 + 4;
      subLines.forEach((line: string, idx: number) => {
        const lineWidth = doc.getTextWidth(line);
        const centerX = xPos + (colWidths[6] / 2) - (lineWidth / 2);
        doc.text(line, centerX, subStartY + (idx * 4.5));
      });
      doc.line(xPos + colWidths[6], yPosition, xPos + colWidths[6], yPosition + rowHeight);
      xPos += colWidths[6];
      
      // Column 8: Notes - Center aligned, increased font size
      doc.setFontSize(7.5);
      const notesText = actuals?.actualNotes 
        ? (actuals.actualNotes.length > 12 ? actuals.actualNotes.substring(0, 12) + '...' : actuals.actualNotes)
        : '-';
      const notesLines = doc.splitTextToSize(notesText, colWidths[7] - 3);
      const notesHeight = notesLines.length * 4.5;
      const notesStartY = yPosition + (rowHeight - notesHeight) / 2 + 4;
      notesLines.forEach((line: string, idx: number) => {
        const lineWidth = doc.getTextWidth(line);
        const centerX = xPos + (colWidths[7] / 2) - (lineWidth / 2);
        doc.text(line, centerX, notesStartY + (idx * 4.5));
      });
      
      yPosition += rowHeight;
    });
    
    yPosition += 12; // Increased spacing between role groups (from 8)
  });
  
  // ===== FOOTER =====
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
    doc.text(
      `Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      margin,
      pageHeight - 8
    );
    doc.setTextColor(0, 0, 0);
  }
  
  // Download PDF
  const filename = `actuals-report-${dateStr.replace(/\s+/g, '-')}-${shiftStr.replace(/\s+/g, '-')}.pdf`;
  doc.save(filename);
}

export default function ActualsSummary({ slots, rosterDate, shiftName, tasks }: ActualsSummaryProps) {
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
        exportActualsComparisonCSV(slots, rosterDate, shiftName, tasks);
      } else {
        await exportActualsComparisonPDF(slots, rosterDate, shiftName, tasks);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-6 shadow-sm relative">
      {isExporting && (
        <Loader overlay message="Generating report..." />
      )}
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
