/* ========================================
   SMART BILLING & SALES TRACKER - SCRIPT
   ======================================== */

// =====================
// STATE & STORAGE KEYS
// =====================
const KEYS = {
  products: 'sbt_products',
  bills:    'sbt_bills',
  profile:  'sbt_profile',
  theme:    'sbt_theme',
  user:     'sbt_user',      // auth credentials
  session:  'sbt_session',   // logged-in flag
};

// =====================
// AUTH FUNCTIONS
// =====================

/** Show a specific auth sub-page */
function showAuthPage(page) {
  document.querySelectorAll('.auth-page').forEach(p => p.classList.remove('active'));
  document.getElementById(`auth-${page}`).classList.add('active');

  // Populate login hint if user exists
  if (page === 'login') {
    const user = loadObj(KEYS.user, {});
    if (user.shopName) {
      document.getElementById('login-shop-title').textContent = `Welcome back!`;
      document.getElementById('login-shop-sub').textContent   = user.shopName;
    }
  }
}

/** Handle signup form */
function handleSignup() {
  const shopName  = document.getElementById('su-shop').value.trim();
  const ownerName = document.getElementById('su-owner').value.trim();
  const phone     = document.getElementById('su-phone').value.trim();
  const pin       = document.getElementById('su-pin').value.trim();
  const pin2      = document.getElementById('su-pin2').value.trim();

  if (!shopName)  { showAuthToast('Enter your shop name', 'error'); return; }
  if (!ownerName) { showAuthToast('Enter your name', 'error'); return; }
  if (!phone || phone.length < 10) { showAuthToast('Enter a valid 10-digit phone number', 'error'); return; }
  if (!pin || pin.length !== 4 || isNaN(pin)) { showAuthToast('PIN must be exactly 4 digits', 'error'); return; }
  if (pin !== pin2) { showAuthToast('PINs do not match', 'error'); return; }

  // Save credentials & profile
  save(KEYS.user, { shopName, ownerName, phone, pin });
  save(KEYS.profile, { shopName, ownerName, phone });
  save(KEYS.session, { loggedIn: true });

  showAuthToast('Account created! Welcome 🎉', 'success');
  setTimeout(() => launchApp(), 900);
}

/** Handle login form */
function handleLogin() {
  const phone = document.getElementById('li-phone').value.trim();
  const pin   = document.getElementById('li-pin').value.trim();
  const user  = loadObj(KEYS.user, {});

  if (!user.phone) {
    showAuthToast('No account found. Please sign up first.', 'error');
    return;
  }
  if (phone !== user.phone) { showAuthToast('Phone number not found', 'error'); return; }
  if (pin !== user.pin)     { showAuthToast('Incorrect PIN', 'error'); return; }

  save(KEYS.session, { loggedIn: true });
  showAuthToast('Signed in! Welcome back 👋', 'success');
  setTimeout(() => launchApp(), 700);
}

/** Logout user */
function handleLogout() {
  if (!confirm('Sign out of ShopTrack?')) return;
  save(KEYS.session, { loggedIn: false });
  location.reload();
}

/** Forgot PIN - show shop data hint */
function handleForgotPin() {
  const user = loadObj(KEYS.user, {});
  if (!user.phone) {
    showAuthToast('No account found. Please sign up.', 'info');
    return;
  }
  const hint = `Your PIN is linked to phone: ${user.phone.slice(0, 3)}XXXXXXX${user.phone.slice(-2)}\n\nIf you remember your PIN, try again. Otherwise click OK to reset ALL data.`;
  if (confirm(hint)) {
    if (confirm('⚠️ This will delete ALL your data including products and bills. Continue?')) {
      Object.values(KEYS).forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  }
}

/** Show toast on auth screen (separate from app toast) */
function showAuthToast(msg, type = 'info') {
  // reuse main toast logic but always visible
  const t = document.getElementById('toast');
  if (!t) {
    // toast might not be in DOM yet - use alert fallback
    if (type === 'error') alert(msg);
    return;
  }
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  // position it for auth screen
  t.style.bottom = '40px';
  setTimeout(() => { t.classList.add('hidden'); t.style.bottom = ''; }, 2500);
}

/** Show main app, hide auth */
function launchApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-wrapper').classList.remove('hidden');
  init();
}

