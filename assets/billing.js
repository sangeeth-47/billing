let VIEW_MODE = false;
let IS_EDITING = false;   
let IS_FINALIZED = false; 
let currentInvoiceId = null;
let IS_DIRTY = false;   // tracks if user changed anything

    const API_BASE = "https://api.sangeeth47.in/api";
    function showToast(message) {
      const container = document.getElementById("toastContainer");
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }

    async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const loader = document.getElementById("loader");

  if (!username || !password) {
    showToast("Please enter username and password");
    return;
  }

  loader.style.display = "block";

  try {
    const response = await fetch(`${API_BASE}/billing-auth-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

  const data = await response.json();

  if (response.ok && data.token) {
    localStorage.setItem("access_token", data.token);
    localStorage.removeItem("selectedInvoice");

    // hide login UI
    document.getElementById("billingapplogin").style.display = "none";

    // load billing UI
    loadBillingApp();
  } 
  else {
    showToast(data.message || "Invalid credentials!");
  }
  
  } catch (error) {
    console.error("Login error:", error);
    showToast("Login failed. Please try again later.");
  } finally {
    loader.style.display = "none";
  }
}

  function toggleTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.style.display = timeline.style.display === 'block' ? 'none' : 'block';
  }

  function showPopup(elem, text) {
  // Remove existing popup
  const oldPopup = document.querySelector('.version-popup');
  if (oldPopup) oldPopup.remove();

  const rect = elem.getBoundingClientRect();

  const popup = document.createElement('div');
  popup.className = 'version-popup';
  popup.innerHTML = text;
  popup.style.display = 'block';
  popup.style.position = 'fixed';
  popup.style.visibility = 'hidden'; // Wait to calculate width

  document.body.appendChild(popup);

  // Calculate width and position
  const popupWidth = popup.offsetWidth;
  const popupHeight = popup.offsetHeight;
  const centerX = rect.left + rect.width / 2;
  let left = centerX - popupWidth / 2;

  // Clamp within screen
  if (left < 10) left = 10;
  if (left + popupWidth > window.innerWidth - 10) {
    left = window.innerWidth - popupWidth - 10;
  }

  // Determine vertical position (above or below)
  const showBelow = rect.top < popupHeight + 20; // if not enough space above

  if (showBelow) {
    popup.classList.add('arrow-up');
    popup.style.top = `${rect.bottom + 8}px`;
  } else {
    popup.classList.add('arrow-down');
    popup.style.top = `${rect.top - popupHeight - 8}px`;
  }

  popup.style.left = `${left}px`;
  popup.style.visibility = 'visible';

  // Close popup on outside click
  document.addEventListener('click', function handler(e) {
    const timeline = document.getElementById('timeline');
    const clickedInside = popup.contains(e.target) || elem.contains(e.target) || timeline.contains(e.target);
    if (!clickedInside) {
      popup.remove();
      timeline.style.display = 'none';
      document.removeEventListener('click', handler);
    }
  });
}

  function loadBillingApp() {
  const tpl = document.getElementById("billingTpl");
  checkAuth();
  document.getElementById("app").innerHTML = tpl.innerHTML;

  initializeBilling(); // must exist
}

function initializeBilling() {
  setTodayDate();

  const qrWrapper = document.getElementById('qrWrapper');
  const qrOverlay = document.getElementById('qrOverlay');

  if (qrWrapper) {
    qrWrapper.addEventListener('click', () => {
      if (hasDuplicateEntries() || cleanEmptyAndPartialRows()) return;
      showFullScreenQR();
    });
  }

  if (qrOverlay) {
    qrOverlay.addEventListener('click', hideFullScreenQR);
  }

  if (!VIEW_MODE) {
    document.getElementById("billNo").disabled = true;

  } else {
    // ✅ VIEW MODE

    document.getElementById("billNo").disabled = true;

    // 🔥 THIS IS THE FIX
    const selected = JSON.parse(localStorage.getItem("selectedInvoice"));
    loadInvoiceIntoBilling(selected);

    // Validate and refresh invoice status from server
    if (selected && selected.InvoiceID) {
      validateAndRefreshInvoiceStatus(selected.InvoiceID);
    }

    // Switch to billing section
    showSection("billing");
  }

  trackChanges();
  setupSubmitButton();
}

function setupSubmitButton() {
  const container = document.querySelector(".billing-container");
  if (!container) return;

  container.querySelectorAll(".submit-btn, .print-btn").forEach(btn => btn.remove());

  // -------- VIEW MODE --------
  if (VIEW_MODE) {
    // Always show Edit Invoice in view mode
    const editBtn = document.createElement("button");
    editBtn.className = "submit-btn";
    editBtn.textContent = "Edit Invoice";
    editBtn.onclick = async () => {
      // If there are unsaved changes, submit them first
      if (IS_DIRTY) {
        const submitted = await finalizeInvoice();
        if (!submitted) return;
        IS_DIRTY = false;
        
        // Refresh selectedInvoice with updated form data
        const selected = JSON.parse(localStorage.getItem("selectedInvoice") || "{}");
        selected.VehicleNo = document.getElementById('vehicleNo').value.trim();
        selected.MobileNo = document.getElementById('ownerNo').value.trim();
        selected.KmCovered = parseInt(document.getElementById('kmCovered').value) || 0;
        
        // Rebuild consumables from table
        selected.Consumables = [];
        document.querySelectorAll('#consumablesTable tbody tr').forEach(row => {
          const itemName = row.children[1].querySelector('input').value.trim();
          const quantity = parseFloat(row.children[2].querySelector('input').value) || 0;
          const price = parseFloat(row.children[3].querySelector('input').value) || 0;
          if (itemName && quantity > 0) {
            selected.Consumables.push({ ItemName: itemName, Quantity: quantity, Price: price });
          }
        });
        
        // Rebuild services from table
        selected.Services = [];
        document.querySelectorAll('#servicesTable tbody tr').forEach(row => {
          const serviceName = row.children[1].querySelector('input').value.trim();
          const charge = parseFloat(row.children[2].querySelector('input').value) || 0;
          if (serviceName && charge >= 0) {
            selected.Services.push({ ServiceName: serviceName, Charge: charge });
          }
        });
        
        localStorage.setItem("selectedInvoice", JSON.stringify(selected));
      }
      // After submit or if no changes, stay in view mode
      setupSubmitButton();
    };

    // Print button in view mode
    const printBtn = document.createElement("button");
    printBtn.className = "print-btn";
    printBtn.textContent = "Print PDF";
    printBtn.onclick = IS_DIRTY ? handlePrint : prepareAndPrint;

    // Get current invoice status
    const selected = JSON.parse(localStorage.getItem("selectedInvoice") || "{}");
    const invoiceStatus = selected.InvoiceStatus || "Pending";
    const isCancelled = invoiceStatus === "Cancelled";

    // Show/hide cancel and reopen buttons in header; clear title tooltips so panel is primary
    const cancelBtn = document.getElementById("cancelInvoiceBtn");
    const reopenBtn = document.getElementById("reopenInvoiceBtn");
    
    if (cancelBtn) {
      // remove hover-only tooltip
      try { cancelBtn.title = ""; cancelBtn.setAttribute('aria-label', 'Cancel Invoice'); } catch(e){}
      if (isCancelled) {
        cancelBtn.style.display = "none";
      } else {
        cancelBtn.style.display = "inline-block";
      }
    }
    
    if (reopenBtn) {
      // remove hover-only tooltip
      try { reopenBtn.title = ""; reopenBtn.setAttribute('aria-label', 'Reopen Invoice'); } catch(e){}
      if (isCancelled) {
        reopenBtn.style.display = "inline-block";
      } else {
        reopenBtn.style.display = "none";
      }
    }

    container.appendChild(editBtn);
    container.appendChild(printBtn);
    return;
  }

  // Hide cancel/reopen buttons when not in view mode
  const cancelBtn = document.getElementById("cancelInvoiceBtn");
  const reopenBtn = document.getElementById("reopenInvoiceBtn");
  if (cancelBtn) cancelBtn.style.display = "none";
  if (reopenBtn) reopenBtn.style.display = "none";

  // -------- NEW INVOICE MODE (not in view mode) --------
  {
    const submitBtn = document.createElement("button");
    submitBtn.className = "submit-btn";
    submitBtn.textContent = "Submit Invoice";

    submitBtn.onclick = async () => {
      const submitted = await finalizeInvoice();
      if (!submitted) return;

      // Build selectedInvoice from current form data
      const invoiceData = {
        InvoiceID: document.getElementById('billNo').value.trim(),
        VehicleNo: document.getElementById('vehicleNo').value.trim(),
        MobileNo: document.getElementById('ownerNo').value.trim(),
        KmCovered: parseInt(document.getElementById('kmCovered').value) || 0,
        Consumables: [],
        Services: []
      };
      
      // Collect consumables from table
      document.querySelectorAll('#consumablesTable tbody tr').forEach(row => {
        const itemName = row.children[1].querySelector('input').value.trim();
        const quantity = parseFloat(row.children[2].querySelector('input').value) || 0;
        const price = parseFloat(row.children[3].querySelector('input').value) || 0;
        if (itemName && quantity > 0) {
          invoiceData.Consumables.push({ ItemName: itemName, Quantity: quantity, Price: price });
        }
      });
      
      // Collect services from table
      document.querySelectorAll('#servicesTable tbody tr').forEach(row => {
        const serviceName = row.children[1].querySelector('input').value.trim();
        const charge = parseFloat(row.children[2].querySelector('input').value) || 0;
        if (serviceName && charge >= 0) {
          invoiceData.Services.push({ ServiceName: serviceName, Charge: charge });
        }
      });
      
      localStorage.setItem("selectedInvoice", JSON.stringify(invoiceData));

      IS_DIRTY = false;
      VIEW_MODE = true;

      setupSubmitButton();
    };

    container.appendChild(submitBtn);
  }
}

function handlePrint() {
  if (IS_DIRTY) {
    alert("You have unsaved changes. Submit the invoice before printing.");
    return;
  }

  prepareAndPrint();
}

function trackChanges() {
  const container = document.querySelector(".billing-container");
  if (!container || container.dataset.trackChangesBound === "true") return;

  container.dataset.trackChangesBound = "true";
  container.addEventListener("input", (event) => {
    const target = event.target;
    if (!target || !target.matches("input, select, textarea")) return;

    const wasDirty = IS_DIRTY;
    IS_DIRTY = true;

    if (VIEW_MODE && !wasDirty) {
      setupSubmitButton();
    }
  });
}

// Validate and refresh invoice status from server
async function validateAndRefreshInvoiceStatus(invoiceId) {
  try {
    const token = localStorage.getItem("access_token");
    const response = await fetch(`${API_BASE}/billing-GetInvoiceStatus?invoiceId=${encodeURIComponent(invoiceId)}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.warn("Failed to validate invoice status:", response.status);
      return;
    }

    const data = await response.json();
    
    if (data.invoiceId) {
      // Update localStorage with latest status
      const selected = JSON.parse(localStorage.getItem("selectedInvoice") || "{}");
      selected.InvoiceStatus = data.invoiceStatus;
      selected.CancelledAt = data.cancelledAt;
      selected.CancelledReason = data.cancelledReason;
      selected.ReopenedAt = data.reopenedAt;
      selected.ReopenReason = data.reopenReason;
      selected.PaidAmount = data.paidAmount;
      selected.GrandTotal = data.grandTotal;
      localStorage.setItem("selectedInvoice", JSON.stringify(selected));

      // Update buttons based on latest status
      setupSubmitButton();
      try { updateInvoiceStatusUI(selected); } catch(e) { }
    }
  } catch (error) {
    console.error("Error validating invoice status:", error);
    // Continue anyway with existing data
  }
}

