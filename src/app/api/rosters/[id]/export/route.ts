import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-helpers';
import { transformUsers } from '@/utils/supabase-helpers';
import { getDay } from 'date-fns';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';

    // Fetch roster (without join first, in case shift_id column doesn't exist)
    let { data: rosterData, error: rosterError } = await supabase
      .from('rosters')
      .select('*')
      .eq('id', params.id)
      .single();

    if (rosterError) throw rosterError;
    
    // Try to fetch shift definition separately
    let shiftName = rosterData.shift_type || 'Unknown Shift';
    const shiftId = rosterData.shift_id;
    const shiftType = rosterData.shift_type;
    
    if (shiftId) {
      // Try to fetch by shift_id
      const { data: shiftData } = await supabase
        .from('shift_definitions')
        .select('name')
        .eq('id', shiftId)
        .maybeSingle();
      
      if (shiftData?.name) {
        shiftName = shiftData.name;
      }
    } else if (shiftType) {
      // Fallback: try to find shift by name (shift_type column no longer exists in shift_definitions)
      // The shiftType value from roster might be a name or old shift_type enum value
      const { data: shiftData } = await supabase
        .from('shift_definitions')
        .select('name')
        .eq('store_id', rosterData.store_id)
        .eq('name', shiftType)
        .maybeSingle();
      
      if (shiftData?.name) {
        shiftName = shiftData.name;
      } else {
        // If not found by name, the shiftType might be an old enum value
        // Use it as-is for backward compatibility
        shiftName = shiftType;
      }
    }

    const { data: slotsData, error: slotsError } = await supabase
      .from('roster_slots')
      .select('*, users!roster_slots_user_id_fkey(*, roles(*))')
      .eq('roster_id', params.id);

    if (slotsError) throw slotsError;

    // Fetch all tasks to map IDs to names
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('id, name');

    if (tasksError) throw tasksError;

    const taskMap = new Map((tasksData || []).map((t: any) => [t.id, t.name]));

    // Get day of week for weekoff check (0 = Sunday, 6 = Saturday)
    const rosterDate = new Date(rosterData.date);
    const dayOfWeek = getDay(rosterDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[dayOfWeek];

    if (format === 'csv') {
      // Generate CSV with improved formatting
      const formattedDate = rosterDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      // CSV Header with metadata
      const metadata = [
        `Roster Export - ${formattedDate}`,
        `Shift: ${shiftName}`,
        `Status: ${rosterData.status}`,
        `Day: ${dayName}`,
        ''
      ];
      
      // Separate slots into weekoff and regular, then group by task
      const weekoffSlots: any[] = [];
      const regularSlotsByTask = new Map<string, any[]>();
      const regularSlotsWithoutTasks: any[] = [];
      
      (slotsData || []).forEach((slot: any) => {
        const user = slot.users ? transformUsers([slot.users])[0] : null;
        const isOnWeekoff = user && (user.weekOffDays || []).includes(dayOfWeek);
        
        const taskIds = slot.assigned_tasks || [];
        if (taskIds.length === 0) {
          if (isOnWeekoff) {
            weekoffSlots.push({ ...slot, taskName: 'No Task Assigned' });
          } else {
            regularSlotsWithoutTasks.push(slot);
          }
        } else {
          taskIds.forEach((taskId: string) => {
            const taskName = taskMap.get(taskId) || taskId;
            if (isOnWeekoff) {
              weekoffSlots.push({ ...slot, taskName });
            } else {
              if (!regularSlotsByTask.has(taskName)) {
                regularSlotsByTask.set(taskName, []);
              }
              regularSlotsByTask.get(taskName)!.push({ ...slot, taskName });
            }
          });
        }
      });
      
      const headers = ['Employee ID', 'Name', 'Role', 'Experience', 'Shift', 'Task', 'Start Time', 'End Time'];
      const rows: string[][] = [];
      
      // Add weekoff section first
      if (weekoffSlots.length > 0) {
        rows.push([]); // Empty row separator
        rows.push(['=== WEEKOFFS ===', '', '', '', '', '', '', '']);
        weekoffSlots.forEach((slot: any) => {
          const user = slot.users ? transformUsers([slot.users])[0] : null;
          if (!user) return;
          
          rows.push([
            user.employeeId || '',
            `${user.firstName} ${user.lastName}`,
            user.role?.name || '',
            user.experienceLevel || '',
            shiftName,
            slot.taskName || 'No Task Assigned',
            slot.start_time || '',
            slot.end_time || ''
          ]);
        });
      }
      
      rows.push([]); // Empty row separator
      rows.push(['=== ASSIGNED STAFF ===', '', '', '', '', '', '', '']);
      
      // Add regular staff grouped by task
      Array.from(regularSlotsByTask.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([taskName, slots]) => {
          slots.forEach((slot: any) => {
            const user = slot.users ? transformUsers([slot.users])[0] : null;
            if (!user) return;
            
            rows.push([
              user.employeeId || '',
              `${user.firstName} ${user.lastName}`,
              user.role?.name || '',
              user.experienceLevel || '',
              shiftName,
              taskName,
              slot.start_time || '',
              slot.end_time || ''
            ]);
          });
        });
      
      // Add regular staff without tasks
      regularSlotsWithoutTasks.forEach((slot: any) => {
        const user = slot.users ? transformUsers([slot.users])[0] : null;
        if (!user) return;
        
        rows.push([
          user.employeeId || '',
          `${user.firstName} ${user.lastName}`,
          user.role?.name || '',
          user.experienceLevel || '',
          shiftName,
          'No Task Assigned',
          slot.start_time || '',
          slot.end_time || ''
        ]);
      });

      const csvContent = [
        ...metadata,
        headers.join(','),
        ...rows.map((row: string[]) => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="roster-${formattedDate.replace(/,/g, '')}-${shiftName.replace(/\s+/g, '-')}.csv"`
        }
      });
    } else {
      // PDF export - generate HTML that can be printed to PDF
      const htmlContent = generatePDFHTML(rosterData, slotsData, taskMap, transformUsers, shiftName, dayOfWeek, dayName);
      
      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

function generatePDFHTML(rosterData: any, slotsData: any[], taskMap: Map<string, string>, transformUsers: any, shiftName: string, dayOfWeek: number, dayName: string) {
  const date = new Date(rosterData.date).toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  // Separate slots into weekoff and regular, then group by task
  const weekoffSlots: any[] = [];
  const regularSlotsByTask = new Map<string, any[]>();
  const regularSlotsWithoutTasks: any[] = [];
  
  slotsData.forEach((slot: any) => {
    const user = slot.users ? transformUsers([slot.users])[0] : null;
    const isOnWeekoff = user && (user.weekOffDays || []).includes(dayOfWeek);
    
    const taskIds = slot.assigned_tasks || [];
    const taskName = taskIds.length > 0 
      ? (taskIds.map((id: string) => taskMap.get(id) || id).join(', ') || 'No Task Assigned')
      : 'No Task Assigned';
    
    if (isOnWeekoff) {
      weekoffSlots.push({ ...slot, taskName, user });
    } else {
      if (taskIds.length === 0) {
        regularSlotsWithoutTasks.push(slot);
      } else {
        taskIds.forEach((taskId: string) => {
          const tName = taskMap.get(taskId) || taskId;
          if (!regularSlotsByTask.has(tName)) {
            regularSlotsByTask.set(tName, []);
          }
          regularSlotsByTask.get(tName)!.push({ ...slot, taskName: tName });
        });
      }
    }
  });
  
  // Calculate summary stats
  const totalStaff = slotsData.length;
  const onWeekoff = weekoffSlots.length;
  
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Roster - ${date}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.6;
      font-size: 14px;
    }
    .page {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    }
    .header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 4px 12px rgba(30, 64, 175, 0.2);
    }
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 16px;
      letter-spacing: -0.5px;
    }
    .header-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .info-label {
      font-size: 12px;
      opacity: 0.9;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .info-value {
      font-size: 16px;
      font-weight: 600;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
      margin-bottom: 35px;
    }
    .summary-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .summary-value {
      font-size: 28px;
      font-weight: 700;
      color: #1e40af;
      margin-bottom: 4px;
    }
    .summary-label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .task-section {
      margin-bottom: 40px;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .task-header {
      background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
      padding: 16px 20px;
      border-bottom: 2px solid #cbd5e1;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .task-icon {
      width: 32px;
      height: 32px;
      background: #3b82f6;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 14px;
    }
    .task-title {
      font-size: 18px;
      font-weight: 700;
      color: #1e293b;
      flex: 1;
    }
    .task-count {
      background: #3b82f6;
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    table { 
      width: 100%; 
      border-collapse: collapse;
    }
    thead {
      background: #f8fafc;
    }
    th { 
      padding: 14px 16px; 
      text-align: left; 
      font-weight: 700;
      font-size: 11px;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 2px solid #e2e8f0;
    }
    td { 
      padding: 14px 16px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px;
      color: #334155;
    }
    tbody tr {
      transition: background-color 0.15s ease;
    }
    tbody tr:hover {
      background-color: #f8fafc;
    }
    tbody tr:last-child td {
      border-bottom: none;
    }
    .employee-id {
      font-weight: 600;
      color: #1e40af;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 13px;
    }
    .name-cell {
      font-weight: 500;
    }
    .weekoff-badge {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .role-badge {
      display: inline-block;
      background: #e0e7ff;
      color: #3730a3;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .experience-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .experience-experienced {
      background: #d1fae5;
      color: #065f46;
    }
    .experience-fresher {
      background: #dbeafe;
      color: #1e40af;
    }
    .time-cell {
      font-family: 'Monaco', 'Menlo', monospace;
      color: #64748b;
      font-size: 13px;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
    }
    @media print {
      body { background: white; padding: 0; }
      .page { box-shadow: none; padding: 20px; }
      .task-section { page-break-inside: avoid; margin-bottom: 30px; }
      .summary { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>📋 Staff Roster</h1>
      <div class="header-info">
        <div class="info-item">
          <span class="info-label">Date</span>
          <span class="info-value">${date}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Day</span>
          <span class="info-value">${dayName}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Shift</span>
          <span class="info-value">${shiftName || rosterData.shift_type || 'Unknown Shift'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Status</span>
          <span class="info-value" style="text-transform: capitalize;">${rosterData.status || 'draft'}</span>
        </div>
      </div>
    </div>

    <div class="summary">
      <div class="summary-card">
        <div class="summary-value">${totalStaff}</div>
        <div class="summary-label">Total Staff</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${totalStaff - onWeekoff}</div>
        <div class="summary-label">Available</div>
      </div>
      <div class="summary-card">
        <div class="summary-value" style="color: #d97706;">${onWeekoff}</div>
        <div class="summary-label">On Weekoff</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${regularSlotsByTask.size + (regularSlotsWithoutTasks.length > 0 ? 1 : 0) + (weekoffSlots.length > 0 ? 1 : 0)}</div>
        <div class="summary-label">Task Groups</div>
      </div>
    </div>
  `;

  // Render weekoff section first
  if (weekoffSlots.length > 0) {
    html += `
    <div class="task-section" style="border-left: 4px solid #f59e0b; background: #fffbeb;">
      <div class="task-header" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-bottom: 2px solid #f59e0b;">
        <div class="task-icon" style="background: #f59e0b;">⚠️</div>
        <div class="task-title">Staff on Weekoff</div>
        <div class="task-count" style="background: #f59e0b;">${weekoffSlots.length} staff</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Employee ID</th>
            <th>Name</th>
            <th>Role</th>
            <th>Experience</th>
            <th>Assigned Task</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    weekoffSlots.forEach((slot: any) => {
      const user = slot.user || (slot.users ? transformUsers([slot.users])[0] : null);
      if (!user) return;
      
      const timeDisplay = slot.start_time && slot.end_time 
        ? `${slot.start_time} - ${slot.end_time}`
        : '<span style="color: #cbd5e1;">Not set</span>';
      
      const experienceClass = user.experienceLevel === 'experienced' ? 'experience-experienced' : 'experience-fresher';
      
      html += `
        <tr>
          <td><span class="employee-id">${user.employeeId || ''}</span></td>
          <td class="name-cell"><strong>${user.firstName || ''} ${user.lastName || ''}</strong></td>
          <td><span class="role-badge">${user.role?.name || ''}</span></td>
          <td><span class="experience-badge ${experienceClass}">${user.experienceLevel || ''}</span></td>
          <td>${slot.taskName || 'No Task Assigned'}</td>
          <td class="time-cell">${timeDisplay}</td>
        </tr>
      `;
    });
    
    html += `
        </tbody>
      </table>
    </div>
    `;
  }

  // Render regular staff grouped by task
  Array.from(regularSlotsByTask.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([taskName, slots]) => {
      html += `
    <div class="task-section">
      <div class="task-header">
        <div class="task-icon">📌</div>
        <div class="task-title">${taskName}</div>
        <div class="task-count">${slots.length} staff</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Employee ID</th>
            <th>Name</th>
            <th>Role</th>
            <th>Experience</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
      `;
      
      slots.forEach((slot: any) => {
        const user = slot.users ? transformUsers([slot.users])[0] : null;
        if (!user) return;
        
        const timeDisplay = slot.start_time && slot.end_time 
          ? `${slot.start_time} - ${slot.end_time}`
          : '<span style="color: #cbd5e1;">Not set</span>';
        
        const experienceClass = user.experienceLevel === 'experienced' ? 'experience-experienced' : 'experience-fresher';
        
        html += `
          <tr>
            <td><span class="employee-id">${user.employeeId || ''}</span></td>
            <td class="name-cell">${user.firstName || ''} ${user.lastName || ''}</td>
            <td><span class="role-badge">${user.role?.name || ''}</span></td>
            <td><span class="experience-badge ${experienceClass}">${user.experienceLevel || ''}</span></td>
            <td class="time-cell">${timeDisplay}</td>
          </tr>
        `;
      });
      
      html += `
        </tbody>
      </table>
    </div>
      `;
    });
  
  // Render regular staff without tasks
  if (regularSlotsWithoutTasks.length > 0) {
    html += `
    <div class="task-section">
      <div class="task-header">
        <div class="task-icon">👤</div>
        <div class="task-title">No Task Assigned</div>
        <div class="task-count">${regularSlotsWithoutTasks.length} staff</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Employee ID</th>
            <th>Name</th>
            <th>Role</th>
            <th>Experience</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    regularSlotsWithoutTasks.forEach((slot: any) => {
      const user = slot.users ? transformUsers([slot.users])[0] : null;
      if (!user) return;
      
      const timeDisplay = slot.start_time && slot.end_time 
        ? `${slot.start_time} - ${slot.end_time}`
        : '<span style="color: #cbd5e1;">Not set</span>';
      
      const experienceClass = user.experienceLevel === 'experienced' ? 'experience-experienced' : 'experience-fresher';
      
      html += `
        <tr>
          <td><span class="employee-id">${user.employeeId || ''}</span></td>
          <td class="name-cell">${user.firstName || ''} ${user.lastName || ''}</td>
          <td><span class="role-badge">${user.role?.name || ''}</span></td>
          <td><span class="experience-badge ${experienceClass}">${user.experienceLevel || ''}</span></td>
          <td class="time-cell">${timeDisplay}</td>
        </tr>
      `;
    });
    
    html += `
        </tbody>
      </table>
    </div>
    `;
  }

    html += `
    </div>
    
    <div class="footer">
      <p>Generated on ${new Date().toLocaleString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}</p>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}