/** Check session on page load */
function checkSession() {
  const session = loadObj(KEYS.session, {});
  const user    = loadObj(KEYS.user, {});

  if (session.loggedIn && user.phone) {
    launchApp();
  } else {
    // Show auth screen — check if existing user to skip to login
    if (user.phone) {
      showAuthPage('login');
    } else {
      showAuthPage('landing');
    }
  }
}



let cart = []; // In-memory cart (not persisted)
let currentBillIndex = null; // tracks which bill is open in the modal
let salesChartInstance = null;
let productChartInstance = null;

// =====================
// DATA HELPERS
// =====================

/** Load an array from localStorage */
function loadArr(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}

/** Load an object from localStorage */
function loadObj(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

/** Save data to localStorage */
function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// =====================
// NAVIGATION
// =====================

/** Switch between pages */
function navigate(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  // Show target page
  document.getElementById(`page-${page}`).classList.add('active');
  document.getElementById(`nav-${page}`).classList.add('active');

  // Refresh page-specific content
  if (page === 'products')  renderProducts();
  if (page === 'billing') {
    // Reset search on page switch
    const si = document.getElementById('billing-search');
    if (si) si.value = '';
    const nb = document.getElementById('billing-no-results');
    if (nb) nb.classList.add('hidden');
    stopVoiceSearch();
    renderBillingProducts();
  }
  if (page === 'dashboard') renderDashboard();
  if (page === 'history')   renderHistory();
  if (page === 'profile')   renderProfile();
}

// =====================
// THEME
// =====================

function initTheme() {
  const theme = localStorage.getItem(KEYS.theme) || 'light';
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeToggle').textContent = theme === 'dark' ? '🌙' : '☀️';
  save(KEYS.theme, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// =====================
// TOAST NOTIFICATIONS
// =====================

let toastTimeout = null;

/** Show a brief toast message */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

// =====================
// PRODUCTS
// =====================

/** Render the product management grid */
function renderProducts() {
  const products = loadArr(KEYS.products);
  const grid = document.getElementById('product-list');
  const empty = document.getElementById('no-products');

  if (products.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = products.map((p, i) => `
    <div class="product-card">
      ${p.image
        ? `<img class="product-img" src="${p.image}" alt="${p.name}" />`
        : `<div class="product-placeholder">🛒</div>`}
      <button class="delete-btn" onclick="deleteProduct(${i})" title="Delete">✕</button>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-price">₹${p.price}/${p.unit}</div>
      </div>
    </div>
  `).join('');
}

/** Open the Add Product modal */
function openAddProductModal() {
  // Reset form fields
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('prod-unit').value = 'pcs';
  document.getElementById('prod-image').value = '';
  document.getElementById('image-preview').src = '';
  document.getElementById('image-preview').classList.add('hidden');
  document.getElementById('upload-placeholder').classList.remove('hidden');

  document.getElementById('add-product-modal').classList.remove('hidden');
}

function closeAddProductModal() {
  document.getElementById('add-product-modal').classList.add('hidden');
}

/** Preview selected image inside the modal */
function previewImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const preview = document.getElementById('image-preview');
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    document.getElementById('upload-placeholder').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

/** Add new product to localStorage */
function addProduct() {
  const name  = document.getElementById('prod-name').value.trim();
  const price = parseFloat(document.getElementById('prod-price').value);
  const unit  = document.getElementById('prod-unit').value;
  const image = document.getElementById('image-preview').src || '';

  if (!name) { showToast('Please enter a product name', 'error'); return; }
  if (!price || price <= 0) { showToast('Please enter a valid price', 'error'); return; }

  const products = loadArr(KEYS.products);
  products.push({
    name, price, unit,
    image: image.startsWith('data:') ? image : '',
  });
  save(KEYS.products, products);

  closeAddProductModal();
  showToast(`"${name}" added successfully!`, 'success');
  renderProducts();
}

/** Delete a product after confirmation */
function deleteProduct(index) {
  const products = loadArr(KEYS.products);
  const product = products[index];
  if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;

  products.splice(index, 1);
  save(KEYS.products, products);
  showToast('Product deleted', 'info');
  renderProducts();
}

// =====================
// BILLING
// =====================


// =====================
// BILLING SEARCH
// =====================

/** Filter billing product cards by search query */
function filterBillingProducts(query) {
  const q = query.trim().toLowerCase();
  const clearBtn = document.getElementById('search-clear-btn');
  const noResults = document.getElementById('billing-no-results');

  // Show/hide clear button
  if (q.length > 0) {
    clearBtn.classList.remove('hidden');
  } else {
    clearBtn.classList.add('hidden');
  }

  const cards = document.querySelectorAll('#billing-product-list .billing-product-card');
  let visibleCount = 0;

  cards.forEach(card => {
    const name = card.getAttribute('data-name') || '';
    if (!q || name.includes(q)) {
      card.style.display = '';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }
  });

  // Show "no results" state
  if (noResults) {
    if (q && visibleCount === 0) {
      noResults.classList.remove('hidden');
    } else {
      noResults.classList.add('hidden');
    }
  }
}

/** Clear search input and reset grid */
function clearBillingSearch() {
  const input = document.getElementById('billing-search');
  if (input) {
    input.value = '';
    filterBillingProducts('');
    input.focus();
  }
}

// =====================
// VOICE SEARCH
// =====================

let voiceRecognition = null;
let isListening = false;

/** Toggle voice recognition on/off */
function toggleVoiceSearch() {
  if (isListening) {
    stopVoiceSearch();
  } else {
    startVoiceSearch();
  }
}

/** Start the Web Speech API recognition */
function startVoiceSearch() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast('Voice search not supported in this browser', 'error');
    return;
  }

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = 'en-IN'; // Indian English for better local product name recognition
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = true;
  voiceRecognition.maxAlternatives = 3;

  voiceRecognition.onstart = function() {
    isListening = true;
    setVoiceUI(true);
    showToast('Listening...', 'info');
  };

  voiceRecognition.onresult = function(event) {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript = event.results[i][0].transcript;
    }

    // Show interim result in search box
    const input = document.getElementById('billing-search');
    if (input) {
      input.value = transcript;
      filterBillingProducts(transcript);
      document.getElementById('voice-status-text').textContent = `Heard: "${transcript}"`;
    }

    // If final result, try to auto-add to cart
    if (event.results[event.resultIndex].isFinal) {
      handleVoiceResult(transcript.trim().toLowerCase());
    }
  };

  voiceRecognition.onerror = function(event) {
    const msgs = {
      'no-speech':     'No speech detected. Try again!',
      'not-allowed':   'Microphone access denied. Please allow mic permission.',
      'network':       'Network error. Check your connection.',
      'audio-capture': 'No microphone found.',
    };
    showToast(msgs[event.error] || 'Voice error: ' + event.error, 'error');
    stopVoiceSearch();
  };

  voiceRecognition.onend = function() {
    if (isListening) stopVoiceSearch();
  };

  voiceRecognition.start();
}

/** Stop recognition and reset UI */
function stopVoiceSearch() {
  isListening = false;
  setVoiceUI(false);
  if (voiceRecognition) {
    try { voiceRecognition.stop(); } catch(e) {}
    voiceRecognition = null;
  }
}

/** Update UI to reflect listening state */
function setVoiceUI(listening) {
  const btn        = document.getElementById('voice-btn');
  const icon       = document.getElementById('voice-icon');
  const statusBar  = document.getElementById('voice-status');
  const statusText = document.getElementById('voice-status-text');

  if (listening) {
    btn.classList.add('listening');
    icon.textContent = '⏹️';
    statusBar.classList.remove('hidden');
    statusText.textContent = 'Listening... say a product name';
  } else {
    btn.classList.remove('listening');
    icon.textContent = '🎤';
    statusBar.classList.add('hidden');
  }
}

/** Try to match voice result to a product and add it to cart */
function handleVoiceResult(transcript) {
  const products = loadArr(KEYS.products);

  // Fuzzy match: find first product whose name is contained in or matches transcript
  const matched = products.find(p =>
    transcript.includes(p.name.toLowerCase()) ||
    p.name.toLowerCase().includes(transcript)
  );

  if (matched) {
    const index = products.indexOf(matched);
    addToCart(index);
    showToast(`"${matched.name}" added via voice! 🎤`, 'success');

    // Clear search after match
    setTimeout(() => {
      clearBillingSearch();
    }, 600);
  } else {
    // Keep search text so user can see what was heard
    showToast(`No product matched "${transcript}"`, 'info');
  }

  stopVoiceSearch();
}

/** Render clickable product cards on the Billing page */
function renderBillingProducts() {
  const products = loadArr(KEYS.products);
  const container = document.getElementById('billing-product-list');

  if (products.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:20px 0">
      <div class="empty-icon">📦</div>
      <p>No products yet. Go to <strong>Products</strong> to add some!</p>
    </div>`;
    return;
  }

  container.innerHTML = products.map((p, i) => `
    <div class="billing-product-card" data-name="${p.name.toLowerCase()}" onclick="addToCart(${i})">
      ${p.image
        ? `<img class="b-img" src="${p.image}" alt="${p.name}" />`
        : `<div class="b-placeholder">🛒</div>`}
      <div class="b-name">${p.name}</div>
      <div class="b-price">₹${p.price}/${p.unit}</div>
    </div>
  `).join('');

  renderCart(); // Always re-render cart when billing page opens
}

/** Add a product to the cart */
function addToCart(productIndex) {
  const products = loadArr(KEYS.products);
  const product = products[productIndex];

  // Check if already in cart
  const existing = cart.find(item => item.name === product.name && item.unit === product.unit);
  if (existing) {
    existing.qty = parseFloat((existing.qty + 1).toFixed(2));
    existing.total = parseFloat((existing.qty * existing.price).toFixed(2));
    showToast(`${product.name} qty updated`, 'info');
  } else {
    cart.push({
      name:  product.name,
      price: product.price,
      unit:  product.unit,
      qty:   1,
      total: product.price,
    });
    showToast(`${product.name} added to cart`, 'success');
  }

  renderCart();
}

/** Render the cart section */
function renderCart() {
  const cartItemsEl  = document.getElementById('cart-items');
  const emptyCartEl  = document.getElementById('empty-cart');
  const totalSection = document.getElementById('cart-total-section');
  const totalAmount  = document.getElementById('cart-total-amount');

  if (cart.length === 0) {
    cartItemsEl.innerHTML = '';
    emptyCartEl.classList.remove('hidden');
    totalSection.style.display = 'none';
    return;
  }

  emptyCartEl.classList.add('hidden');
  totalSection.style.display = 'block';

  cartItemsEl.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div class="cart-item-name">
        ${item.name}<br/>
        <span class="cart-item-unit">${item.unit}</span>
      </div>
      <div class="cart-qty">
        <button class="qty-btn" onclick="changeQty(${i}, -0.5)">−</button>
        <input class="qty-input" type="number" value="${item.qty}" min="0.1" step="0.5"
          onchange="setQty(${i}, this.value)" />
        <button class="qty-btn" onclick="changeQty(${i}, 0.5)">+</button>
      </div>
      <div class="cart-item-price">₹${item.total.toFixed(2)}</div>
      <button class="remove-cart-item" onclick="removeFromCart(${i})">🗑️</button>
    </div>
  `).join('');

  const total = cart.reduce((sum, item) => sum + item.total, 0);
  totalAmount.textContent = `₹${total.toFixed(2)}`;
}

/** Change quantity by delta (+/-) */
function changeQty(index, delta) {
  const item = cart[index];
  const newQty = parseFloat((item.qty + delta).toFixed(2));
  if (newQty <= 0) {
    removeFromCart(index);
    return;
  }
  item.qty = newQty;
  item.total = parseFloat((item.qty * item.price).toFixed(2));
  renderCart();
}

/** Set quantity directly via input */
function setQty(index, value) {
  const qty = parseFloat(value);
  if (!qty || qty <= 0) {
    removeFromCart(index);
    return;
  }
  cart[index].qty = qty;
  cart[index].total = parseFloat((qty * cart[index].price).toFixed(2));
  renderCart();
}

/** Remove item from cart */
function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

/** Clear cart */
function clearCart() {
  if (cart.length === 0) return;
  if (!confirm('Clear all cart items?')) return;
  cart = [];
  renderCart();
}

/** Save bill to localStorage */
function generateBill() {
  if (cart.length === 0) {
    showToast('Cart is empty!', 'error');
    return;
  }

  const total = cart.reduce((sum, item) => sum + item.total, 0);
  const bills = loadArr(KEYS.bills);

  const bill = {
    id:    `BILL-${Date.now()}`,
    items: cart.map(item => ({ ...item })),
    total: parseFloat(total.toFixed(2)),
    date:  new Date().toISOString(),
  };

  bills.unshift(bill); // Add to beginning
  save(KEYS.bills, bills);

  cart = [];
  renderCart();
  showToast('Bill generated successfully! 🎉', 'success');
}

// =====================
// DASHBOARD
// =====================

/** Render stats and charts */
function renderDashboard() {
  const bills = loadArr(KEYS.bills);
  const now   = new Date();

  // Date boundaries
  const todayStr     = toDateStr(now);
  const yesterdayStr = toDateStr(new Date(now - 86400000));

  let todayIncome = 0, yesterdayIncome = 0, weekIncome = 0;

  // Last 7 days labels & amounts
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    last7.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), date: toDateStr(d), amount: 0 });
  }

  // Product sold count map
  const productTotals = {};

  bills.forEach(bill => {
    const billDate = toDateStr(new Date(bill.date));
    const billAmt  = bill.total;

    if (billDate === todayStr)     todayIncome += billAmt;
    if (billDate === yesterdayStr) yesterdayIncome += billAmt;

    // Week: last 7 days
    const dayEntry = last7.find(d => d.date === billDate);
    if (dayEntry) {
      dayEntry.amount += billAmt;
      weekIncome += billAmt;
    }

    // Track product quantities for bar chart
    bill.items.forEach(item => {
      productTotals[item.name] = (productTotals[item.name] || 0) + item.qty;
    });
  });

  // Update stat cards
  document.getElementById('stat-today').textContent     = `₹${todayIncome.toFixed(0)}`;
  document.getElementById('stat-yesterday').textContent = `₹${yesterdayIncome.toFixed(0)}`;
  document.getElementById('stat-week').textContent      = `₹${weekIncome.toFixed(0)}`;
  document.getElementById('stat-bills').textContent     = bills.length;

  // ---- Sales Line Chart ----
  const salesCtx = document.getElementById('salesChart').getContext('2d');
  if (salesChartInstance) salesChartInstance.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#9099c8' : '#5a6072';

  salesChartInstance = new Chart(salesCtx, {
    type: 'line',
    data: {
      labels: last7.map(d => d.label),
      datasets: [{
        label: 'Sales (₹)',
        data: last7.map(d => d.amount),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.12)',
        borderWidth: 2.5,
        pointBackgroundColor: '#4f46e5',
        pointRadius: 4,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `₹${ctx.raw.toFixed(2)}` } }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, callback: v => `₹${v}` } }
      }
    }
  });

  // ---- Top Products Bar Chart ----
  const sorted = Object.entries(productTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const productCtx = document.getElementById('productChart').getContext('2d');
  if (productChartInstance) productChartInstance.destroy();

  productChartInstance = new Chart(productCtx, {
    type: 'bar',
    data: {
      labels: sorted.map(([name]) => name),
      datasets: [{
        label: 'Qty Sold',
        data: sorted.map(([, qty]) => qty),
        backgroundColor: [
          'rgba(79,70,229,0.7)', 'rgba(22,163,74,0.7)', 'rgba(234,88,12,0.7)',
          'rgba(124,58,237,0.7)','rgba(3,105,161,0.7)', 'rgba(220,38,38,0.7)',
        ],
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } }
      }
    }
  });
}

