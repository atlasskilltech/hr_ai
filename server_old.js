const express = require("express");
const mysql = require("mysql2/promise");
const fetch = require("node-fetch");
const fs = require("fs");
require("dotenv").config();

const systemPrompt = fs.readFileSync("./systemPromptSingle.txt", "utf8");

const app = express();
app.use(express.json({ limit: "10mb" }));

function now() {
  return Number(process.hrtime.bigint() / 1000000n);
}

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10
});

console.log("✅ Server booting...");
console.log("✅ Prompt loaded. Length:", systemPrompt.length);

/* =========================================================
   DASHBOARD & DATA API ROUTES
========================================================= */

// Serve the dashboard HTML
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/hr-dashboard.html");
});

app.get("/dashboard", (req, res) => {
  res.sendFile(__dirname + "/hr-dashboard.html");
});

// API: Get all active staff
app.get("/api/staff/list", async (req, res) => {
  try {
    const [staff] = await db.query(`
      SELECT 
        staff_id,
        CONCAT(staff_first_name, ' ', staff_last_name) as staff_name,
        staff_department,
        staff_designation
      FROM dice_staff 
      WHERE staff_active = 0
      ORDER BY staff_first_name, staff_last_name
    `);
    res.json({ success: true, data: staff });
  } catch (error) {
    console.error("Error fetching staff:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get all departments
app.get("/api/departments/list", async (req, res) => {
  try {
    const [departments] = await db.query(`
      SELECT 
        staff_department_id as department_id,
        staff_department_name as department_name,
        staff_department_head as department_head_id
      FROM dice_staff_department
      ORDER BY staff_department_name
    `);
    res.json({ success: true, data: departments });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get staff by department
app.get("/api/departments/:department_id/staff", async (req, res) => {
  try {
    const department_id = req.params.department_id;
    const [staff] = await db.query(`
      SELECT 
        staff_id,
        CONCAT(staff_first_name, ' ', staff_last_name) as staff_name,
        staff_designation
      FROM dice_staff 
      WHERE staff_department = ? AND staff_active = 0
      ORDER BY staff_first_name, staff_last_name
    `, [department_id]);
    res.json({ success: true, data: staff });
  } catch (error) {
    console.error("Error fetching department staff:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* =========================================================
   UTILITY: BUILD CYCLES DYNAMICALLY
========================================================= */
function buildCycles(numCycles = 6) {
  const cycles = [];
  const today = new Date();
  const currentDay = today.getDate();

  let current_start, current_end;

  if (currentDay >= 21) {
    current_start = new Date(today.getFullYear(), today.getMonth(), 21);
    current_end = new Date(today.getFullYear(), today.getMonth() + 1, 20);
  } else {
    current_start = new Date(today.getFullYear(), today.getMonth() - 1, 21);
    current_end = new Date(today.getFullYear(), today.getMonth(), 20);
  }

  for (let i = 1; i <= numCycles; i++) {
    const start = new Date(current_start);
    const end = new Date(current_end);
    start.setMonth(start.getMonth() - i);
    end.setMonth(end.getMonth() - i);

    cycles.push({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      pay_cycle_id: i,
      label: `${start.getDate()} ${start.toLocaleString("en", {month: "short"})} ${start.getFullYear()} To ${end.getDate()} ${end.toLocaleString("en", {month: "short"})} ${end.getFullYear()}`
    });
  }

  return cycles;
}

/* =========================================================
   MODERN HTML BUILDERS WITH PROFESSIONAL STYLING
========================================================= */

function getModernStyles() {
  return `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 40px 20px;
        color: #1f2937;
      }
      
      .report-container {
        max-width: 1200px;
        margin: 0 auto;
        background: white;
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        overflow: hidden;
      }
      
      .report-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 40px;
        text-align: center;
      }
      
      .report-header h1 {
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 10px;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
      }
      
      .report-header .subtitle {
        font-size: 16px;
        opacity: 0.9;
      }
      
      .staff-info, .department-info {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        padding: 30px 40px;
        background: #f8fafc;
        border-bottom: 2px solid #e2e8f0;
      }
      
      .info-card {
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        border-left: 4px solid #667eea;
      }
      
      .info-card .label {
        font-size: 12px;
        text-transform: uppercase;
        color: #64748b;
        font-weight: 600;
        margin-bottom: 8px;
        letter-spacing: 0.5px;
      }
      
      .info-card .value {
        font-size: 18px;
        font-weight: 700;
        color: #1e293b;
      }
      
      .section {
        padding: 40px;
      }
      
      .section-title {
        font-size: 24px;
        font-weight: 700;
        color: #1e293b;
        margin-bottom: 24px;
        padding-bottom: 12px;
        border-bottom: 3px solid #667eea;
        display: inline-block;
      }
      
      .chart-container {
        background: white;
        padding: 30px;
        border-radius: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        margin-bottom: 30px;
      }
      
      .chart-wrapper {
        position: relative;
        height: 400px;
        margin-top: 20px;
      }
      
      .table-container {
        overflow-x: auto;
        background: white;
        border-radius: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        margin-bottom: 30px;
      }
      
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      
      thead {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      thead th {
        padding: 16px;
        text-align: center;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 12px;
        letter-spacing: 0.5px;
      }
      
      tbody tr {
        border-bottom: 1px solid #e2e8f0;
        transition: background-color 0.2s;
      }
      
      tbody tr:hover {
        background-color: #f8fafc;
      }
      
      tbody td {
        padding: 16px;
        text-align: center;
      }
      
      tbody tr td:first-child {
        font-weight: 600;
        text-align: left;
        color: #475569;
        background: #f8fafc;
      }
      
      .value-before {
        color: #dc2626;
        font-weight: 700;
        background: #fee2e2;
        padding: 6px 12px;
        border-radius: 6px;
        display: inline-block;
      }
      
      .value-after {
        color: #16a34a;
        font-weight: 700;
        background: #dcfce7;
        padding: 6px 12px;
        border-radius: 6px;
        display: inline-block;
      }

      .comparison-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin-top: 30px;
      }

      .staff-card {
        background: white;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        border-top: 4px solid #667eea;
        transition: transform 0.2s, box-shadow 0.2s;
      }

      .staff-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 20px rgba(0,0,0,0.12);
      }

      .staff-card h4 {
        font-size: 18px;
        color: #1e293b;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 2px solid #e2e8f0;
      }

      .stat-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        font-size: 14px;
      }

      .stat-label {
        color: #64748b;
        font-weight: 500;
      }

      .stat-value {
        font-weight: 700;
        color: #1e293b;
      }

      .stat-value.positive {
        color: #16a34a;
      }

      .stat-value.negative {
        color: #dc2626;
      }

      .metric-badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        margin-top: 12px;
      }

      .metric-badge.excellent {
        background: #dcfce7;
        color: #16a34a;
      }

      .metric-badge.good {
        background: #dbeafe;
        color: #2563eb;
      }

      .metric-badge.warning {
        background: #fef3c7;
        color: #d97706;
      }

      .metric-badge.poor {
        background: #fee2e2;
        color: #dc2626;
      }

      .status-changed {
        background: #fef3c7 !important;
      }

      .status-changed:hover {
        background: #fde68a !important;
      }

      tbody tr.status-changed td:first-child {
        background: #fef3c7;
      }
      
      /* Compact table for comparisons */
      .table-container table thead th {
        white-space: nowrap;
        min-width: 80px;
      }

      .table-container table tbody td {
        white-space: nowrap;
      }
      
      .ai-analysis {
        background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
        padding: 30px;
        border-radius: 16px;
        border-left: 6px solid #0284c7;
        margin-top: 30px;
      }
      
      .ai-analysis h3 {
        color: #0c4a6e;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .ai-analysis h3:before {
        content: "🤖";
        font-size: 24px;
      }
      
      .report-footer {
        text-align: center;
        padding: 30px;
        background: #f8fafc;
        color: #64748b;
        font-size: 14px;
        border-top: 2px solid #e2e8f0;
      }

      .department-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
      }

      .summary-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        text-align: center;
      }

      .summary-card .number {
        font-size: 36px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .summary-card .label {
        font-size: 14px;
        opacity: 0.9;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      @media print {
        body {
          background: white;
          padding: 0;
        }
        
        .report-container {
          box-shadow: none;
          border-radius: 0;
        }
      }
    </style>
  `;
}

function buildModernGraphHTML(chartData, canvasId = "attendanceGraph") {
  return `
    <div class="chart-container">
      <h3 class="section-title">📊 Attendance Trend Overview</h3>
      <div class="chart-wrapper">
        <canvas id="${canvasId}"></canvas>
      </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels"></script>

    <script>
      if (!window.Chart.instances) window.Chart.instances = [];
      Chart.register(ChartDataLabels);
      const chartData_${canvasId} = ${JSON.stringify(chartData)};

      new Chart(document.getElementById("${canvasId}"), {
        type: "bar",
        data: {
          labels: chartData_${canvasId}.labels,
          datasets: [
            {
              label: "Before Regularization (%)",
              data: chartData_${canvasId}.before,
              backgroundColor: "rgba(239, 68, 68, 0.8)",
              borderColor: "#dc2626",
              borderWidth: 2,
              borderRadius: 8
            },
            {
              label: "After Regularization (%)",
              data: chartData_${canvasId}.after,
              backgroundColor: "rgba(34, 197, 94, 0.8)",
              borderColor: "#16a34a",
              borderWidth: 2,
              borderRadius: 8
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                padding: 20,
                font: { size: 14, weight: "600" },
                usePointStyle: true,
                pointStyle: "rectRounded"
              }
            },
            datalabels: {
              anchor: "end",
              align: "top",
              color: "#1e293b",
              font: { weight: "bold", size: 11 },
              formatter: (value, ctx) => {
                const i = ctx.dataIndex;
                const count = ctx.dataset.label.includes("Before")
                  ? chartData_${canvasId}.before_count[i]
                  : chartData_${canvasId}.after_count[i];
                return value + "% (" + count + ")";
              }
            },
            tooltip: {
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              padding: 12,
              titleFont: { size: 14 },
              bodyFont: { size: 13 }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: (value) => value + "%",
                font: { size: 12 }
              },
              grid: {
                color: "rgba(0, 0, 0, 0.05)"
              }
            },
            x: {
              ticks: { font: { size: 12 } },
              grid: { display: false }
            }
          }
        }
      });
    </script>
  `;
}

function buildModernCycleWiseTableHTML(finalData) {
  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Very Less", key: "very_less" },
    { label: "Late", key: "late" },
    { label: "Holiday", key: "holiday" }
  ];

  const cycles = finalData.cycles;

  let headerRow1 = `<tr><th rowspan="2">Status</th>`;
  let headerRow2 = `<tr>`;

  cycles.forEach(c => {
    headerRow1 += `<th colspan="2">${c.label}</th>`;
    headerRow2 += `<th>Before</th><th>After</th>`;
  });

  headerRow1 += `</tr>`;
  headerRow2 += `</tr>`;

  let bodyRows = "";

  statuses.forEach(s => {
    bodyRows += `<tr><td>${s.label}</td>`;

    cycles.forEach(cycle => {
      const beforeVal = cycle.before[s.key] || 0;
      const afterVal = cycle.after[s.key] || 0;

      bodyRows += `
        <td><span class="value-before">${beforeVal}</span></td>
        <td><span class="value-after">${afterVal}</span></td>
      `;
    });

    bodyRows += `</tr>`;
  });

  return `
    <div class="table-container">
      <h3 class="section-title">📅 Cycle-wise Attendance Comparison</h3>
      <table>
        <thead>
          ${headerRow1}
          ${headerRow2}
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
  `;
}

function buildDepartmentCycleWiseTableHTML(departmentData) {
  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Very Less", key: "very_less" },
    { label: "Late", key: "late" },
    { label: "Holiday", key: "holiday" }
  ];

  const cycles = departmentData.cycles;

  let headerRow1 = `<tr><th rowspan="2">Status</th>`;
  let headerRow2 = `<tr>`;

  cycles.forEach(c => {
    headerRow1 += `<th colspan="2">${c.label}</th>`;
    headerRow2 += `<th>Before</th><th>After</th>`;
  });

  headerRow1 += `</tr>`;
  headerRow2 += `</tr>`;

  let bodyRows = "";

  statuses.forEach(s => {
    bodyRows += `<tr><td>${s.label}</td>`;

    cycles.forEach(cycle => {
      const beforeVal = cycle.before[s.key] || 0;
      const afterVal = cycle.after[s.key] || 0;

      bodyRows += `
        <td><span class="value-before">${beforeVal}</span></td>
        <td><span class="value-after">${afterVal}</span></td>
      `;
    });

    bodyRows += `</tr>`;
  });

  return `
    <div class="table-container">
      <h3 class="section-title">📅 Department Cycle-wise Summary</h3>
      <table>
        <thead>
          ${headerRow1}
          ${headerRow2}
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
  `;
}

function buildDateWiseStatusTableHTML(dateWiseData) {
  if (!dateWiseData || dateWiseData.length === 0) {
    return '';
  }

  let tableRows = "";
  
  dateWiseData.forEach(record => {
    const statusChanged = record.before_status !== record.after_status;
    const changeClass = statusChanged ? 'status-changed' : '';
    
    tableRows += `
      <tr class="${changeClass}">
        <td>${record.date}</td>
        <td><span class="value-before">${record.before_status}</span></td>
        <td><span class="value-after">${record.after_status}</span></td>
        <td>${statusChanged ? '✓ Changed' : '- No change'}</td>
      </tr>
    `;
  });

  return `
    <div class="table-container">
      <h3 class="section-title">📆 Date-wise Status Details</h3>
      <div style="max-height: 400px; overflow-y: auto;">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Before Regularization</th>
              <th>After Regularization</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function buildDepartmentStaffBeforeAfterTableHTML(staffDataArray) {
  if (!staffDataArray || staffDataArray.length === 0) {
    return '';
  }

  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Very Less", key: "very_less" },
    { label: "Late", key: "late" },
    { label: "Holiday", key: "holiday" }
  ];

  // Build header
  let headerRow = `<tr><th>Staff Name</th>`;
  statuses.forEach(status => {
    headerRow += `<th colspan="2">${status.label}</th>`;
  });
  headerRow += `<th colspan="2">Total Days</th><th colspan="2">Attendance %</th><th>Irregularities</th></tr>`;

  let subHeaderRow = `<tr><th></th>`;
  statuses.forEach(() => {
    subHeaderRow += `<th>Before</th><th>After</th>`;
  });
  subHeaderRow += `<th>Before</th><th>After</th><th>Before</th><th>After</th><th>Total</th></tr>`;

  // Build staff rows
  let staffRows = "";
  staffDataArray.forEach(staff => {
    staffRows += `<tr><td style="font-weight: 600; background: #f8fafc;">${staff.staff_name}</td>`;

    // Status columns
    statuses.forEach(status => {
      const beforeVal = staff.summary_before[status.key] || 0;
      const afterVal = staff.summary_after[status.key] || 0;
      staffRows += `
        <td><span class="value-before">${beforeVal}</span></td>
        <td><span class="value-after">${afterVal}</span></td>
      `;
    });

    // Total days
    const totalBefore = Object.values(staff.summary_before).reduce((a,b) => a+b, 0);
    const totalAfter = Object.values(staff.summary_after).reduce((a,b) => a+b, 0);
    staffRows += `<td>${totalBefore}</td><td>${totalAfter}</td>`;

    // Attendance percentage
    const percentBefore = totalBefore > 0 ? ((staff.summary_before.present / totalBefore) * 100).toFixed(1) : 0;
    const percentAfter = totalAfter > 0 ? ((staff.summary_after.present / totalAfter) * 100).toFixed(1) : 0;
    const badgeBefore = percentBefore >= 95 ? 'excellent' : percentBefore >= 85 ? 'good' : percentBefore >= 70 ? 'warning' : 'poor';
    const badgeAfter = percentAfter >= 95 ? 'excellent' : percentAfter >= 85 ? 'good' : percentAfter >= 70 ? 'warning' : 'poor';
    
    staffRows += `
      <td><span class="metric-badge ${badgeBefore}">${percentBefore}%</span></td>
      <td><span class="metric-badge ${badgeAfter}">${percentAfter}%</span></td>
    `;

    // Irregularities
    staffRows += `<td>${staff.irregularity_analysis.total_irregularities || 0}</td>`;

    staffRows += `</tr>`;
  });

  // Build summary row
  let summaryRow = `<tr style="background: #e0f2fe; font-weight: 700;"><td>DEPARTMENT TOTAL</td>`;
  
  statuses.forEach(status => {
    const beforeTotal = staffDataArray.reduce((sum, staff) => sum + (staff.summary_before[status.key] || 0), 0);
    const afterTotal = staffDataArray.reduce((sum, staff) => sum + (staff.summary_after[status.key] || 0), 0);
    summaryRow += `
      <td>${beforeTotal}</td>
      <td>${afterTotal}</td>
    `;
  });

  // Summary totals
  const deptTotalBefore = staffDataArray.reduce((sum, staff) => 
    sum + Object.values(staff.summary_before).reduce((a,b) => a+b, 0), 0);
  const deptTotalAfter = staffDataArray.reduce((sum, staff) => 
    sum + Object.values(staff.summary_after).reduce((a,b) => a+b, 0), 0);
  const deptPresentBefore = staffDataArray.reduce((sum, staff) => sum + (staff.summary_before.present || 0), 0);
  const deptPresentAfter = staffDataArray.reduce((sum, staff) => sum + (staff.summary_after.present || 0), 0);
  
  const deptPercentBefore = deptTotalBefore > 0 ? ((deptPresentBefore / deptTotalBefore) * 100).toFixed(1) : 0;
  const deptPercentAfter = deptTotalAfter > 0 ? ((deptPresentAfter / deptTotalAfter) * 100).toFixed(1) : 0;
  
  const deptBadgeBefore = deptPercentBefore >= 95 ? 'excellent' : deptPercentBefore >= 85 ? 'good' : 
                          deptPercentBefore >= 70 ? 'warning' : 'poor';
  const deptBadgeAfter = deptPercentAfter >= 95 ? 'excellent' : deptPercentAfter >= 85 ? 'good' : 
                         deptPercentAfter >= 70 ? 'warning' : 'poor';

  const deptIrregularities = staffDataArray.reduce((sum, staff) => 
    sum + (staff.irregularity_analysis.total_irregularities || 0), 0);

  summaryRow += `
    <td>${deptTotalBefore}</td>
    <td>${deptTotalAfter}</td>
    <td><span class="metric-badge ${deptBadgeBefore}">${deptPercentBefore}%</span></td>
    <td><span class="metric-badge ${deptBadgeAfter}">${deptPercentAfter}%</span></td>
    <td>${deptIrregularities}</td>
  </tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📊 Staff-wise Before & After Analysis</h3>
      <p style="color: #64748b; margin-bottom: 20px;">
        Detailed attendance breakdown for each staff member showing before and after regularization
      </p>
      <table>
        <thead>
          ${headerRow}
          ${subHeaderRow}
        </thead>
        <tbody>
          ${staffRows}
          ${summaryRow}
        </tbody>
      </table>
    </div>
  `;
}

function buildStaffComparisonCycleWiseTableHTML(staffDataArray) {
  if (!staffDataArray || staffDataArray.length === 0) {
    return '';
  }

  // Get cycles from first staff member (all have same cycles)
  const cycles = staffDataArray[0].cycles || [];
  
  if (cycles.length === 0) {
    return '';
  }

  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Very Less", key: "very_less" },
    { label: "Late", key: "late" },
    { label: "Holiday", key: "holiday" }
  ];

  // Build consolidated header - Cycle 1 (All Staff) | Cycle 2 (All Staff) | etc.
  let headerRow1 = `<tr><th rowspan="2">Status</th>`;
  let headerRow2 = `<tr>`;

  cycles.forEach(cycle => {
    const colspanCount = staffDataArray.length * 2; // 2 columns (Before/After) per staff
    headerRow1 += `<th colspan="${colspanCount}">${cycle.label}</th>`;
    
    staffDataArray.forEach(staff => {
      headerRow2 += `<th colspan="2">${staff.staff_name}</th>`;
    });
  });

  headerRow1 += `</tr>`;
  headerRow2 += `</tr>`;

  // Build third header row for Before/After
  let headerRow3 = `<tr><th></th>`;
  cycles.forEach(() => {
    staffDataArray.forEach(() => {
      headerRow3 += `<th>Before</th><th>After</th>`;
    });
  });
  headerRow3 += `</tr>`;

  // Build body rows - one row per status
  let bodyRows = "";

  statuses.forEach(status => {
    bodyRows += `<tr><td>${status.label}</td>`;

    cycles.forEach((cycle, cycleIdx) => {
      staffDataArray.forEach(staff => {
        const staffCycle = staff.cycles[cycleIdx];
        const beforeVal = staffCycle?.before?.[status.key] || 0;
        const afterVal = staffCycle?.after?.[status.key] || 0;

        bodyRows += `
          <td><span class="value-before">${beforeVal}</span></td>
          <td><span class="value-after">${afterVal}</span></td>
        `;
      });
    });

    bodyRows += `</tr>`;
  });

  return `
    <div class="table-container">
      <h3 class="section-title">📊 Cycle-wise Staff Comparison</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        Detailed attendance breakdown for each staff member across all cycles
      </p>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            ${headerRow1}
            ${headerRow2}
            ${headerRow3}
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function buildStaffComparisonSummaryTableHTML(staffDataArray) {
  if (!staffDataArray || staffDataArray.length === 0) {
    return '';
  }

  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Very Less", key: "very_less" },
    { label: "Late", key: "late" },
    { label: "Holiday", key: "holiday" }
  ];

  // Build header
  let headerRow = `<tr><th>Metric</th>`;
  staffDataArray.forEach(staff => {
    headerRow += `<th>${staff.staff_name}</th>`;
  });
  headerRow += `</tr>`;

  // Build status rows
  let statusRows = "";
  statuses.forEach(status => {
    statusRows += `<tr><td>${status.label}</td>`;
    staffDataArray.forEach(staff => {
      const count = staff.summary_after[status.key] || 0;
      const cssClass = status.key === 'present' ? 'positive' : 
                       status.key === 'absent' ? 'negative' : '';
      statusRows += `<td><span class="stat-value ${cssClass}">${count}</span></td>`;
    });
    statusRows += `</tr>`;
  });

  // Build summary metrics rows
  let metricsRows = "";
  
  // Total Days
  metricsRows += `<tr style="background: #f8fafc; font-weight: 600;"><td>Total Days</td>`;
  staffDataArray.forEach(staff => {
    const total = Object.values(staff.summary_after).reduce((a,b) => a+b, 0);
    metricsRows += `<td>${total}</td>`;
  });
  metricsRows += `</tr>`;

  // Attendance %
  metricsRows += `<tr style="background: #f8fafc; font-weight: 600;"><td>Attendance %</td>`;
  staffDataArray.forEach(staff => {
    const total = Object.values(staff.summary_after).reduce((a,b) => a+b, 0);
    const percent = total > 0 ? ((staff.summary_after.present / total) * 100).toFixed(1) : 0;
    const badge = percent >= 95 ? 'excellent' : percent >= 85 ? 'good' : percent >= 70 ? 'warning' : 'poor';
    metricsRows += `<td><span class="metric-badge ${badge}">${percent}%</span></td>`;
  });
  metricsRows += `</tr>`;

  // Total Irregularities
  metricsRows += `<tr style="background: #fef3c7;"><td>Total Irregularities</td>`;
  staffDataArray.forEach(staff => {
    metricsRows += `<td>${staff.irregularity_analysis.total_irregularities || 0}</td>`;
  });
  metricsRows += `</tr>`;

  // Approved Changes
  metricsRows += `<tr style="background: #dcfce7;"><td>Approved Changes</td>`;
  staffDataArray.forEach(staff => {
    metricsRows += `<td>${staff.irregularity_analysis.approved_changes || 0}</td>`;
  });
  metricsRows += `</tr>`;

  // Rejected Changes
  metricsRows += `<tr style="background: #fee2e2;"><td>Rejected Changes</td>`;
  staffDataArray.forEach(staff => {
    metricsRows += `<td>${staff.irregularity_analysis.rejected_changes || 0}</td>`;
  });
  metricsRows += `</tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📋 Overall Comparison Summary</h3>
      <table>
        <thead>
          ${headerRow}
        </thead>
        <tbody>
          ${statusRows}
          ${metricsRows}
        </tbody>
      </table>
    </div>
  `;
}

function buildStaffComparisonHTML(staffDataArray) {
  let cardsHTML = "";

  staffDataArray.forEach(staff => {
    const totalDays = Object.values(staff.summary_after).reduce((a,b) => a+b, 0);
    const presentPercent = totalDays > 0 
      ? ((staff.summary_after.present / totalDays) * 100).toFixed(1)
      : 0;
    
    const badge = presentPercent >= 95 ? "excellent" : 
                  presentPercent >= 85 ? "good" : 
                  presentPercent >= 70 ? "warning" : "poor";

    cardsHTML += `
      <div class="staff-card">
        <h4>${staff.staff_name}</h4>
        <div class="stat-row">
          <span class="stat-label">Present Days:</span>
          <span class="stat-value positive">${staff.summary_after.present || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Absent Days:</span>
          <span class="stat-value negative">${staff.summary_after.absent || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">On Leave:</span>
          <span class="stat-value">${staff.summary_after.on_leave || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Irregularities:</span>
          <span class="stat-value">${staff.irregularity_analysis.total_irregularities || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Approved Changes:</span>
          <span class="stat-value">${staff.irregularity_analysis.approved_changes || 0}</span>
        </div>
        <span class="metric-badge ${badge}">Attendance: ${presentPercent}%</span>
      </div>
    `;
  });

  return `
    <div class="chart-container">
      <h3 class="section-title">👥 Staff-wise Comparison Cards</h3>
      <div class="comparison-grid">
        ${cardsHTML}
      </div>
    </div>
  `;
}

/* =========================================================
   STAFF REPORT ROUTE - With Dynamic Cycles
========================================================= */
app.get("/staffAttendanceAnalysisReportUpdate/:staff_id", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("➡️ STAFF API HIT:", new Date().toISOString());

  try {
    const staff_id = req.params.staff_id;
    const numCycles = parseInt(req.query.cycles) || 6; // Default 6 cycles
    console.log("STEP 0️⃣ Staff ID:", staff_id, "Cycles:", numCycles);

    const [rows] = await db.query(
      "SELECT staff_first_name, staff_last_name, staff_head FROM dice_staff WHERE staff_id=?",
      [staff_id]
    );

    if (!rows.length) {
      return res.status(404).send("Staff not found");
    }

    const data = rows[0];
    const staff_name = `${data.staff_first_name} ${data.staff_last_name}`;

    const [rowsM] = await db.query(
      "SELECT staff_first_name, staff_last_name FROM dice_staff WHERE staff_id=?",
      [data.staff_head]
    );

    const dataM = rowsM[0] || {};
    const staff_managaer = `${dataM.staff_first_name || ""} ${dataM.staff_last_name || ""}`.trim();

    const cycles = buildCycles(numCycles);

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0, very_less: 0, late: 0, holiday: 0
    };

    const unchangedTemplate = {
      present_to_present: 0,
      absent_to_absent: 0,
      onleave_to_onleave: 0
    };

    const irregularTemplate = {
      total_irregularities: 0,
      approved_changes: 0,
      rejected_changes: 0,
      lesswork_to_present: 0,
      absent_to_present: 0,
      comissing_to_present: 0,
      halfday_to_present: 0,
      veryless_to_present: 0,
      late_to_present: 0,
      other_changes: 0
    };

    const finalData = {
      staff_id,
      staff_name,
      staff_managaer,
      cycles: [],
      summary_before: structuredClone(statusTemplate),
      summary_after: structuredClone(statusTemplate),
      un_changed_summary: structuredClone(unchangedTemplate),
      irregularity_analysis: structuredClone(irregularTemplate),
      date_wise_status: []
    };

    const statusKeyMap = {
      "Present": "present",
      "Absent": "absent",
      "On Leave": "on_leave",
      "HalfDay": "halfday",
      "Lesswork": "lesswork",
      "Very Less": "very_less",
      "Late CheckIn": "late",
      "Holiday": "holiday"
    };

    for (const cycle of cycles) {
      const [records] = await db.query(`
        SELECT 
          DATE_FORMAT(attendance_date,'%e %b') AS attendance_date,
          attendance_date AS full_date,
          CASE attendance_status
            WHEN 5 THEN 'Present'
            WHEN 6 THEN 'Absent'
            WHEN 7 THEN 'Lesswork'
            WHEN 8 THEN 'Clock out Missing'
            WHEN 9 THEN 'HalfDay'
            WHEN 10 THEN 'Very Less'
            WHEN 12 THEN 'On Leave'
            WHEN 13 THEN 'Holiday'
            WHEN 16 THEN 'Late CheckIn'
            ELSE ''
          END AS newStatus,

          CASE dice_irregularity_staff_prev_attendanc_status
            WHEN 5 THEN 'Present'
            WHEN 6 THEN 'Absent'
            WHEN 7 THEN 'Lesswork'
            WHEN 8 THEN 'Clock out Missing'
            WHEN 9 THEN 'HalfDay'
            WHEN 10 THEN 'Very Less'
            WHEN 12 THEN 'On Leave'
            WHEN 13 THEN 'Holiday'
            WHEN 16 THEN 'Late CheckIn'
            ELSE ''
          END AS prevStatusRaw

        FROM dice_staff_attendance
        LEFT JOIN dice_irregularity_staff
          ON dice_irregularity_staff.dice_irregularity_staff_attendance_id =
             dice_staff_attendance.staff_attendance_id
        WHERE staff_att_id=?
        AND attendance_date BETWEEN ? AND ?
        ORDER BY attendance_date ASC
      `, [staff_id, cycle.start, cycle.end]);

      const summary = {
        label: cycle.label,
        pay_cycle_id: cycle.pay_cycle_id,
        before: structuredClone(statusTemplate),
        after: structuredClone(statusTemplate),
        un_changed: structuredClone(unchangedTemplate),
        edits: []
      };

      for (const r of records) {
        const beforeRaw = r.prevStatusRaw;
        const afterRaw = r.newStatus;
        const before = beforeRaw || afterRaw;

        // Collect date-wise data
        finalData.date_wise_status.push({
          date: r.attendance_date,
          full_date: r.full_date,
          before_status: before,
          after_status: afterRaw
        });

        if (statusKeyMap[before]) {
          summary.before[statusKeyMap[before]]++;
          finalData.summary_before[statusKeyMap[before]]++;
        }

        if (statusKeyMap[afterRaw]) {
          summary.after[statusKeyMap[afterRaw]]++;
          finalData.summary_after[statusKeyMap[afterRaw]]++;
        }

        if (beforeRaw) {
          finalData.irregularity_analysis.total_irregularities++;
          if (beforeRaw !== afterRaw) {
            finalData.irregularity_analysis.approved_changes++;
            summary.edits.push({date: r.attendance_date, before: beforeRaw, after: afterRaw});
          } else {
            finalData.irregularity_analysis.rejected_changes++;
          }
        }
      }

      finalData.cycles.push(summary);
    }

    const labels = [
      "Present", "Absent", "On Leave", "HalfDay",
      "Lesswork", "Very Less", "Late", "Holiday"
    ];

    const beforeRaw = finalData.summary_before;
    const afterRaw = finalData.summary_after;

    const totalBefore = Object.values(beforeRaw).reduce((a, b) => a + b, 0);
    const totalAfter = Object.values(afterRaw).reduce((a, b) => a + b, 0);

    const beforeArr = [];
    const afterArr = [];
    const beforeCount = [];
    const afterCount = [];

    for (const label of labels) {
      const key = label.toLowerCase().replace(/ /g, "_");

      const b = beforeRaw[key] || 0;
      const a = afterRaw[key] || 0;

      beforeArr.push(totalBefore > 0 ? Number(((b / totalBefore) * 100).toFixed(2)) : 0);
      afterArr.push(totalAfter > 0 ? Number(((a / totalAfter) * 100).toFixed(2)) : 0);

      beforeCount.push(b);
      afterCount.push(a);
    }

    const chartData = {
      labels,
      before: beforeArr,
      after: afterArr,
      before_count: beforeCount,
      after_count: afterCount
    };

    console.log("STEP 7️⃣ Calling Mistral AI...");
    const ai = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          {role: "system", content: systemPrompt},
          {role: "user", content: "FINAL_DATA_JSON:" + JSON.stringify(finalData)}
        ]
      })
    });

    const aiRes = await ai.json();
    const aiHTML = aiRes.choices[0].message.content;

    const reportDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    const finalHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Attendance Regularization Report - ${staff_name}</title>
  ${getModernStyles()}
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>Attendance Regularization Report</h1>
      <div class="subtitle">Comprehensive Analysis & Insights</div>
    </div>

    <div class="staff-info">
      <div class="info-card">
        <div class="label">Employee Name</div>
        <div class="value">${staff_name}</div>
      </div>
      <div class="info-card">
        <div class="label">Reporting Manager</div>
        <div class="value">${staff_managaer || "N/A"}</div>
      </div>
      <div class="info-card">
        <div class="label">Report Date</div>
        <div class="value">${reportDate}</div>
      </div>
      <div class="info-card">
        <div class="label">Employee ID</div>
        <div class="value">#${staff_id}</div>
      </div>
      <div class="info-card">
        <div class="label">Cycles Analyzed</div>
        <div class="value">${numCycles}</div>
      </div>
    </div>

    <div class="section">
      ${buildModernGraphHTML(chartData)}
      ${buildModernCycleWiseTableHTML(finalData)}
      ${buildDateWiseStatusTableHTML(finalData.date_wise_status)}
      
      <div class="ai-analysis">
        <h3>AI-Powered Analysis</h3>
        ${aiHTML}
      </div>
    </div>

    <div class="report-footer">
      <p><strong>Generated by HR Analytics System</strong></p>
      <p>This report is confidential and intended for authorized personnel only.</p>
      <p style="margin-top: 10px; color: #94a3b8;">Report ID: RPT-${staff_id}-${Date.now()}</p>
    </div>
  </div>
</body>
</html>
    `;

    await db.query(
      "INSERT INTO staff_attendance_reports (staff_id,report_html,created_at) VALUES (?,?,NOW())",
      [staff_id, finalHTML]
    );

    res.send(finalHTML);

  } catch (e) {
    console.error("❌ ERROR OCCURRED:", e);
    res.status(500).send("Internal Server Error");
  }
});

/* =========================================================
   DEPARTMENT REPORT ROUTE - With Dynamic Cycles
========================================================= */
app.get("/departmentAttendanceReport/:department_id", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("➡️ DEPARTMENT API HIT:", new Date().toISOString());

  try {
    const department_id = req.params.department_id;
    const numCycles = parseInt(req.query.cycles) || 6; // Default 6 cycles
    console.log("Department ID:", department_id, "Cycles:", numCycles);

    // Get department details
    const [deptInfo] = await db.query(
      "SELECT staff_department_name as department_name, staff_department_id as department_head_staff_id FROM dice_staff_department  WHERE staff_department_id=?",
      [department_id]
    );

    if (!deptInfo.length) {
      return res.status(404).send("Department not found");
    }

    const department_name = deptInfo[0].department_name;
    const department_head_id = deptInfo[0].department_head_staff_id;

    let department_head = "N/A";
    if (department_head_id) {
      const [headInfo] = await db.query(
        "SELECT staff_first_name, staff_last_name FROM dice_staff WHERE staff_id=?",
        [department_head_id]
      );
      if (headInfo.length) {
        department_head = `${headInfo[0].staff_first_name} ${headInfo[0].staff_last_name}`;
      }
    }

    // Get all staff in department
    const [staffList] = await db.query(
      "SELECT staff_id, staff_first_name, staff_last_name FROM dice_staff WHERE department_id=? AND staff_status=1",
      [department_id]
    );

    console.log("Staff count:", staffList.length);

    const cycles = buildCycles(numCycles);

    const statusKeyMap = {
      "Present": "present",
      "Absent": "absent",
      "On Leave": "on_leave",
      "HalfDay": "halfday",
      "Lesswork": "lesswork",
      "Very Less": "very_less",
      "Late CheckIn": "late",
      "Holiday": "holiday"
    };

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0, very_less: 0, late: 0, holiday: 0
    };

    // Aggregate department data
    const departmentData = {
      summary_before: structuredClone(statusTemplate),
      summary_after: structuredClone(statusTemplate),
      cycles: cycles.map(c => ({
        label: c.label,
        before: structuredClone(statusTemplate),
        after: structuredClone(statusTemplate)
      })),
      total_irregularities: 0,
      approved_changes: 0
    };

    const staffDataArray = [];

    // Process each staff member
    for (const staff of staffList) {
      const staff_id = staff.staff_id;
      const staff_name = `${staff.staff_first_name} ${staff.staff_last_name}`;

      const staffData = {
        staff_id,
        staff_name,
        summary_before: structuredClone(statusTemplate),
        summary_after: structuredClone(statusTemplate),
        irregularity_analysis: { total_irregularities: 0, approved_changes: 0, rejected_changes: 0 }
      };

      for (let cycleIdx = 0; cycleIdx < cycles.length; cycleIdx++) {
        const cycle = cycles[cycleIdx];

        const [records] = await db.query(`
          SELECT 
            CASE attendance_status
              WHEN 5 THEN 'Present'
              WHEN 6 THEN 'Absent'
              WHEN 7 THEN 'Lesswork'
              WHEN 8 THEN 'Clock out Missing'
              WHEN 9 THEN 'HalfDay'
              WHEN 10 THEN 'Very Less'
              WHEN 12 THEN 'On Leave'
              WHEN 13 THEN 'Holiday'
              WHEN 16 THEN 'Late CheckIn'
              ELSE ''
            END AS newStatus,
            CASE dice_irregularity_staff_prev_attendanc_status
              WHEN 5 THEN 'Present'
              WHEN 6 THEN 'Absent'
              WHEN 7 THEN 'Lesswork'
              WHEN 8 THEN 'Clock out Missing'
              WHEN 9 THEN 'HalfDay'
              WHEN 10 THEN 'Very Less'
              WHEN 12 THEN 'On Leave'
              WHEN 13 THEN 'Holiday'
              WHEN 16 THEN 'Late CheckIn'
              ELSE ''
            END AS prevStatusRaw
          FROM dice_staff_attendance
          LEFT JOIN dice_irregularity_staff
            ON dice_irregularity_staff.dice_irregularity_staff_attendance_id = dice_staff_attendance.staff_attendance_id
          WHERE staff_att_id=? AND attendance_date BETWEEN ? AND ?
        `, [staff_id, cycle.start, cycle.end]);

        for (const r of records) {
          const beforeRaw = r.prevStatusRaw;
          const afterRaw = r.newStatus;
          const before = beforeRaw || afterRaw;

          if (statusKeyMap[before]) {
            staffData.summary_before[statusKeyMap[before]]++;
            departmentData.summary_before[statusKeyMap[before]]++;
            departmentData.cycles[cycleIdx].before[statusKeyMap[before]]++;
          }

          if (statusKeyMap[afterRaw]) {
            staffData.summary_after[statusKeyMap[afterRaw]]++;
            departmentData.summary_after[statusKeyMap[afterRaw]]++;
            departmentData.cycles[cycleIdx].after[statusKeyMap[afterRaw]]++;
          }

          if (beforeRaw) {
            staffData.irregularity_analysis.total_irregularities++;
            departmentData.total_irregularities++;
            if (beforeRaw !== afterRaw) {
              staffData.irregularity_analysis.approved_changes++;
              departmentData.approved_changes++;
            } else {
              staffData.irregularity_analysis.rejected_changes++;
            }
          }
        }
      }

      staffDataArray.push(staffData);
    }

    // Build chart data for department
    const labels = ["Present", "Absent", "On Leave", "HalfDay", "Lesswork", "Very Less", "Late", "Holiday"];
    const totalBefore = Object.values(departmentData.summary_before).reduce((a, b) => a + b, 0);
    const totalAfter = Object.values(departmentData.summary_after).reduce((a, b) => a + b, 0);

    const beforeArr = [];
    const afterArr = [];
    const beforeCount = [];
    const afterCount = [];

    for (const label of labels) {
      const key = label.toLowerCase().replace(/ /g, "_");
      const b = departmentData.summary_before[key] || 0;
      const a = departmentData.summary_after[key] || 0;

      beforeArr.push(totalBefore > 0 ? Number(((b / totalBefore) * 100).toFixed(2)) : 0);
      afterArr.push(totalAfter > 0 ? Number(((a / totalAfter) * 100).toFixed(2)) : 0);
      beforeCount.push(b);
      afterCount.push(a);
    }

    const chartData = { labels, before: beforeArr, after: afterArr, before_count: beforeCount, after_count: afterCount };

    // AI Analysis
    console.log("Calling Mistral AI for department analysis...");
    const ai = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          {role: "system", content: systemPrompt},
          {role: "user", content: "DEPARTMENT_DATA:" + JSON.stringify({ department_name, ...departmentData })}
        ]
      })
    });

    const aiRes = await ai.json();
    const aiHTML = aiRes.choices[0].message.content;

    const reportDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    const finalHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Department Attendance Report - ${department_name}</title>
  ${getModernStyles()}
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>Department Attendance Report</h1>
      <div class="subtitle">${department_name} - Comprehensive Analysis</div>
    </div>

    <div class="department-info">
      <div class="info-card">
        <div class="label">Department</div>
        <div class="value">${department_name}</div>
      </div>
      <div class="info-card">
        <div class="label">Total Staff</div>
        <div class="value">${staffList.length}</div>
      </div>
      <div class="info-card">
        <div class="label">Report Date</div>
        <div class="value">${reportDate}</div>
      </div>
      <div class="info-card">
        <div class="label">Department Head</div>
        <div class="value">${department_head}</div>
      </div>
      <div class="info-card">
        <div class="label">Cycles Analyzed</div>
        <div class="value">${numCycles}</div>
      </div>
    </div>

    <div class="section">
      <div class="department-summary">
        <div class="summary-card">
          <div class="number">${departmentData.summary_after.present || 0}</div>
          <div class="label">Total Present Days</div>
        </div>
        <div class="summary-card">
          <div class="number">${departmentData.summary_after.absent || 0}</div>
          <div class="label">Total Absent Days</div>
        </div>
        <div class="summary-card">
          <div class="number">${departmentData.total_irregularities || 0}</div>
          <div class="label">Total Irregularities</div>
        </div>
        <div class="summary-card">
          <div class="number">${departmentData.approved_changes || 0}</div>
          <div class="label">Approved Changes</div>
        </div>
      </div>

      ${buildModernGraphHTML(chartData, "departmentGraph")}
      ${buildDepartmentCycleWiseTableHTML(departmentData)}
      ${buildDepartmentStaffBeforeAfterTableHTML(staffDataArray)}
      ${buildStaffComparisonHTML(staffDataArray)}
      
      <div class="ai-analysis">
        <h3>AI-Powered Department Analysis</h3>
        ${aiHTML}
      </div>
    </div>

    <div class="report-footer">
      <p><strong>Generated by HR Analytics System</strong></p>
      <p>This report is confidential and intended for authorized personnel only.</p>
      <p style="margin-top: 10px; color: #94a3b8;">Report ID: DEPT-${department_id}-${Date.now()}</p>
    </div>
  </div>
</body>
</html>
    `;

    await db.query(
      "INSERT INTO department_attendance_reports (department_id,report_html,created_at) VALUES (?,?,NOW())",
      [department_id, finalHTML]
    );

    res.send(finalHTML);

  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).send("Internal Server Error");
  }
});

/* =========================================================
   STAFF COMPARISON ROUTE - With Dynamic Cycles
========================================================= */
app.post("/staffComparisonReport", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("➡️ COMPARISON API HIT:", new Date().toISOString());

  try {
    const { staff_ids, cycles: numCycles = 6 } = req.body; // Default 6 cycles

    if (!staff_ids || !Array.isArray(staff_ids) || staff_ids.length < 2) {
      return res.status(400).send("Please provide at least 2 staff IDs for comparison");
    }

    console.log("Comparing staff:", staff_ids, "Cycles:", numCycles);

    const cycles = buildCycles(numCycles);

    const statusKeyMap = {
      "Present": "present",
      "Absent": "absent",
      "On Leave": "on_leave",
      "HalfDay": "halfday",
      "Lesswork": "lesswork",
      "Very Less": "very_less",
      "Late CheckIn": "late",
      "Holiday": "holiday"
    };

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0, very_less: 0, late: 0, holiday: 0
    };

    const staffDataArray = [];

    // Process each staff member
    for (const staff_id of staff_ids) {
      const [staffInfo] = await db.query(
        "SELECT staff_first_name, staff_last_name FROM dice_staff WHERE staff_id=?",
        [staff_id]
      );

      if (!staffInfo.length) continue;

      const staff_name = `${staffInfo[0].staff_first_name} ${staffInfo[0].staff_last_name}`;

      const staffData = {
        staff_id,
        staff_name,
        summary_before: structuredClone(statusTemplate),
        summary_after: structuredClone(statusTemplate),
        irregularity_analysis: { total_irregularities: 0, approved_changes: 0, rejected_changes: 0 },
        cycles: []
      };

      for (const cycle of cycles) {
        const cycleData = {
          label: cycle.label,
          pay_cycle_id: cycle.pay_cycle_id,
          before: structuredClone(statusTemplate),
          after: structuredClone(statusTemplate)
        };

        const [records] = await db.query(`
          SELECT 
            CASE attendance_status
              WHEN 5 THEN 'Present'
              WHEN 6 THEN 'Absent'
              WHEN 7 THEN 'Lesswork'
              WHEN 8 THEN 'Clock out Missing'
              WHEN 9 THEN 'HalfDay'
              WHEN 10 THEN 'Very Less'
              WHEN 12 THEN 'On Leave'
              WHEN 13 THEN 'Holiday'
              WHEN 16 THEN 'Late CheckIn'
              ELSE ''
            END AS newStatus,
            CASE dice_irregularity_staff_prev_attendanc_status
              WHEN 5 THEN 'Present'
              WHEN 6 THEN 'Absent'
              WHEN 7 THEN 'Lesswork'
              WHEN 8 THEN 'Clock out Missing'
              WHEN 9 THEN 'HalfDay'
              WHEN 10 THEN 'Very Less'
              WHEN 12 THEN 'On Leave'
              WHEN 13 THEN 'Holiday'
              WHEN 16 THEN 'Late CheckIn'
              ELSE ''
            END AS prevStatusRaw
          FROM dice_staff_attendance
          LEFT JOIN dice_irregularity_staff
            ON dice_irregularity_staff.dice_irregularity_staff_attendance_id = dice_staff_attendance.staff_attendance_id
          WHERE staff_att_id=? AND attendance_date BETWEEN ? AND ?
        `, [staff_id, cycle.start, cycle.end]);

        for (const r of records) {
          const beforeRaw = r.prevStatusRaw;
          const afterRaw = r.newStatus;
          const before = beforeRaw || afterRaw;

          if (statusKeyMap[before]) {
            staffData.summary_before[statusKeyMap[before]]++;
            cycleData.before[statusKeyMap[before]]++;
          }

          if (statusKeyMap[afterRaw]) {
            staffData.summary_after[statusKeyMap[afterRaw]]++;
            cycleData.after[statusKeyMap[afterRaw]]++;
          }

          if (beforeRaw) {
            staffData.irregularity_analysis.total_irregularities++;
            if (beforeRaw !== afterRaw) {
              staffData.irregularity_analysis.approved_changes++;
            } else {
              staffData.irregularity_analysis.rejected_changes++;
            }
          }
        }

        staffData.cycles.push(cycleData);
      }

      staffDataArray.push(staffData);
    }

    const reportDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    const finalHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Staff Comparison Report</title>
  ${getModernStyles()}
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>Staff Attendance Comparison</h1>
      <div class="subtitle">Side-by-Side Performance Analysis</div>
    </div>

    <div class="staff-info">
      <div class="info-card">
        <div class="label">Staff Members</div>
        <div class="value">${staffDataArray.length}</div>
      </div>
      <div class="info-card">
        <div class="label">Report Date</div>
        <div class="value">${reportDate}</div>
      </div>
      <div class="info-card">
        <div class="label">Cycles Analyzed</div>
        <div class="value">${numCycles}</div>
      </div>
    </div>

    <div class="section">
      ${buildStaffComparisonHTML(staffDataArray)}
      ${buildStaffComparisonSummaryTableHTML(staffDataArray)}
      ${buildStaffComparisonCycleWiseTableHTML(staffDataArray)}
    </div>

    <div class="report-footer">
      <p><strong>Generated by HR Analytics System</strong></p>
      <p>This report is confidential and intended for authorized personnel only.</p>
      <p style="margin-top: 10px; color: #94a3b8;">Report ID: CMP-${Date.now()}</p>
    </div>
  </div>
</body>
</html>
    `;

    res.send(finalHTML);

  } catch (e) {
    console.error("❌ ERROR:", e);
    res.status(500).send("Internal Server Error");
  }
});

/* =========================================================
   SERVER START
========================================================= */
app.listen(3000, () => {
  console.log("🚀 Node Attendance Server running on port 3000");
  console.log("📍 Endpoints:");
  console.log("   - GET  /staffAttendanceAnalysisReportUpdate/:staff_id?cycles=N");
  console.log("   - GET  /departmentAttendanceReport/:department_id?cycles=N");
  console.log("   - POST /staffComparisonReport (body: {staff_ids: [], cycles: N})");
});