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
      FROM dice_staff_department where staff_department_active = 0
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
   UTILITY: CHECK IF WORKING HOURS COMPLETED
========================================================= */
function getEnhancedStatus(statusRaw, totalTime) {
  // Only for Late CheckIn, check if working hours completed
  // Clock out Missing is kept as separate status without enhancement
  if (statusRaw === 'Late CheckIn') {
    if (!totalTime) {
      return 'Late CheckIn (Incomplete)';
    }
    
    // Parse time format HH:MM:SS
    const timeParts = totalTime.split(':');
    if (timeParts.length !== 3) {
      return 'Late CheckIn (Incomplete)';
    }
    
    const hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    const totalMinutes = (hours * 60) + minutes;
    
    // 08:30:00 = 510 minutes
    const requiredMinutes = 510;
    
    if (totalMinutes >= requiredMinutes) {
      return 'Late CheckIn (Completed)';
    } else {
      return 'Late CheckIn (Incomplete)';
    }
  }
  
  // For all other statuses including "Clock out Missing", return as-is
  return statusRaw;
}

/* =========================================================
   UTILITY: CALCULATE LoP OMISSION
   is_faculty = 1 (Academic): Absent * 1 + (Clock out Missing + Late CheckIn Incomplete + Lesswork) * 1
   is_faculty = 0 (Non-Academic): Absent * 1 + (Clock out Missing + Late CheckIn Incomplete + Lesswork) * 0.17
========================================================= */
function calculateLoPOmission(summary, isFaculty) {
  const absent = summary.absent || 0;
  const clockOutMissing = summary.clock_out_missing || 0;
  const lateCheckinIncomplete = summary.late_checkin_incomplete || 0;
  const lesswork = summary.lesswork || 0;
  
  const irregularDays = clockOutMissing + lateCheckinIncomplete + lesswork;
  
  // isFaculty: 1 = Academic (faculty), 0 = Non-Academic (non-faculty)
  if (isFaculty === 1) {
    // Academic: All irregularities count as full day
    return absent + irregularDays;
  } else {
    // Non-Academic: Irregularities count as 0.17
    return absent + (irregularDays * 0.17);
  }
}

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

      .cw-table{
        table-layout: fixed;
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

      .lop-value {
        color: #7c3aed;
        font-weight: 700;
        background: #ede9fe;
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

      .stat-value-group {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .before-after-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
      }

      .before-after-badge.before {
        background: #fee2e2;
        color: #dc2626;
      }

      .before-after-badge.after {
        background: #dcfce7;
        color: #16a34a;
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

      .table-container table .cw-head th {
        white-space: normal;
        word-wrap: break-word;
      }

      .table-container table tbody td {
        white-space: nowrap;
      }

      .table-container table .cw-body td {
        white-space: normal;
        word-wrap: break-word;
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

      .lop-row {
        background: #faf5ff;
        font-weight: 600;
        border-top: 2px solid #7c3aed;
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
              anchor: function(context) {
                const value = context.dataset.data[context.dataIndex];
                return value > 5 ? 'end' : 'end';
              },
              align: function(context) {
                const value = context.dataset.data[context.dataIndex];
                return value > 5 ? 'top' : 'top';
              },
              offset: function(context) {
                const value = context.dataset.data[context.dataIndex];
                return value > 5 ? 0 : 4;
              },
              color: "#1e293b",
              font: { weight: "bold", size: 10 },
              formatter: (value, ctx) => {
                const i = ctx.dataIndex;
                const count = ctx.dataset.label.includes("Before")
                  ? chartData_${canvasId}.before_count[i]
                  : chartData_${canvasId}.after_count[i];
                
                // Only show label if there's data
                if (count === 0 && value === 0) {
                  return '';
                }
                
                // Return array for multi-line label
                return [value + "%", "(" + count + ")"];
              },
              rotation: 0,
              clamp: true,
              clip: false
            },
            tooltip: {
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              padding: 12,
              titleFont: { size: 14 },
              bodyFont: { size: 13 },
              callbacks: {
                label: function(context) {
                  const i = context.dataIndex;
                  const count = context.dataset.label.includes("Before")
                    ? chartData_${canvasId}.before_count[i]
                    : chartData_${canvasId}.after_count[i];
                  return context.dataset.label + ': ' + context.parsed.y + '% (' + count + ' days)';
                }
              }
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
              ticks: { 
                font: { size: 11 },
                maxRotation: 45,
                minRotation: 45
              },
              grid: { display: false }
            }
          },
          layout: {
            padding: {
              top: 40
            }
          }
        }
      });
    </script>
  `;
}

function buildModernCycleWiseTableHTML(finalData, isFaculty) {
  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
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

  // Add Total row
  bodyRows += `<tr style="background-color: #f0f9ff; font-weight: bold; border-top: 2px solid #3b82f6;"><td>Total</td>`;
  cycles.forEach(cycle => {
    const totalBefore = Object.values(cycle.before).reduce((sum, val) => sum + val, 0);
    const totalAfter = Object.values(cycle.after).reduce((sum, val) => sum + val, 0);
    bodyRows += `
      <td><span class="value-before">${totalBefore}</span></td>
      <td><span class="value-after">${totalAfter}</span></td>
    `;
  });
  bodyRows += `</tr>`;

  // Add LoP Omission row
  const staffTypeLabel = isFaculty === 1 ? 'Academic' : 'Non-Academic';
  const lopMultiplier = isFaculty === 1 ? '1' : '0.17';
  
  bodyRows += `<tr class="lop-row"><td>LoP Omission (${staffTypeLabel})</td>`;
  cycles.forEach(cycle => {
    const lopBefore = calculateLoPOmission(cycle.before, isFaculty);
    const lopAfter = calculateLoPOmission(cycle.after, isFaculty);
    bodyRows += `
      <td><span class="lop-value">${lopBefore.toFixed(2)}</span></td>
      <td><span class="lop-value">${lopAfter.toFixed(2)}</span></td>
    `;
  });
  bodyRows += `</tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📅 Cycle-wise Attendance Comparison</h3>
      <p style="color: #64748b; margin-bottom: 15px; font-size: 13px;">
        <strong>LoP Calculation:</strong> ${staffTypeLabel} staff - Absent × 1 + (Clock out Missing + Late CheckIn Incomplete + Lesswork) × ${lopMultiplier}
      </p>
      <table class="cw-table">
        <thead class="cw-head">
          ${headerRow1}
          ${headerRow2}
        </thead>
        <tbody class="cw-body">
          ${bodyRows}
        </tbody>
      </table>
    </div>
  `;
}

function buildDepartmentComparisonHTML(departmentDataArray) {
  let cardsHTML = "";

  departmentDataArray.forEach(dept => {
    const totalDaysBefore = Object.values(dept.summary_before).reduce((a,b) => a+b, 0);
    const totalDaysAfter = Object.values(dept.summary_after).reduce((a,b) => a+b, 0);
    
    const presentPercentBefore = totalDaysBefore > 0 
      ? ((dept.summary_before.present / totalDaysBefore) * 100).toFixed(1)
      : 0;
    const presentPercentAfter = totalDaysAfter > 0 
      ? ((dept.summary_after.present / totalDaysAfter) * 100).toFixed(1)
      : 0;
    
    const badgeBefore = presentPercentBefore >= 95 ? "excellent" : 
                  presentPercentBefore >= 85 ? "good" : 
                  presentPercentBefore >= 70 ? "warning" : "poor";
    const badgeAfter = presentPercentAfter >= 95 ? "excellent" : 
                  presentPercentAfter >= 85 ? "good" : 
                  presentPercentAfter >= 70 ? "warning" : "poor";

    cardsHTML += `
      <div class="staff-card">
        <h4>${dept.department_name}</h4>
        <div class="stat-row">
          <span class="stat-label">Staff Count:</span>
          <span class="stat-value">${dept.staff_count || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Present Days:</span>
          <div class="stat-value-group">
            <span class="before-after-badge before">Before: ${dept.summary_before.present || 0}</span>
            <span>→</span>
            <span class="before-after-badge after">After: ${dept.summary_after.present || 0}</span>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">Absent Days:</span>
          <div class="stat-value-group">
            <span class="before-after-badge before">Before: ${dept.summary_before.absent || 0}</span>
            <span>→</span>
            <span class="before-after-badge after">After: ${dept.summary_after.absent || 0}</span>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">On Leave:</span>
          <div class="stat-value-group">
            <span class="before-after-badge before">Before: ${dept.summary_before.on_leave || 0}</span>
            <span>→</span>
            <span class="before-after-badge after">After: ${dept.summary_after.on_leave || 0}</span>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">Irregularities:</span>
          <div class="stat-value-group">
            <span class="before-after-badge before">Before: ${dept.irregularity_analysis.irregularities_before || 0}</span>
            <span>→</span>
            <span class="before-after-badge after">After: ${dept.irregularity_analysis.irregularities_after || 0}</span>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total Regularizations:</span>
          <span class="stat-value">${dept.irregularity_analysis.total_irregularities || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Approved Changes:</span>
          <span class="stat-value positive">${dept.irregularity_analysis.approved_changes || 0}</span>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <span class="metric-badge ${badgeBefore}">Before: ${presentPercentBefore}%</span>
          <span class="metric-badge ${badgeAfter}">After: ${presentPercentAfter}%</span>
        </div>
      </div>
    `;
  });

  return `
    <div class="chart-container">
      <h3 class="section-title">🏢 Department-wise Comparison Cards</h3>
      <div class="comparison-grid">
        ${cardsHTML}
      </div>
    </div>
  `;
}


function buildDepartmentComparisonSummaryTableHTML(departmentDataArray) {
  if (!departmentDataArray || departmentDataArray.length === 0) {
    return '';
  }

  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
    { label: "Holiday", key: "holiday" }
  ];

  // Build header with Before/After for each department
  let headerRow1 = `<tr><th rowspan="2">Status</th>`;
  let headerRow2 = `<tr>`;
  
  departmentDataArray.forEach(dept => {
    headerRow1 += `<th colspan="2">${dept.department_name}</th>`;
    headerRow2 += `<th>Before</th><th>After</th>`;
  });
  headerRow1 += `</tr>`;
  headerRow2 += `</tr>`;

  // Build status rows
  let statusRows = "";
  statuses.forEach(status => {
    statusRows += `<tr><td>${status.label}</td>`;
    departmentDataArray.forEach(dept => {
      const beforeCount = dept.summary_before[status.key] || 0;
      const afterCount = dept.summary_after[status.key] || 0;
      
      const cssClass = status.key === 'present' ? 'positive' : 
                       status.key === 'absent' ? 'negative' : '';
      
      statusRows += `
        <td><span class="value-before">${beforeCount}</span></td>
        <td><span class="value-after">${afterCount}</span></td>
      `;
    });
    statusRows += `</tr>`;
  });

  // Add Total row for status counts
  statusRows += `<tr style="background-color: #f0f9ff; font-weight: bold; border-top: 2px solid #3b82f6;"><td>Total Days</td>`;
  departmentDataArray.forEach(dept => {
    const totalBefore = Object.values(dept.summary_before).reduce((a,b) => a+b, 0);
    const totalAfter = Object.values(dept.summary_after).reduce((a,b) => a+b, 0);
    statusRows += `
      <td><span class="stat-value">${totalBefore}</span></td>
      <td><span class="stat-value">${totalAfter}</span></td>
    `;
  });
  statusRows += `</tr>`;

  // Add LoP Omission row - Note: For departments, this is an approximation based on department type majority
  statusRows += `<tr class="lop-row"><td>LoP Omission (Estimated)</td>`;
  departmentDataArray.forEach(dept => {
    // Use department is_faculty if available, otherwise default to non-academic (0)
    const deptIsFaculty = dept.department_is_faculty !== undefined ? dept.department_is_faculty : 0;
    const lopBefore = calculateLoPOmission(dept.summary_before, deptIsFaculty);
    const lopAfter = calculateLoPOmission(dept.summary_after, deptIsFaculty);
    statusRows += `
      <td><span class="lop-value">${lopBefore.toFixed(2)}</span></td>
      <td><span class="lop-value">${lopAfter.toFixed(2)}</span></td>
    `;
  });
  statusRows += `</tr>`;

  // Build summary metrics rows
  let metricsRows = "";
  
  // Staff Count
  metricsRows += `<tr style="background: #f8fafc; font-weight: 600;"><td>Staff Count</td>`;
  departmentDataArray.forEach(dept => {
    metricsRows += `<td colspan="2">${dept.staff_count || 0}</td>`;
  });
  metricsRows += `</tr>`;

  // Attendance %
  metricsRows += `<tr style="background: #f8fafc; font-weight: 600;"><td>Attendance %</td>`;
  departmentDataArray.forEach(dept => {
    const totalBefore = Object.values(dept.summary_before).reduce((a,b) => a+b, 0);
    const totalAfter = Object.values(dept.summary_after).reduce((a,b) => a+b, 0);
    const percentBefore = totalBefore > 0 ? ((dept.summary_before.present / totalBefore) * 100).toFixed(1) : 0;
    const percentAfter = totalAfter > 0 ? ((dept.summary_after.present / totalAfter) * 100).toFixed(1) : 0;
    
    const badgeBefore = percentBefore >= 95 ? 'excellent' : percentBefore >= 85 ? 'good' : percentBefore >= 70 ? 'warning' : 'poor';
    const badgeAfter = percentAfter >= 95 ? 'excellent' : percentAfter >= 85 ? 'good' : percentAfter >= 70 ? 'warning' : 'poor';
    
    metricsRows += `
      <td><span class="metric-badge ${badgeBefore}">${percentBefore}%</span></td>
      <td><span class="metric-badge ${badgeAfter}">${percentAfter}%</span></td>
    `;
  });
  metricsRows += `</tr>`;

  // Irregularities
  metricsRows += `<tr style="background: #fef3c7;"><td>Total Irregularities</td>`;
  departmentDataArray.forEach(dept => {
    metricsRows += `
      <td><strong>${dept.irregularity_analysis.irregularities_before || 0}</strong></td>
      <td><strong>${dept.irregularity_analysis.irregularities_after || 0}</strong></td>
    `;
  });
  metricsRows += `</tr>`;

  // Total Regularizations
  metricsRows += `<tr style="background: #dbeafe;"><td>Total Regularizations</td>`;
  departmentDataArray.forEach(dept => {
    metricsRows += `<td colspan="2">${dept.irregularity_analysis.total_irregularities || 0}</td>`;
  });
  metricsRows += `</tr>`;

  // Approved Changes
  metricsRows += `<tr style="background: #dcfce7;"><td>Approved Changes</td>`;
  departmentDataArray.forEach(dept => {
    metricsRows += `<td colspan="2">${dept.irregularity_analysis.approved_changes || 0}</td>`;
  });
  metricsRows += `</tr>`;

  // Rejected Changes
  metricsRows += `<tr style="background: #fee2e2;"><td>Rejected Changes</td>`;
  departmentDataArray.forEach(dept => {
    metricsRows += `<td colspan="2">${dept.irregularity_analysis.rejected_changes || 0}</td>`;
  });
  metricsRows += `</tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📋 Overall Comparison Summary (Before & After)</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        <strong>Note:</strong> Shows counts for each status before and after regularization. LoP values are estimated based on department type.
      </p>
      <table>
        <thead>
          ${headerRow1}
          ${headerRow2}
        </thead>
        <tbody>
          ${statusRows}
          ${metricsRows}
        </tbody>
      </table>
    </div>
  `;
}

function buildDepartmentComparisonIrregularitiesTableHTML(departmentDataArray) {
  if (!departmentDataArray || departmentDataArray.length === 0) {
    return '';
  }

  // Only irregularity statuses
  const irregularityStatuses = [
    { label: "Absent", key: "absent" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" }
  ];

  // Build header with department names
  let headerRow1 = `<tr><th rowspan="2">Status</th>`;
  let headerRow2 = `<tr>`;

  departmentDataArray.forEach(dept => {
    headerRow1 += `<th colspan="2">${dept.department_name}</th>`;
    headerRow2 += `<th>Before</th><th>After</th>`;
  });

  headerRow1 += `</tr>`;
  headerRow2 += `</tr>`;

  // Build status rows
  let bodyRows = "";
  irregularityStatuses.forEach(status => {
    bodyRows += `<tr><td>${status.label}</td>`;
    
    departmentDataArray.forEach(dept => {
      const beforeVal = dept.summary_before[status.key] || 0;
      const afterVal = dept.summary_after[status.key] || 0;
      
      bodyRows += `
        <td><span class="value-before">${beforeVal}</span></td>
        <td><span class="value-after">${afterVal}</span></td>
      `;
    });
    
    bodyRows += `</tr>`;
  });

  // Add Total Irregularities row
  bodyRows += `<tr style="background-color: #fef3c7; font-weight: bold; border-top: 2px solid #f59e0b;"><td>Total Irregularities</td>`;
  departmentDataArray.forEach(dept => {
    bodyRows += `
      <td><span class="value-before">${dept.irregularity_analysis.irregularities_before || 0}</span></td>
      <td><span class="value-after">${dept.irregularity_analysis.irregularities_after || 0}</span></td>
    `;
  });
  bodyRows += `</tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">⚠️ Status-wise Irregularities Breakdown</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        Detailed breakdown of irregular attendance statuses before and after regularization
      </p>
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

function buildDepartmentComparisonCycleWiseTableHTML(departmentDataArray) {
  if (!departmentDataArray || departmentDataArray.length === 0) {
    return '';
  }

  const cycles = departmentDataArray[0].cycles || [];
  
  if (cycles.length === 0) {
    return '';
  }

  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
    { label: "Holiday", key: "holiday" }
  ];

  // Build consolidated header
  let headerRow1 = `<tr><th rowspan="2">Status</th>`;
  let headerRow2 = `<tr>`;

  cycles.forEach(cycle => {
    const colspanCount = departmentDataArray.length * 2;
    headerRow1 += `<th colspan="${colspanCount}">${cycle.label}</th>`;
    
    departmentDataArray.forEach(dept => {
      headerRow2 += `<th colspan="2">${dept.department_name}</th>`;
    });
  });

  headerRow1 += `</tr>`;
  headerRow2 += `</tr>`;

  // Build third header row for Before/After
  let headerRow3 = `<tr><th></th>`;
  cycles.forEach(() => {
    departmentDataArray.forEach(() => {
      headerRow3 += `<th>Before</th><th>After</th>`;
    });
  });
  headerRow3 += `</tr>`;

  // Build body rows
  let bodyRows = "";

  statuses.forEach(status => {
    bodyRows += `<tr><td>${status.label}</td>`;

    cycles.forEach((cycle, cycleIdx) => {
      departmentDataArray.forEach(dept => {
        const deptCycle = dept.cycles[cycleIdx];
        const beforeVal = deptCycle?.before?.[status.key] || 0;
        const afterVal = deptCycle?.after?.[status.key] || 0;

        bodyRows += `
          <td><span class="value-before">${beforeVal}</span></td>
          <td><span class="value-after">${afterVal}</span></td>
        `;
      });
    });

    bodyRows += `</tr>`;
  });

  // Add Total row
  bodyRows += `<tr style="background-color: #f0f9ff; font-weight: bold; border-top: 2px solid #3b82f6;"><td>Total</td>`;
  cycles.forEach((cycle, cycleIdx) => {
    departmentDataArray.forEach(dept => {
      const deptCycle = dept.cycles[cycleIdx];
      const totalBefore = Object.values(deptCycle?.before || {}).reduce((sum, val) => sum + val, 0);
      const totalAfter = Object.values(deptCycle?.after || {}).reduce((sum, val) => sum + val, 0);

      bodyRows += `
        <td><span class="value-before">${totalBefore}</span></td>
        <td><span class="value-after">${totalAfter}</span></td>
      `;
    });
  });
  bodyRows += `</tr>`;

  // Add LoP Omission row
  bodyRows += `<tr class="lop-row"><td>LoP Omission (Est.)</td>`;
  cycles.forEach((cycle, cycleIdx) => {
    departmentDataArray.forEach(dept => {
      const deptCycle = dept.cycles[cycleIdx];
      const deptIsFaculty = dept.department_is_faculty !== undefined ? dept.department_is_faculty : 0;
      const lopBefore = calculateLoPOmission(deptCycle?.before || {}, deptIsFaculty);
      const lopAfter = calculateLoPOmission(deptCycle?.after || {}, deptIsFaculty);

      bodyRows += `
        <td><span class="lop-value">${lopBefore.toFixed(2)}</span></td>
        <td><span class="lop-value">${lopAfter.toFixed(2)}</span></td>
      `;
    });
  });
  bodyRows += `</tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📊 Cycle-wise Department Comparison</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        Detailed attendance breakdown for each department across all cycles. LoP values estimated based on department type.
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

function buildDepartmentCycleWiseTableHTML(departmentData, departmentIsFaculty) {
  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
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

  // Add Total row
  bodyRows += `<tr style="background-color: #f0f9ff; font-weight: bold; border-top: 2px solid #3b82f6;"><td>Total</td>`;
  cycles.forEach(cycle => {
    const totalBefore = Object.values(cycle.before).reduce((sum, val) => sum + val, 0);
    const totalAfter = Object.values(cycle.after).reduce((sum, val) => sum + val, 0);
    bodyRows += `
      <td><span class="value-before">${totalBefore}</span></td>
      <td><span class="value-after">${totalAfter}</span></td>
    `;
  });
  bodyRows += `</tr>`;

  // Add LoP Omission row
  const staffTypeLabel = departmentIsFaculty === 1 ? 'Academic' : 'Non-Academic';
  const lopMultiplier = departmentIsFaculty === 1 ? '1' : '0.17';
  
  bodyRows += `<tr class="lop-row"><td>LoP Omission (${staffTypeLabel})</td>`;
  cycles.forEach(cycle => {
    const lopBefore = calculateLoPOmission(cycle.before, departmentIsFaculty);
    const lopAfter = calculateLoPOmission(cycle.after, departmentIsFaculty);
    bodyRows += `
      <td><span class="lop-value">${lopBefore.toFixed(2)}</span></td>
      <td><span class="lop-value">${lopAfter.toFixed(2)}</span></td>
    `;
  });
  bodyRows += `</tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📅 Department Cycle-wise Summary</h3>
      <p style="color: #64748b; margin-bottom: 15px; font-size: 13px;">
        <strong>LoP Calculation:</strong> ${staffTypeLabel} staff - Absent × 1 + (Clock out Missing + Late CheckIn Incomplete + Lesswork) × ${lopMultiplier}
      </p>
      <table class="cw-table">
        <thead class="cw-head">
          ${headerRow1}
          ${headerRow2}
        </thead>
        <tbody class="cw-body">
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
    
    // Show total_time for Late CheckIn statuses
    const showTime = (status, time) => {
      if (status && status.includes('Late CheckIn') && time) {
        return `${status} [${time}]`;
      }
      return status;
    };
    
    tableRows += `
      <tr class="${changeClass}">
        <td>${record.date}</td>
        <td><span class="value-before">${showTime(record.before_status, record.total_time)}</span></td>
        <td><span class="value-after">${showTime(record.after_status, record.total_time)}</span></td>
        <td>${statusChanged ? '✓ Changed' : '- No change'}</td>
      </tr>
    `;
  });

  return `
    <div class="table-container">
      <h3 class="section-title">📆 Date-wise Status Details</h3>
      <p style="color: #64748b; margin-bottom: 10px; font-size: 13px;">
        <strong>Note:</strong> "Late CheckIn (Completed)" means working hours ≥ 08:30:00. Time shown in brackets [HH:MM:SS].
      </p>
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
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
    { label: "Holiday", key: "holiday" }
  ];

  // Build header
  let headerRow = `<tr><th>Staff Name</th>`;
  statuses.forEach(status => {
    headerRow += `<th colspan="2">${status.label}</th>`;
  });
  headerRow += `<th colspan="2">Total Days</th><th colspan="2">Attendance %</th><th colspan="2">LoP Omission</th><th>Irregularities</th></tr>`;

  let subHeaderRow = `<tr><th></th>`;
  statuses.forEach(() => {
    subHeaderRow += `<th>Before</th><th>After</th>`;
  });
  subHeaderRow += `<th>Before</th><th>After</th><th>Before</th><th>After</th><th>Before</th><th>After</th><th>Total</th></tr>`;

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

    // LoP Omission
    const lopBefore = calculateLoPOmission(staff.summary_before, staff.is_faculty);
    const lopAfter = calculateLoPOmission(staff.summary_after, staff.is_faculty);
    staffRows += `
      <td><span class="lop-value">${lopBefore.toFixed(2)}</span></td>
      <td><span class="lop-value">${lopAfter.toFixed(2)}</span></td>
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

  // Calculate aggregated LoP for department
  const deptLoPBefore = staffDataArray.reduce((sum, staff) => 
    sum + calculateLoPOmission(staff.summary_before, staff.is_faculty), 0);
  const deptLoPAfter = staffDataArray.reduce((sum, staff) => 
    sum + calculateLoPOmission(staff.summary_after, staff.is_faculty), 0);

  summaryRow += `
    <td>${deptTotalBefore}</td>
    <td>${deptTotalAfter}</td>
    <td><span class="metric-badge ${deptBadgeBefore}">${deptPercentBefore}%</span></td>
    <td><span class="metric-badge ${deptBadgeAfter}">${deptPercentAfter}%</span></td>
    <td><span class="lop-value">${deptLoPBefore.toFixed(2)}</span></td>
    <td><span class="lop-value">${deptLoPAfter.toFixed(2)}</span></td>
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
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
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

  // Add Total row
  bodyRows += `<tr style="background-color: #f0f9ff; font-weight: bold; border-top: 2px solid #3b82f6;"><td>Total</td>`;
  cycles.forEach((cycle, cycleIdx) => {
    staffDataArray.forEach(staff => {
      const staffCycle = staff.cycles[cycleIdx];
      const totalBefore = Object.values(staffCycle?.before || {}).reduce((sum, val) => sum + val, 0);
      const totalAfter = Object.values(staffCycle?.after || {}).reduce((sum, val) => sum + val, 0);

      bodyRows += `
        <td><span class="value-before">${totalBefore}</span></td>
        <td><span class="value-after">${totalAfter}</span></td>
      `;
    });
  });
  bodyRows += `</tr>`;

  // Add LoP Omission row
  bodyRows += `<tr class="lop-row"><td>LoP Omission</td>`;
  cycles.forEach((cycle, cycleIdx) => {
    staffDataArray.forEach(staff => {
      const staffCycle = staff.cycles[cycleIdx];
      const lopBefore = calculateLoPOmission(staffCycle?.before || {}, staff.is_faculty);
      const lopAfter = calculateLoPOmission(staffCycle?.after || {}, staff.is_faculty);

      bodyRows += `
        <td><span class="lop-value">${lopBefore.toFixed(2)}</span></td>
        <td><span class="lop-value">${lopAfter.toFixed(2)}</span></td>
      `;
    });
  });
  bodyRows += `</tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📊 Cycle-wise Staff Comparison</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        Detailed attendance breakdown for each staff member across all cycles. LoP calculated based on individual staff type.
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
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
    { label: "Holiday", key: "holiday" }
  ];

  // Build header with Before/After for each staff
  let headerRow1 = `<tr><th rowspan="2">Status</th>`;
  let headerRow2 = `<tr>`;
  
  staffDataArray.forEach(staff => {
    headerRow1 += `<th colspan="2">${staff.staff_name}</th>`;
    headerRow2 += `<th>Before</th><th>After</th>`;
  });
  headerRow1 += `</tr>`;
  headerRow2 += `</tr>`;

  // Build status rows
  let statusRows = "";
  statuses.forEach(status => {
    statusRows += `<tr><td>${status.label}</td>`;
    staffDataArray.forEach(staff => {
      const beforeCount = staff.summary_before[status.key] || 0;
      const afterCount = staff.summary_after[status.key] || 0;
      
      const cssClass = status.key === 'present' ? 'positive' : 
                       status.key === 'absent' ? 'negative' : '';
      
      statusRows += `
        <td><span class="value-before">${beforeCount}</span></td>
        <td><span class="value-after">${afterCount}</span></td>
      `;
    });
    statusRows += `</tr>`;
  });

  // Add Total row for status counts
  statusRows += `<tr style="background-color: #f0f9ff; font-weight: bold; border-top: 2px solid #3b82f6;"><td>Total Days</td>`;
  staffDataArray.forEach(staff => {
    const totalBefore = Object.values(staff.summary_before).reduce((a,b) => a+b, 0);
    const totalAfter = Object.values(staff.summary_after).reduce((a,b) => a+b, 0);
    statusRows += `
      <td><span class="stat-value">${totalBefore}</span></td>
      <td><span class="stat-value">${totalAfter}</span></td>
    `;
  });
  statusRows += `</tr>`;

  // Add LoP Omission row
  statusRows += `<tr class="lop-row"><td>LoP Omission</td>`;
  staffDataArray.forEach(staff => {
    const lopBefore = calculateLoPOmission(staff.summary_before, staff.is_faculty);
    const lopAfter = calculateLoPOmission(staff.summary_after, staff.is_faculty);
    statusRows += `
      <td><span class="lop-value">${lopBefore.toFixed(2)}</span></td>
      <td><span class="lop-value">${lopAfter.toFixed(2)}</span></td>
    `;
  });
  statusRows += `</tr>`;

  // Build summary metrics rows
  let metricsRows = "";
  
  // Attendance %
  metricsRows += `<tr style="background: #f8fafc; font-weight: 600;"><td>Attendance %</td>`;
  staffDataArray.forEach(staff => {
    const totalBefore = Object.values(staff.summary_before).reduce((a,b) => a+b, 0);
    const totalAfter = Object.values(staff.summary_after).reduce((a,b) => a+b, 0);
    const percentBefore = totalBefore > 0 ? ((staff.summary_before.present / totalBefore) * 100).toFixed(1) : 0;
    const percentAfter = totalAfter > 0 ? ((staff.summary_after.present / totalAfter) * 100).toFixed(1) : 0;
    
    const badgeBefore = percentBefore >= 95 ? 'excellent' : percentBefore >= 85 ? 'good' : percentBefore >= 70 ? 'warning' : 'poor';
    const badgeAfter = percentAfter >= 95 ? 'excellent' : percentAfter >= 85 ? 'good' : percentAfter >= 70 ? 'warning' : 'poor';
    
    metricsRows += `
      <td><span class="metric-badge ${badgeBefore}">${percentBefore}%</span></td>
      <td><span class="metric-badge ${badgeAfter}">${percentAfter}%</span></td>
    `;
  });
  metricsRows += `</tr>`;

  // Irregularities
  metricsRows += `<tr style="background: #fef3c7;"><td>Total Irregularities</td>`;
  staffDataArray.forEach(staff => {
    metricsRows += `
      <td><strong>${staff.irregularity_analysis.irregularities_before || 0}</strong></td>
      <td><strong>${staff.irregularity_analysis.irregularities_after || 0}</strong></td>
    `;
  });
  metricsRows += `</tr>`;

  // Total Regularizations
  metricsRows += `<tr style="background: #dbeafe;"><td>Total Regularizations</td>`;
  staffDataArray.forEach(staff => {
    metricsRows += `<td colspan="2">${staff.irregularity_analysis.total_irregularities || 0}</td>`;
  });
  metricsRows += `</tr>`;

  // Approved Changes
  metricsRows += `<tr style="background: #dcfce7;"><td>Approved Changes</td>`;
  staffDataArray.forEach(staff => {
    metricsRows += `<td colspan="2">${staff.irregularity_analysis.approved_changes || 0}</td>`;
  });
  metricsRows += `</tr>`;

  // Rejected Changes
  metricsRows += `<tr style="background: #fee2e2;"><td>Rejected Changes</td>`;
  staffDataArray.forEach(staff => {
    metricsRows += `<td colspan="2">${staff.irregularity_analysis.rejected_changes || 0}</td>`;
  });
  metricsRows += `</tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📋 Overall Comparison Summary (Before & After)</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        <strong>Note:</strong> Shows counts for each status before and after regularization. LoP calculated based on individual staff type.
      </p>
      <table>
        <thead>
          ${headerRow1}
          ${headerRow2}
        </thead>
        <tbody>
          ${statusRows}
          ${metricsRows}
        </tbody>
      </table>
    </div>
  `;
}