/** Convert Date to 'YYYY-MM-DD' string */
function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

// =====================
// BILL HISTORY
// =====================

/** Render past bills list */
function renderHistory() {
  const bills = loadArr(KEYS.bills);
  const list  = document.getElementById('bill-history-list');
  const empty = document.getElementById('no-history');

  if (bills.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = bills.map((bill, i) => {
    const date = new Date(bill.date);
    const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const preview = bill.items.slice(0, 3).map(item => `${item.name} ×${item.qty}${item.unit}`).join(', ');
    const more = bill.items.length > 3 ? ` + ${bill.items.length - 3} more` : '';

    return `
      <div class="bill-card" onclick="viewBill(${i})">
        <div class="bill-card-header">
          <span class="bill-number">${bill.id}</span>
          <span class="bill-date">${dateStr} ${timeStr}</span>
        </div>
        <div class="bill-items-preview">${preview}${more}</div>
        <div class="bill-total">₹${bill.total.toFixed(2)}</div>
      </div>
    `;
  }).join('');
}

/** Open bill detail modal */
function viewBill(index) {
  currentBillIndex = index;
  const bills = loadArr(KEYS.bills);
  const bill  = bills[index];
  const profile = loadObj(KEYS.profile, { shopName: 'My Shop' });
  const date  = new Date(bill.date);
  const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const content = document.getElementById('bill-detail-content');
  content.innerHTML = `
    <div class="bill-detail-shop">
      <h3>🏪 ${profile.shopName || 'My Shop'}</h3>
      <p>${profile.ownerName ? profile.ownerName + ' · ' : ''}${profile.phone || ''}</p>
      <p style="margin-top:4px;font-size:11px;color:var(--text3)">${dateStr}</p>
      <p style="font-size:11px;color:var(--accent);margin-top:4px;font-weight:700">${bill.id}</p>
    </div>
    ${bill.items.map(item => `
      <div class="bill-detail-item">
        <span class="bill-detail-item-name">${item.name}</span>
        <span class="bill-detail-item-qty">${item.qty} ${item.unit}</span>
        <span class="bill-detail-item-price">₹${item.total.toFixed(2)}</span>
      </div>
    `).join('')}
    <div class="bill-detail-total">
      <span>Total</span>
      <span>₹${bill.total.toFixed(2)}</span>
    </div>
  `;

  document.getElementById('bill-detail-modal').classList.remove('hidden');
}

function closeBillModal() {
  document.getElementById('bill-detail-modal').classList.add('hidden');
}

/** Delete all bill history */
function clearAllBills() {
  const bills = loadArr(KEYS.bills);
  if (bills.length === 0) { showToast('No bills to clear', 'info'); return; }
  if (!confirm('Delete all bill history? This cannot be undone.')) return;
  save(KEYS.bills, []);
  showToast('All bills cleared', 'info');
  renderHistory();
}

// =====================
// PROFILE
// =====================

/** Render profile display */
function renderProfile() {
  const profile = loadObj(KEYS.profile, {});
  document.getElementById('display-shop-name').textContent  = profile.shopName  || 'My Shop';
  document.getElementById('display-owner-name').textContent = profile.ownerName || 'Owner Name';
  document.getElementById('display-phone').textContent      = profile.phone ? `📞 ${profile.phone}` : '📞 Phone Number';

  // Sync header
  document.getElementById('header-shop-name').textContent = profile.shopName || 'My Shop';

  // App info
  const bills    = loadArr(KEYS.bills);
  const products = loadArr(KEYS.products);
  const usedKB   = new Blob([JSON.stringify(localStorage)]).size / 1024;
  document.getElementById('storage-used').textContent    = `${usedKB.toFixed(1)} KB`;
  document.getElementById('total-bills-info').textContent = bills.length;
  document.getElementById('stat-bills') && (document.getElementById('stat-bills').textContent = bills.length);
}

/** Toggle between profile view and edit form */
function toggleProfileEdit() {
  const form    = document.getElementById('profile-form');
  const display = document.getElementById('profile-card');
  const isHidden = form.classList.contains('hidden');

  if (isHidden) {
    // Populate form with current values
    const profile = loadObj(KEYS.profile, {});
    document.getElementById('input-shop-name').value  = profile.shopName  || '';
    document.getElementById('input-owner-name').value = profile.ownerName || '';
    document.getElementById('input-phone').value      = profile.phone     || '';
    form.classList.remove('hidden');
  } else {
    form.classList.add('hidden');
  }
}

/** Save profile data */
function saveProfile() {
  const shopName  = document.getElementById('input-shop-name').value.trim();
  const ownerName = document.getElementById('input-owner-name').value.trim();
  const phone     = document.getElementById('input-phone').value.trim();

  if (!shopName) { showToast('Please enter a shop name', 'error'); return; }

  save(KEYS.profile, { shopName, ownerName, phone });

  // Update header
  document.getElementById('header-shop-name').textContent = shopName;

  document.getElementById('profile-form').classList.add('hidden');
  renderProfile();
  showToast('Profile saved!', 'success');
}

/** Nuke all app data */
function clearAllData() {
  if (!confirm('⚠️ This will DELETE all products, bills, and profile data. Are you sure?')) return;
  if (!confirm('This is PERMANENT. Last chance — delete everything?')) return;
  Object.values(KEYS).forEach(key => localStorage.removeItem(key));
  cart = [];
  showToast('All data cleared', 'info');
  renderProfile();
  renderProducts();
  renderHistory();
}

// =====================
// MODAL CLOSE ON OVERLAY
// =====================
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function(e) {
    if (e.target === this) {
      this.classList.add('hidden');
    }
  });
});

