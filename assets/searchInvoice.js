async function si_setLoading(btnId, isLoading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  if (isLoading) {
    btn.disabled = true;
    btn.dataset.original = btn.innerHTML;
    btn.innerHTML = "Loading...";
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.original;
  }
}

async function si_fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function si_formatDateInput(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function si_setDefaultDateRange() {
  const fromEl = document.getElementById("si-fromDate");
  const toEl = document.getElementById("si-toDate");

  if (!fromEl || !toEl) return;

  const today = new Date();
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  fromEl.value = si_formatDateInput(oneMonthAgo);
  toEl.value = si_formatDateInput(today);
}

const SI_RECENT_PAGE_SIZE = 10;
let si_recentOffset = 0;
let si_recentHasMore = true;
let si_recentLoading = false;
let si_recentModeActive = false;
let si_dateOffset = 0;
let si_dateHasMore = true;
let si_dateLoading = false;
let si_dateModeActive = false;
let si_dateFrom = "";
let si_dateTo = "";
let si_scrollHandlerBound = false;

function si_resetRecentState() {
  si_recentOffset = 0;
  si_recentHasMore = true;
  si_recentLoading = false;
  si_recentModeActive = true;
  si_dateModeActive = false;
}

function si_resetDateState(fromDate, toDate) {
  si_dateOffset = 0;
  si_dateHasMore = true;
  si_dateLoading = false;
  si_dateModeActive = true;
  si_recentModeActive = false;
  si_dateFrom = fromDate;
  si_dateTo = toDate;
}

function si_isNearBottom() {
  const threshold = 220;
  const scrollPosition = window.innerHeight + window.scrollY;
  const pageHeight = document.documentElement.scrollHeight;
  return scrollPosition >= pageHeight - threshold;
}

function si_bindRecentScroll() {
  if (si_scrollHandlerBound) return;

  window.addEventListener("scroll", () => {
    if (!document.getElementById("si-invoiceOptions")) return;
    if (!si_isNearBottom()) return;

    if (si_recentModeActive && !si_recentLoading && si_recentHasMore) {
      si_loadRecentInvoices({ append: true });
      return;
    }

    if (si_dateModeActive && !si_dateLoading && si_dateHasMore) {
      si_loadDateInvoices({ append: true });
    }
  });

  si_scrollHandlerBound = true;
}

function si_setListStatus(message) {
  const statusEl = document.getElementById("si-listStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
}

async function si_loadRecentInvoices({ append }) {
  if (si_recentLoading || !si_recentHasMore) return;

  si_recentLoading = true;
  let shouldAutoLoadMore = false;
  si_setListStatus("Loading more invoices...");

  try {
    const token = localStorage.getItem("access_token");

    const res = await si_fetchJson(
      `https://api.sangeeth47.in/api/billing-GetLastInvoices?offset=${si_recentOffset}&limit=${SI_RECENT_PAGE_SIZE}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }
    );

    if (res.status === 401) {
      si_showToast("Session expired. Login again.");
      si_recentModeActive = false;
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = await res.json();
    const invoices = Array.isArray(payload) ? payload : (payload.invoices || []);
    const hasMore = Array.isArray(payload) ? invoices.length === SI_RECENT_PAGE_SIZE : Boolean(payload.hasMore);

    if (!invoices.length && !append) {
      si_showToast("No invoices found");
      si_setListStatus("No invoices found.");
      si_recentHasMore = false;
      return;
    }

    si_renderInvoices(invoices, { append });
    si_recentOffset += invoices.length;
    si_recentHasMore = hasMore;

    if (!si_recentHasMore) {
      si_setListStatus("You have reached the end (oldest invoice).");
    } else {
      si_setListStatus("Scroll down to load more invoices.");

      if (document.documentElement.scrollHeight <= window.innerHeight + 20) {
        shouldAutoLoadMore = true;
      }
    }
  } catch (err) {
    console.error(err);
    si_setListStatus("Unable to load invoices right now.");
    si_showToast("Server unreachable. Try again later.");
  } finally {
    si_recentLoading = false;
  }

  if (shouldAutoLoadMore) {
    await si_loadRecentInvoices({ append: true });
  }
}

async function si_initRecentInvoices() {
  si_resetRecentState();
  si_bindRecentScroll();
  await si_loadRecentInvoices({ append: false });
}

async function si_loadDateInvoices({ append }) {
  if (si_dateLoading || !si_dateHasMore) return;

  si_dateLoading = true;
  let shouldAutoLoadMore = false;
  si_setListStatus("Loading more date-filtered invoices...");

  try {
    const token = localStorage.getItem("access_token");

    const res = await si_fetchJson(
      `https://api.sangeeth47.in/api/billing-GetInvoicesDated?fromDate=${si_dateFrom}&toDate=${si_dateTo}&offset=${si_dateOffset}&limit=${SI_RECENT_PAGE_SIZE}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }
    );

    if (res.status === 401) {
      si_showToast("Session expired. Login again.");
      si_dateModeActive = false;
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = await res.json();
    const invoices = Array.isArray(payload) ? payload : (payload.invoices || []);
    const hasMore = Array.isArray(payload) ? invoices.length === SI_RECENT_PAGE_SIZE : Boolean(payload.hasMore);

    if (!invoices.length && !append) {
      si_showToast("No invoices found");
      si_setListStatus("No invoices found for selected dates.");
      si_dateHasMore = false;
      return;
    }

    si_renderInvoices(invoices, { append });
    si_dateOffset += invoices.length;
    si_dateHasMore = hasMore;

    if (!si_dateHasMore) {
      si_setListStatus("You have reached the end of date-filtered invoices.");
    } else {
      si_setListStatus("Scroll down to load more date-filtered invoices.");

      if (document.documentElement.scrollHeight <= window.innerHeight + 20) {
        shouldAutoLoadMore = true;
      }
    }
  } catch (err) {
    console.error(err);
    si_setListStatus("Unable to load date-filtered invoices right now.");
    si_showToast("Server unreachable. Try again later.");
  } finally {
    si_dateLoading = false;
  }

  if (shouldAutoLoadMore) {
    await si_loadDateInvoices({ append: true });
  }
}

async function si_initDateInvoices(fromDate, toDate) {
  si_resetDateState(fromDate, toDate);
  si_bindRecentScroll();
  await si_loadDateInvoices({ append: false });
}

/* SEARCH */
async function si_searchInvoice() {
  si_recentModeActive = false;
  si_dateModeActive = false;
  si_setListStatus("");
  await si_setLoading("si-searchBtn", true);

  try {
    const query = document.getElementById("si-searchInput").value.trim();
    if (!query) {
      si_showToast("Enter mobile or vehicle number");
      return;
    }

    const token = localStorage.getItem("access_token");
    const res = await si_fetchJson(`https://api.sangeeth47.in/api/billing-GetInvoicesByCustomer?vehicleNo=${query}&mobileNo=${query}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (data.message === "No invoices found") {
      si_showToast("No invoices found");
      document.getElementById("si-invoiceOptions").innerHTML = "";
      si_setListStatus("No invoices found.");
      return;
    }

    si_renderInvoices(data);
    si_setListStatus("End of search results.");

  } catch (err) {
    console.error(err);
    si_showToast("Server unreachable. Try again later.");
  } finally {
    await si_setLoading("si-searchBtn", false);
  }
}

/* LAST 10 */
async function si_showLastInvoices() {
  await si_initRecentInvoices();
}

/* DATE SEARCH */
async function si_fetchInvoicesByDate() {
  si_recentModeActive = false;
  si_dateModeActive = false;
  si_setListStatus("");
  await si_setLoading("si-dateBtn", true);

  try {
    const token = localStorage.getItem("access_token");

    const from = document.getElementById("si-fromDate").value;
    const to = document.getElementById("si-toDate").value;

    if (!from || !to) {
      si_showToast("Select both dates");
      return;
    }

    await si_initDateInvoices(from, to);

  } catch (err) {
    console.error(err);
    si_showToast("Server unreachable. Try again later.");
  } finally {
    await si_setLoading("si-dateBtn", false);
  }
}

/* RENDER */
function si_renderInvoices(data, options = {}) {
  const { append = false } = options;
  const container = document.getElementById("si-invoiceOptions");

  const existing = append
    ? JSON.parse(localStorage.getItem("si_invoiceCache") || "[]")
    : [];
  const merged = [...existing, ...data];

  localStorage.setItem("si_invoiceCache", JSON.stringify(merged));

  const html = data.map(d => `
    <div class="si-invoice-card" data-id="${d.InvoiceID}" onclick="si_selectInvoice('${d.InvoiceID}')">
      ${si_getInvoiceCardHTML(d)}
    </div>
  `).join("");

  if (append) {
    container.insertAdjacentHTML("beforeend", html);
  } else {
    container.innerHTML = html;
  }
}


// Add Payment

let si_currentInvoiceId = null;
let si_currentMaxAmount = 0;

function si_addPaymentPrompt(invoiceId, maxAmount) {
  si_currentInvoiceId = invoiceId;
  si_currentMaxAmount = maxAmount;

  document.getElementById("si-pay-amount").value = "";
  document.getElementById("si-pay-mode").value = "UPI";
  document.getElementById("si-pay-remarks").value = "";

  document.getElementById("si-paymentModal").style.display = "flex";
}

function si_closePaymentModal() {
  document.getElementById("si-paymentModal").style.display = "none";
}

async function si_submitPayment() {

  const amount = parseFloat(document.getElementById("si-pay-amount").value);
  const mode = document.getElementById("si-pay-mode").value;
  const remarks = document.getElementById("si-pay-remarks").value;

  if (!amount || amount <= 0) {
    alert("Invalid amount");
    return;
  }

  if (amount > si_currentMaxAmount) {
    alert("Amount exceeds balance");
    return;
  }

  const token = localStorage.getItem("access_token");

  const res = await fetch("https://api.sangeeth47.in/api/billing-addpayment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      invoiceId: si_currentInvoiceId,
      amount,
      mode,
      remarks
    })
  });

  if (!res.ok) {
    si_showToast("Payment failed");
    return;
  }

  const updated = await res.json();

  si_updateInvoiceFromServer(updated);
  si_closePaymentModal();
}

function si_updateInvoiceFromServer(updated) {

  let data = JSON.parse(localStorage.getItem("si_invoiceCache") || "[]");

  const index = data.findIndex(d => d.InvoiceID == updated.InvoiceID);
  if (index === -1) return;

  // ✅ overwrite with DB values
  data[index] = {
    ...data[index],
    ...updated
  };

  localStorage.setItem("si_invoiceCache", JSON.stringify(data));

  // ✅ update only that card
  si_updateSingleCard(data[index]);
}

function si_updateSingleCard(d) {
  const card = document.querySelector(`.si-invoice-card[data-id='${d.InvoiceID}']`);
  if (!card) return;

  card.innerHTML = si_getInvoiceCardHTML(d);
}

function si_getInvoiceCardHTML(d) {

  const status = d.PaymentStatus || "Unpaid";
  const paid = d.PaidAmount || 0;
  const balance = d.RemainingAmount ?? d.GrandTotal;

  const isPaid = status === "Paid";
  const isPartial = status === "Partial";
  const isCancelled = status === "Cancelled"; 

  return `
    <div class="si-card-left">
      <strong>#${d.InvoiceID}</strong><br>
      <small>${d.MobileNo || "N/A"}</small><br>
      ${d.VehicleNo || "N/A"}<br>
      ₹${d.GrandTotal || 0}
    </div>

    <div class="si-card-right">

      <div class="si-status-row">
        <span class="si-status 
          ${isPaid ? "paid" : isPartial ? "partial" : isCancelled ? "cancelled" : "unpaid"}">
          ${status}
        </span>

        <button class="si-eye-btn"
          onclick="event.stopPropagation(); si_viewPayments('${d.InvoiceID}')">
          👁
        </button>
      </div>

      ${
        isCancelled
        ? `<div class="si-cancelled-text">Invoice Cancelled</div>`
        : isPaid || isPartial
        ? `
          Paid: ₹${paid}<br>
          Bal: ₹${balance}<br>

          ${
            !isPaid
            ? `<button class="si-pay-btn update"
                onclick="event.stopPropagation(); si_addPaymentPrompt('${d.InvoiceID}', ${balance})">
                Update Payment
              </button>`
            : ""
          }
        `
        : `
          <button class="si-pay-btn"
            onclick="event.stopPropagation(); si_addPaymentPrompt('${d.InvoiceID}', ${balance})">
            Enter Payment
          </button>
        `
      }

    </div>
  `;
}

async function si_viewPayments(invoiceId) {

  const token = localStorage.getItem("access_token");

  const res = await fetch(`https://api.sangeeth47.in/api/billing-GetPayments?invoiceId=${invoiceId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    si_showToast("Failed to load history");
    return;
  }

  const data = await res.json();

  const container = document.getElementById("si-historyList");

container.innerHTML = data.map(p => {

  let localTime = "Invalid";

  if (p.PaymentDate) {
    const dt = new Date(p.PaymentDate);

    if (!isNaN(dt)) {
      localTime = dt.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    }
  }

  return `
    <div class="si-history-item">
      <div>
        <strong>₹${p.AmountPaid}</strong> (${p.PaymentMode})
      </div>
      <div class="si-history-date">${localTime}</div>
      ${p.Remarks ? `<div class="si-history-remarks">${p.Remarks}</div>` : ""}
    </div>
  `;
}).join("");

  document.getElementById("si-historyModal").style.display = "flex";
}

function si_closeHistory() {
  document.getElementById("si-historyModal").style.display = "none";
}

/* SELECT */
async function si_selectInvoice(id) {
  const data = JSON.parse(localStorage.getItem("si_invoiceCache") || "[]");
  const selected = data.find(d => d.InvoiceID == id);
  if (!selected) return;

  localStorage.setItem("selectedInvoice", JSON.stringify(selected));
  VIEW_MODE = true;
  
  // Load billing UI (same template)
  loadBillingApp();
}

/* TOAST */
function si_showToast(msg) {
  const t = document.getElementById("si-toast");
  t.textContent = msg;
  t.classList.add("show");

  setTimeout(() => t.classList.remove("show"), 3000);
}