/**
 * CSV and PDF export utilities
 */

import {
  Roster,
  User,
  ExportOptions
} from '@/types';

export function exportRostersToCSV(
  rosters: Roster[],
  users: User[],
  options: ExportOptions
): string {
  const lines: string[] = [];
  const userMap = new Map(users.map(u => [u.id, u]));

  const headers = [
    'Date',
    'Shift',
    'Employee ID',
    'Name',
    'Role',
    'Start Time',
    'End Time',
    'Status'
  ];

  if (options.includeContactInfo) {
    headers.push('Email', 'Phone');
  }

  if (options.includeTasks) {
    headers.push('Tasks');
  }

  if (options.includeMetadata) {
    headers.push('Created At', 'Published At', 'Created By');
  }

  lines.push(headers.join(','));

  rosters.forEach(roster => {
    roster.slots.forEach(slot => {
      const user = userMap.get(slot.userId);
      if (!user) return;

      const row: string[] = [
        roster.date,
        roster.shift?.name || (roster as any).shiftType || 'Unknown Shift',
        user.employeeId,
        `"${user.firstName} ${user.lastName}"`,
        user.role?.name || '',
        slot.startTime,
        slot.endTime,
        slot.status
      ];

      if (options.includeContactInfo) {
        row.push(user.email || '', user.phone || '');
      }

      if (options.includeTasks) {
        row.push(`"${slot.assignedTasks.join(', ')}"`);
      }

      if (options.includeMetadata) {
        row.push(
          roster.createdAt.toISOString(),
          roster.publishedAt?.toISOString() || '',
          roster.createdBy || ''
        );
      }

      lines.push(row.join(','));
    });
  });

  return lines.join('\n');
}

export function downloadCSV(content: string, filename: string = 'rosters.csv'): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

export async function exportRostersToPDF(
  rosters: Roster[],
  users: User[],
  options: ExportOptions
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  
  const doc = new jsPDF();
  const userMap = new Map(users.map(u => [u.id, u]));
  let yPosition = 20;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  const lineHeight = 7;

  rosters.forEach((roster, rosterIndex) => {
    if (rosterIndex > 0) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(16);
    doc.text(`Roster: ${roster.date} - ${roster.shift?.name || (roster as any).shiftType || 'Unknown Shift'}`, margin, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    doc.text(
      `Coverage: ${roster.coverage.filledSlots}/${roster.coverage.minRequiredStaff} (${roster.coverage.coveragePercentage.toFixed(0)}%)`,
      margin,
      yPosition
    );
    yPosition += 10;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    let xPosition = margin;
    
    doc.text('Employee ID', xPosition, yPosition);
    xPosition += 30;
    doc.text('Name', xPosition, yPosition);
    xPosition += 50;
    doc.text('Role', xPosition, yPosition);
    xPosition += 30;
    doc.text('Time', xPosition, yPosition);
    xPosition += 30;
    
    if (options.includeTasks) {
      doc.text('Tasks', xPosition, yPosition);
      xPosition += 40;
    }

    yPosition += 5;
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, 190, yPosition);
    yPosition += 5;

    doc.setFont('helvetica', 'normal');
    roster.slots.forEach(slot => {
      if (yPosition > pageHeight - 30) {
        doc.addPage();
        yPosition = 20;
      }

      const user = userMap.get(slot.userId);
      if (!user) return;

      xPosition = margin;
      doc.text(user.employeeId || '', xPosition, yPosition);
      xPosition += 30;
      doc.text(`${user.firstName || ''} ${user.lastName || ''}`, xPosition, yPosition);
      xPosition += 50;
      doc.text(user.role?.name || '', xPosition, yPosition);
      xPosition += 30;
      doc.text(`${slot.startTime} - ${slot.endTime}`, xPosition, yPosition);
      xPosition += 30;

      if (options.includeTasks) {
        const tasksText = slot.assignedTasks.join(', ');
        const truncatedTasks = doc.splitTextToSize(tasksText, 40);
        doc.text(truncatedTasks, xPosition, yPosition);
      }

      yPosition += lineHeight;
    });

    if (options.includeMetadata) {
      yPosition += 5;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text(
        `Created: ${roster.createdAt.toLocaleString()} | Published: ${roster.publishedAt?.toLocaleString() || 'Not published'}`,
        margin,
        yPosition
      );
    }
  });

  return doc.output('blob');
}

export function downloadPDF(blob: Blob, filename: string = 'rosters.pdf'): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

export async function exportRosters(
  rosters: Roster[],
  users: User[],
  options: ExportOptions
): Promise<void> {
  const dateRangeStr = options.dateRange 
    ? `${options.dateRange.start.toISOString().split('T')[0]}-${options.dateRange.end.toISOString().split('T')[0]}`
    : 'all';
  
  if (options.format === 'csv') {
    const csvContent = exportRostersToCSV(rosters, users, options);
    downloadCSV(csvContent, `rosters-${dateRangeStr}.csv`);
  } else if (options.format === 'pdf') {
    const pdfBlob = await exportRostersToPDF(rosters, users, options);
    downloadPDF(pdfBlob, `rosters-${dateRangeStr}.pdf`);
  } else {
    throw new Error(`Unsupported export format: ${options.format || 'undefined'}`);
  }
}
