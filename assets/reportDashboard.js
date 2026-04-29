const REPORT_API_BASE = "http://localhost:7071/api";
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

function reportStatusClass(status) {
  const normalized = String(status || "Pending").toLowerCase();
  if (normalized === "paid") return "paid";
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "partial") return "partial";
  return "pending";
}

function reportChip(status) {
  const safeStatus = reportEscapeHtml(status || "Pending");
  return `<span class="status-chip ${reportStatusClass(status)}">${safeStatus}</span>`;
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
    const status = invoice.InvoiceStatus || invoice.PaymentStatus || "Pending";
    return `
      <tr>
        <td>#${reportEscapeHtml(invoice.InvoiceID)}</td>
        <td>${reportEscapeHtml(reportFormatDate(invoice.InvoiceDate || invoice.Date || invoice.InvoiceDateTime))}</td>
        <td>${reportEscapeHtml(invoice.MobileNo || "N/A")}</td>
        <td>${reportEscapeHtml(invoice.VehicleNo || "N/A")}</td>
        <td>₹${reportEscapeHtml(reportFormatCurrency(invoice.GrandTotal || 0))}</td>
        <td>₹${reportEscapeHtml(reportFormatCurrency(invoice.PaidAmount || 0))}</td>
        <td>₹${reportEscapeHtml(reportFormatCurrency(invoice.RemainingAmount || 0))}</td>
        <td>${reportChip(status)}</td>
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
            <td>${reportChip(row.InvoiceStatus || row.PaymentStatus || "Pending")}</td>
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
      const itemsSoldRows = itemsSold.slice(0, 10);
      itemsSoldTableEl.innerHTML = reportRenderTable({
        headers: ["Item", "Qty Sold", "Bills", "Estimated Value"],
        rows: itemsSoldRows,
        rowRenderer: (row) => reportBuildUsageRows([row]).join(""),
        emptyMessage: "No sold items found."
      });
    }

    reportDashboardInitialized = true;
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
