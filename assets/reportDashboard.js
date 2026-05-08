const REPORT_API_BASE = "https://api.sangeeth47.in/api";
let reportDashboardInitialized = false;

function reportEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reportFormatCurrency(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function reportFormatDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN");
}

function reportFormatDateTime(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatToIST(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return ts;
  }
}

function reportStatusClass(status) {
  const normalized = String(status || "Pending").toLowerCase();
  if (normalized === "paid") return "paid";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "partial") return "partial";
  if (normalized.includes("reopen")) return "reopened";
  return "pending";
}

function reportHasReopenInfo(invoice) {
  return Boolean(invoice && (invoice.ReopenReason || invoice.ReopenedAt));
}

function reportDisplayStatus(invoice) {
  const rawStatus = invoice?.InvoiceStatus || invoice?.PaymentStatus || "Pending";
  const normalized = String(rawStatus).toLowerCase();
  const isReopened = reportHasReopenInfo(invoice);

  if (normalized === "paid") {
    return isReopened
      ? { label: "Paid - Reopened", className: "reopened" }
      : { label: "Paid", className: "paid" };
  }

  if (normalized === "cancelled") {
    return { label: "Cancelled", className: "cancelled" };
  }

  if (normalized === "partial") {
    return isReopened
      ? { label: "Partial - Reopened", className: "reopened" }
      : { label: "Partial", className: "partial" };
  }

  if (isReopened) {
    return { label: "Pending - Reopened", className: "reopened" };
  }

  return { label: rawStatus || "Pending", className: reportStatusClass(rawStatus) };
}

function reportChip(status, className = "") {
  const safeStatus = reportEscapeHtml(status || "Pending");
  const resolvedClassName = className || reportStatusClass(status);
  return `<span class="status-chip ${resolvedClassName}">${safeStatus}</span>`;
}

function reportSetCurrentMonth() {
  const fromInput = document.getElementById("reportFromDate");
  const toInput = document.getElementById("reportToDate");
  if (!fromInput || !toInput) return;

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDate = now;

  const toIsoDate = (date) => date.toISOString().slice(0, 10);
  fromInput.value = toIsoDate(firstDay);
  toInput.value = toIsoDate(toDate);

  if (reportDashboardInitialized) {
    loadReportDashboard(true);
  }
}

function reportInitDefaults() {
  const fromInput = document.getElementById("reportFromDate");
  const toInput = document.getElementById("reportToDate");
  const statusInput = document.getElementById("reportStatus");
  const searchInput = document.getElementById("reportSearch");

  if (!fromInput || !toInput || !statusInput || !searchInput) return;

  if (!fromInput.value || !toInput.value) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    fromInput.value = thirtyDaysAgo.toISOString().slice(0, 10);
    toInput.value = now.toISOString().slice(0, 10);
  }

  if (!statusInput.value) {
    statusInput.value = "all";
  }

  if (!searchInput.value) {
    searchInput.value = "";
  }
}

function reportBuildSummaryCards(summary) {
  const topCards = [
    {
      label: "Total sales",
      value: `₹${reportFormatCurrency(summary.totalSales)}`,
      subtext: `${summary.totalInvoices || 0} invoices`
    },
    {
      label: "Pending balance",
      value: `₹${reportFormatCurrency(summary.pendingBalance)}`,
      subtext: `Open invoices: ${summary.pendingInvoices || 0}`
    }
  ];

  const detailCards = [
    {
      label: "Collected",
      value: `₹${reportFormatCurrency(summary.totalCollected)}`,
      subtext: `Paid invoices: ${summary.paidInvoices || 0}`
    },
    {
      label: "Cancelled",
      value: `${summary.cancelledInvoices || 0}`,
      subtext: "Voided invoices"
    },
    {
      label: "Customers",
      value: `${summary.activeCustomers || 0}`,
      subtext: "Unique customers"
    },
    {
      label: "Items sold",
      value: `${summary.totalItemsSold || 0}`,
      subtext: `${summary.uniqueItemsUsed || 0} items used`
    }
  ];

  const renderCard = (card, className = "") => `
    <article class="report-summary-card ${className}">
      <div class="report-summary-label">${reportEscapeHtml(card.label)}</div>
      <div class="report-summary-value">${reportEscapeHtml(card.value)}</div>
      <div class="report-summary-subtext">${reportEscapeHtml(card.subtext)}</div>
    </article>
  `;

  return `
    <div class="report-summary-top">
      ${topCards.map((card) => renderCard(card, "report-summary-card-highlight")).join("")}
    </div>
    <div class="report-summary-secondary">
      ${detailCards.map((card) => renderCard(card)).join("")}
    </div>
  `;
}