// =====================
// KEYBOARD: close modal on Escape
// =====================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  }
});

// =====================
// INIT
// =====================

/** Bootstrap the main app (called after login) */
function init() {
  initTheme();

  // Load profile name into header
  const profile = loadObj(KEYS.profile, {});
  document.getElementById('header-shop-name').textContent = profile.shopName || 'My Shop';

  // Show Products page by default
  navigate('products');
}


// =============================
// BILL DOWNLOAD / IMPORT / SHARE
// =============================

/** Download current bill as a .json file */
function downloadBillJSON() {
  const bills = loadArr(KEYS.bills);
  const bill  = bills[currentBillIndex];
  if (!bill) { showToast('No bill selected', 'error'); return; }

  const profile = loadObj(KEYS.profile, { shopName: 'MyShop' });
  const exportData = {
    _app: 'ShopTrack',
    _version: '1.0',
    shopName: profile.shopName,
    bill: bill,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  // Sanitise filename
  const safeName = (profile.shopName || 'Bill').replace(/[^a-z0-9]/gi, '_');
  const dateStr  = new Date(bill.date).toISOString().slice(0, 10);
  a.href     = url;
  a.download = `${safeName}_${bill.id}_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Bill downloaded as JSON!', 'success');
}

/** Open print dialog — browser can save as PDF */
function downloadBillPDF() {
  const bills = loadArr(KEYS.bills);
  const bill  = bills[currentBillIndex];
  if (!bill) { showToast('No bill selected', 'error'); return; }

  const profile = loadObj(KEYS.profile, {});
  const date    = new Date(bill.date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const itemRows = bill.items.map(item =>
    `<div class="print-item">
       <span>${item.name} x${item.qty}${item.unit}</span>
       <span>Rs.${item.total.toFixed(2)}</span>
     </div>`
  ).join('');

  const printHTML = `
    <div class="print-bill">
      <h2>${profile.shopName || 'My Shop'}</h2>
      ${profile.ownerName ? `<div class="print-sub">${profile.ownerName}</div>` : ''}
      ${profile.phone     ? `<div class="print-sub">Ph: ${profile.phone}</div>` : ''}
      <hr class="print-divider"/>
      <div class="print-sub">${bill.id}</div>
      <div class="print-sub">${date}</div>
      <hr class="print-divider"/>
      ${itemRows}
      <div class="print-total"><span>TOTAL</span><span>Rs.${bill.total.toFixed(2)}</span></div>
      <hr class="print-divider"/>
      <div class="print-footer">Thank you for shopping!</div>
    </div>`;

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = printHTML;
  printArea.classList.remove('hidden');

  setTimeout(() => {
    window.print();
    printArea.classList.add('hidden');
    printArea.innerHTML = '';
  }, 200);
}

/** Share bill text via Web Share API or copy to clipboard */
async function shareBill() {
  const bills = loadArr(KEYS.bills);
  const bill  = bills[currentBillIndex];
  if (!bill) { showToast('No bill selected', 'error'); return; }

  const profile = loadObj(KEYS.profile, {});
  const date    = new Date(bill.date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const itemLines = bill.items.map(item =>
    `  ${item.name} x${item.qty}${item.unit}  ->  Rs.${item.total.toFixed(2)}`
  ).join('\n');

  const text = [
    `*${profile.shopName || 'My Shop'}*`,
    profile.ownerName ? `Owner: ${profile.ownerName}` : '',
    profile.phone     ? `Ph: ${profile.phone}` : '',
    ``,
    `Bill ID: ${bill.id}`,
    `Date: ${date}`,
    ``,
    `Items:`,
    itemLines,
    ``,
    `*TOTAL: Rs.${bill.total.toFixed(2)}*`,
    ``,
    `Thank you for shopping!`,
  ].filter(l => l !== null).join('\n');

  if (navigator.share) {
    try {
      await navigator.share({ title: `Bill from ${profile.shopName}`, text });
      showToast('Bill shared!', 'success');
    } catch (e) {
      if (e.name !== 'AbortError') copyToClipboard(text);
    }
  } else {
    copyToClipboard(text);
  }
}

/** Fallback: copy bill text to clipboard */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
    .then(() => showToast('Bill text copied to clipboard!', 'success'))
    .catch(() => showToast('Could not copy. Try manually.', 'error'));
}

// ===========================
// BILL IMPORT
// ===========================

/** Trigger hidden file input */
function triggerImportBill() {
  document.getElementById('import-bill-input').click();
}

/** Read the selected JSON file and import the bill */
function importBill(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Reset input so same file can be re-imported if needed
  event.target.value = '';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);

      // Validate structure
      if (!data._app || data._app !== 'ShopTrack') {
        showToast('Invalid file: not a ShopTrack bill', 'error');
        return;
      }

      if (!data.bill || !data.bill.id || !Array.isArray(data.bill.items)) {
        showToast('File is corrupted or missing bill data', 'error');
        return;
      }

      const bills = loadArr(KEYS.bills);

      // Check for duplicate
      const exists = bills.some(b => b.id === data.bill.id);
      if (exists) {
        showToast(`Bill ${data.bill.id} already exists!`, 'info');
        return;
      }

      // Insert at correct chronological position
      bills.push(data.bill);
      bills.sort((a, b) => new Date(b.date) - new Date(a.date));
      save(KEYS.bills, bills);

      showToast(`Bill ${data.bill.id} imported successfully! 🎉`, 'success');
      renderHistory();

    } catch (err) {
      showToast('Failed to read file. Make sure it is a valid JSON.', 'error');
    }
  };

  reader.onerror = function() {
    showToast('Error reading file', 'error');
  };

  reader.readAsText(file);
}


// Run on page load — check auth first
checkSession();