// Cancel Invoice Modal and Handler
function showCancelInvoiceModal() {
  const modal = document.getElementById("cancelInvoiceModal");
  const input = document.getElementById("cancelReasonInput");
  if (modal && input) {
    input.value = "";
    modal.style.display = "flex";
  }
}

function closeCancelModal() {
  const modal = document.getElementById("cancelInvoiceModal");
  if (modal) {
    modal.style.display = "none";
  }
}

function submitCancelInvoiceFromModal() {
  const selected = JSON.parse(localStorage.getItem("selectedInvoice") || "{}");
  const reason = document.getElementById("cancelReasonInput")?.value.trim() || "";

  if (!selected.InvoiceID) {
    alert("Invoice ID not found");
    return;
  }

  if (!reason) {
    alert("Please enter a reason for cancellation");
    return;
  }

  closeCancelModal();
  submitCancelInvoice(selected.InvoiceID, reason);
}

async function submitCancelInvoice(invoiceId, reason) {
  const token = localStorage.getItem("access_token");
  const cancelBtn = document.getElementById("cancelInvoiceBtn");
  
  if (cancelBtn) {
    cancelBtn.disabled = true;
    cancelBtn.textContent = "Cancelling...";
  }

  try {
    const response = await fetch(`${API_BASE}/billing-CancelInvoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ invoiceId, reason })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Update localStorage with new status
      const selected = JSON.parse(localStorage.getItem("selectedInvoice") || "{}");
      selected.InvoiceStatus = data.invoice.invoiceStatus;
      selected.CancelledAt = data.invoice.cancelledAt;
      selected.CancelledReason = data.invoice.cancelledReason;
      localStorage.setItem("selectedInvoice", JSON.stringify(selected));

      showToast("Invoice cancelled successfully");
      setupSubmitButton();
      try { updateInvoiceStatusUI(selected); } catch(e) { }
    } else {
      alert("Failed to cancel invoice: " + (data.error || "Unknown error"));
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.textContent = "Cancel Invoice";
      }
    }
  } catch (error) {
    console.error("Cancel invoice error:", error);
    alert("Error cancelling invoice: " + error.message);
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = "Cancel Invoice";
    }
  }
}

// Reopen Invoice Modal and Handler
function showReopenInvoiceModal() {
  const modal = document.getElementById("reopenInvoiceModal");
  const input = document.getElementById("reopenRemarksInput");
  if (modal && input) {
    input.value = "";
    modal.style.display = "flex";
  }
}

function closeReopenModal() {
  const modal = document.getElementById("reopenInvoiceModal");
  if (modal) {
    modal.style.display = "none";
  }
}

function submitReopenInvoiceFromModal() {
  const selected = JSON.parse(localStorage.getItem("selectedInvoice") || "{}");
  const remarks = document.getElementById("reopenRemarksInput")?.value.trim() || "";

  if (!selected.InvoiceID) {
    alert("Invoice ID not found");
    return;
  }

  closeReopenModal();
  submitReopenInvoice(selected.InvoiceID, remarks);
}

async function submitReopenInvoice(invoiceId, remarks) {
  const token = localStorage.getItem("access_token");
  const reopenBtn = document.getElementById("reopenInvoiceBtn");
  
  if (reopenBtn) {
    reopenBtn.disabled = true;
    reopenBtn.textContent = "Reopening...";
  }

  try {
    const response = await fetch(`${API_BASE}/billing-ReopenInvoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ invoiceId, remarks })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Update localStorage with new status
      const selected = JSON.parse(localStorage.getItem("selectedInvoice") || "{}");
      selected.InvoiceStatus = data.invoice.invoiceStatus;
      selected.ReopenedAt = data.invoice.reopenedAt;
      selected.ReopenReason = data.invoice.reopenReason;
      localStorage.setItem("selectedInvoice", JSON.stringify(selected));

      showToast("Invoice reopened successfully");
      setupSubmitButton();
      try { updateInvoiceStatusUI(selected); } catch(e) { }
    } else {
      alert("Failed to reopen invoice: " + (data.error || "Unknown error"));
      if (reopenBtn) {
        reopenBtn.disabled = false;
        reopenBtn.textContent = "Reopen Invoice";
      }
    }
  } catch (error) {
    console.error("Reopen invoice error:", error);
    alert("Error reopening invoice: " + error.message);
    if (reopenBtn) {
      reopenBtn.disabled = false;
      reopenBtn.textContent = "Reopen Invoice";
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("access_token");

  if (token) {
    document.getElementById("billingapplogin").style.display = "none";
    loadBillingApp();
  }
  
  if (!token) { setTimeout(() => {
    const intro = document.getElementById("introScreen");
    const loginForm = document.getElementById("loginForm");

    intro.style.display = "none";
    loginForm.style.display = "block";
    loginForm.style.opacity = 0;
    loginForm.style.transition = "opacity 1s ease-in-out";

    requestAnimationFrame(() => {
      loginForm.style.opacity = 1;
    });
  }, 3000);
}});

  function loadSearchInvoice() {
  const tpl = document.getElementById("searchInvoiceTpl");
  const app = document.getElementById("app");

  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  if (typeof si_setDefaultDateRange === "function") {
    si_setDefaultDateRange();
  }

  if (typeof si_initRecentInvoices === "function") {
    si_initRecentInvoices();
  }
}
    async function setTodayDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const formattedDate = `${dd}-${mm}-${yyyy}`;
  document.getElementById('date').value = formattedDate;
}
    // Fetch list of available consumable item suggestions from backend
  async function loadItemSuggestions() {
    try {
      const token = localStorage.getItem("access_token");

      const res = await fetch(
        `${API_BASE}/billing-GetConsumableSuggestions`,
        {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const datalist = document.getElementById('itemSuggestions');
      datalist.innerHTML = '';

      data.forEach(({ ItemCode, ItemName, Price }) => {
        const option = document.createElement('option');
        const codeLabel = ItemCode ? `[${ItemCode}] ` : '';
        option.value = `${codeLabel}${ItemName} - ₹${Price}`;
        option.dataset.name = ItemName;
        option.dataset.code = ItemCode || '';
        option.dataset.price = Price;
        datalist.appendChild(option);
      });

    } catch (err) {
      console.error("Failed to load suggestions:", err);
      alert("⚠ Unable to load consumable suggestions.");
    }
  }

   // Handle autofill of price when user selects a known suggestion
function handleSuggestionSelect(input) {
  const selectedValue = input.value.trim();

  const matchedOption = Array.from(document.querySelectorAll('#itemSuggestions option'))
    .find(opt => opt.value === selectedValue);

  if (matchedOption) {
    const itemName = matchedOption.dataset.name;
    const price = parseFloat(matchedOption.dataset.price) || 0;

    // ✅ Set just the item name in input (hide price)
    input.value = itemName;

    // ✅ Autofill the price column
    const row = input.closest('tr');
    if (row && row.children[3]) {
      const priceInput = row.children[3].querySelector('input');
      priceInput.value = price.toFixed(2);
      priceInput.classList.remove('input-error'); // Clear red highlight from price field
      formatDecimal(priceInput);
      calculateTotals();
    }
  }
}

  async function createDraftInvoice() {
    try {
      const token = localStorage.getItem("access_token");

      // Step 1: Get next invoice ID
      const nextRes = await fetch(
        `${API_BASE}/billing-GetNextInvoiceId`,
        {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }
      );

      const nextData = await nextRes.json();
      const predictedId = nextData.nextInvoiceId;

      document.getElementById('billNo').value = predictedId;

      // Step 2: Create draft invoice
      const res = await fetch(
        `${API_BASE}/billing-CreateDraftInvoice`,
        {
          method: 'POST',
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }
      );

      const data = await res.json();
      currentInvoiceId = data.invoiceId;

      if (currentInvoiceId !== predictedId) {
        console.warn(`Mismatch: expected ${predictedId}, got ${currentInvoiceId}`);
        document.getElementById('billNo').value = currentInvoiceId;
      }

    } catch (err) {
      console.error(err);
      alert("Unable to create invoice. Try again.");
    }
  }

   async function finalizeInvoice() {
    const kmCovered = parseInt(document.getElementById('kmCovered').value) || 0;
    const consumables = [];
    document.querySelectorAll('#consumablesTable tbody tr').forEach(row => {
    const itemName = row.children[1].querySelector('input').value.trim();
    const quantity = parseFloat(row.children[2].querySelector('input').value) || 0;
    const price = parseFloat(row.children[3].querySelector('input').value) || 0;
    if (itemName && quantity > 0 && price >= 0) {
      consumables.push({ itemName, quantity, price });
    }
  });

  const services = [];
  document.querySelectorAll('#servicesTable tbody tr').forEach(row => {
    const serviceName = row.children[1].querySelector('input').value.trim();
    const charge = parseFloat(row.children[2].querySelector('input').value) || 0;
    if (serviceName && charge >= 0) {
      services.push({ serviceName, charge });
    }
  });
  
  if (hasDuplicateEntries()) return false;
  const hasPartial = cleanEmptyAndPartialRows();
  if (hasPartial) {
    showBalloon(`❌ Cannot print. Some rows are partially filled. Please correct them first.`, 3000, "error");
    return false; // 🚫 Stop Editing
  }
  if (!currentInvoiceId) {
    alert("Invoice ID not found. Please create the invoice first.");
    return false;
  }

  try {
  const vehicleNo = document.getElementById('vehicleNo').value.trim();
  const ownerNo = document.getElementById('ownerNo').value.trim(); // mobile no
  const kmCovered = parseInt(document.getElementById('kmCovered').value) || 0;

  const consumables = [];
  document.querySelectorAll('#consumablesTable tbody tr').forEach(row => {
    const itemName = row.children[1].querySelector('input').value.trim();
    const quantity = parseFloat(row.children[2].querySelector('input').value) || 0;
    const price = parseFloat(row.children[3].querySelector('input').value) || 0;
    if (itemName && quantity > 0 && price >= 0) {
      consumables.push({ itemName, quantity, price });
    }
  });

  const services = [];
  document.querySelectorAll('#servicesTable tbody tr').forEach(row => {
    const serviceName = row.children[1].querySelector('input').value.trim();
    const charge = parseFloat(row.children[2].querySelector('input').value) || 0;
    if (serviceName && charge >= 0) {
      services.push({ serviceName, charge });
    }
  });

  if (!currentInvoiceId || !vehicleNo || !ownerNo) {
    alert("❌ Please fill in Bill No, Vehicle No, and Mobile No.");
    return false;
  }
  document.getElementById('SubmitInvoiceOverlay').style.display = 'flex';

  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE}/billing-UpdateInvoiceDetails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      invoiceId: currentInvoiceId,
      vehicleNo,
      mobileNo: ownerNo,
      kmCovered,
      consumables,
      services
    })
  });

  const result = await response.json();
  if (response.ok) {
  showBalloon(`✅ Invoice ${currentInvoiceId} submitted successfully!`, 3000, "success");
  return true;
} else {
    console.error("API Error:", result);
    showBalloon(`❌ Error: ${result.error || "Unknown error"}`, 3000, "error");
    return false;
  }
} catch (err) {
  console.error("Unexpected Error:", err);
  showBalloon("⚠ Unexpected error occurred while submitting invoice.", 3000, "error");
  return false;
} finally {
    // Hide loading overlay
    document.getElementById('SubmitInvoiceOverlay').style.display = 'none';
  }
};

   async function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  // Get nav button elements
  const billingBtn = document.getElementById('billingBtn');
  const inventoryBtn = document.getElementById('inventoryBtn');
  const viewInvoiceBtn = document.getElementById('viewInvoiceBtn');
  const reportsBtn = document.getElementById('reportsBtn');
  const purchaseBtn = document.getElementById('purchaseOrderBtn');
  const goBottomBtn = document.getElementById('goToBottomBtn');

  // Reset all buttons to show first
  billingBtn.style.display = '';
  inventoryBtn.style.display = '';
  viewInvoiceBtn.style.display = '';
  reportsBtn.style.display = '';
  if (purchaseBtn) purchaseBtn.style.display = '';
  if (goBottomBtn) goBottomBtn.style.display = 'none';

  if (id === 'billing') {
    // In billing tab: only show inventory button
    billingBtn.style.display = 'none';
    viewInvoiceBtn.style.display = 'none';
    if (purchaseBtn) purchaseBtn.style.display = 'none';

    await loadItemSuggestions();

    // Load only when billing tab is clicked
    if (!currentInvoiceId) {
      await setTodayDate();
      await createDraftInvoice();
    }
  } else if (id === 'inventory') {
    // In inventory tab: only show billing button
    inventoryBtn.style.display = 'none';
    viewInvoiceBtn.style.display = 'none';
    if (purchaseBtn) purchaseBtn.style.display = '';
    if (goBottomBtn) goBottomBtn.style.display = 'inline-flex';

    // Load inventory when inventory tab is clicked
    await loadInventoryData();
  } else if (id === 'reports') {
    reportsBtn.style.display = 'none';
    if (purchaseBtn) purchaseBtn.style.display = 'none';

    if (typeof loadReportDashboard === 'function') {
      await loadReportDashboard(false);
    }
  } else if (id === 'dashboard') {
    // In home/dashboard: show all tabs
    // selectedInvoice persists unless explicitly cleared by reloadForNewBill or new invoice selection
    // All buttons are already visible from reset above
  }

  // Load Purchase Order inventory when purchase tab is selected
  if (id === 'purchase') {
    if (purchaseBtn) purchaseBtn.style.display = '';
    inventoryBtn.style.display = '';
    billingBtn.style.display = 'none';
    viewInvoiceBtn.style.display = 'none';
    reportsBtn.style.display = 'none';
    if (goBottomBtn) goBottomBtn.style.display = 'inline-flex';
    await loadPurchaseSection();
  }

  updateGoBottomButtonState();
}

    function formatDecimal(el) {
      let val = parseFloat(el.value);
      if (!isNaN(val)) {
        el.value = val.toFixed(2);
      }
    }

    function formatCurrency(num) {
      return parseFloat(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function calculateTotals() {
      let consumableSubtotal = 0;
      document.querySelectorAll('#consumablesTable tbody tr').forEach((row, i) => {
        row.children[0].textContent = i + 1;
        const qty = parseFloat(row.children[2].children[0].value) || 0;
        const price = parseFloat(row.children[3].children[0].value) || 0;
        const total = qty * price;
        row.children[4].children[0].value = total.toFixed(2);
        consumableSubtotal += total;
      });
      document.getElementById('consumableSubtotal').textContent = formatCurrency(consumableSubtotal);

      let serviceSubtotal = 0;
      document.querySelectorAll('#servicesTable tbody tr').forEach((row, i) => {
        row.children[0].textContent = i + 1;
        const charge = parseFloat(row.children[2].children[0].value) || 0;
        serviceSubtotal += charge;
      });
      document.getElementById('serviceSubtotal').textContent = formatCurrency(serviceSubtotal);
      document.getElementById('grandTotal').textContent = formatCurrency(consumableSubtotal + serviceSubtotal);
    }

    function addRow(tableId) {
  const tbody = document.getElementById(tableId).querySelector("tbody");
  const rows = tbody.querySelectorAll("tr");

  // Check last row for required fields
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    const itemName = lastRow.children[1].querySelector('input').value.trim();
    const qty = lastRow.children[2].querySelector('input').value.trim();
    const price = lastRow.children[3].querySelector('input').value.trim();

    if (!itemName || !qty || !price) {
  if (!itemName) lastRow.children[1].querySelector('input').classList.add("input-error");
  if (!qty) lastRow.children[2].querySelector('input').classList.add("input-error");
  if (!price) lastRow.children[3].querySelector('input').classList.add("input-error");
  alert("Please complete the previous item entry (Name, Qty, Price) before adding a new one.");
  return;
}
  }

  // Add new row
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td></td>
    <td><input type="text" list="itemSuggestions" style="width: 100%;" 
    oninput="handleSuggestionSelect(this); calculateTotals(); this.classList.remove('input-error')" onchange="handleSuggestionSelect(this)"></td>
    <td><input type="number" class="qty-input" min="1" max="999" value="1" oninput="validateQty(this);this.classList.remove('input-error');calculateTotals()"></td>
    <td><input type="number" class="price-input" oninput="calculateTotals(); this.classList.remove('input-error')" onblur="formatDecimal(this)"></td>
    <td><input type="number" readonly></td>
    <td><button class="delete-btn" onclick="this.parentElement.parentElement.remove(); calculateTotals()">Delete</button></td>
  `;
  tbody.appendChild(tr);
  calculateTotals();
  tr.children[1].querySelector('input').focus();
}

function validateQty(input) {
  const val = parseInt(input.value);
  if (isNaN(val) || val < 1) {
    input.value = 1;
  } else if (val > 999) {
    input.value = 999;
  }
}

    function addServiceRow(tableId) {
  const tbody = document.getElementById(tableId).querySelector("tbody");
  const rows = tbody.querySelectorAll("tr");

  // Check last row for required fields
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    const serviceName = lastRow.children[1].querySelector('input').value.trim();
    const charge = lastRow.children[2].querySelector('input').value.trim();

    if (!serviceName || !charge) {
  if (!serviceName) lastRow.children[1].querySelector('input').classList.add("input-error");
  if (!charge) lastRow.children[2].querySelector('input').classList.add("input-error");
  alert("Please complete the previous service entry (Name and Charge) before adding a new one.");
  return;
}}

  // Add new service row
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td></td>
    <td><input type="text" style="width: 100%;" 
  oninput="calculateTotals(); this.classList.remove('input-error')"></td>
<td><input type="number" 
  oninput="calculateTotals(); this.classList.remove('input-error')" 
  onblur="formatDecimal(this)"></td>
    <td><button class="delete-btn" onclick="this.parentElement.parentElement.remove(); calculateTotals()">Delete</button></td>
  `;
  tbody.appendChild(tr);
  calculateTotals();
}

// Print
async function prepareAndPrint() {
  const selected = JSON.parse(localStorage.getItem("selectedInvoice"));
  const token = localStorage.getItem("access_token"); //
  const pdfOverlay = document.getElementById('PdfGenerationOverlay');

  if (!selected) {
    alert("No invoice selected");
    return;
  }

  if (!token) {
    alert("Missing authentication token");
    return;
  }

  try {
    if (pdfOverlay) {
      pdfOverlay.style.display = 'flex';
    }

    const response = await fetch(`${API_BASE}/billing-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        invoice: selected
      })
    });

    if (!response.ok) {
      alert("PDF generation failed");
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice_${selected.InvoiceID}.pdf`;
    a.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  } finally {
    if (pdfOverlay) {
      pdfOverlay.style.display = 'none';
    }
  }
}

function cleanEmptyAndPartialRows() {
  let foundPartial = false;

  // ✅ Clean consumables
    document.querySelectorAll('#consumablesTable tbody tr').forEach(row => {
    const nameInput = row.children[1]?.querySelector('input');
    const priceInput = row.children[3]?.querySelector('input');

    const name = nameInput?.value.trim();
    const price = priceInput?.value.trim();

    const isEmpty = !name && !price;
    const isPartial = (name && !price) || (!name && price);

    if (isEmpty) {
      row.remove();
    } else if (isPartial) {
      if (!name) nameInput?.classList.add('input-error');
      if (!price) priceInput?.classList.add('input-error');
      foundPartial = true;
    }
  });

  // ✅ Clean services
    document.querySelectorAll('#servicesTable tbody tr').forEach(row => {
    const nameInput = row.children[1]?.querySelector('input');
    const chargeInput = row.children[2]?.querySelector('input');

    const name = nameInput?.value.trim();
    const charge = chargeInput?.value.trim();

    const isEmpty = !name && !charge;
    const isPartial = (name && !charge) || (!name && charge);

    if (isEmpty) {
      row.remove();
    } else if (isPartial) {
      if (!name) nameInput?.classList.add('input-error');
      if (!charge) chargeInput?.classList.add('input-error');
      foundPartial = true;
    }
  });

  return foundPartial;
}

// window.onafterprint = () => {
//   document.title = originalTitle;

//   const dateInput = document.getElementById("date");
//   const dateText = document.getElementById("dateText");

//   if (dateInput && dateText) {
//     dateInput.style.display = "inline-block";
//     dateText.style.display = "none";
//     dateText.textContent = ""; // Clear the printed date
//   }
// };

// function formatPrintDate() {
//   const dateInput = document.getElementById('date');
//   const dateText = document.getElementById('dateText');
//   const dateValue = dateInput.value;

//   if (dateValue) {
//     const [year, month, day] = dateValue.split("-");
//     dateText.textContent = `${day}-${month}-${year}`;
//   }
// }

function clearBillingPage() {
  // Keep only Bill No and Date, clear other inputs
  const inputs = document.querySelectorAll('#billing input');
  inputs.forEach(input => {
    if (input.id !== 'billNo' && input.id !== 'date') {
      input.value = '';
    }
  });

  // Clear item table rows (consumables or services)
  const tbody = document.querySelector('#consumablesTable tbody');
  if (tbody) tbody.innerHTML = '';

  const serviceTbody = document.querySelector('#servicesTable tbody');
  if (serviceTbody) serviceTbody.innerHTML = '';
  // Hide printed date text if used
  const dateText = document.getElementById('dateText');
  if (dateText) dateText.style.display = 'none';

  // ✅ Reset totals if they exist
  const totalIds = ['consumableTotal', 'serviceTotal', 'grandTotal', 'advanceAmount', 'balanceAmount'];
  totalIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Optionally call recalculate totals if needed
  if (typeof calculateTotals === 'function') {
    calculateTotals();
  }
}
function reloadForNewBill() {
  if (confirm("Start a new bill? Unsaved data will be lost.")) {
    clearBillingPage(); // Clear fields
    // Show loading overlay
    document.getElementById('NewInvoiceOverlay').style.display = 'flex';
    localStorage.removeItem("selectedInvoice");
    VIEW_MODE = false;
    setupSubmitButton()
    // Generate new bill number and reload suggestions
    createDraftInvoice()
      .then(() => {
        loadItemSuggestions();
      })
      .catch(err => {
        console.error("Failed to create new draft invoice:", err);
        alert("❌ Error while starting a new bill.");
      })
      .finally(() => {
        // Hide loading overlay
        document.getElementById('NewInvoiceOverlay').style.display = 'none';
      });
  }
}
// Duplicate Check Function
function hasDuplicateEntries() {
  const consumableDup = hasDuplicateConsumables();
  const serviceDup = hasDuplicateServicesByTotal();

  if (consumableDup || serviceDup) {
    let msg = "⚠️ Duplicate ";
    if (consumableDup && serviceDup) {
      msg += "consumables and services found.";
    } else if (consumableDup) {
      msg += "consumables found.";
    } else {
      msg += "services found.";
    }

    showBalloon(msg, 3000, "error");
    return true;
  }

  return false;
}

// Check for duplicate consumables by name and price
function hasDuplicateConsumables() {
  const seen = new Set();
  let duplicateFound = false;

  document.querySelectorAll('#consumablesTable tbody tr').forEach(row => {
    const name = row.children[1]?.querySelector('input')?.value.trim().toLowerCase();
    const price = row.children[3]?.querySelector('input')?.value.trim();

    if (name && price) {
      const key = `${name}|${price}`;  // ✅ checking for exact match (name + price)
      if (seen.has(key)) {
        row.style.backgroundColor = '#ffd6d6'; // highlight duplicate
        duplicateFound = true;
      } else {
        seen.add(key);
        row.style.backgroundColor = ''; // reset style
      }
    }
  });
  return duplicateFound;
}

// Check for duplicate services by name and charge
function hasDuplicateServicesByTotal() {
  const seen = new Set();
  let duplicateFound = false;

  document.querySelectorAll('#servicesTable tbody tr').forEach(row => {
    const name = row.children[1]?.querySelector('input')?.value.trim().toLowerCase();
    const charge = parseFloat(row.children[2]?.querySelector('input')?.value || 0);

    if (name && charge > 0) {
      const key = `${name}|${charge}`; 
      if (seen.has(key)) {
        row.style.backgroundColor = '#ffd6d6'; 
        duplicateFound = true;
      } else {
        seen.add(key);
        row.style.backgroundColor = '';
      }
    }
  });

  return duplicateFound;
}


function showBalloon(message, duration = 3000, type = "error") {
  const balloon = document.getElementById("balloonMsg");
  if (!balloon) return;

  // Remove any previous type class
  balloon.className = "";
  balloon.classList.add(type); // 'success' or 'error'

  balloon.textContent = message;
  balloon.style.opacity = "1";
  balloon.style.transform = "translateX(-50%) translateY(0)";

  setTimeout(() => {
    balloon.style.opacity = "0";
    balloon.style.transform = "translateX(-50%) translateY(20px)";
  }, duration);
}
//QR code generation
function showFullScreenQR() {
  const overlay = document.getElementById('qrOverlay');
  const qrContainer = document.getElementById('qrFullScreen');
  qrContainer.innerHTML = '';

  const grandTotalText = document.getElementById('grandTotal')?.textContent || '';
  const amount = parseFloat(grandTotalText.replace(/[^0-9.]/g, '')) || 0;

  const formattedAmount = Number.isInteger(amount)
    ? amount.toString()
    : amount.toFixed(2);

  const upiURL = `upi://pay?pa=9400109413@yescred&pn=BillingShop&am=${formattedAmount}&cu=INR`;

  new QRCode(qrContainer, {
    text: upiURL,
    width: 300,
    height: 300,
  });

  overlay.style.display = 'flex';
}

function hideFullScreenQR() {
  document.getElementById('qrOverlay').style.display = 'none';
}

// Inventory Management Functions
let inventoryItemCounter = 1;

function addItemInputRow() {
  const container = document.getElementById('itemInputs');
  const currentRows = container.querySelectorAll('.item-input-row');
  
  // Validate the last row before adding a new one
  if (currentRows.length > 0) {
    const lastRow = currentRows[currentRows.length - 1];
    const nameInput = lastRow.querySelector('.item-name-input');
    const priceInput = lastRow.querySelector('.item-price-input');
    
    const itemName = nameInput.value.trim();
    const itemPrice = priceInput.value.trim();
    
    // Check if both fields are filled
    if (!itemName || !itemPrice) {
      // Clear any previous error styling
      nameInput.classList.remove('input-error');
      priceInput.classList.remove('input-error');
      
      // Add error styling to empty fields
      if (!itemName) {
        nameInput.classList.add('input-error');
        nameInput.focus();
      }
      if (!itemPrice) {
        priceInput.classList.add('input-error');
        if (!itemName) priceInput.focus(); // Focus price if name is also empty
      }
      
      showBalloon('❌ Please fill in both item name and price before adding a new row.', 3000, 'error');
      return;
    }
    
    // Clear any error styling from the completed row
    nameInput.classList.remove('input-error');
    priceInput.classList.remove('input-error');
  }
  
  inventoryItemCounter++;
  const newRow = document.createElement('div');
  newRow.className = 'item-input-row';
  newRow.innerHTML = `
    <input type="text" id="itemName_${inventoryItemCounter}" placeholder="Item Name" class="item-name-input" oninput="clearErrorStyling(this)">
    <input type="text" id="itemCode_${inventoryItemCounter}" placeholder="Item Code" class="item-code-input" oninput="clearErrorStyling(this)">
    <input type="number" id="itemPrice_${inventoryItemCounter}" placeholder="Price" step="0.01" min="0" class="item-price-input" oninput="clearErrorStyling(this)">
    <button type="button" onclick="addItemInputRow()" class="add-item-btn">+</button>
    <button type="button" onclick="removeItemInputRow(this)" class="remove-item-btn">-</button>
  `;
  container.appendChild(newRow);
  
  updateButtonVisibility();
  
  // Focus on the new item name input
  document.getElementById(`itemName_${inventoryItemCounter}`).focus();
}

function clearErrorStyling(input) {
  input.classList.remove('input-error');
}

function updateButtonVisibility() {
  const rows = document.querySelectorAll('.item-input-row');
  
  // Hide all + buttons first
  document.querySelectorAll('.add-item-btn').forEach(btn => {
    btn.style.display = 'none';
  });
  
  // Show + button only on the last row
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    const addBtn = lastRow.querySelector('.add-item-btn');
    if (addBtn) addBtn.style.display = 'flex';
  }
  
  // Handle - button visibility
  document.querySelectorAll('.remove-item-btn').forEach((btn, index) => {
    // Show - button on all rows except when there's only one row
    btn.style.display = rows.length > 1 ? 'flex' : 'none';
  });
}

function removeItemInputRow(button) {
  const row = button.closest('.item-input-row');
  const container = document.getElementById('itemInputs');
  
  if (container.children.length > 1) {
    row.remove();
    updateButtonVisibility();
  }
}

async function saveInventoryItems() {
  const items = [];
  const rows = document.querySelectorAll('.item-input-row');

  // Collect all items from input rows
  rows.forEach((row) => {
    const nameInput = row.querySelector('.item-name-input');
    const priceInput = row.querySelector('.item-price-input');
    
    const name = nameInput.value.trim();
    const codeInput = row.querySelector('.item-code-input');
    const code = codeInput ? codeInput.value.trim() : null;
    const price = parseFloat(priceInput.value);
    
    if (name && !isNaN(price) && price >= 0) {
      items.push({ name, price, code });
      
      // Clear the inputs after collecting
      nameInput.value = '';
      priceInput.value = '';
    }
  });
  
  if (items.length === 0) {
    showBalloon('❌ Please enter at least one item with name and price.', 3000, 'error');
    return;
  }

  // ✅ Only show spinner when we are ready to send valid items
  document.getElementById('inventory-spinner').style.display = 'grid'; 

  try {
    const token = localStorage.getItem("access_token");
    if (!token) {
      showBalloon('❌ Authentication required. Please login first.', 3000, 'error');
      document.getElementById('inventory-spinner').style.display = 'none';
      return;
    }

    const response = await fetch(`${API_BASE}/billing-inventory-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ items })
    });
    
    const result = await response.json();
    document.getElementById('inventory-spinner').style.display = 'none'; // Hide spinner after saving

    if (response.ok) {
      showInventorySaveSummary(result);
      
      // Reset input rows
      document.getElementById('itemInputs').innerHTML = `
        <div class="item-input-row">
          <input type="text" id="itemName_1" placeholder="Item Name" class="item-name-input" oninput="clearErrorStyling(this)">
          <input type="text" id="itemCode_1" placeholder="Item Code" class="item-code-input" oninput="clearErrorStyling(this)">
          <input type="number" id="itemPrice_1" placeholder="Price" step="0.01" min="0" class="item-price-input" oninput="clearErrorStyling(this)">
          <button type="button" onclick="addItemInputRow()" class="add-item-btn">+</button>
          <button type="button" onclick="removeItemInputRow(this)" class="remove-item-btn" style="display: none;">-</button>
        </div>
      `;
      inventoryItemCounter = 1;

      // Reload inventory and billing suggestions
      await loadInventoryData();
    } else {
      showBalloon(`❌ Error: ${result.error || 'Failed to save items'}`, 3000, 'error');
    }
  } catch (error) {
    console.error('Error saving inventory items:', error);
    showBalloon('❌ Network error. Please try again.', 3000, 'error');
    document.getElementById('inventory-spinner').style.display = 'none'; // ensure hidden on error
  }
}

function showInventorySaveSummary(result) {
  const oldDialog = document.querySelector('.inventory-save-summary-dialog');
  if (oldDialog) oldDialog.remove();

  const overlay = document.createElement('div');
  overlay.className = 'inventory-save-summary-dialog';

  const duplicateItems = Array.isArray(result.duplicateItems) ? result.duplicateItems : [];
  const addedItems = Array.isArray(result.addedItems) ? result.addedItems : [];

  function formatItemPrice(price) {
    const numericPrice = parseFloat(price);
    if (Number.isNaN(numericPrice)) return '';
    return `₹${numericPrice.toFixed(2)}`;
  }

  const duplicateList = duplicateItems.map((item, index) => {
    const code = item.code ? `[${escapeHtml(item.code)}] ` : '';
    const price = formatItemPrice(item.price);
    return `<div class="inventory-summary-item"><span class="inventory-summary-index">${index + 1}</span><span class="inventory-summary-text">${code}${escapeHtml(item.name || '')}${price ? ` <span class="inventory-summary-price">(${escapeHtml(price)})</span>` : ''}</span></div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="inventory-save-summary-card" role="dialog" aria-modal="true" aria-labelledby="inventorySaveSummaryTitle">
      <div class="inventory-save-summary-badge">Save complete</div>
      <h3 id="inventorySaveSummaryTitle">Inventory save summary</h3>
      <div class="inventory-save-summary-stats">
        <div class="inventory-save-summary-stat success">
          <span class="label">Added</span>
          <span class="value">${result.addedCount || 0}</span>
        </div>
        <div class="inventory-save-summary-stat warning">
          <span class="label">Duplicate</span>
          <span class="value">${result.duplicateCount || 0}</span>
        </div>
      </div>
      <div class="inventory-save-summary-body">
        <div class="inventory-save-summary-section">
          <div class="inventory-save-summary-section-title">Added items</div>
          <div class="inventory-save-summary-list">
            ${(addedItems.length ? addedItems.map((item, index) => {
              const code = item.code ? `<strong>[${escapeHtml(item.code)}]</strong> ` : '';
              const price = formatItemPrice(item.price);
              return `<div class="inventory-summary-item"><span class="inventory-summary-index">${index + 1}</span><span class="inventory-summary-text">${code}${escapeHtml(item.name || '')}${price ? ` <span class="inventory-summary-price">(${escapeHtml(price)})</span>` : ''}</span></div>`;
            }).join('') : '<div class="inventory-save-summary-empty">No items added.</div>')}
          </div>
        </div>
        <div class="inventory-save-summary-section">
          <div class="inventory-save-summary-section-title">Duplicate items</div>
          <div class="inventory-save-summary-list">
            ${duplicateList || '<div class="inventory-save-summary-empty">No duplicate items found.</div>'}
          </div>
        </div>
      </div>
      <div class="inventory-save-summary-actions">
        <button type="button" class="inventory-save-summary-close">Close</button>
      </div>
    </div>
  `;

  const closeDialog = () => overlay.remove();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDialog();
  });
  overlay.querySelector('.inventory-save-summary-close')?.addEventListener('click', closeDialog);

  document.body.appendChild(overlay);
}


async function loadInventoryData() {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) {
      showBalloon('❌ Authentication required. Please login first.', 3000, 'error');
      return;
    }

    const response = await fetch(`${API_BASE}/billing-inventory-get`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const result = await response.json();
    
    if (response.ok) {
      displayInventoryItems(result.items);
    } else {
      console.error('Error loading inventory:', result.error);
      showBalloon('❌ Failed to load inventory data', 3000, 'error');
    }
  } catch (error) {
    console.error('Error loading inventory:', error);
    showBalloon('❌ Network error while loading inventory', 3000, 'error');
  }
}

// Load inventory for Purchase Order section
async function loadPurchaseSection() {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) {
      showBalloon('❌ Authentication required. Please login first.', 3000, 'error');
      return;
    }

    const previousState = capturePurchaseSelectionState();

    const response = await fetch(`${API_BASE}/billing-inventory-get`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await response.json();
    if (response.ok) {
      displayInventoryForPurchase(result.items, previousState);
      const searchInput = document.getElementById('purchaseSearch');
      if (searchInput) searchInput.value = '';
    } else {
      showBalloon('❌ Failed to load inventory for purchase', 3000, 'error');
    }
  } catch (err) {
    console.error(err);
    showBalloon('❌ Network error while loading purchase inventory', 3000, 'error');
  }
}

function buildPurchaseItemKey(item = {}) {
  const itemId = item.ItemID || item.itemId || '';
  if (itemId) return String(itemId);

  const itemCode = (item.ItemCode || '').trim().toLowerCase();
  const itemName = (item.ItemName || '').trim().toLowerCase();
  const itemPrice = String(item.Price ?? '').trim().toLowerCase();
  return `${itemCode}|${itemName}|${itemPrice}`;
}

function capturePurchaseSelectionState() {
  const state = new Map();
  document.querySelectorAll('#purchaseTable tbody tr').forEach(row => {
    const checkbox = row.querySelector('.po-select');
    const qtyInput = row.cells[4]?.querySelector('input');
    const itemKey = row.dataset.itemKey || checkbox?.dataset.id || '';

    if (!itemKey) return;

    state.set(itemKey, {
      checked: !!checkbox?.checked,
      qty: qtyInput?.value || '1'
    });
  });
  return state;
}

// Build printable purchase order and trigger print
function openPurchaseOrderPrint() {
  const checked = Array.from(document.querySelectorAll('#purchaseTable tbody .po-select:checked'));
  if (checked.length === 0) {
    showBalloon('❌ Select at least one item to create purchase order', 3000, 'error');
    return;
  }

  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = now.getFullYear();
  const time = now.toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const dateTimeText = `${day}/${month}/${year} ${time}`;

  const items = checked.map(cb => {
    const tr = cb.closest('tr');
    const code = tr.cells[2].textContent.trim();
    const name = tr.cells[3].textContent.trim();
    const qtyInput = tr.cells[5].querySelector('input');
    const qty = parseInt(qtyInput?.value, 10) || 1;
    return { code, name, qty };
  });

  // Build simple printable HTML
  let html = `<html><head><title>Purchase Order</title>`;
  html += `<style>body{font-family: Arial, sans-serif;padding:24px;color:#222} .po-header{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:18px} .po-title{font-size:24px;font-weight:700;letter-spacing:1px} .po-datetime{font-size:13px;color:#555} table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4} .po-summary{margin-top:16px;display:flex;justify-content:flex-end;font-weight:700;break-inside:avoid;page-break-inside:avoid} .po-summary-box{min-width:220px;padding:10px 14px;border:1px solid #ddd;border-radius:8px;background:#fafafa}</style>`;
  html += `</head><body>`;
  html += `<div class="po-header"><div class="po-title">REBORN PURCHASE ORDER</div><div class="po-datetime">Date &amp; Time: ${dateTimeText}</div></div>`;
  html += `<table><thead><tr><th>#</th><th>Item Code</th><th>Item Name</th><th>Qty</th></tr></thead><tbody>`;
  let totalQty = 0;
  items.forEach((it, index) => { totalQty += it.qty; html += `<tr><td>${index + 1}</td><td>${it.code}</td><td>${it.name}</td><td>${it.qty}</td></tr>`; });
  html += `</tbody></table>`;
  html += `<div class="po-summary"><div class="po-summary-box">Total Qty: ${totalQty}</div></div>`;
  html += `</body></html>`;

  const existingFrame = document.getElementById('purchaseOrderPrintFrame');
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'purchaseOrderPrintFrame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  let printTriggered = false;
  iframe.onload = () => {
    if (printTriggered) return;
    try {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) return;
      printTriggered = true;
      window.setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            frameWindow.focus();
            frameWindow.print();
          });
        });
      }, 50);
    } catch (error) {
      console.error('Purchase order print failed:', error);
      showBalloon('❌ Unable to open print dialog on this device', 3000, 'error');
    } finally {
      window.setTimeout(() => iframe.remove(), 1000);
    }
  };

  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    showBalloon('❌ Unable to prepare print view', 3000, 'error');
    return;
  }

  iframe.srcdoc = html;
}

