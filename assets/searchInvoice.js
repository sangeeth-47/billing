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

/* SEARCH */
async function si_searchInvoice() {
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
      return;
    }

    si_renderInvoices(data);

  } catch (err) {
    console.error(err);
    si_showToast("Server unreachable. Try again later.");
  } finally {
    await si_setLoading("si-searchBtn", false);
  }
}

/* LAST 10 */
async function si_showLastInvoices() {
  await si_setLoading("si-lastBtn", true);

  try {
    const token = localStorage.getItem("access_token");

    const res = await si_fetchJson(`https://api.sangeeth47.in/api/billing-GetLastInvoices`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (res.status === 401) {
      si_showToast("Session expired. Login again.");
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!data.length) {
      si_showToast("No invoices found");
      return;
    }

    si_renderInvoices(data);

  } catch (err) {
    console.error(err);
    si_showToast("Server unreachable. Try again later.");
  } finally {
    await si_setLoading("si-lastBtn", false);
  }
}

/* DATE SEARCH */
async function si_fetchInvoicesByDate() {
  await si_setLoading("si-dateBtn", true);

  try {
    const token = localStorage.getItem("access_token");

    const from = document.getElementById("si-fromDate").value;
    const to = document.getElementById("si-toDate").value;

    if (!from || !to) {
      si_showToast("Select both dates");
      return;
    }

    const res = await si_fetchJson(
      `https://api.sangeeth47.in/api/billing-GetInvoicesDated?fromDate=${from}&toDate=${to}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }
    );

    if (res.status === 401) {
      si_showToast("Session expired. Login again.");
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!data.length) {
      si_showToast("No invoices found");
      document.getElementById("si-invoiceOptions").innerHTML = "";
      return;
    }

    si_renderInvoices(data);

  } catch (err) {
    console.error(err);
    si_showToast("Server unreachable. Try again later.");
  } finally {
    await si_setLoading("si-dateBtn", false);
  }
}

/* RENDER */
function si_renderInvoices(data) {
  const container = document.getElementById("si-invoiceOptions");

  localStorage.setItem("si_invoiceCache", JSON.stringify(data));

  container.innerHTML = data.map(d => `
    <div class="si-invoice-card" data-id="${d.InvoiceID}" onclick="si_selectInvoice('${d.InvoiceID}')">
      ${si_getInvoiceCardHTML(d)}
    </div>
  `).join("");
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

  return `
    <div class="si-card-left">
      <strong>#${d.InvoiceID}</strong><br>
<small>${d.MobileNo || "N/A"}</small><br>
      ${d.VehicleNo || "N/A"}<br>
      ₹${d.GrandTotal || 0}
    </div>
    <div class="si-card-right">

  <div class="si-status-row">
    <span class="si-status ${isPaid ? "paid" : isPartial ? "partial" : "unpaid"}">
      ${status}
    </span>

    <button class="si-eye-btn"
      onclick="event.stopPropagation(); si_viewPayments('${d.InvoiceID}')">
      👁
    </button>
  </div>

  ${
    isPaid || isPartial
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