function reportRenderTable({ headers, rows, rowRenderer, emptyMessage }) {
  if (!rows || rows.length === 0) {
    return `<div class="empty-state">${reportEscapeHtml(emptyMessage || "No records found.")}</div>`;
  }

  const headHtml = headers.map((header) => `<th>${reportEscapeHtml(header)}</th>`).join("");
  const bodyHtml = rows.map(rowRenderer).join("");

  return `
    <table class="report-table">
      <thead><tr>${headHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  `;
}

function reportSummarizeInvoices(invoices) {
  const groups = new Map();

  for (const invoice of invoices) {
    const key = `${invoice.CustomerID || ""}-${invoice.MobileNo || ""}-${invoice.VehicleNo || ""}`;
    const current = groups.get(key) || {
      customerId: invoice.CustomerID,
      mobileNo: invoice.MobileNo,
      vehicleNo: invoice.VehicleNo,
      invoiceCount: 0,
      billedAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      cancelledCount: 0,
      latestInvoiceDate: null
    };

    current.invoiceCount += 1;
    current.billedAmount += Number(invoice.GrandTotal || 0);
    current.paidAmount += Number(invoice.PaidAmount || 0);
    current.pendingAmount += Number(invoice.RemainingAmount || 0);
    current.cancelledCount += String(invoice.InvoiceStatus || "").toLowerCase() === "cancelled" ? 1 : 0;

    const invoiceDate = invoice.InvoiceDate || invoice.Date || invoice.InvoiceDateTime;
    if (invoiceDate) {
      const dateValue = new Date(invoiceDate).getTime();
      if (!current.latestInvoiceDate || dateValue > current.latestInvoiceDate) {
        current.latestInvoiceDate = dateValue;
      }
    }

    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((a, b) => b.billedAmount - a.billedAmount);
}

function reportBuildPendingAging(invoices) {
  const buckets = [
    { label: "0-30 days", min: 0, max: 30, count: 0, amount: 0 },
    { label: "31-60 days", min: 31, max: 60, count: 0, amount: 0 },
    { label: "61-90 days", min: 61, max: 90, count: 0, amount: 0 },
    { label: "90+ days", min: 91, max: Infinity, count: 0, amount: 0 }
  ];

  for (const invoice of invoices) {
    const status = String(invoice.InvoiceStatus || "Pending").toLowerCase();
    const remaining = Number(invoice.RemainingAmount || 0);
    if (status === "paid" || status === "cancelled" || remaining <= 0) continue;

    const ageDays = Number(invoice.AgeDays || 0);
    const bucket = buckets.find((entry) => ageDays >= entry.min && ageDays <= entry.max);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.amount += remaining;
  }

  return buckets;
}

function reportBuildRowsForInvoices(invoices) {
  return invoices.map((invoice) => {
    const displayStatus = reportDisplayStatus(invoice);
    const cancelledReason = invoice.CancelledReason || "";
    const cancelledAt = invoice.CancelledAt || "";
    const reopenReason = invoice.ReopenReason || "";
    const reopenedAt = invoice.ReopenedAt || "";
    
    // Build a data attribute with cancellation/reopen info for click handler
    const dataAttr = `data-invoice-id="${reportEscapeHtml(invoice.InvoiceID)}" data-status="${reportEscapeHtml(displayStatus.label)}" data-cancelled-reason="${reportEscapeHtml(cancelledReason)}" data-cancelled-at="${reportEscapeHtml(cancelledAt)}" data-reopen-reason="${reportEscapeHtml(reopenReason)}" data-reopened-at="${reportEscapeHtml(reopenedAt)}"`;
    
    return `
      <tr>
        <td>#${reportEscapeHtml(invoice.InvoiceID)}</td>
        <td>${reportEscapeHtml(reportFormatDate(invoice.InvoiceDate || invoice.Date || invoice.InvoiceDateTime))}</td>
        <td>${reportEscapeHtml(invoice.MobileNo || "N/A")}</td>
        <td>${reportEscapeHtml(invoice.VehicleNo || "N/A")}</td>
        <td>₹${reportEscapeHtml(reportFormatCurrency(invoice.GrandTotal || 0))}</td>
        <td>₹${reportEscapeHtml(reportFormatCurrency(invoice.PaidAmount || 0))}</td>
        <td>₹${reportEscapeHtml(reportFormatCurrency(invoice.RemainingAmount || 0))}</td>
        <td><span class="report-status-chip" style="cursor:pointer;" ${dataAttr}>${reportChip(displayStatus.label, displayStatus.className)}</span></td>
      </tr>
    `;
  });
}

function reportBuildSalesTrendRows(salesTrend) {
  return salesTrend.map((row) => `
    <tr>
      <td>${reportEscapeHtml(reportFormatDate(row.SalesDate || row.Date))}</td>
      <td>${reportEscapeHtml(row.InvoiceCount || 0)}</td>
      <td>₹${reportEscapeHtml(reportFormatCurrency(row.TotalSales || 0))}</td>
      <td>₹${reportEscapeHtml(reportFormatCurrency(row.CollectedAmount || 0))}</td>
      <td>₹${reportEscapeHtml(reportFormatCurrency(row.PendingAmount || 0))}</td>
    </tr>
  `);
}

function reportBuildCustomerRows(customers) {
  return customers.map((row) => `
    <tr>
      <td>${reportEscapeHtml(row.MobileNo || "N/A")}</td>
      <td>${reportEscapeHtml(row.VehicleNo || "N/A")}</td>
      <td>${reportEscapeHtml(row.InvoiceCount || 0)}</td>
      <td>₹${reportEscapeHtml(reportFormatCurrency(row.BilledAmount || 0))}</td>
      <td>₹${reportEscapeHtml(reportFormatCurrency(row.PaidAmount || 0))}</td>
      <td>₹${reportEscapeHtml(reportFormatCurrency(row.OutstandingAmount || 0))}</td>
      <td>${reportEscapeHtml(reportFormatDate(row.LastInvoiceDate))}</td>
    </tr>
  `);
}

function reportBuildUsageRows(items) {
  return items.map((row) => `
    <tr>
      <td>${reportEscapeHtml(row.ItemName || "N/A")}</td>
      <td>${reportEscapeHtml(row.UsedQuantity || 0)}</td>
      <td>${reportEscapeHtml(row.UsedInBills || 0)}</td>
      <td>₹${reportEscapeHtml(reportFormatCurrency(row.EstimatedValue || 0))}</td>
    </tr>
  `);
}

function reportBuildAgingRows(buckets) {
  return buckets.map((bucket) => `
    <tr>
      <td>${reportEscapeHtml(bucket.AgeBucket || bucket.label || "N/A")}</td>
      <td>${reportEscapeHtml(bucket.InvoiceCount ?? bucket.count ?? 0)}</td>
      <td>₹${reportEscapeHtml(reportFormatCurrency(bucket.PendingAmount ?? bucket.amount ?? 0))}</td>
    </tr>
  `);
}

async function loadReportDashboard(forceReload = false) {
  const section = document.getElementById("reports");
  if (!section) return;

  reportInitDefaults();

  const summaryEl = document.getElementById("reportSummary");
  if (summaryEl && forceReload) {
    summaryEl.innerHTML = `<div class="empty-state">Loading report data...</div>`;
  }

  const fromDate = document.getElementById("reportFromDate")?.value;
  const toDate = document.getElementById("reportToDate")?.value;
  const status = document.getElementById("reportStatus")?.value || "all";
  const search = document.getElementById("reportSearch")?.value.trim() || "";
  const token = localStorage.getItem("access_token");

  try {
    const url = new URL(`${REPORT_API_BASE}/billing-report-dashboard`);
    url.searchParams.set("fromDate", fromDate);
    url.searchParams.set("toDate", toDate);
    url.searchParams.set("status", status);
    if (search) {
      url.searchParams.set("search", search);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
    const summary = payload.summary || {};
    const salesTrend = Array.isArray(payload.salesTrend) ? payload.salesTrend : [];
    const customerHistory = Array.isArray(payload.customerHistory) ? payload.customerHistory : reportSummarizeInvoices(invoices);
    const inventoryUsage = Array.isArray(payload.inventoryUsage) ? payload.inventoryUsage : [];
    const itemsSold = Array.isArray(payload.itemsSold) && payload.itemsSold.length ? payload.itemsSold : inventoryUsage;
    const pendingAging = Array.isArray(payload.paymentAging) ? payload.paymentAging : reportBuildPendingAging(invoices);
    const pendingInvoices = invoices.filter((invoice) => {
      const normalizedStatus = String(invoice.InvoiceStatus || invoice.PaymentStatus || "Pending").toLowerCase();
      return normalizedStatus !== "paid" && normalizedStatus !== "cancelled" && Number(invoice.RemainingAmount || 0) > 0;
    });

    const derivedSummary = {
      totalInvoices: summary.totalInvoices ?? invoices.length,
      totalSales: summary.totalSales ?? invoices.reduce((total, invoice) => total + Number(invoice.GrandTotal || 0), 0),
      totalCollected: summary.totalCollected ?? invoices.reduce((total, invoice) => total + Number(invoice.PaidAmount || 0), 0),
      pendingBalance: summary.pendingBalance ?? invoices.reduce((total, invoice) => total + Number(invoice.RemainingAmount || 0), 0),
      paidInvoices: summary.paidInvoices ?? invoices.filter((invoice) => String(invoice.InvoiceStatus || invoice.PaymentStatus || "").toLowerCase() === "paid").length,
      pendingInvoices: summary.pendingInvoices ?? pendingInvoices.length,
      cancelledInvoices: summary.cancelledInvoices ?? invoices.filter((invoice) => String(invoice.InvoiceStatus || invoice.PaymentStatus || "").toLowerCase() === "cancelled").length,
      activeCustomers: summary.activeCustomers ?? customerHistory.length,
      totalItemsSold: summary.totalItemsSold ?? itemsSold.reduce((total, item) => total + Number(item.UsedQuantity || item.Quantity || 0), 0),
      uniqueItemsUsed: summary.uniqueItemsUsed ?? itemsSold.length
    };

    if (summaryEl) {
      summaryEl.innerHTML = reportBuildSummaryCards(derivedSummary);
    }

    const salesMeta = document.getElementById("reportSalesMeta");
    if (salesMeta) {
      salesMeta.textContent = `${salesTrend.length} day${salesTrend.length === 1 ? "" : "s"}`;
    }

    const invoiceMeta = document.getElementById("reportInvoiceMeta");
    if (invoiceMeta) {
      invoiceMeta.textContent = `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`;
    }

    const customerMeta = document.getElementById("reportCustomerMeta");
    if (customerMeta) {
      customerMeta.textContent = `${customerHistory.length} customer${customerHistory.length === 1 ? "" : "s"}`;
    }

    const pendingMeta = document.getElementById("reportPendingMeta");
    if (pendingMeta) {
      pendingMeta.textContent = `${pendingInvoices.length} open invoice${pendingInvoices.length === 1 ? "" : "s"}`;
    }

    const agingMeta = document.getElementById("reportAgingMeta");
    if (agingMeta) {
      agingMeta.textContent = `₹${reportFormatCurrency(derivedSummary.pendingBalance)}`;
    }

    const inventoryMeta = document.getElementById("reportInventoryMeta");
    if (inventoryMeta) {
      inventoryMeta.textContent = `${inventoryUsage.length} item${inventoryUsage.length === 1 ? "" : "s"}`;
    }

    const itemsSoldMeta = document.getElementById("reportItemsSoldMeta");
    if (itemsSoldMeta) {
      itemsSoldMeta.textContent = `${derivedSummary.totalItemsSold} sold`;
    }

    const salesTrendEl = document.getElementById("reportSalesTrend");
    if (salesTrendEl) {
      salesTrendEl.innerHTML = reportRenderTable({
        headers: ["Date", "Invoices", "Sales", "Collected", "Pending"],
        rows: salesTrend,
        rowRenderer: (row) => reportBuildSalesTrendRows([row]).join(""),
        emptyMessage: "No sales data for the selected range."
      });
    }

    const invoiceTableEl = document.getElementById("reportInvoiceTable");
    if (invoiceTableEl) {
      invoiceTableEl.innerHTML = reportRenderTable({
        headers: ["Invoice", "Date", "Mobile", "Vehicle", "Grand Total", "Paid", "Balance", "Status"],
        rows: invoices,
        rowRenderer: (row) => reportBuildRowsForInvoices([row]).join(""),
        emptyMessage: "No invoices found for the selected range."
      });
    }

    const customerTableEl = document.getElementById("reportCustomerTable");
    if (customerTableEl) {
      customerTableEl.innerHTML = reportRenderTable({
        headers: ["Mobile", "Vehicle", "Invoices", "Billed", "Paid", "Outstanding", "Last Invoice"],
        rows: customerHistory,
        rowRenderer: (row) => reportBuildCustomerRows([row]).join(""),
        emptyMessage: "No customer history found."
      });
    }

    const pendingTableEl = document.getElementById("reportPendingTable");
    if (pendingTableEl) {
      pendingTableEl.innerHTML = reportRenderTable({
        headers: ["Invoice", "Date", "Mobile", "Vehicle", "Balance", "Status"],
        rows: pendingInvoices,
        rowRenderer: (row) => `
          <tr>
            <td>#${reportEscapeHtml(row.InvoiceID)}</td>
            <td>${reportEscapeHtml(reportFormatDate(row.InvoiceDate || row.Date || row.InvoiceDateTime))}</td>
            <td>${reportEscapeHtml(row.MobileNo || "N/A")}</td>
            <td>${reportEscapeHtml(row.VehicleNo || "N/A")}</td>
            <td>₹${reportEscapeHtml(reportFormatCurrency(row.RemainingAmount || 0))}</td>
            <td>${(() => { const displayStatus = reportDisplayStatus(row); return reportChip(displayStatus.label, displayStatus.className); })()}</td>
          </tr>
        `,
        emptyMessage: "No pending payments in the selected range."
      });
    }

    const agingTableEl = document.getElementById("reportAgingTable");
    if (agingTableEl) {
      agingTableEl.innerHTML = reportRenderTable({
        headers: ["Age Bucket", "Invoices", "Pending Amount"],
        rows: pendingAging,
        rowRenderer: (row) => reportBuildAgingRows([row]).join(""),
        emptyMessage: "No aging data found."
      });
    }

    const inventoryTableEl = document.getElementById("reportInventoryTable");
    if (inventoryTableEl) {
      inventoryTableEl.innerHTML = reportRenderTable({
        headers: ["Item", "Qty Used", "Bills", "Estimated Value"],
        rows: inventoryUsage,
        rowRenderer: (row) => reportBuildUsageRows([row]).join(""),
        emptyMessage: "No inventory usage data for the selected range."
      });
    }

    const itemsSoldTableEl = document.getElementById("reportItemsSoldTable");
    if (itemsSoldTableEl) {
      itemsSoldTableEl.innerHTML = reportRenderTable({
        headers: ["Item", "Qty Sold", "Bills", "Estimated Value"],
        rows: itemsSold,
        rowRenderer: (row) => reportBuildUsageRows([row]).join(""),
        emptyMessage: "No sold items found."
      });
    }

    reportDashboardInitialized = true;
    
    // Initialize event delegation for status chips
    setTimeout(() => initReportStatusChipEvents(), 100);
  } catch (error) {
    console.error("Report dashboard error:", error);
    if (summaryEl) {
      summaryEl.innerHTML = `<div class="empty-state">Unable to load report dashboard.</div>`;
    }

    const targets = [
      "reportSalesTrend",
      "reportInvoiceTable",
      "reportCustomerTable",
      "reportPendingTable",
      "reportAgingTable",
      "reportInventoryTable",
      "reportItemsSoldTable"
    ];

    for (const targetId of targets) {
      const target = document.getElementById(targetId);
      if (target) {
        target.innerHTML = `<div class="empty-state">Unable to load report data.</div>`;
      }
    }

    if (typeof showToast === "function") {
      showToast("Unable to load report dashboard.");
    }
  }
}

// Tooltip element for status hover
let statusTooltip = null;

// Initialize event delegation for status chips in reports
function initReportStatusChipEvents() {
  const reportInvoiceTable = document.getElementById('reportInvoiceTable');
  if (!reportInvoiceTable) return;
  
  // Event delegation for clicks
  reportInvoiceTable.addEventListener('click', function(e) {
    const chip = e.target.closest('.report-status-chip');
    if (chip) {
      e.preventDefault();
      e.stopPropagation();
      reportShowStatusDetail(chip);
    }
  });
  
  // Event delegation for hover (using mouseover/mouseout which bubble)
  reportInvoiceTable.addEventListener('mouseover', function(e) {
    const chip = e.target.closest('.report-status-chip');
    if (chip) {
      reportShowStatusTooltip(chip);
    }
  });
  
  reportInvoiceTable.addEventListener('mouseout', function(e) {
    const chip = e.target.closest('.report-status-chip');
    if (chip) {
      reportHideStatusTooltip();
    }
  });
}

// Show tooltip on hover of status chip
function reportShowStatusTooltip(element) {
  const cancelledReason = element.getAttribute('data-cancelled-reason') || '';
  const cancelledAt = element.getAttribute('data-cancelled-at') || '';
  const reopenReason = element.getAttribute('data-reopen-reason') || '';
  const reopenedAt = element.getAttribute('data-reopened-at') || '';
  
  if (!cancelledReason && !reopenReason) {
    console.log('No tooltip data:', { cancelledReason, reopenReason });
    return; // No details to show
  }
  
  console.log('Showing tooltip for:', { cancelledReason, cancelledAt, reopenReason, reopenedAt });
  
  // Hide existing tooltip
  reportHideStatusTooltip();
  
  // Create tooltip
  statusTooltip = document.createElement('div');
  statusTooltip.style.cssText = 'position:absolute; background:#1a1a1a; color:#fff; padding:12px 14px; border-radius:4px; font-size:12px; z-index:10000; box-shadow:0 2px 10px rgba(0,0,0,0.8); border:1px solid #555; max-width:320px; word-wrap:break-word; white-space:normal;';
  
  let tooltipHtml = '';
  if (cancelledReason) {
    const formattedTime = cancelledAt ? formatToIST(cancelledAt) : '';
    tooltipHtml = `<div style="margin-bottom:8px; color:#ffb3b3; font-weight:bold; font-size:11px;">${formattedTime}</div><div style="color:#ddd;">${reportEscapeHtml(cancelledReason)}</div>`;
  }
  if (reopenReason) {
    const formattedTime = reopenedAt ? formatToIST(reopenedAt) : '';
    if (tooltipHtml) tooltipHtml += '<div style="margin-top:10px; border-top:1px solid #444; padding-top:10px;"></div>';
    tooltipHtml += `<div style="margin-bottom:8px; color:#bff0c6; font-weight:bold; font-size:11px;">${formattedTime}</div><div style="color:#ddd;">${reportEscapeHtml(reopenReason)}</div>`;
  }
  
  statusTooltip.innerHTML = tooltipHtml;
  document.body.appendChild(statusTooltip);
  
  // Position tooltip with better centering and boundary checking
  const rect = element.getBoundingClientRect();
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  let left = rect.left + scrollLeft + rect.width / 2;
  let top = rect.bottom + scrollTop + 8;
  
  // Adjust if tooltip goes off-screen
  left = Math.max(10, left - statusTooltip.offsetWidth / 2);
  if (left + statusTooltip.offsetWidth > window.innerWidth + scrollLeft - 10) {
    left = window.innerWidth + scrollLeft - statusTooltip.offsetWidth - 10;
  }
  
  statusTooltip.style.left = left + 'px';
  statusTooltip.style.top = top + 'px';
}

// Hide tooltip
function reportHideStatusTooltip() {
  if (statusTooltip) {
    statusTooltip.remove();
    statusTooltip = null;
  }
}

// Show detail modal on click of status chip
function reportShowStatusDetail(element) {
  const invoiceId = element.getAttribute('data-invoice-id') || '';
  const status = element.getAttribute('data-status') || 'Pending';
  const cancelledReason = element.getAttribute('data-cancelled-reason') || '';
  const cancelledAt = element.getAttribute('data-cancelled-at') || '';
  const reopenReason = element.getAttribute('data-reopen-reason') || '';
  const reopenedAt = element.getAttribute('data-reopened-at') || '';
  
  console.log('Status detail clicked:', { invoiceId, status, cancelledReason, cancelledAt, reopenReason, reopenedAt });
  
  if (!cancelledReason && !reopenReason) {
    console.log('No cancellation or reopen data to display');
    return; // No details to show
  }
  
  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:10001; display:flex; align-items:center; justify-content:center;';
  
  const content = document.createElement('div');
  content.style.cssText = 'background:#222; color:#fff; padding:20px; border-radius:8px; max-width:450px; width:90%; border:1px solid #444;';
  
  let detailsHtml = `<h3 style="margin-top:0; margin-bottom:20px; border-bottom:1px solid #444; padding-bottom:10px;">Invoice #${reportEscapeHtml(invoiceId)} - Status Details</h3>`;
  
  if (cancelledReason) {
    const formattedTime = cancelledAt ? formatToIST(cancelledAt) : '';
    detailsHtml += `<div style="margin-bottom:20px;">
      <div style="margin-bottom:8px; color:#ffb3b3; font-weight:bold; font-size:12px;">Cancelled - ${formattedTime}</div>
      <div style="padding:10px; background:#3a2a2a; border-radius:4px; color:#ddd; border-left:3px solid #ffb3b3;">${reportEscapeHtml(cancelledReason)}</div>
    </div>`;
  }
  
  if (reopenReason) {
    const formattedTime = reopenedAt ? formatToIST(reopenedAt) : '';
    detailsHtml += `<div style="margin-bottom:20px;">
      <div style="margin-bottom:8px; color:#bff0c6; font-weight:bold; font-size:12px;">Reopened - ${formattedTime}</div>
      <div style="padding:10px; background:#2a3a2a; border-radius:4px; color:#ddd; border-left:3px solid #bff0c6;">${reportEscapeHtml(reopenReason)}</div>
    </div>`;
  }
  
  detailsHtml += `<div style="margin-top:20px; text-align:right;"><button onclick="this.closest('div').parentElement.parentElement.remove()" style="padding:8px 16px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Close</button></div>`;
  
  content.innerHTML = detailsHtml;
  modal.appendChild(content);
  
  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.body.appendChild(modal);
}

// DEBUG: Test function to verify hover/click works with sample data
window.testStatusChipHandlers = function() {
  const testChip = document.createElement('span');
  testChip.className = 'report-status-chip';
  testChip.style.cssText = 'cursor:pointer; display:inline-block; padding:4px 8px; background:#f44; color:#fff; border-radius:3px; margin:10px; border:1px solid #c00;';
  testChip.setAttribute('data-invoice-id', '999-TEST');
  testChip.setAttribute('data-status', 'Cancelled');
  testChip.setAttribute('data-cancelled-reason', 'Customer requested cancellation due to duplicate entry');
  testChip.setAttribute('data-cancelled-at', new Date().toISOString());
  testChip.setAttribute('data-reopen-reason', '');
  testChip.setAttribute('data-reopened-at', '');
  testChip.textContent = 'Cancelled [TEST]';
  
  testChip.addEventListener('click', function() {
    reportShowStatusDetail(this);
  });
  
  testChip.addEventListener('mouseover', function() {
    reportShowStatusTooltip(this);
  });
  
  testChip.addEventListener('mouseout', function() {
    reportHideStatusTooltip();
  });
  
  document.body.appendChild(testChip);
  console.log('Test chip added. Click it or hover over it. Run testStatusChipHandlers() to add another test chip.');
}