function goToBottom() {
  if (isAtPageBottom()) {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    return;
  }

  const target = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight,
    document.body.clientHeight,
    document.documentElement.clientHeight
  );

  window.scrollTo({
    top: target,
    behavior: 'smooth'
  });
}

function isAtPageBottom() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  return scrollTop + viewportHeight >= pageHeight - 8;
}

function updateGoBottomButtonState() {
  const button = document.getElementById('goToBottomBtn');
  if (!button) return;

  const visibleSection = document.querySelector('.section.active')?.id;
  const shouldShow = visibleSection === 'inventory' || visibleSection === 'purchase';
  button.style.display = shouldShow ? 'inline-flex' : 'none';
  const atBottom = isAtPageBottom();
  button.textContent = atBottom ? 'Go Top' : 'Go Bottom';
  button.classList.toggle('go-bottom-btn-top', atBottom);
}

window.addEventListener('scroll', () => {
  updateGoBottomButtonState();
}, { passive: true });

window.addEventListener('resize', () => {
  updateGoBottomButtonState();
});

function displayInventoryItems(items) {
  const tbody = document.querySelector('#inventoryTable tbody');
  tbody.innerHTML = '';
  
  items.forEach((item, index) => {
    const row = document.createElement('tr');
    const itemCode = item.ItemCode || '';
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${itemCode}</td>
      <td>${item.ItemName}</td>
      <td>₹${parseFloat(item.Price).toFixed(2)}</td>
      <td>${item.UsedInBills || 0}</td>
      <td>
        <button onclick="deleteInventoryItem('${item.ItemName.replace(/'/g,"\\'")}', ${item.Price}, ${item.UsedInBills || 0})" 
                class="inventory-delete-btn" 
                ${(item.UsedInBills > 0) ? 'title="Item used in bills - click for details"' : ''}>
          Delete
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Display inventory in Purchase Order section (with checkbox selection)
function displayInventoryForPurchase(items, previousState = new Map()) {
  const tbody = document.querySelector('#purchaseTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  items.forEach((item, index) => {
    const row = document.createElement('tr');
    const code = item.ItemCode || '';
    const itemKey = buildPurchaseItemKey(item);
    const previousEntry = previousState instanceof Map ? previousState.get(itemKey) : null;
    const isChecked = previousEntry ? previousEntry.checked : false;
    const qtyValue = previousEntry?.qty || '1';
    const priceText = formatPurchasePrice(item.Price);
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><input type="checkbox" class="po-select" data-id="${item.ItemID || ''}" ${isChecked ? 'checked' : ''}></td>
      <td>${code}</td>
      <td>${item.ItemName}</td>
      <td><span class="purchase-item-price">${escapeHtml(priceText)}</span></td>
      <td><input type="number" min="1" value="${escapeHtml(qtyValue)}" style="width: 70px; padding: 4px 6px;"></td>
    `;
    row.dataset.itemKey = itemKey;
    row.dataset.itemCode = code.toLowerCase();
    row.dataset.itemName = (item.ItemName || '').toLowerCase();
    tbody.appendChild(row);
  });
}

function formatPurchasePrice(price) {
  const numericPrice = parseFloat(price);
  if (Number.isNaN(numericPrice)) return '';
  return `₹${numericPrice.toFixed(2)}`;
}

function filterPurchaseItems() {
  const searchValue = document.getElementById('purchaseSearch')?.value.trim().toLowerCase() || '';
  const rows = document.querySelectorAll('#purchaseTable tbody tr');

  rows.forEach(row => {
    const itemCode = row.dataset.itemCode || '';
    const itemName = row.dataset.itemName || '';
    const matches = !searchValue || itemCode.includes(searchValue) || itemName.includes(searchValue);
    row.style.display = matches ? '' : 'none';
  });
}

function selectVisiblePurchaseItems() {
  const rows = document.querySelectorAll('#purchaseTable tbody tr');

  rows.forEach(row => {
    if (row.style.display !== 'none') {
      const checkbox = row.querySelector('.po-select');
      if (checkbox) checkbox.checked = true;
    }
  });
}

function toggleVisiblePurchaseItems() {
  const rows = Array.from(document.querySelectorAll('#purchaseTable tbody tr'));
  const visibleRows = rows.filter(row => row.style.display !== 'none');
  if (visibleRows.length === 0) return;

  const visibleCheckboxes = visibleRows.map(row => row.querySelector('.po-select')).filter(Boolean);
  const checkedCount = visibleCheckboxes.filter(checkbox => checkbox.checked).length;
  const allVisibleChecked = checkedCount === visibleCheckboxes.length;
  const someVisibleChecked = checkedCount > 0;

  if (allVisibleChecked) {
    showPurchaseDeselectDialog(visibleRows);
    return;
  }

  if (someVisibleChecked) {
    showPurchaseSelectAllDialog(visibleRows);
    return;
  }

  visibleRows.forEach(row => {
    const checkbox = row.querySelector('.po-select');
    if (checkbox) checkbox.checked = !allVisibleChecked;
  });
}

function showPurchaseSelectAllDialog(visibleRows) {
  const oldDialog = document.querySelector('.purchase-deselect-dialog');
  if (oldDialog) oldDialog.remove();

  const overlay = document.createElement('div');
  overlay.className = 'purchase-deselect-dialog';

  const selectedItems = [];
  const newItems = [];

  visibleRows.forEach((row, index) => {
    const code = row.cells[2]?.textContent.trim() || '';
    const name = row.cells[3]?.textContent.trim() || '';
    const label = `${code ? `[${escapeHtml(code)}] ` : ''}${escapeHtml(name)}`;
    const checkbox = row.querySelector('.po-select');
    const itemHtml = `
      <div class="purchase-deselect-item">
        <span class="purchase-deselect-index">${index + 1}</span>
        <span class="purchase-deselect-text">${label}</span>
      </div>
    `;

    if (checkbox?.checked) {
      selectedItems.push(itemHtml);
    } else {
      newItems.push(itemHtml);
    }
  });

  overlay.innerHTML = `
    <div class="purchase-deselect-card" role="dialog" aria-modal="true" aria-labelledby="purchaseSelectAllTitle">
      <div class="purchase-deselect-badge">Confirm add</div>
      <h3 id="purchaseSelectAllTitle">Add the remaining visible items?</h3>
      <p class="purchase-deselect-message">Some items in the filtered list are already selected. Do you want to add the new visible items along with the existing selected items?</p>
      <div class="purchase-deselect-actions purchase-deselect-actions-top">
        <button type="button" class="purchase-deselect-cancel">Cancel</button>
        <button type="button" class="purchase-deselect-confirm">Add Visible Items</button>
      </div>
      <div class="purchase-deselect-body">
        <div class="purchase-deselect-section">
          <div class="purchase-deselect-section-title">Already selected in this filtered list</div>
          <div class="purchase-deselect-list">
            ${selectedItems.join('') || '<div class="purchase-deselect-empty">No visible items are currently selected.</div>'}
          </div>
        </div>
        <div class="purchase-deselect-section">
          <div class="purchase-deselect-section-title">New items to add</div>
          <div class="purchase-deselect-list">
            ${newItems.join('') || '<div class="purchase-deselect-empty">No new visible items to add.</div>'}
          </div>
        </div>
      </div>
    </div>
  `;

  const closeDialog = () => overlay.remove();

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDialog();
  });

  overlay.querySelector('.purchase-deselect-cancel')?.addEventListener('click', closeDialog);
  overlay.querySelector('.purchase-deselect-confirm')?.addEventListener('click', () => {
    visibleRows.forEach(row => {
      const checkbox = row.querySelector('.po-select');
      if (checkbox) checkbox.checked = true;
    });
    closeDialog();
  });

  document.body.appendChild(overlay);
}

function showPurchaseDeselectDialog(visibleRows) {
  const oldDialog = document.querySelector('.purchase-deselect-dialog');
  if (oldDialog) oldDialog.remove();

  const overlay = document.createElement('div');
  overlay.className = 'purchase-deselect-dialog';

  const listItems = visibleRows.map((row, index) => {
    const code = row.cells[2]?.textContent.trim() || '';
    const name = row.cells[3]?.textContent.trim() || '';
    const checkboxId = `purchase-deselect-${index}`;
    return `
      <label class="purchase-deselect-item" for="${checkboxId}">
        <span class="purchase-deselect-index">${index + 1}</span>
        <input id="${checkboxId}" type="checkbox" class="purchase-deselect-checkbox" data-row-index="${index}" checked>
        <span class="purchase-deselect-text">${code ? `<strong>[${escapeHtml(code)}]</strong> ` : ''}${escapeHtml(name)}</span>
      </label>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="purchase-deselect-card" role="dialog" aria-modal="true" aria-labelledby="purchaseDeselectTitle">
      <div class="purchase-deselect-badge">Confirm action</div>
      <h3 id="purchaseDeselectTitle">Choose items to deselect</h3>
      <p class="purchase-deselect-message">Uncheck any items you want to keep selected. The checked items below will be deselected when you confirm.</p>
      <div class="purchase-deselect-body">
        <div class="purchase-deselect-list">
          ${listItems}
        </div>
      </div>
      <div class="purchase-deselect-actions">
        <button type="button" class="purchase-deselect-cancel">Cancel</button>
        <button type="button" class="purchase-deselect-confirm">Deselect Selected</button>
      </div>
    </div>
  `;

  const closeDialog = () => overlay.remove();

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDialog();
  });

  overlay.querySelector('.purchase-deselect-cancel')?.addEventListener('click', closeDialog);
  overlay.querySelector('.purchase-deselect-confirm')?.addEventListener('click', () => {
    const selectedCheckboxes = Array.from(overlay.querySelectorAll('.purchase-deselect-checkbox:checked'));
    const deselectedIndices = new Set(selectedCheckboxes.map(cb => Number(cb.dataset.rowIndex)));

    visibleRows.forEach((row, index) => {
      if (deselectedIndices.has(index)) {
        const checkbox = row.querySelector('.po-select');
        if (checkbox) checkbox.checked = false;
      }
    });
    closeDialog();
  });

  document.body.appendChild(overlay);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function deleteInventoryItem(itemName, price, usedInBills) {
  if (usedInBills > 0) {
    showWarningDialog(
      `Warning: Item "${itemName}" has been used in ${usedInBills} bill(s).`,
      'This item cannot be deleted because it has been used in invoice. Deleting it may affect existing invoices.',
      () => {
        performDeleteInventoryItem(itemName, price);
      }
    );
  } else {
    showWarningDialog(
      `Delete Item`,
      `Are you sure you want to delete "${itemName}" from inventory?`,
      () => {
        performDeleteInventoryItem(itemName, price);
      }
    );
  }
}


async function performDeleteInventoryItem(itemName, price) {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) {
      showBalloon('❌ Authentication required. Please login first.', 3000, 'error');
      return;
    }
    document.getElementById('inventory-spinner').style.display = 'grid'; // Show spinner while saving
    // Perform the delete request
    const response = await fetch(`${API_BASE}/billing-inventory-delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        itemName, 
        price 
      })
    });
    
    const result = await response.json();
    document.getElementById('inventory-spinner').style.display = 'none'; // Show spinner while saving
    if (response.ok) {
      showBalloon(`✅ Item "${itemName}" deleted successfully!`, 3000, 'success');
      
      // Reload inventory data
      await loadInventoryData();
    } else {
      showBalloon(`❌ Error: ${result.error || 'Failed to delete item'}`, 3000, 'error');
    }
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    showBalloon('❌ Network error. Please try again.', 3000, 'error');
  }
}

