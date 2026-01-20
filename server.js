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
   UTILITY: CALCULATE ATTENDANCE PERCENTAGE (EXCLUDING HOLIDAYS)
========================================================= */
// function calculateAttendancePercent(summary) {
//   const totalDays = Object.values(summary).reduce((a, b) => a + b, 0);

//   const holidays = summary.holiday || 0;
//   const nonWorking = summary.non_working || 0;
//   const late_checkin_completed = summary.late_checkin_completed || 0;

//   //console.log(summary);

//   const workingDays = totalDays;
//   const totlworkingDays = summary.present + holidays  + nonWorking + late_checkin_completed;

//   if (workingDays <= 0) return 0;

//   return ((totlworkingDays / workingDays) * 100).toFixed(1);
// }


/* =========================================================
   TIME ANALYSIS SECTION
========================================================= */

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;
  const seconds = parseInt(parts[2]) || 0;
  return (hours * 60) + minutes + (seconds / 60);
}

function minutesToTimeString(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  const seconds = Math.floor(((totalMinutes % 60) - minutes) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildTimeAnalysisBoxesHTML(timeAnalysisData) {
  const { expected_time, before_time, after_time, working_days } = timeAnalysisData;
  
  const beforeDiff = parseTimeToMinutes(before_time) - parseTimeToMinutes(expected_time);
  const afterDiff = parseTimeToMinutes(after_time) - parseTimeToMinutes(expected_time);
  
  const beforeDiffStr = minutesToTimeString(Math.abs(beforeDiff));
  const afterDiffStr = minutesToTimeString(Math.abs(afterDiff));
  
  const beforeColor = beforeDiff >= 0 ? '#16a34a' : '#dc2626';
  const afterColor = afterDiff >= 0 ? '#16a34a' : '#dc2626';
  const beforeSign = beforeDiff >= 0 ? '▲' : '▼';
  const afterSign = afterDiff >= 0 ? '▲' : '▼';
  
  return `
    <div class="chart-container" style="margin-top: 30px;">
      <h3 class="section-title">⏱️ Time Analysis Summary</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 20px;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">⏰ Expected Total Time</div>
          <div style="font-size: 36px; font-weight: 700;">${expected_time}</div>
          <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">${working_days} days × 08:30:00</div>
        </div>
        
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">📊 Before Regularization Time</div>
          <div style="font-size: 36px; font-weight: 700;">${before_time}</div>
          <div style="font-size: 12px; opacity: 0.8; margin-top: 4px; background: ${beforeColor}; padding: 4px 8px; border-radius: 4px; display: inline-block;">
            ${beforeSign} ${beforeDiffStr}
          </div>
        </div>
        
        <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">✅ After Regularization Time</div>
          <div style="font-size: 36px; font-weight: 700;">${after_time}</div>
          <div style="font-size: 12px; opacity: 0.8; margin-top: 4px; background: ${afterColor}; padding: 4px 8px; border-radius: 4px; display: inline-block;">
            ${afterSign} ${afterDiffStr}
          </div>
        </div>
      </div>
    </div>
  `;
}

function calculateAttendancePercent(summary) {

  const totalDays =
    Object.values(summary).reduce((a, b) => a + b, 0) -
    (summary.holiday || 0) -
    (summary.non_working || 0);

  const completedDays =
    (summary.present || 0) +
    (summary.late_checkin_completed || 0);

  if (totalDays <= 0) return "0.00";

  return ((completedDays / totalDays) * 100).toFixed(2);
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
   NEW: BEFORE REGULARIZATION ANALYSIS - HELPER FUNCTIONS
========================================================= */

function calculateWorkingDaysAnalysis(summary, dateWiseData) {
  const analysis = {
    total_days: 0,
    completed_days: 0,
    incomplete_days: 0,
    completion_percentage: 0,
    status_breakdown: {
      present: summary.present || 0,
      late_completed: summary.late_checkin_completed || 0,
      late_incomplete: summary.late_checkin_incomplete || 0,
      halfday: summary.halfday || 0,
      lesswork: summary.lesswork || 0,
      absent: summary.absent || 0,
      on_leave: summary.on_leave || 0,
      clock_out_missing: summary.clock_out_missing || 0,
      holiday: summary.holiday || 0,
      non_working: summary.non_working || 0
    }
  };

  analysis.total_days = Object.values(summary).reduce((a, b) => a + b, 0) - 
                        (summary.holiday || 0) - (summary.non_working || 0);
  analysis.completed_days = (summary.present || 0) + (summary.late_checkin_completed || 0);
  analysis.incomplete_days = analysis.total_days - analysis.completed_days;

  if (analysis.total_days > 0) {
    analysis.completion_percentage = ((analysis.completed_days / analysis.total_days) * 100).toFixed(2);
  }

  return analysis;
}

/* =========================================================
   NEW: OVERALL SUMMARY SECTION (BEFORE REGULARIZATION DATA)
========================================================= */

function buildOverallSummaryMetricsHTML(summaryData) {
  return `
    <div class="chart-container">
      <h3 class="section-title">📈 Overall Summary - Before Regularization</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">📅 Total Days</div>
          <div style="font-size: 36px; font-weight: 700;">${summaryData.total_days}</div>
        </div>
        
        <div style="background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">🏖️ Holidays</div>
          <div style="font-size: 36px; font-weight: 700;">${summaryData.holidays}</div>
        </div>
        
        <div style="background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">🚫 Non Working Days</div>
          <div style="font-size: 36px; font-weight: 700;">${summaryData.non_working_days}</div>
        </div>
        
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">💼 Total Working Days</div>
          <div style="font-size: 36px; font-weight: 700;">${summaryData.total_working_days}</div>
          <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">Total - Holidays - Non Working</div>
        </div>
        
        <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">❌ Absence</div>
          <div style="font-size: 36px; font-weight: 700;">${summaryData.absence}</div>
        </div>
        
        <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">🏥 Leave</div>
          <div style="font-size: 36px; font-weight: 700;">${summaryData.leave}</div>
        </div>
        
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">⚠️ Irregularities</div>
          <div style="font-size: 36px; font-weight: 700;">${summaryData.irregularities}</div>
          <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">Lesswork + Late CheckIn (not completed) + Clockout Missing</div>
        </div>
        
        <div style="background: linear-gradient(135deg, #2a312d 0%, #15803d 100%); color: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
          <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">✅ Actual Days Present (≥8.5hrs)</div>
          <div style="font-size: 36px; font-weight: 700;">${summaryData.actual_present}</div>
          <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">Present + Late CheckIn (Completed)</div>
        </div>
      </div>
    </div>
  `;
}

function buildOverallSummaryChartHTML(summaryData, canvasId = "overallSummaryChart") {
  const chartData = {
    labels: [
      'Total Days', 
      'Holidays', 
      'Non Working Days', 
      'Total Working Days', 
      'Actual Present (≥8.5hrs)',
      'Absence', 
      'Leave', 
      'Irregularities'
    ],
    data: [
      summaryData.total_days,
      summaryData.holidays,
      summaryData.non_working_days,
      summaryData.total_working_days,
      summaryData.actual_present,
      summaryData.absence,
      summaryData.leave,
      summaryData.irregularities
    ],
    colors: [
      '#667eea', // Total Days - Purple
      '#94a3b8', // Holidays - Gray
      '#64748b', // Non Working - Dark Gray
      '#3b82f6', // Working Days - Blue
      '#16a34a', // Actual Present - Green
      '#dc2626', // Absence - Red
      '#0284c7', // Leave - Cyan
      '#f59e0b'  // Irregularities - Orange
    ]
  };

  return `
    <div class="chart-container">
      <h3 class="section-title">📊 Overall Summary - Visual Breakdown</h3>
      <div class="chart-wrapper">
        <canvas id="${canvasId}"></canvas>
      </div>
    </div>

    <script>
      (function() {
        function initOverallChart_${canvasId}() {
          if (typeof Chart === 'undefined') {
            setTimeout(initOverallChart_${canvasId}, 100);
            return;
          }
          
          if (typeof ChartDataLabels !== 'undefined' && Chart.registry && !Chart.registry.plugins.get('datalabels')) {
            Chart.register(ChartDataLabels);
          }
          
          const chartData = ${JSON.stringify(chartData)};
          const summaryData = ${JSON.stringify(summaryData)};
          const ctx = document.getElementById("${canvasId}");
          
          if (!ctx) {
            console.error('Canvas not found: ${canvasId}');
            return;
          }
          
          new Chart(ctx, {
            type: "bar",
            data: {
              labels: chartData.labels,
              datasets: [{
                label: "Count",
                data: chartData.data,
                backgroundColor: chartData.colors,
                borderColor: chartData.colors,
                borderWidth: 2,
                borderRadius: 8
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                datalabels: {
                  anchor: 'end',
                  align: 'top',
                  offset: 4,
                  color: "#1e293b",
                  font: { weight: "bold", size: 12 },
                  formatter: (value, context) => {
                    if (value === 0) return '';
                    
                    const index = context.dataIndex;
                    
                    // Show percentage only for: Actual Present, Absence, Leave, Irregularities (indices 4-7)
                    if (index >= 4) {
                      const percentage = summaryData.total_working_days > 0 
                        ? (value / summaryData.total_working_days * 100).toFixed(1)
                        : 0;
                      return value + '\\n(' + percentage + '%)';
                    }
                    
                    // For Total Days, Holidays, Non Working Days, Total Working Days - show only count
                    return value;
                  }
                },
                tooltip: {
                  backgroundColor: "rgba(0, 0, 0, 0.8)",
                  padding: 12,
                  callbacks: {
                    label: function(context) {
                      const index = context.dataIndex;
                      const value = context.parsed.y;
                      
                      // Show percentage only for: Actual Present, Absence, Leave, Irregularities
                      if (index >= 4) {
                        const percentage = summaryData.total_working_days > 0 
                          ? (value / summaryData.total_working_days * 100).toFixed(1)
                          : 0;
                        return value + ' days (' + percentage + '%)';
                      }
                      
                      // For others, show only days
                      return value + ' days';
                    }
                  }
                }
              },
              scales: {
                y: { 
                  beginAtZero: true, 
                  ticks: { stepSize: 1, font: { size: 12 } }, 
                  grid: { color: "rgba(0, 0, 0, 0.05)" },
                  title: {
                    display: true,
                    text: 'Number of Days',
                    font: { size: 14, weight: 'bold' }
                  }
                },
                x: { 
                  ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 45 }, 
                  grid: { display: false } 
                }
              },
              layout: { padding: { top: 30 } }
            }
          });
        }
        
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initOverallChart_${canvasId});
        } else {
          initOverallChart_${canvasId}();
        }
      })();
    </script>
  `;
}

function buildOverallSummaryCycleWiseTableHTML(cyclesData) {
  if (!cyclesData || cyclesData.length === 0) {
    return '';
  }

  // Build header row
  let headerRow = `<tr><th>Metric</th>`;
  cyclesData.forEach(c => {
    headerRow += `<th>${c.label}</th>`;
  });
  headerRow += `<th>Total</th></tr>`;

  // Metrics to display
  const metrics = [
    { label: "📅 Total Days", key: "total_days", color: "#667eea" },
    { label: "🏖️ Holidays", key: "holidays", color: "#94a3b8" },
    { label: "🚫 Non Working Days", key: "non_working_days", color: "#64748b" },
    { label: "💼 Total Working Days", key: "total_working_days", color: "#3b82f6" },
    { label: "❌ Absence", key: "absence", color: "#dc2626" },
    { label: "🏥 Leave", key: "leave", color: "#0284c7" },
    { label: "⚠️ Irregularities", key: "irregularities", color: "#f59e0b" },
    { label: "✅ Actual Present (≥8.5hrs)", key: "actual_present", color: "#16a34a" }
  ];

  // Build body rows
  let bodyRows = "";
  metrics.forEach(metric => {
    bodyRows += `<tr><td style="text-align: left;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 12px; height: 12px; border-radius: 3px; background: ${metric.color};"></div>
        <span style="font-weight: 600;">${metric.label}</span>
      </div>
    </td>`;

    let rowTotal = 0;
    cyclesData.forEach(cycle => {
      const val = cycle[metric.key] || 0;
      rowTotal += val;
      bodyRows += `<td style="text-align: center; font-weight: 600;">${val}</td>`;
    });

    bodyRows += `<td style="text-align: center; font-weight: 700; background: #f0f9ff;">${rowTotal}</td></tr>`;
  });

  // Add completion rate row
  bodyRows += `<tr style="background: #dbeafe; font-weight: 600;">
    <td style="text-align: left;"><strong>📊 Completion Rate (%)</strong></td>`;
  
  cyclesData.forEach(cycle => {
    const percentage = cycle.total_working_days > 0 ? 
      ((cycle.actual_present / cycle.total_working_days) * 100).toFixed(1) : 0;
    
    const badgeColor = percentage >= 95 ? '#16a34a' : 
                       percentage >= 85 ? '#2563eb' : 
                       percentage >= 70 ? '#d97706' : '#dc2626';
    
    bodyRows += `<td style="text-align: center;">
      <span style="background: ${badgeColor}; color: white; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 13px;">
        ${percentage}%
      </span>
    </td>`;
  });
  
  // Overall completion rate
  const totalWorkingDays = cyclesData.reduce((sum, c) => sum + (c.total_working_days || 0), 0);
  const totalActualPresent = cyclesData.reduce((sum, c) => sum + (c.actual_present || 0), 0);
  const overallPercentage = totalWorkingDays > 0 ? 
    ((totalActualPresent / totalWorkingDays) * 100).toFixed(1) : 0;
  const overallBadgeColor = overallPercentage >= 95 ? '#16a34a' : 
                            overallPercentage >= 85 ? '#2563eb' : 
                            overallPercentage >= 70 ? '#d97706' : '#dc2626';
  
  bodyRows += `<td style="text-align: center; background: #dbeafe;">
    <span style="background: ${overallBadgeColor}; color: white; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 14px;">
      ${overallPercentage}%
    </span>
  </td></tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📋 Overall Summary - Cycle-wise Breakdown</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        <strong>Note:</strong> All metrics based on "Before Regularization" data. 
        Actual Days Present = Present + Late CheckIn (Completed where hours ≥ 08:30:00).
        <br> Irregularities =  Lesswork + Late CheckIn (Not completed where hours ≥ 08:30:00). + Clock out Missing.
      </p>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            ${headerRow}
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function calculateOverallSummaryData(summary_before, cycles = null) {
  const summaryData = {
    total_days: Object.values(summary_before).reduce((a, b) => a + b, 0),
    holidays: summary_before.holiday || 0,
    non_working_days: summary_before.non_working || 0,
    total_working_days: 0,
    absence: summary_before.absent || 0,
    leave: (summary_before.on_leave || 0) + (summary_before.halfday * 0.5 || 0),
    irregularities: 0,
    actual_present: 0
  };

  //console.log("summary_before",summary_before.on_leave);
  //console.log("summary_before",summary_before);

  //console.log("summaryData",summaryData);


  summaryData.total_working_days = summaryData.total_days - summaryData.holidays - summaryData.non_working_days;
  
  summaryData.irregularities =                             
                               (summary_before.lesswork || 0) +                                
                               (summary_before.late_checkin_incomplete || 0) + 
                               (summary_before.clock_out_missing || 0);
  
  summaryData.actual_present = (summary_before.present || 0) + (summary_before.late_checkin_completed || 0);

  return summaryData;
}

function calculateOverallSummaryCycleWiseData(cycles) {
  if (!cycles || cycles.length === 0) {
    return [];
  }

  return cycles.map(cycle => {
    const beforeData = cycle.before;
    const total_days = Object.values(beforeData).reduce((a, b) => a + b, 0);
    const holidays = beforeData.holiday || 0;
    const non_working_days = beforeData.non_working || 0;
    const total_working_days = total_days - holidays - non_working_days;
    
    const irregularities = (beforeData.absent || 0) + 
                          (beforeData.halfday || 0) + 
                          (beforeData.lesswork || 0) + 
                          (beforeData.late_checkin_completed || 0) + 
                          (beforeData.late_checkin_incomplete || 0) + 
                          (beforeData.clock_out_missing || 0);
    
    const actual_present = (beforeData.present || 0) + (beforeData.late_checkin_completed || 0);

    return {
      label: cycle.label,
      total_days,
      holidays,
      non_working_days,
      total_working_days,
      absence: beforeData.absent || 0,
      leave: beforeData.on_leave || 0,
      irregularities,
      actual_present
    };
  });
}

function buildBeforeAnalysisChartHTML(workingDaysAnalysis, canvasId = "beforeAnalysisChart") {
  const statusData = workingDaysAnalysis.status_breakdown;
  
  const chartData = {
    labels: ['Present', 'Late CheckIn (Completed)', 'Late CheckIn (Incomplete)', 'HalfDay', 'Lesswork', 'Absent', 'On Leave', 'Clock out Missing', 'Holiday', 'Non Working'],
    data: [statusData.present, statusData.late_completed, statusData.late_incomplete, statusData.halfday, statusData.lesswork, statusData.absent, statusData.on_leave, statusData.clock_out_missing, statusData.holiday, statusData.non_working],
    colors: ['#16a34a', '#22c55e', '#f59e0b', '#fb923c', '#fbbf24', '#dc2626', '#3b82f6', '#ef4444', '#94a3b8', '#64748b']
  };

  return `
    <div class="chart-container">
      <h3 class="section-title">📊 Before Regularization - Status Distribution</h3>
      <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
          <div style="text-align: center;">
            <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">Total Working Days</div>
            <div style="font-size: 32px; font-weight: 700; color: #1e293b;">${workingDaysAnalysis.total_days}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">Completed Days (≥8:30hrs)</div>
            <div style="font-size: 32px; font-weight: 700; color: #16a34a;">${workingDaysAnalysis.completed_days}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">Incomplete Days</div>
            <div style="font-size: 32px; font-weight: 700; color: #dc2626;">${workingDaysAnalysis.incomplete_days}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">Completion Rate</div>
            <div style="font-size: 32px; font-weight: 700; color: #0284c7;">${workingDaysAnalysis.completion_percentage}%</div>
          </div>
        </div>
      </div>
      <div class="chart-wrapper">
        <canvas id="${canvasId}"></canvas>
      </div>
    </div>

    <script>
      (function() {
        function initChart_${canvasId}() {
          if (typeof Chart === 'undefined') {
            setTimeout(initChart_${canvasId}, 100);
            return;
          }
          
          if (typeof ChartDataLabels !== 'undefined' && Chart.registry && !Chart.registry.plugins.get('datalabels')) {
            Chart.register(ChartDataLabels);
          }
          
          const chartData = ${JSON.stringify(chartData)};
          const workingDaysAnalysis = ${JSON.stringify(workingDaysAnalysis)};
          const ctx = document.getElementById("${canvasId}");
          
          if (!ctx) {
            console.error('Canvas not found: ${canvasId}');
            return;
          }
          
          new Chart(ctx, {
            type: "bar",
            data: {
              labels: chartData.labels,
              datasets: [{
                label: "Number of Days",
                data: chartData.data,
                backgroundColor: chartData.colors,
                borderColor: chartData.colors,
                borderWidth: 2,
                borderRadius: 8
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                datalabels: {
                  anchor: 'end',
                  align: 'top',
                  offset: 4,
                  color: "#1e293b",
                  font: { weight: "bold", size: 11 },
                  formatter: (value) => {
                    if (value === 0) return '';
                    
                    const total = workingDaysAnalysis.total_days;
                    const percentage = total > 0 ? (value / total * 100).toFixed(1) : 0;
                    
                    return value + '(' + percentage + '%)';
                  }
                },
                tooltip: {
                  backgroundColor: "rgba(0, 0, 0, 0.8)",
                  padding: 12,
                  callbacks: {
                    label: function(context) {
                      const total = workingDaysAnalysis.total_days;
                      const percentage = total > 0 ? ((context.parsed.y / total) * 100).toFixed(1) : 0;
                      return context.parsed.y + ' days (' + percentage + '%)';
                    }
                  }
                }
              },
              scales: {
                y: { 
                  beginAtZero: true, 
                  ticks: { stepSize: 1, font: { size: 12 } }, 
                  grid: { color: "rgba(0, 0, 0, 0.05)" } 
                },
                x: { 
                  ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 45 }, 
                  grid: { display: false } 
                }
              },
              layout: { padding: { top: 30 } }
            }
          });
        }
        
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initChart_${canvasId});
        } else {
          initChart_${canvasId}();
        }
      })();
    </script>
  `;
}


function buildBeforeAnalysisTableHTML(workingDaysAnalysis) {
  const statusData = workingDaysAnalysis.status_breakdown;
  const total = workingDaysAnalysis.total_days;

  const statuses = [
    { label: "Present", value: statusData.present, color: "#16a34a" },
    { label: "Late CheckIn (Completed) ✓", value: statusData.late_completed, color: "#22c55e" },
    { label: "Late CheckIn (Incomplete) ✗", value: statusData.late_incomplete, color: "#f59e0b" },
    { label: "HalfDay", value: statusData.halfday, color: "#fb923c" },
    { label: "Lesswork", value: statusData.lesswork, color: "#fbbf24" },
    { label: "Absent", value: statusData.absent, color: "#dc2626" },
    { label: "On Leave", value: statusData.on_leave, color: "#3b82f6" },
    { label: "Clock out Missing", value: statusData.clock_out_missing, color: "#ef4444" },
    { label: "Holiday", value: statusData.holiday, color: "#94a3b8" },
    { label: "Non Working", value: statusData.non_working, color: "#64748b" }
  ];

  let tableRows = "";
  statuses.forEach(status => {
    const percentage = total > 0 ? ((status.value / total) * 100).toFixed(1) : 0;
    tableRows += `
      <tr>
        <td><div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 12px; height: 12px; border-radius: 3px; background: ${status.color};"></div>
          <span style="font-weight: 600;">${status.label}</span>
        </div></td>
        <td style="text-align: center; font-weight: 700; font-size: 18px;">${status.value}</td>
        <td style="text-align: center;">
          <span style="background: ${status.color}20; color: ${status.color}; padding: 6px 12px; border-radius: 6px; font-weight: 700;">${percentage}%</span>
        </td>
      </tr>`;
  });

  tableRows += `
    <tr style="background: #f0f9ff; font-weight: bold; border-top: 3px solid #3b82f6;">
      <td>Total Working Days (excl. holidays)</td>
      <td style="text-align: center; font-size: 20px;">${total}</td>
      <td style="text-align: center;">100%</td>
    </tr>
    <tr style="background: #dcfce7;">
      <td><strong>✓ Completed Days (≥8:30 hours)</strong></td>
      <td style="text-align: center; color: #16a34a; font-size: 20px; font-weight: 700;">${workingDaysAnalysis.completed_days}</td>
      <td style="text-align: center;">
        <span style="background: #16a34a; color: white; padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 16px;">${workingDaysAnalysis.completion_percentage}%</span>
      </td>
    </tr>
    <tr style="background: #fee2e2;">
      <td><strong>✗ Incomplete Days</strong></td>
      <td style="text-align: center; color: #dc2626; font-size: 20px; font-weight: 700;">${workingDaysAnalysis.incomplete_days}</td>
      <td style="text-align: center;">
        <span style="background: #dc2626; color: white; padding: 8px 16px; border-radius: 6px; font-weight: 700; font-size: 16px;">${(100 - parseFloat(workingDaysAnalysis.completion_percentage)).toFixed(2)}%</span>
      </td>
    </tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📋 Before Regularization - Detailed Breakdown</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        <strong>Note:</strong> "Completed Days" = Present + Late CheckIn (Completed where working hours ≥ 08:30:00). 
        Holidays and Non Working days excluded from calculations.
      </p>
      <table>
        <thead><tr><th style="text-align: left;">Status</th><th>Count</th><th>Percentage</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

function buildBeforeRegularizationCycleWiseTableHTML(finalData) {
  if (!finalData.cycles || finalData.cycles.length === 0) {
    return '';
  }

  const statuses = [
    { label: "Present", key: "present", color: "#16a34a" },
    { label: "Late CheckIn (Completed) ✓", key: "late_checkin_completed", color: "#22c55e" },
    { label: "Late CheckIn (Incomplete) ✗", key: "late_checkin_incomplete", color: "#f59e0b" },
    { label: "HalfDay", key: "halfday", color: "#fb923c" },
    { label: "Lesswork", key: "lesswork", color: "#fbbf24" },
    { label: "Absent", key: "absent", color: "#dc2626" },
    { label: "On Leave", key: "on_leave", color: "#3b82f6" },
    { label: "Clock out Missing", key: "clock_out_missing", color: "#ef4444" },
    { label: "Holiday", key: "holiday", color: "#94a3b8" },
    { label: "Non Working", key: "non_working", color: "#64748b" }
  ];

  const cycles = finalData.cycles;

  // Build header row
  let headerRow = `<tr><th>Status</th>`;
  cycles.forEach(c => {
    headerRow += `<th>${c.label}</th>`;
  });
  headerRow += `<th>Total</th></tr>`;

  // Build body rows for each status
  let bodyRows = "";
  statuses.forEach(status => {
    bodyRows += `<tr><td style="text-align: left;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 12px; height: 12px; border-radius: 3px; background: ${status.color};"></div>
        <span style="font-weight: 600;">${status.label}</span>
      </div>
    </td>`;

    let rowTotal = 0;
    cycles.forEach(cycle => {
      const val = cycle.before[status.key] || 0;
      rowTotal += val;
      bodyRows += `<td style="text-align: center; font-weight: 600;">${val}</td>`;
    });

    bodyRows += `<td style="text-align: center; font-weight: 700; background: #f0f9ff;">${rowTotal}</td></tr>`;
  });

  // Add working days row (excluding holidays and non-working)
  bodyRows += `<tr style="background: #f8fafc; font-weight: 600; border-top: 2px solid #94a3b8;">
    <td style="text-align: left;">Working Days (excl. holidays)</td>`;
  
  let totalWorkingDays = 0;
  cycles.forEach(cycle => {
    const cycleTotal = Object.values(cycle.before).reduce((sum, val) => sum + val, 0);
    const holidays = cycle.before.holiday || 0;
    const nonWorking = cycle.before.non_working || 0;
    const workingDays = cycleTotal - holidays - nonWorking;
    totalWorkingDays += workingDays;
    bodyRows += `<td style="text-align: center;">${workingDays}</td>`;
  });
  bodyRows += `<td style="text-align: center; background: #f0f9ff;">${totalWorkingDays}</td></tr>`;

  // Add completed days row (Present + Late CheckIn Completed)
  bodyRows += `<tr style="background: #dcfce7; font-weight: 600;">
    <td style="text-align: left;"><strong>✓ Completed Days (≥8:30 hours)</strong></td>`;
  
  let totalCompletedDays = 0;
  cycles.forEach(cycle => {
    const completedDays = (cycle.before.present || 0) + (cycle.before.late_checkin_completed || 0);
    totalCompletedDays += completedDays;
    bodyRows += `<td style="text-align: center; color: #16a34a; font-weight: 700;">${completedDays}</td>`;
  });
  bodyRows += `<td style="text-align: center; color: #16a34a; font-weight: 700; background: #dcfce7;">${totalCompletedDays}</td></tr>`;

  // Add completion percentage row
  bodyRows += `<tr style="background: #dbeafe; font-weight: 600;">
    <td style="text-align: left;"><strong>Completion Rate</strong></td>`;
  
  cycles.forEach(cycle => {
    const cycleTotal = Object.values(cycle.before).reduce((sum, val) => sum + val, 0);
    const holidays = cycle.before.holiday || 0;
    const nonWorking = cycle.before.non_working || 0;
    const workingDays = cycleTotal - holidays - nonWorking;
    const completedDays = (cycle.before.present || 0) + (cycle.before.late_checkin_completed || 0);
    const percentage = workingDays > 0 ? ((completedDays / workingDays) * 100).toFixed(1) : 0;
    
    const badgeColor = percentage >= 95 ? '#16a34a' : 
                       percentage >= 85 ? '#2563eb' : 
                       percentage >= 70 ? '#d97706' : '#dc2626';
    
    bodyRows += `<td style="text-align: center;">
      <span style="background: ${badgeColor}; color: white; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 13px;">
        ${percentage}%
      </span>
    </td>`;
  });
  
  const overallPercentage = totalWorkingDays > 0 ? ((totalCompletedDays / totalWorkingDays) * 100).toFixed(1) : 0;
  const overallBadgeColor = overallPercentage >= 95 ? '#16a34a' : 
                            overallPercentage >= 85 ? '#2563eb' : 
                            overallPercentage >= 70 ? '#d97706' : '#dc2626';
  
  bodyRows += `<td style="text-align: center; background: #dbeafe;">
    <span style="background: ${overallBadgeColor}; color: white; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 14px;">
      ${overallPercentage}%
    </span>
  </td></tr>`;

  return `
    <div class="table-container">
      <h3 class="section-title">📅 Before Regularization - Cycle-wise Breakdown</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        <strong>Note:</strong> Shows status distribution before regularization across all cycles. 
        Completion Rate = (Present + Late CheckIn Completed) / Working Days. 
        Holidays and Non Working days excluded from working days calculation.
      </p>
      <div style="overflow-x: auto;">
        <table>
          <thead>
            ${headerRow}
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
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

function buildModernCycleWiseTableHTML(finalData) {
  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
    { label: "Holiday", key: "holiday" },{ label: "Non Working", key: "non_working" }  ];

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

function buildDepartmentComparisonHTML(departmentDataArray) {
  let cardsHTML = "";

  departmentDataArray.forEach(dept => {
    const presentPercentBefore = calculateAttendancePercent(dept.summary_before);
    const presentPercentAfter = calculateAttendancePercent(dept.summary_after);
    
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
    { label: "Holiday", key: "holiday" },{ label: "Non Working", key: "non_working" }  ];

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

  // Build summary metrics rows
  let metricsRows = "";
  
  // Staff Count
  metricsRows += `<tr style="background: #f8fafc; font-weight: 600;"><td>Staff Count</td>`;
  departmentDataArray.forEach(dept => {
    metricsRows += `<td colspan="2">${dept.staff_count || 0}</td>`;
  });
  metricsRows += `</tr>`;

  // Attendance % (excluding holidays)
  metricsRows += `<tr style="background: #f8fafc; font-weight: 600;"><td>Attendance % (excl. holidays)</td>`;
  departmentDataArray.forEach(dept => {
    const percentBefore = calculateAttendancePercent(dept.summary_before);
    const percentAfter = calculateAttendancePercent(dept.summary_after);
    
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
        <strong>Note:</strong> Shows counts for each status before and after regularization. Attendance % calculated excluding holidays.
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
    { label: "Holiday", key: "holiday" },{ label: "Non Working", key: "non_working" } 
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

  return `
    <div class="table-container">
      <h3 class="section-title">📊 Cycle-wise Department Comparison</h3>
      <p style="color: #64748b; margin-bottom: 15px;">
        Detailed attendance breakdown for each department across all cycles
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

function buildDepartmentCycleWiseTableHTML(departmentData) {
  const statuses = [
    { label: "Present", key: "present" },
    { label: "Absent", key: "absent" },
    { label: "On Leave", key: "on_leave" },
    { label: "HalfDay", key: "halfday" },
    { label: "Lesswork", key: "lesswork" },
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
    { label: "Holiday", key: "holiday" },{ label: "Non Working", key: "non_working" }
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
    { label: "Holiday", key: "holiday" },{ label: "Non Working", key: "non_working" } 
  ];

  // Build header
  let headerRow = `<tr><th>Staff Name</th>`;
  statuses.forEach(status => {
    headerRow += `<th colspan="2">${status.label}</th>`;
  });
  headerRow += `<th colspan="2">Total Days</th><th colspan="2">Attendance % (excl. holidays)</th><th>Irregularities Applied</th></tr>`;

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

    // Attendance percentage (excluding holidays)
    const percentBefore = calculateAttendancePercent(staff.summary_before);
    const percentAfter = calculateAttendancePercent(staff.summary_after);
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
  
  // Calculate department totals for percentages
  const deptSummaryBefore = {};
  const deptSummaryAfter = {};
  staffDataArray.forEach(staff => {
    Object.keys(staff.summary_before).forEach(key => {
      deptSummaryBefore[key] = (deptSummaryBefore[key] || 0) + (staff.summary_before[key] || 0);
      deptSummaryAfter[key] = (deptSummaryAfter[key] || 0) + (staff.summary_after[key] || 0);
    });
  });
  
  const deptPercentBefore = calculateAttendancePercent(deptSummaryBefore);
  const deptPercentAfter = calculateAttendancePercent(deptSummaryAfter);
  
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
        Detailed attendance breakdown for each staff member showing before and after regularization. Attendance % calculated excluding holidays.
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
    { label: "Holiday", key: "holiday" },{ label: "Non Working", key: "non_working" }
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
    { label: "Late CheckIn (Completed)", key: "late_checkin_completed" },
    { label: "Late CheckIn (Incomplete)", key: "late_checkin_incomplete" },
    { label: "Clock out Missing", key: "clock_out_missing" },
    { label: "Holiday", key: "holiday" },{ label: "Non Working", key: "non_working" }
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

  // Build summary metrics rows
  let metricsRows = "";
  
  // Attendance % (excluding holidays)
  metricsRows += `<tr style="background: #f8fafc; font-weight: 600;"><td>Attendance % (excl. holidays)</td>`;
  staffDataArray.forEach(staff => {
    const percentBefore = calculateAttendancePercent(staff.summary_before);
    const percentAfter = calculateAttendancePercent(staff.summary_after);
    
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
        <strong>Note:</strong> Shows counts for each status before and after regularization. Attendance % calculated excluding holidays.
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
    const presentPercentBefore = calculateAttendancePercent(staff.summary_before);
    const presentPercentAfter = calculateAttendancePercent(staff.summary_after);
    
    const badgeBefore = presentPercentBefore >= 95 ? "excellent" : 
                  presentPercentBefore >= 85 ? "good" : 
                  presentPercentBefore >= 70 ? "warning" : "poor";
    const badgeAfter = presentPercentAfter >= 95 ? "excellent" : 
                  presentPercentAfter >= 85 ? "good" : 
                  presentPercentAfter >= 70 ? "warning" : "poor";

    cardsHTML += `
      <div class="staff-card">
        <h4>${staff.staff_name}</h4>
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
   STAFF REPORT ROUTE - With Dynamic Cycles
========================================================= */
/* =========================================================
   STAFF REPORT ROUTE - With Dynamic Cycles
========================================================= */
app.get("/staffAttendanceAnalysisReportUpdate/:staff_id", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("➡️ STAFF API HIT:", new Date().toISOString());

  try {
    const staff_id = req.params.staff_id;
    const numCycles = parseInt(req.query.cycles) || 6;
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
      lesswork: 0,
      late_checkin_completed: 0, late_checkin_incomplete: 0,
      clock_out_missing: 0,
      holiday: 0, non_working: 0 
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
      "Late CheckIn (Completed)": "late_checkin_completed",
      "Late CheckIn (Incomplete)": "late_checkin_incomplete",
      "Clock out Missing": "clock_out_missing",
      "Holiday": "holiday",
      "Non Working": "non_working"
    };

    for (const cycle of cycles) {
      const [records] = await db.query(`
        SELECT 
          DATE_FORMAT(attendance_date,'%e %b') AS attendance_date,
          attendance_date AS full_date,
          CASE 
        WHEN attendance_status = 12
             AND login_time IS NOT NULL
             AND logout_time IS NOT NULL
             AND login_time <> '0000-00-00 00:00:00'
             AND logout_time <> '0000-00-00 00:00:00'
        THEN 'HalfDay'

        
        WHEN attendance_status = 12
        THEN 'On Leave'

        
        WHEN attendance_status = 5 THEN 'Present'
        WHEN attendance_status = 6 THEN 'Absent'
        WHEN attendance_status = 7 THEN 'Lesswork'
        WHEN attendance_status = 8 THEN 'Clock out Missing'
        WHEN attendance_status = 9 THEN 'HalfDay'
        WHEN attendance_status = 10 THEN 'Very Less'
        WHEN attendance_status = 13 THEN 'Holiday'
        WHEN attendance_status = 15 THEN 'Non Working'
        WHEN attendance_status = 16 THEN 'Late CheckIn'
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
            WHEN 15 THEN 'Non Working'
            WHEN 16 THEN 'Late CheckIn'
            ELSE ''
          END AS prevStatusRaw,
          
          COALESCE(dice_irregularity_staff.dice_pre_total,
            dice_staff_attendance.total_time) AS total_time_seven,
          total_time

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
        
        const beforeEnhanced = beforeRaw ? getEnhancedStatus(beforeRaw, r.total_time_seven) : null;
        const afterEnhanced = getEnhancedStatus(afterRaw, r.total_time_seven);
        
        const before = beforeEnhanced || afterEnhanced;

        // Collect date-wise data with enhanced status
        finalData.date_wise_status.push({
          date: r.attendance_date,
          full_date: r.full_date,
          before_status: before,
          after_status: afterEnhanced,
          total_time: r.total_time_seven,
          before_total_time: r.total_time_seven,
          after_total_time: r.total_time
        });

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
      "Clock out Missing", "Holiday", "Non Working"
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

    const workingDaysAnalysis = calculateWorkingDaysAnalysis(finalData.summary_before, finalData.date_wise_status);
     
    console.log(workingDaysAnalysis);
     // ✅ Get values safely (default 0 if undefined/null)
    const absent   = Number(workingDaysAnalysis.status_breakdown.absent) || 0;
    const onLeave  = Number(workingDaysAnalysis.status_breakdown.on_leave) || 0;
    const halfDay  = Number(workingDaysAnalysis.status_breakdown.halfday) || 0;

    // Total working days
    const totalWorkingDays1 = Number(workingDaysAnalysis.total_days) || 0;

    // ✅ Subtraction logic
    const totalWorkingDays =
        totalWorkingDays1 - (absent + onLeave + halfDay*0.5);

    // Result
    console.log("Actual Working Days:", totalWorkingDays1);

    // ✅ ADD - Calculate time analysis
    //const totalWorkingDays = workingDaysAnalysis.total_days;
    //const expectedTotalMinutes = totalWorkingDays * 510; // 8.5 hours = 510 minutes

    const expectedTotalMinutes = totalWorkingDays * 510 - (  halfDay * 0.5 ) * 510 ; // 8.5 hours = 510 minutes

    let overallBeforeMinutes = 0;
    let overallAfterMinutes = 0;

    finalData.date_wise_status.forEach(day => {
      overallBeforeMinutes += parseTimeToMinutes(day.before_total_time);
      overallAfterMinutes += parseTimeToMinutes(day.after_total_time);
    });

    const timeAnalysisData = {
      working_days: totalWorkingDays,
      expected_time: minutesToTimeString(expectedTotalMinutes),
      before_time: minutesToTimeString(overallBeforeMinutes),
      after_time: minutesToTimeString(overallAfterMinutes)
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
      ${buildOverallSummaryMetricsHTML(calculateOverallSummaryData(finalData.summary_before))}
      ${buildTimeAnalysisBoxesHTML(timeAnalysisData)}
      ${buildOverallSummaryChartHTML(calculateOverallSummaryData(finalData.summary_before), "overallSummary_staff_" + staff_id)}
      ${buildOverallSummaryCycleWiseTableHTML(calculateOverallSummaryCycleWiseData(finalData.cycles))}
      
      
      
      ${buildBeforeAnalysisChartHTML(workingDaysAnalysis, "beforeChart_" + staff_id)}
      ${buildBeforeAnalysisTableHTML(workingDaysAnalysis)}
      
      ${buildBeforeRegularizationCycleWiseTableHTML(finalData)}
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
   DEPARTMENT REPORT ROUTE - With Dynamic Cycles (FIXED)
========================================================= */

/* =========================================================
   DEPARTMENT REPORT ROUTE - With Dynamic Cycles (FIXED)
========================================================= */
/* =========================================================
   DEPARTMENT REPORT ROUTE - With Dynamic Cycles
========================================================= */
app.get("/departmentAttendanceReport/:department_id", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("➡️ DEPARTMENT API HIT:", new Date().toISOString());

  try {
    const department_id = req.params.department_id;
    const numCycles = parseInt(req.query.cycles) || 6;
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

    const [staffList] = await db.query(
      "SELECT staff_id, staff_first_name, staff_last_name FROM dice_staff WHERE staff_department=? AND staff_active=0",
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
      "Late CheckIn (Completed)": "late_checkin_completed",
      "Late CheckIn (Incomplete)": "late_checkin_incomplete",
      "Clock out Missing": "clock_out_missing",
      "Holiday": "holiday",
      "Non Working": "non_working"
    };

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0,
      late_checkin_completed: 0, late_checkin_incomplete: 0,
      clock_out_missing: 0,
      holiday: 0, non_working: 0 
    };

    const countIrregularities = (summary) => {
      return (summary.absent || 0) + 
             (summary.late_checkin_completed || 0) + 
             (summary.late_checkin_incomplete || 0) + 
             (summary.clock_out_missing || 0) + 
             (summary.lesswork || 0) + 
             (summary.halfday || 0);
    };

    const departmentData = {
      summary_before: structuredClone(statusTemplate),
      summary_after: structuredClone(statusTemplate),
      cycles: cycles.map(c => ({
        label: c.label,
        before: structuredClone(statusTemplate),
        after: structuredClone(statusTemplate)
      })),
      total_irregularities: 0,
      approved_changes: 0,
      total_before_minutes: 0,
      total_after_minutes: 0
    };

    const staffDataArray = [];

    for (const staff of staffList) {
      const staff_id = staff.staff_id;
      const staff_name = `${staff.staff_first_name} ${staff.staff_last_name}`;

      const staffData = {
        staff_id,
        staff_name,
        summary_before: structuredClone(statusTemplate),
        summary_after: structuredClone(statusTemplate),
        irregularity_analysis: { 
          total_irregularities: 0, 
          approved_changes: 0, 
          rejected_changes: 0,
          irregularities_before: 0,
          irregularities_after: 0
        }
      };

      let staffTotalBeforeMinutes = 0;
      let staffTotalAfterMinutes = 0;

      for (let cycleIdx = 0; cycleIdx < cycles.length; cycleIdx++) {
        const cycle = cycles[cycleIdx];

        const [records] = await db.query(`
          SELECT 
            CASE WHEN attendance_status = 12
             AND login_time IS NOT NULL
             AND logout_time IS NOT NULL
             AND login_time <> '0000-00-00 00:00:00'
             AND logout_time <> '0000-00-00 00:00:00'
        THEN 'HalfDay'

        
        WHEN attendance_status = 12
        THEN 'On Leave'

        
        WHEN attendance_status = 5 THEN 'Present'
        WHEN attendance_status = 6 THEN 'Absent'
        WHEN attendance_status = 7 THEN 'Lesswork'
        WHEN attendance_status = 8 THEN 'Clock out Missing'
        WHEN attendance_status = 9 THEN 'HalfDay'
        WHEN attendance_status = 10 THEN 'Very Less'
        WHEN attendance_status = 13 THEN 'Holiday'
        WHEN attendance_status = 15 THEN 'Non Working'
        WHEN attendance_status = 16 THEN 'Late CheckIn'
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
              WHEN 15 THEN 'Non Working'
              WHEN 16 THEN 'Late CheckIn'
              ELSE ''
            END AS prevStatusRaw,
            COALESCE(dice_irregularity_staff.dice_pre_total,
              dice_staff_attendance.total_time) AS total_time_seven,
            total_time
          FROM dice_staff_attendance
          LEFT JOIN dice_irregularity_staff
            ON dice_irregularity_staff.dice_irregularity_staff_attendance_id = dice_staff_attendance.staff_attendance_id
          WHERE staff_att_id=? AND attendance_date BETWEEN ? AND ?
        `, [staff_id, cycle.start, cycle.end]);

        for (const r of records) {
          const beforeRaw = r.prevStatusRaw;
          const afterRaw = r.newStatus;
          
          const beforeEnhanced = beforeRaw ? getEnhancedStatus(beforeRaw, r.total_time_seven) : null;
          const afterEnhanced = getEnhancedStatus(afterRaw, r.total_time_seven);
          
          const before = beforeEnhanced || afterEnhanced;

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

          // Track time
          staffTotalBeforeMinutes += parseTimeToMinutes(r.total_time_seven);
          staffTotalAfterMinutes += parseTimeToMinutes(r.total_time);
        }
      }

      staffData.irregularity_analysis.irregularities_before = countIrregularities(staffData.summary_before);
      staffData.irregularity_analysis.irregularities_after = countIrregularities(staffData.summary_after);

      // Accumulate time to department total
      departmentData.total_before_minutes += staffTotalBeforeMinutes;
      departmentData.total_after_minutes += staffTotalAfterMinutes;

      staffDataArray.push(staffData);
    }

    const labels = ["Present", "Absent", "On Leave", "HalfDay", "Lesswork",
                    "Late CheckIn (Completed)", "Late CheckIn (Incomplete)", 
                    "Clock out Missing", "Holiday", "Non Working"];
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

    const workingDaysAnalysis = calculateWorkingDaysAnalysis(departmentData.summary_before, []);

     // ✅ Get values safely (default 0 if undefined/null)
    const absent   = Number(workingDaysAnalysis.status_breakdown.absent) || 0;
    const onLeave  = Number(workingDaysAnalysis.status_breakdown.on_leave) || 0;
    const halfDay  = Number(workingDaysAnalysis.status_breakdown.halfday) || 0;

    // Total working days
    const totalWorkingDays1 = Number(workingDaysAnalysis.total_days) || 0;

    // ✅ Subtraction logic
    const totalWorkingDays =
        totalWorkingDays1 - (absent + onLeave + halfDay*0.5);

    // Result
    console.log("Actual Working Days:", totalWorkingDays1);

    // ✅ ADD - Calculate time analysis
    //const totalWorkingDays = workingDaysAnalysis.total_days;
    //const expectedTotalMinutes = totalWorkingDays * 510;

    const expectedTotalMinutes = totalWorkingDays * 510 - (  halfDay * 0.5 ) * 510 ; // 8.5 hours = 510 minutes

    const timeAnalysisData = {
      working_days: totalWorkingDays,
      expected_time: minutesToTimeString(expectedTotalMinutes),
      before_time: minutesToTimeString(departmentData.total_before_minutes),
      after_time: minutesToTimeString(departmentData.total_after_minutes)
    };

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
      ${buildOverallSummaryMetricsHTML(calculateOverallSummaryData(departmentData.summary_before))}
      ${buildTimeAnalysisBoxesHTML(timeAnalysisData)}
      ${buildOverallSummaryChartHTML(calculateOverallSummaryData(departmentData.summary_before), "overallSummary_dept_" + department_id)}
      ${buildOverallSummaryCycleWiseTableHTML(calculateOverallSummaryCycleWiseData(departmentData.cycles))}

      

      ${buildBeforeAnalysisChartHTML(workingDaysAnalysis, "beforeChart_dept_" + department_id)}
      ${buildBeforeAnalysisTableHTML(workingDaysAnalysis)}

      ${buildBeforeRegularizationCycleWiseTableHTML({cycles: departmentData.cycles})}
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
   DEPARTMENT REPORT WITH STAFF SELECTION - With Dynamic Cycles
========================================================= */
/* =========================================================
   DEPARTMENT REPORT WITH STAFF SELECTION - With Dynamic Cycles
========================================================= */
app.post("/departmentAttendanceReport/:department_id", async (req, res) => {
  console.log("--------------------------------------------------");
  console.log("➡️ DEPARTMENT API HIT (WITH STAFF SELECTION):", new Date().toISOString());

  try {
    const department_id = req.params.department_id;
    const numCycles = parseInt(req.query.cycles) || parseInt(req.body.cycles) || 6;
    const selectedStaffIds = req.body.staff_ids; // Array of staff IDs to include
    
    console.log("Department ID:", department_id, "Cycles:", numCycles);
    console.log("Selected Staff IDs:", selectedStaffIds);

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

    // Fetch all staff in department
    const [allStaffList] = await db.query(
      "SELECT staff_id, staff_first_name, staff_last_name FROM dice_staff WHERE staff_department=? AND staff_active=0",
      [department_id]
    );

    // Filter staff based on selection
    let staffList;
    if (selectedStaffIds && Array.isArray(selectedStaffIds) && selectedStaffIds.length > 0) {
      // Use only selected staff
      staffList = allStaffList.filter(staff => selectedStaffIds.includes(staff.staff_id));
      console.log(`Processing ${staffList.length} selected staff out of ${allStaffList.length} total staff`);
    } else {
      // Use all staff (default behavior)
      staffList = allStaffList;
      console.log(`Processing all ${staffList.length} staff (no selection provided)`);
    }

    if (staffList.length === 0) {
      return res.status(400).send("No valid staff members found for the provided selection");
    }

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
      "Holiday": "holiday",
      "Non Working": "non_working"
    };

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0,
      late_checkin_completed: 0, late_checkin_incomplete: 0,
      clock_out_missing: 0,
      holiday: 0, non_working: 0 
    };

    const countIrregularities = (summary) => {
      return (summary.absent || 0) + 
             (summary.late_checkin_completed || 0) + 
             (summary.late_checkin_incomplete || 0) + 
             (summary.clock_out_missing || 0) + 
             (summary.lesswork || 0) + 
             (summary.halfday || 0);
    };

    const departmentData = {
      summary_before: structuredClone(statusTemplate),
      summary_after: structuredClone(statusTemplate),
      cycles: cycles.map(c => ({
        label: c.label,
        before: structuredClone(statusTemplate),
        after: structuredClone(statusTemplate)
      })),
      total_irregularities: 0,
      approved_changes: 0,
      total_before_minutes: 0,  // ✅ ADD
      total_after_minutes: 0    // ✅ ADD
    };

    const staffDataArray = [];

    for (const staff of staffList) {
      const staff_id = staff.staff_id;
      const staff_name = `${staff.staff_first_name} ${staff.staff_last_name}`;

      const staffData = {
        staff_id,
        staff_name,
        summary_before: structuredClone(statusTemplate),
        summary_after: structuredClone(statusTemplate),
        irregularity_analysis: { 
          total_irregularities: 0, 
          approved_changes: 0, 
          rejected_changes: 0,
          irregularities_before: 0,
          irregularities_after: 0
        }
      };

      // ✅ ADD - Track time for each staff member
      let staffTotalBeforeMinutes = 0;
      let staffTotalAfterMinutes = 0;

      for (let cycleIdx = 0; cycleIdx < cycles.length; cycleIdx++) {
        const cycle = cycles[cycleIdx];

        const [records] = await db.query(`
          SELECT 
            CASE WHEN attendance_status = 12
             AND login_time IS NOT NULL
             AND logout_time IS NOT NULL
             AND login_time <> '0000-00-00 00:00:00'
             AND logout_time <> '0000-00-00 00:00:00'
        THEN 'HalfDay'

        
        WHEN attendance_status = 12
        THEN 'On Leave'

        
        WHEN attendance_status = 5 THEN 'Present'
        WHEN attendance_status = 6 THEN 'Absent'
        WHEN attendance_status = 7 THEN 'Lesswork'
        WHEN attendance_status = 8 THEN 'Clock out Missing'
        WHEN attendance_status = 9 THEN 'HalfDay'
        WHEN attendance_status = 10 THEN 'Very Less'
        WHEN attendance_status = 13 THEN 'Holiday'
        WHEN attendance_status = 15 THEN 'Non Working'
        WHEN attendance_status = 16 THEN 'Late CheckIn'
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
              WHEN 15 THEN 'Non Working'
              WHEN 16 THEN 'Late CheckIn'
              ELSE ''
            END AS prevStatusRaw,
            COALESCE(dice_irregularity_staff.dice_pre_total,
              dice_staff_attendance.total_time) AS total_time_seven,
            total_time
          FROM dice_staff_attendance
          LEFT JOIN dice_irregularity_staff
            ON dice_irregularity_staff.dice_irregularity_staff_attendance_id = dice_staff_attendance.staff_attendance_id
          WHERE staff_att_id=? AND attendance_date BETWEEN ? AND ?
        `, [staff_id, cycle.start, cycle.end]);

        for (const r of records) {
          const beforeRaw = r.prevStatusRaw;
          const afterRaw = r.newStatus;
          
          const beforeEnhanced = beforeRaw ? getEnhancedStatus(beforeRaw, r.total_time_seven) : null;
          const afterEnhanced = getEnhancedStatus(afterRaw, r.total_time_seven);
          
          const before = beforeEnhanced || afterEnhanced;

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

          // ✅ ADD - Track time
          staffTotalBeforeMinutes += parseTimeToMinutes(r.total_time_seven);
          staffTotalAfterMinutes += parseTimeToMinutes(r.total_time);
        }
      }

      staffData.irregularity_analysis.irregularities_before = countIrregularities(staffData.summary_before);
      staffData.irregularity_analysis.irregularities_after = countIrregularities(staffData.summary_after);

      // ✅ ADD - Accumulate time to department total
      departmentData.total_before_minutes += staffTotalBeforeMinutes;
      departmentData.total_after_minutes += staffTotalAfterMinutes;

      staffDataArray.push(staffData);
    }

    const labels = ["Present", "Absent", "On Leave", "HalfDay", "Lesswork",
                    "Late CheckIn (Completed)", "Late CheckIn (Incomplete)", 
                    "Clock out Missing", "Holiday", "Non Working"];
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

    const workingDaysAnalysis = calculateWorkingDaysAnalysis(departmentData.summary_before, []);

    // ✅ Get values safely (default 0 if undefined/null)
    const absent   = Number(workingDaysAnalysis.status_breakdown.absent) || 0;
    const onLeave  = Number(workingDaysAnalysis.status_breakdown.on_leave) || 0;
    const halfDay  = Number(workingDaysAnalysis.status_breakdown.halfday) || 0;

    // Total working days
    const totalWorkingDays1 = Number(workingDaysAnalysis.total_days) || 0;

    // ✅ Subtraction logic
    const totalWorkingDays =
        totalWorkingDays1 - (absent + onLeave + halfDay*0.5);

    // Result
    console.log("Actual Working Days:", totalWorkingDays1);

    // ✅ ADD - Calculate time analysis
    //const totalWorkingDays = workingDaysAnalysis.total_days;
    //const expectedTotalMinutes = totalWorkingDays * 510; // 8.5 hours = 510 minutes

    const expectedTotalMinutes = totalWorkingDays * 510 - (  halfDay * 0.5 ) * 510 ; // 8.5 hours = 510 minutes

    const timeAnalysisData = {
      working_days: totalWorkingDays,
      expected_time: minutesToTimeString(expectedTotalMinutes),
      before_time: minutesToTimeString(departmentData.total_before_minutes),
      after_time: minutesToTimeString(departmentData.total_after_minutes)
    };

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

    // Add info about selected staff
    const staffSelectionInfo = selectedStaffIds && selectedStaffIds.length > 0 
      ? `<p style="background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
           <strong>📋 Staff Selection:</strong> Report generated for ${staffList.length} selected staff members out of ${allStaffList.length} total department staff.
         </p>`
      : '';

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
        <div class="label">Staff Analyzed</div>
        <div class="value">${staffList.length}${selectedStaffIds && selectedStaffIds.length > 0 ? ` / ${allStaffList.length}` : ''}</div>
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
      ${staffSelectionInfo}

      ${buildOverallSummaryMetricsHTML(calculateOverallSummaryData(departmentData.summary_before))}
      ${buildTimeAnalysisBoxesHTML(timeAnalysisData)}
      ${buildOverallSummaryChartHTML(calculateOverallSummaryData(departmentData.summary_before), "overallSummary_dept_" + department_id)}
      ${buildOverallSummaryCycleWiseTableHTML(calculateOverallSummaryCycleWiseData(departmentData.cycles))}

      

      ${buildBeforeAnalysisChartHTML(workingDaysAnalysis, "beforeChart_dept_" + department_id)}
      ${buildBeforeAnalysisTableHTML(workingDaysAnalysis)}

      ${buildBeforeRegularizationCycleWiseTableHTML({cycles: departmentData.cycles})}
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
   DEPARTMENT COMPARISON ROUTE - With Dynamic Cycles
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
      "Holiday": "holiday",
	  "Non Working": "non_working"
    };

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0,
      late_checkin_completed: 0, late_checkin_incomplete: 0,
      clock_out_missing: 0,
      holiday: 0,non_working: 0
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

      const departmentData = {
        department_id,
        department_name,
        staff_count: staffList.length,
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

          const [records] = await db.query(`
            SELECT 
              CASE WHEN attendance_status = 12
             AND login_time IS NOT NULL
             AND logout_time IS NOT NULL
             AND login_time <> '0000-00-00 00:00:00'
             AND logout_time <> '0000-00-00 00:00:00'
        THEN 'HalfDay'

        
        WHEN attendance_status = 12
        THEN 'On Leave'

        
        WHEN attendance_status = 5 THEN 'Present'
        WHEN attendance_status = 6 THEN 'Absent'
        WHEN attendance_status = 7 THEN 'Lesswork'
        WHEN attendance_status = 8 THEN 'Clock out Missing'
        WHEN attendance_status = 9 THEN 'HalfDay'
        WHEN attendance_status = 10 THEN 'Very Less'
        WHEN attendance_status = 13 THEN 'Holiday'
        WHEN attendance_status = 15 THEN 'Non Working'
        WHEN attendance_status = 16 THEN 'Late CheckIn'
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
				WHEN 15 THEN 'Non Working'   -- ✅ ADD
                WHEN 16 THEN 'Late CheckIn'
                ELSE ''
              END AS prevStatusRaw,
               COALESCE(dice_irregularity_staff.dice_pre_total,
         dice_staff_attendance.total_time) AS total_time_seven,
         total_time
            FROM dice_staff_attendance
            LEFT JOIN dice_irregularity_staff
              ON dice_irregularity_staff.dice_irregularity_staff_attendance_id = dice_staff_attendance.staff_attendance_id
            WHERE staff_att_id=? AND attendance_date BETWEEN ? AND ?
          `, [staff_id, cycle.start, cycle.end]);

          for (const r of records) {
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

      // Calculate irregularities before and after
      departmentData.irregularity_analysis.irregularities_before = countIrregularities(departmentData.summary_before);
      departmentData.irregularity_analysis.irregularities_after = countIrregularities(departmentData.summary_after);

      departmentDataArray.push(departmentData);
    }

    // ✅ NEW: Calculate working days analysis for each department
    const deptComparisonWorkingAnalysis = departmentDataArray.map(dept => 
      calculateWorkingDaysAnalysis(dept.summary_before, [])
    );

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
   STAFF COMPARISON ROUTE - With Dynamic Cycles
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
      "Holiday": "holiday",
	  "Non Working": "non_working"
    };

    const statusTemplate = {
      present: 0, absent: 0, on_leave: 0, halfday: 0,
      lesswork: 0,
      late_checkin_completed: 0, late_checkin_incomplete: 0,
      clock_out_missing: 0,
      holiday: 0,
	  non_working: 0
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

      const staffData = {
        staff_id,
        staff_name,
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
            CASE WHEN attendance_status = 12
             AND login_time IS NOT NULL
             AND logout_time IS NOT NULL
             AND login_time <> '0000-00-00 00:00:00'
             AND logout_time <> '0000-00-00 00:00:00'
        THEN 'HalfDay'

        
        WHEN attendance_status = 12
        THEN 'On Leave'

        
        WHEN attendance_status = 5 THEN 'Present'
        WHEN attendance_status = 6 THEN 'Absent'
        WHEN attendance_status = 7 THEN 'Lesswork'
        WHEN attendance_status = 8 THEN 'Clock out Missing'
        WHEN attendance_status = 9 THEN 'HalfDay'
        WHEN attendance_status = 10 THEN 'Very Less'
        WHEN attendance_status = 13 THEN 'Holiday'
        WHEN attendance_status = 15 THEN 'Non Working'
        WHEN attendance_status = 16 THEN 'Late CheckIn'
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
			  WHEN 15 THEN 'Non Working'   -- ✅ ADD
              WHEN 16 THEN 'Late CheckIn'
              ELSE ''
            END AS prevStatusRaw,
            
            COALESCE(dice_irregularity_staff.dice_pre_total,
         dice_staff_attendance.total_time) AS total_time_seven,
         total_time
          FROM dice_staff_attendance
          LEFT JOIN dice_irregularity_staff
            ON dice_irregularity_staff.dice_irregularity_staff_attendance_id = dice_staff_attendance.staff_attendance_id
          WHERE staff_att_id=? AND attendance_date BETWEEN ? AND ?
        `, [staff_id, cycle.start, cycle.end]);

        for (const r of records) {
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

    // ✅ NEW: Calculate working days analysis for each staff
    const comparisonWorkingAnalysis = staffDataArray.map(staff => 
      calculateWorkingDaysAnalysis(staff.summary_before, [])
    );

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
});
