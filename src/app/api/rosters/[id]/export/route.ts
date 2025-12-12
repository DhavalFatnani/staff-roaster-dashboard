import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { transformUsers } from '@/utils/supabase-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';

    // Fetch roster with slots
    const { data: rosterData, error: rosterError } = await supabase
      .from('rosters')
      .select('*')
      .eq('id', params.id)
      .single();

    if (rosterError) throw rosterError;

    const { data: slotsData, error: slotsError } = await supabase
      .from('roster_slots')
      .select('*, users(*, roles(*))')
      .eq('roster_id', params.id);

    if (slotsError) throw slotsError;

    // Fetch all tasks to map IDs to names
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('id, name');

    if (tasksError) throw tasksError;

    const taskMap = new Map((tasksData || []).map((t: any) => [t.id, t.name]));

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Employee ID', 'Name', 'Role', 'Experience', 'Shift', 'Tasks', 'Start Time', 'End Time', 'Status'];
      const rows = (slotsData || []).map((slot: any) => {
        const user = slot.users ? transformUsers([slot.users])[0] : null;
        const taskNames = (slot.assigned_tasks || [])
          .map((taskId: string) => taskMap.get(taskId) || taskId)
          .join(', ');
        
        return [
          user?.employeeId || '',
          user ? `${user.firstName} ${user.lastName}` : '',
          user?.role?.name || '',
          user?.experienceLevel || '',
          rosterData.shift_type,
          taskNames,
          slot.start_time || '',
          slot.end_time || '',
          slot.status || ''
        ];
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="roster-${params.id}.csv"`
        }
      });
    } else {
      // PDF export - generate HTML that can be printed to PDF
      const htmlContent = generatePDFHTML(rosterData, slotsData, taskMap, transformUsers);
      
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

function generatePDFHTML(rosterData: any, slotsData: any[], taskMap: Map<string, string>, transformUsers: any) {
  const date = new Date(rosterData.date).toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Roster - ${date}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #1f2937; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
    th { background-color: #f3f4f6; font-weight: bold; }
    tr:nth-child(even) { background-color: #f9fafb; }
  </style>
</head>
<body>
  <h1>Roster - ${date}</h1>
  <p><strong>Shift:</strong> ${rosterData.shift_type}</p>
  <p><strong>Status:</strong> ${rosterData.status}</p>
  <table>
    <thead>
      <tr>
        <th>Employee ID</th>
        <th>Name</th>
        <th>Role</th>
        <th>Experience</th>
        <th>Tasks</th>
        <th>Start Time</th>
        <th>End Time</th>
      </tr>
    </thead>
    <tbody>
  `;

  slotsData.forEach((slot: any) => {
    const user = slot.users ? transformUsers([slot.users])[0] : null;
    if (!user) return;
    
    const taskNames = (slot.assigned_tasks || [])
      .map((taskId: string) => taskMap.get(taskId) || taskId)
      .join(', ');

    html += `
      <tr>
        <td>${user.employeeId || ''}</td>
        <td>${user.firstName || ''} ${user.lastName || ''}</td>
        <td>${user.role?.name || ''}</td>
        <td>${user.experienceLevel || ''}</td>
        <td>${taskNames}</td>
        <td>${slot.start_time || ''}</td>
        <td>${slot.end_time || ''}</td>
      </tr>
    `;
  });

  html += `
    </tbody>
  </table>
</body>
</html>
  `;

  return html;
}