function showWarningDialog(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'warning-dialog';
  overlay.innerHTML = `
    <div class="warning-content">
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="warning-buttons">
        <button class="warning-cancel" onclick="this.closest('.warning-dialog').remove()">Cancel</button>
        <button class="warning-ok" onclick="this.closest('.warning-dialog').remove(); window.confirmDelete()">Delete Anyway</button>
      </div>
    </div>
  `;
  
  // Store the confirm function globally so the button can access it
  window.confirmDelete = onConfirm;
  
  document.body.appendChild(overlay);
}

function filterInventory() {
  const searchTerm = document.getElementById('inventorySearch').value.toLowerCase();
  const rows = document.querySelectorAll('#inventoryTable tbody tr');

  rows.forEach(row => {
    const itemCode = (row.cells[0]?.textContent || '').toLowerCase();
    const itemName = (row.cells[1]?.textContent || '').toLowerCase();
    const price = (row.cells[2]?.textContent || '').toLowerCase();

    if (itemCode.includes(searchTerm) || itemName.includes(searchTerm) || price.includes(searchTerm)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

//Signout function in landing page

function signOut() {
  localStorage.clear();
  location.reload(); // simplest and clean
}

//Function to check token expiry

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiry = payload.exp * 1000; // convert to ms
    return Date.now() > expiry;
  } catch (e) {
    return true; // invalid token → treat as expired
  }
}

//Check Token validity

function checkAuth() {
  const token = localStorage.getItem("access_token");

  if (!token || isTokenExpired(token)) {
    signOut();
  }
}

// Load Invoice
async function updateExistingInvoice() {
  if (!currentInvoiceId) {
    alert("Invoice ID missing");
    return;
  }

  const vehicleNo = document.getElementById('vehicleNo').value.trim();
  const ownerNo = document.getElementById('ownerNo').value.trim();
  const kmCovered = parseInt(document.getElementById('kmCovered').value) || 0;

  const consumables = [];
  document.querySelectorAll('#consumablesTable tbody tr').forEach(row => {
    const itemName = row.children[1].querySelector('input').value.trim();
    const quantity = parseFloat(row.children[2].querySelector('input').value) || 0;
    const price = parseFloat(row.children[3].querySelector('input').value) || 0;

    if (itemName && quantity > 0) {
      consumables.push({ itemName, quantity, price });
    }
  });

  const services = [];
  document.querySelectorAll('#servicesTable tbody tr').forEach(row => {
    const serviceName = row.children[1].querySelector('input').value.trim();
    const charge = parseFloat(row.children[2].querySelector('input').value) || 0;

    if (serviceName && charge >= 0) {
      services.push({ serviceName, charge });
    }
  });

  try {
    const token = localStorage.getItem("access_token");

    const res = await fetch(`${API_BASE}/billing-UpdateInvoiceDetails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        invoiceId: currentInvoiceId,
        vehicleNo,
        mobileNo: ownerNo,
        kmCovered,
        consumables,
        services
      })
    });

    const result = await res.json();

    if (res.ok) {
      showBalloon(`✅ Invoice ${currentInvoiceId} updated`, 3000, "success");
    } else {
      showBalloon(`❌ ${result.error}`, 3000, "error");
    }
  } catch (err) {
    console.error(err);
    showBalloon("❌ Update failed", 3000, "error");
  }
}

function loadInvoiceIntoBilling(data) {
  if (!data) return;

  currentInvoiceId = data.InvoiceID;

  // Fill header fields
  document.getElementById("billNo").value = data.InvoiceID;
  document.getElementById("vehicleNo").value = data.VehicleNo || "";
  document.getElementById("ownerNo").value = data.MobileNo || "";
  document.getElementById("kmCovered").value = data.KmCovered || 0;

  // Disable Bill No
  const billNo = document.getElementById("billNo");
  if (billNo) billNo.disabled = true;

  // Clear tables
  const ctbody = document.querySelector('#consumablesTable tbody');
  const stbody = document.querySelector('#servicesTable tbody');

  if (ctbody) ctbody.innerHTML = "";
  if (stbody) stbody.innerHTML = "";

  // Load consumables
  (data.Consumables || []).forEach(item => {
    addRow('consumablesTable');

    const row = ctbody.lastElementChild;
    row.children[1].querySelector('input').value = item.ItemName;
    row.children[2].querySelector('input').value = item.Quantity;
    row.children[3].querySelector('input').value = item.Price;
  });

  // Load services
  (data.Services || []).forEach(s => {
    addServiceRow('servicesTable');

    const row = stbody.lastElementChild;
    row.children[1].querySelector('input').value = s.ServiceName;
    row.children[2].querySelector('input').value = s.Charge;
  });

  calculateTotals();
  // Update status and comment UI (if present)
  try { updateInvoiceStatusUI(data); } catch (e) { /* ignore */ }
}

// Render invoice status and cancellation/reopen comments in the UI
function updateInvoiceStatusUI(data) {
  const selected = data || JSON.parse(localStorage.getItem("selectedInvoice") || "{}");
  const statusText = document.getElementById('invoiceStatusText');
  const cancelledInfo = document.getElementById('invoiceCancelledInfo');
  const cancelledReasonEl = document.getElementById('invoiceCancelledReason');
  const cancelledAtEl = document.getElementById('invoiceCancelledAt');
  const reopenInfo = document.getElementById('invoiceReopenInfo');
  const reopenReasonEl = document.getElementById('invoiceReopenReason');
  const reopenedAtEl = document.getElementById('invoiceReopenedAt');

  if (!statusText) return;

  const invoiceStatus = selected.InvoiceStatus || selected.invoiceStatus || 'Pending';
  statusText.textContent = invoiceStatus;

  // Cancelled details
  if (selected.CancelledReason || selected.cancelledReason) {
    const reason = selected.CancelledReason || selected.cancelledReason || '';
    const at = selected.CancelledAt || selected.cancelledAt || '';
    if (cancelledInfo && cancelledReasonEl && cancelledAtEl) {
      cancelledReasonEl.textContent = reason;
      cancelledAtEl.textContent = at ? `At: ${formatToIST(at)}` : '';
      cancelledInfo.style.display = 'block';
    }
  } else {
    if (cancelledInfo) cancelledInfo.style.display = 'none';
  }

  // Reopen details
  if (selected.ReopenReason || selected.reopenReason || selected.ReopenedAt || selected.reopenedAt) {
    const rreason = selected.ReopenReason || selected.reopenReason || '';
    const rat = selected.ReopenedAt || selected.reopenedAt || '';
    if (reopenInfo && reopenReasonEl && reopenedAtEl) {
      reopenReasonEl.textContent = rreason;
      reopenedAtEl.textContent = rat ? `At: ${formatToIST(rat)}` : '';
      reopenInfo.style.display = 'block';
    }
  } else {
    if (reopenInfo) reopenInfo.style.display = 'none';
  }
}

// Format a timestamp string to IST (Asia/Kolkata) readable format. Falls back to original input if parsing fails.
function formatToIST(ts) {
  if (!ts) return '';
  try {
    // Some backends send SQL datetime without timezone. Parse as local/UTC where possible.
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    // Use toLocaleString with Asia/Kolkata timezone
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
