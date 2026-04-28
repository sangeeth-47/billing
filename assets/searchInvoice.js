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
    const res = await si_fetchJson(`https://api.sangeeth47.in/api/GetInvoicesByCustomer?vehicleNo=${query}&mobileNo=${query}`, {
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

    const res = await si_fetchJson(`https://api.sangeeth47.in/api/GetLastInvoices`, {
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
      `https://api.sangeeth47.in/api/GetInvoicesDated?fromDate=${from}&toDate=${to}`,
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
    <div class="si-invoice-card" onclick="si_selectInvoice('${d.InvoiceID}')">
      <strong>#${d.InvoiceID}</strong><br>
      ${d.VehicleNo || "N/A"}<br>
      ₹${d.GrandTotal || 0}
    </div>
  `).join("");
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