function buildStaffComparisonIrregularitiesTableHTML(staffDataArray) {
  if (!staffDataArray || staffDataArray.length === 0) {
    return '';
  }

  // Only irregularity statuses
  const irregularityStatuses = [
    { label: "Absent", key: "absent" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" }
  ];

  // Build header with staff names
  let headerRow1 = `<tr><th rowspan="2">Status</th>`;
  let headerRow2 = `<tr>`;

  staffDataArray.forEach(staff => {
    headerRow1 += `<th colspan="2">${staff.staff_name}</th>`;
    headerRow2 += `<th>Before</th><th>After</th>`;
  });

  headerRow1 += `</tr>`;
  headerRow2 += `</tr>`;

  // Build status rows
  let bodyRows = "";
  irregularityStatuses.forEach(status => {
    bodyRows += `<tr><td>${status.label}</td>`;
    
    staffDataArray.forEach(staff => {
      const beforeVal = staff.summary_before[status.key] || 0;
      const afterVal = staff.summary_after[status.key] || 0;
      
      bodyRows += `
        <td><span class="value-before">${beforeVal}</span></td>
        <td><span class="value-after">${afterVal}</span></td>
      `;
    });
    
    bodyRows += `</tr>`;
  });

  // Add Total Irregularities row
  bodyRows += `<tr style="background-color: #fef3c7; font-weight: bold; border-top: 2px solid #f59e0b;"><td>Total Irregularities</td>`;
  staffDataArray.forEach(staff => {
    bodyRows += `
      <td><span class="value-before">${staff.irregularity_analysis.irregularities_before || 0}</span></td>
      <td><span class="value-after">${staff.irregularity_analysis.irregularities_after || 0}</span></td>
    `;
  });
  bodyRows += `</tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">⚠️ Status-wise Irregularities Breakdown</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        Detailed breakdown of irregular attendance statuses before and after regularization
      </p>
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

function buildStaffComparisonHTML(staffDataArray) {
  let cardsHTML = "";

  staffDataArray.forEach(staff => {
    const totalDaysBefore = Object.values(staff.summary_before).reduce((a,b) => a+b, 0);
    const totalDaysAfter = Object.values(staff.summary_after).reduce((a,b) => a+b, 0);
    
    const presentPercentBefore = totalDaysBefore > 0 
      ? ((staff.summary_before.present / totalDaysBefore) * 100).toFixed(1)
      : 0;
    const presentPercentAfter = totalDaysAfter > 0 
      ? ((staff.summary_after.present / totalDaysAfter) * 100).toFixed(1)
      : 0;
    
    const badgeBefore = presentPercentBefore >= 95 ? "excellent" : 
                  presentPercentBefore >= 85 ? "good" : 
                  presentPercentBefore >= 70 ? "warning" : "poor";
    const badgeAfter = presentPercentAfter >= 95 ? "excellent" : 
                  presentPercentAfter >= 85 ? "good" : 
                  presentPercentAfter >= 70 ? "warning" : "poor";

    // Calculate LoP Omission
    const lopBefore = calculateLoPOmission(staff.summary_before, staff.is_faculty);
    const lopAfter = calculateLoPOmission(staff.summary_after, staff.is_faculty);
    const staffTypeLabel = staff.is_faculty === 1 ? 'Academic' : 'Non-Academic';

    cardsHTML += `
      <div class="staff-card">
        <h4>${staff.staff_name} <span style="font-size: 12px; color: #7c3aed;">(${staffTypeLabel})</span></h4>
        <div class="stat-row">
          <span class="stat-label">Present Days:</span>
          <div class="stat-value-group">
            <span class="before-after-badge before">Before: ${staff.summary_before.present || 0}</span>
            <span>→</span>
            <span class="before-after-badge after">After: ${staff.summary_after.present || 0}</span>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">Absent Days:</span>
          <div class="stat-value-group">
            <span class="before-after-badge before">Before: ${staff.summary_before.absent || 0}</span>
            <span>→</span>
            <span class="before-after-badge after">After: ${staff.summary_after.absent || 0}</span>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">On Leave:</span>
          <div class="stat-value-group">
            <span class="before-after-badge before">Before: ${staff.summary_before.on_leave || 0}</span>
            <span>→</span>
            <span class="before-after-badge after">After: ${staff.summary_after.on_leave || 0}</span>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">LoP Omission:</span>
          <div class="stat-value-group">
            <span class="lop-value">${lopBefore.toFixed(2)}</span>
            <span>→</span>
            <span class="lop-value">${lopAfter.toFixed(2)}</span>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">Irregularities:</span>
          <div class="stat-value-group">
            <span class="before-after-badge before">Before: ${staff.irregularity_analysis.irregularities_before || 0}</span>
            <span>→</span>
            <span class="before-after-badge after">After: ${staff.irregularity_analysis.irregularities_after || 0}</span>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total Regularizations:</span>
          <span class="stat-value">${staff.irregularity_analysis.total_irregularities || 0}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Approved Changes:</span>
          <span class="stat-value positive">${staff.irregularity_analysis.approved_changes || 0}</span>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <span class="metric-badge ${badgeBefore}">Before: ${presentPercentBefore}%</span>
          <span class="metric-badge ${badgeAfter}">After: ${presentPercentAfter}%</span>
        </div>
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
   STAFF REPORT ROUTE - With Dynamic Cycles & LoP
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
    
    // Will be determined from attendance records
    let is_faculty = 0; // Default to non-academic
    let staff_type_label = 'Non-Academic';

    const [rowsM] = await db.query(
      "SELECT staff_first_name, staff_last_name FROM dice_staff WHERE staff_id=?",
      [data.staff_head]
    );

    const dataM = rowsM[0] || {};
    const staff_managaer = `${dataM.staff_first_name || ""} ${dataM.staff_last_name || ""}`.trim();

    const cycles = buildCycles(numCycles);

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0,
      late_checkin_completed: 0, late_checkin_incomplete: 0,
      clock_out_missing: 0,
      holiday: 0
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
      is_faculty,  // Will be updated from attendance records
      staff_type_label,  // Will be updated
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
      "Late CheckIn (Completed)": "late_checkin_completed",
      "Late CheckIn (Incomplete)": "late_checkin_incomplete",
      "Clock out Missing": "clock_out_missing",
      "Holiday": "holiday"
    };

    let facultyDetermined = false; // Flag to set is_faculty only once

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
          END AS prevStatusRaw,
          
          dice_staff_attendance.total_time_seven,
          dice_staff_attendance.is_faculty

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
        // Set is_faculty from first record only
        if (!facultyDetermined && r.is_faculty !== undefined && r.is_faculty !== null) {
          is_faculty = r.is_faculty;
          staff_type_label = is_faculty === 1 ? 'Academic' : 'Non-Academic';
          finalData.is_faculty = is_faculty;
          finalData.staff_type_label = staff_type_label;
          facultyDetermined = true;
        }

        const beforeRaw = r.prevStatusRaw;
        const afterRaw = r.newStatus;
        
        // Enhance status with completed/incomplete for Late CheckIn and Clock out Missing
        const beforeEnhanced = beforeRaw ? getEnhancedStatus(beforeRaw, r.total_time_seven) : null;
        const afterEnhanced = getEnhancedStatus(afterRaw, r.total_time_seven);
        
        const before = beforeEnhanced || afterEnhanced;

        // Collect date-wise data with enhanced status
        finalData.date_wise_status.push({
          date: r.attendance_date,
          full_date: r.full_date,
          before_status: before,
          after_status: afterEnhanced,
          total_time: r.total_time_seven
        });

        // Count statuses with enhanced Late CheckIn separately
        if (statusKeyMap[before]) {
          summary.before[statusKeyMap[before]]++;
          finalData.summary_before[statusKeyMap[before]]++;
        }

        if (statusKeyMap[afterEnhanced]) {
          summary.after[statusKeyMap[afterEnhanced]]++;
          finalData.summary_after[statusKeyMap[afterEnhanced]]++;
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
      "Lesswork",
      "Late CheckIn (Completed)", "Late CheckIn (Incomplete)",
      "Clock out Missing", "Holiday"
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
      const key = label.toLowerCase().replace(/ /g, "_").replace(/[()]/g, "");

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
        <div class="label">Staff Type</div>
        <div class="value">${staff_type_label}</div>
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
      ${buildModernCycleWiseTableHTML(finalData, is_faculty)}
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
   DEPARTMENT REPORT ROUTE - With Dynamic Cycles & LoP
========================================================= */
app.get("/departmentAttendanceReport/:department_id", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("➡️ DEPARTMENT API HIT:", new Date().toISOString());

  try {
    const department_id = req.params.department_id;
    const numCycles = parseInt(req.query.cycles) || 6; // Default 6 cycles
    console.log("Department ID:", department_id, "Cycles:", numCycles);

    const [deptInfo] = await db.query(
      "SELECT staff_department_name as department_name, staff_department_head as department_head_staff_id FROM dice_staff_department WHERE staff_department_id=?",
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
      "SELECT staff_id, staff_first_name, staff_last_name FROM dice_staff WHERE staff_department=? AND staff_active=0",
      [department_id]
    );

    console.log("Staff count:", staffList.length);

    // Will determine predominant is_faculty after processing attendance records
    let department_is_faculty = 0; // Default to non-academic

    const cycles = buildCycles(numCycles);

    const statusKeyMap = {
      "Present": "present",
      "Absent": "absent",
      "On Leave": "on_leave",
      "HalfDay": "halfday",
      "Lesswork": "lesswork",
      "Late CheckIn (Completed)": "late_checkin_completed",
      "Late CheckIn (Incomplete)": "late_checkin_incomplete",
      "Clock out Missing": "clock_out_missing",
      "Holiday": "holiday"
    };

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0,
      late_checkin_completed: 0, late_checkin_incomplete: 0,
      clock_out_missing: 0,
      holiday: 0
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
      let is_faculty = 0; // Default to non-academic
      let facultyDetermined = false;

      const staffData = {
        staff_id,
        staff_name,
        is_faculty,  // Will be updated from attendance records
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
            END AS prevStatusRaw,
            dice_staff_attendance.total_time_seven,
            dice_staff_attendance.is_faculty
          FROM dice_staff_attendance
          LEFT JOIN dice_irregularity_staff
            ON dice_irregularity_staff.dice_irregularity_staff_attendance_id = dice_staff_attendance.staff_attendance_id
          WHERE staff_att_id=? AND attendance_date BETWEEN ? AND ?
        `, [staff_id, cycle.start, cycle.end]);

        for (const r of records) {
          // Set is_faculty from first record
          if (!facultyDetermined && r.is_faculty !== undefined && r.is_faculty !== null) {
            is_faculty = r.is_faculty;
            staffData.is_faculty = is_faculty;
            facultyDetermined = true;
          }

          const beforeRaw = r.prevStatusRaw;
          const afterRaw = r.newStatus;
          
          // Enhance status with completed/incomplete for Late CheckIn only
          const beforeEnhanced = beforeRaw ? getEnhancedStatus(beforeRaw, r.total_time_seven) : null;
          const afterEnhanced = getEnhancedStatus(afterRaw, r.total_time_seven);
          
          const before = beforeEnhanced || afterEnhanced;

          // Count statuses with enhanced Late CheckIn separately
          if (statusKeyMap[before]) {
            staffData.summary_before[statusKeyMap[before]]++;
            departmentData.summary_before[statusKeyMap[before]]++;
            departmentData.cycles[cycleIdx].before[statusKeyMap[before]]++;
          }

          if (statusKeyMap[afterEnhanced]) {
            staffData.summary_after[statusKeyMap[afterEnhanced]]++;
            departmentData.summary_after[statusKeyMap[afterEnhanced]]++;
            departmentData.cycles[cycleIdx].after[statusKeyMap[afterEnhanced]]++;
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

    // Determine department is_faculty based on majority
    const academicCount = staffDataArray.filter(s => s.is_faculty === 1).length;
    const nonAcademicCount = staffDataArray.filter(s => s.is_faculty === 0).length;
    department_is_faculty = academicCount >= nonAcademicCount ? 1 : 0;
    
    console.log(`Department type: ${department_is_faculty === 1 ? 'Academic' : 'Non-Academic'} (${academicCount} academic, ${nonAcademicCount} non-academic)`);

    // Build chart data for department
    const labels = ["Present", "Absent", "On Leave", "HalfDay", "Lesswork",
                    "Late CheckIn (Completed)", "Late CheckIn (Incomplete)", 
                    "Clock out Missing", "Holiday"];
    const totalBefore = Object.values(departmentData.summary_before).reduce((a, b) => a + b, 0);
    const totalAfter = Object.values(departmentData.summary_after).reduce((a, b) => a + b, 0);

    const beforeArr = [];
    const afterArr = [];
    const beforeCount = [];
    const afterCount = [];

    for (const label of labels) {
      const key = label.toLowerCase().replace(/ /g, "_").replace(/[()]/g, "");
      const b = departmentData.summary_before[key] || 0;
      const a = departmentData.summary_after[key] || 0;

      beforeArr.push(totalBefore > 0 ? Number(((b / totalBefore) * 100).toFixed(2)) : 0);
      afterArr.push(totalAfter > 0 ? Number(((a / totalAfter) * 100).toFixed(2)) : 0);
      beforeCount.push(b);
      afterCount.push(a);
    }

    const chartData = { labels, before: beforeArr, after: afterArr, before_count: beforeCount, after_count: afterCount };

    // AI Analysis for Department
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
      ${buildDepartmentCycleWiseTableHTML(departmentData, department_is_faculty)}
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
   DEPARTMENT COMPARISON ROUTE - With Dynamic Cycles & LoP
========================================================= */
app.post("/departmentComparisonReport", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("➡️ DEPARTMENT COMPARISON API HIT:", new Date().toISOString());

  try {
    const { department_ids, cycles: numCycles = 6 } = req.body;

    if (!department_ids || !Array.isArray(department_ids) || department_ids.length < 2) {
      return res.status(400).send("Please provide at least 2 department IDs for comparison");
    }

    console.log("Comparing departments:", department_ids, "Cycles:", numCycles);

    const cycles = buildCycles(numCycles);

    const statusKeyMap = {
      "Present": "present",
      "Absent": "absent",
      "On Leave": "on_leave",
      "HalfDay": "halfday",
      "Lesswork": "lesswork",
      "Late CheckIn (Completed)": "late_checkin_completed",
      "Late CheckIn (Incomplete)": "late_checkin_incomplete",
      "Clock out Missing": "clock_out_missing",
      "Holiday": "holiday"
    };

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0,
      late_checkin_completed: 0, late_checkin_incomplete: 0,
      clock_out_missing: 0,
      holiday: 0
    };

    // Helper function to count irregularities
    const countIrregularities = (summary) => {
      return (summary.absent || 0) + 
             (summary.late_checkin_completed || 0) + 
             (summary.late_checkin_incomplete || 0) + 
             (summary.clock_out_missing || 0) + 
             (summary.lesswork || 0) + 
             (summary.halfday || 0);
    };

    const departmentDataArray = [];

    // Process each department
    for (const department_id of department_ids) {
      const [deptInfo] = await db.query(
        "SELECT staff_department_name as department_name, staff_department_head as department_head_staff_id FROM dice_staff_department WHERE staff_department_id=?",
        [department_id]
      );

      if (!deptInfo.length) continue;

      const department_name = deptInfo[0].department_name;

      // Get all staff in department
      const [staffList] = await db.query(
        "SELECT staff_id FROM dice_staff WHERE staff_department=? AND staff_active=0",
        [department_id]
      );

      // Will determine predominant is_faculty after processing
      const staffFacultyList = [];

      const departmentData = {
        department_id,
        department_name,
        staff_count: staffList.length,
        department_is_faculty: 0,  // Will be updated
        summary_before: structuredClone(statusTemplate),
        summary_after: structuredClone(statusTemplate),
        irregularity_analysis: { 
          total_irregularities: 0, 
          approved_changes: 0, 
          rejected_changes: 0,
          irregularities_before: 0,
          irregularities_after: 0
        },
        cycles: []
      };

      // Process each cycle for this department
      for (const cycle of cycles) {
        const cycleData = {
          label: cycle.label,
          pay_cycle_id: cycle.pay_cycle_id,
          before: structuredClone(statusTemplate),
          after: structuredClone(statusTemplate)
        };

        // Process all staff in department for this cycle
        for (const staff of staffList) {
          const staff_id = staff.staff_id;
          let staffFacultyDetermined = false;

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
              END AS prevStatusRaw,
              dice_staff_attendance.total_time_seven,
              dice_staff_attendance.is_faculty
            FROM dice_staff_attendance
            LEFT JOIN dice_irregularity_staff
              ON dice_irregularity_staff.dice_irregularity_staff_attendance_id = dice_staff_attendance.staff_attendance_id
            WHERE staff_att_id=? AND attendance_date BETWEEN ? AND ?
          `, [staff_id, cycle.start, cycle.end]);

          for (const r of records) {
            // Collect is_faculty from first record
            if (!staffFacultyDetermined && r.is_faculty !== undefined && r.is_faculty !== null) {
              staffFacultyList.push(r.is_faculty);
              staffFacultyDetermined = true;
            }

            const beforeRaw = r.prevStatusRaw;
            const afterRaw = r.newStatus;
            
            const beforeEnhanced = beforeRaw ? getEnhancedStatus(beforeRaw, r.total_time_seven) : null;
            const afterEnhanced = getEnhancedStatus(afterRaw, r.total_time_seven);
            
            const before = beforeEnhanced || afterEnhanced;

            if (statusKeyMap[before]) {
              departmentData.summary_before[statusKeyMap[before]]++;
              cycleData.before[statusKeyMap[before]]++;
            }

            if (statusKeyMap[afterEnhanced]) {
              departmentData.summary_after[statusKeyMap[afterEnhanced]]++;
              cycleData.after[statusKeyMap[afterEnhanced]]++;
            }

            if (beforeRaw) {
              departmentData.irregularity_analysis.total_irregularities++;
              if (beforeRaw !== afterRaw) {
                departmentData.irregularity_analysis.approved_changes++;
              } else {
                departmentData.irregularity_analysis.rejected_changes++;
              }
            }
          }
        }

        departmentData.cycles.push(cycleData);
      }

      // After cycles loop, determine department type
      const academicCount = staffFacultyList.filter(f => f === 1).length;
      const nonAcademicCount = staffFacultyList.filter(f => f === 0).length;
      departmentData.department_is_faculty = academicCount >= nonAcademicCount ? 1 : 0;

      // Calculate irregularities before and after
      departmentData.irregularity_analysis.irregularities_before = countIrregularities(departmentData.summary_before);
      departmentData.irregularity_analysis.irregularities_after = countIrregularities(departmentData.summary_after);

      departmentDataArray.push(departmentData);
    }

    // AI Analysis for Department Comparison
    console.log("Calling Mistral AI for department comparison analysis...");
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
          {role: "user", content: "DEPARTMENT_COMPARISON_DATA:" + JSON.stringify({ 
            department_count: departmentDataArray.length, 
            cycles: numCycles,
            department_data: departmentDataArray 
          })}
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
  <title>Department Comparison Report</title>
  ${getModernStyles()}
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>Department Attendance Comparison</h1>
      <div class="subtitle">Cross-Department Performance Analysis</div>
    </div>

    <div class="staff-info">
      <div class="info-card">
        <div class="label">Departments</div>
        <div class="value">${departmentDataArray.length}</div>
      </div>
      <div class="info-card">
        <div class="label">Report Date</div>
        <div class="value">${reportDate}</div>
      </div>
      <div class="info-card">
        <div class="label">Cycles Analyzed</div>
        <div class="value">${numCycles}</div>
      </div>
      <div class="info-card">
        <div class="label">Total Staff</div>
        <div class="value">${departmentDataArray.reduce((sum, d) => sum + d.staff_count, 0)}</div>
      </div>
    </div>

    <div class="section">
      ${buildDepartmentComparisonHTML(departmentDataArray)}
      ${buildDepartmentComparisonSummaryTableHTML(departmentDataArray)}
      ${buildDepartmentComparisonIrregularitiesTableHTML(departmentDataArray)}
      ${buildDepartmentComparisonCycleWiseTableHTML(departmentDataArray)}
      
      <div class="ai-analysis">
        <h3>AI-Powered Comparative Analysis</h3>
        ${aiHTML}
      </div>
    </div>

    <div class="report-footer">
      <p><strong>Generated by HR Analytics System</strong></p>
      <p>This report is confidential and intended for authorized personnel only.</p>
      <p style="margin-top: 10px; color: #94a3b8;">Report ID: DEPT-CMP-${Date.now()}</p>
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
   STAFF COMPARISON ROUTE - With Dynamic Cycles & LoP
========================================================= */
app.post("/staffComparisonReport", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("➡️ COMPARISON API HIT:", new Date().toISOString());

  try {
    const { staff_ids, cycles: numCycles = 6 } = req.body;

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
      "Late CheckIn (Completed)": "late_checkin_completed",
      "Late CheckIn (Incomplete)": "late_checkin_incomplete",
      "Clock out Missing": "clock_out_missing",
      "Holiday": "holiday"
    };

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0,
      late_checkin_completed: 0, late_checkin_incomplete: 0,
      clock_out_missing: 0,
      holiday: 0
    };

    // Helper function to count irregularities
    const countIrregularities = (summary) => {
      return (summary.absent || 0) + 
             (summary.late_checkin_completed || 0) + 
             (summary.late_checkin_incomplete || 0) + 
             (summary.clock_out_missing || 0) + 
             (summary.lesswork || 0) + 
             (summary.halfday || 0);
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
      let is_faculty = 0; // Default to non-academic
      let facultyDetermined = false;

      const staffData = {
        staff_id,
        staff_name,
        is_faculty,  // Will be updated from attendance records
        summary_before: structuredClone(statusTemplate),
        summary_after: structuredClone(statusTemplate),
        irregularity_analysis: { 
          total_irregularities: 0, 
          approved_changes: 0, 
          rejected_changes: 0,
          irregularities_before: 0,
          irregularities_after: 0
        },
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
            END AS prevStatusRaw,
            dice_staff_attendance.total_time_seven,
            dice_staff_attendance.is_faculty
          FROM dice_staff_attendance
          LEFT JOIN dice_irregularity_staff
            ON dice_irregularity_staff.dice_irregularity_staff_attendance_id = dice_staff_attendance.staff_attendance_id
          WHERE staff_att_id=? AND attendance_date BETWEEN ? AND ?
        `, [staff_id, cycle.start, cycle.end]);

        for (const r of records) {
          // Set is_faculty from first record
          if (!facultyDetermined && r.is_faculty !== undefined && r.is_faculty !== null) {
            is_faculty = r.is_faculty;
            staffData.is_faculty = is_faculty;
            facultyDetermined = true;
          }

          const beforeRaw = r.prevStatusRaw;
          const afterRaw = r.newStatus;
          
          const beforeEnhanced = beforeRaw ? getEnhancedStatus(beforeRaw, r.total_time_seven) : null;
          const afterEnhanced = getEnhancedStatus(afterRaw, r.total_time_seven);
          
          const before = beforeEnhanced || afterEnhanced;

          if (statusKeyMap[before]) {
            staffData.summary_before[statusKeyMap[before]]++;
            cycleData.before[statusKeyMap[before]]++;
          }

          if (statusKeyMap[afterEnhanced]) {
            staffData.summary_after[statusKeyMap[afterEnhanced]]++;
            cycleData.after[statusKeyMap[afterEnhanced]]++;
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

      // Calculate irregularities before and after
      staffData.irregularity_analysis.irregularities_before = countIrregularities(staffData.summary_before);
      staffData.irregularity_analysis.irregularities_after = countIrregularities(staffData.summary_after);

      staffDataArray.push(staffData);
    }

    // AI Analysis for Comparison
    console.log("Calling Mistral AI for comparison analysis...");
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
          {role: "user", content: "STAFF_COMPARISON_DATA:" + JSON.stringify({ 
            staff_count: staffDataArray.length, 
            cycles: numCycles,
            staff_data: staffDataArray 
          })}
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
      ${buildStaffComparisonIrregularitiesTableHTML(staffDataArray)}
      ${buildStaffComparisonCycleWiseTableHTML(staffDataArray)}
      
      <div class="ai-analysis">
        <h3>AI-Powered Comparative Analysis</h3>
        ${aiHTML}
      </div>
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
  console.log("   - POST /departmentComparisonReport (body: {department_ids: [], cycles: N})");
  console.log("✨ LoP Omission calculations enabled for all reports");
  console.log("✨ Using dice_staff_attendance.is_faculty (1=Academic, 0=Non-Academic)");
});
