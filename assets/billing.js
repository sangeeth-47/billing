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

    container.appendChild(editBtn);
    container.appendChild(printBtn);
    return;
  }

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

// billing.html JS

(async () => {
  const token = localStorage.getItem("access_token");

  const res = await fetch(`https://api.sangeeth47.in/api/billing-serveapi-backend?file=qr.js`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (res.ok) {
    const js = await res.text();

    // Create a <script> element and append it
    const script = document.createElement("script");
    script.textContent = js;
    document.body.appendChild(script);
  } else {
    console.error("Failed to load script");
  }
})();

  function loadSearchInvoice() {
  const tpl = document.getElementById("searchInvoiceTpl");
  const app = document.getElementById("app");

  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  if (typeof si_setDefaultDateRange === "function") {
    si_setDefaultDateRange();
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
        `https://api.sangeeth47.in/api/GetConsumableSuggestions`,
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

      data.forEach(({ ItemName, Price }) => {
        const option = document.createElement('option');
        option.value = `${ItemName} - ₹${Price}`;
        option.dataset.name = ItemName;
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
        `https://api.sangeeth47.in/api/GetNextInvoiceId`,
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
        `https://api.sangeeth47.in/api/CreateDraftInvoice`,
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
  const response = await fetch(`https://api.sangeeth47.in/api/UpdateInvoiceDetails`, {
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

  // Reset all buttons to show first
  billingBtn.style.display = '';
  inventoryBtn.style.display = '';
  viewInvoiceBtn.style.display = '';

  if (id === 'billing') {
    // In billing tab: only show inventory button
    billingBtn.style.display = 'none';
    viewInvoiceBtn.style.display = 'none';

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

    // Load inventory when inventory tab is clicked
    await loadInventoryData();
  } else if (id === 'dashboard') {
    // In home/dashboard: show all tabs
    // selectedInvoice persists unless explicitly cleared by reloadForNewBill or new invoice selection
    // All buttons are already visible from reset above
  }
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

  if (!selected) {
    alert("No invoice selected");
    return;
  }

  if (!token) {
    alert("Missing authentication token");
    return;
  }

const response = await fetch(`https://api.sangeeth47.in/api/billing-pdf`, {
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
    const price = parseFloat(priceInput.value);
    
    if (name && !isNaN(price) && price >= 0) {
      items.push({ name, price });
      
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

    const response = await fetch(`https://api.sangeeth47.in/api/inventory-create`, {
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
      // Handle API response
      if (result.addedCount > 0 && result.duplicateCount > 0) {
        showBalloon(`✅ ${result.addedCount} item(s) added successfully! ${result.duplicateCount} duplicate(s) skipped.`, 4000, 'success');
      } else if (result.addedCount > 0) {
        showBalloon(`✅ ${result.addedCount} item(s) added to inventory successfully!`, 3000, 'success');
      } else if (result.duplicateCount > 0) {
        showBalloon(`⚠️ All ${result.duplicateCount} item(s) already exist in inventory. No new items added.`, 4000, 'error');
      } else {
        showBalloon(`✅ ${result.message || 'Operation completed'}`, 3000, 'success');
      }
      
      // Reset input rows
      document.getElementById('itemInputs').innerHTML = `
        <div class="item-input-row">
          <input type="text" id="itemName_1" placeholder="Item Name" class="item-name-input" oninput="clearErrorStyling(this)">
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


async function loadInventoryData() {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) {
      showBalloon('❌ Authentication required. Please login first.', 3000, 'error');
      return;
    }

    const response = await fetch(`https://api.sangeeth47.in/api/inventory-get`, {
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

function displayInventoryItems(items) {
  const tbody = document.querySelector('#inventoryTable tbody');
  tbody.innerHTML = '';
  
  items.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.ItemName}</td>
      <td>₹${parseFloat(item.Price).toFixed(2)}</td>
      <td>${item.UsedInBills || 0}</td>
      <td>
        <button onclick="deleteInventoryItem('${item.ItemName}', ${item.Price}, ${item.UsedInBills || 0})" 
                class="inventory-delete-btn" 
                ${(item.UsedInBills > 0) ? 'title="Item used in bills - click for details"' : ''}>
          Delete
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
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
    const response = await fetch(`https://api.sangeeth47.in/api/inventory-delete`, {
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
    const itemName = row.cells[0].textContent.toLowerCase();
    const price = row.cells[1].textContent.toLowerCase();
    
    if (itemName.includes(searchTerm) || price.includes(searchTerm)) {
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

    const res = await fetch(`https://api.sangeeth47.in/api/UpdateInvoiceDetails`, {
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
}
