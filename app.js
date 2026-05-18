const STORAGE_KEY = "fournee-erp-v2";
const LEGACY_KEY = "fournee-erp-v1";

const seedData = {
  settings: {
    dailyGoal: 2500
  },
  products: [
    { id: "p1", name: "Baguette tradition", family: "Pain", price: 1.2, cost: 0.34, threshold: 25, minutes: 4 },
    { id: "p2", name: "Croissant beurre", family: "Viennoiserie", price: 1.4, cost: 0.48, threshold: 18, minutes: 8 },
    { id: "p3", name: "Pain complet", family: "Pain", price: 2.6, cost: 0.82, threshold: 10, minutes: 6 },
    { id: "p4", name: "Sandwich poulet", family: "Snacking", price: 4.9, cost: 1.85, threshold: 8, minutes: 7 },
    { id: "p5", name: "Eclair chocolat", family: "Patisserie", price: 2.9, cost: 1.05, threshold: 8, minutes: 12 },
    { id: "p6", name: "Tartelette fruits", family: "Patisserie", price: 3.6, cost: 1.22, threshold: 6, minutes: 14 }
  ],
  ingredients: [
    { id: "i1", name: "Farine T65", unit: "kg", stock: 85, threshold: 30 },
    { id: "i2", name: "Beurre", unit: "kg", stock: 14, threshold: 8 },
    { id: "i3", name: "Sucre", unit: "kg", stock: 18, threshold: 8 },
    { id: "i4", name: "Levure", unit: "kg", stock: 4, threshold: 3 },
    { id: "i5", name: "Chocolat", unit: "kg", stock: 7, threshold: 5 },
    { id: "i6", name: "Emballages", unit: "piece", stock: 320, threshold: 120 }
  ],
  sales: [],
  productions: [],
  purchases: [],
  orders: [],
  expenses: []
};

let state = loadState();
let currentDate = localDate();
let productSearch = "";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MAD" });
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const el = (id) => document.getElementById(id);

function localDate(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeState(input) {
  const data = { ...clone(seedData), ...(input || {}) };
  data.settings = { ...clone(seedData.settings), ...(input?.settings || {}) };
  data.products = (data.products || []).map((product) => ({
    minutes: 0,
    threshold: 0,
    ...product
  }));
  data.ingredients = data.ingredients || [];
  data.sales = (data.sales || []).map((sale) => ({
    discount: 0,
    channel: "Boutique",
    ...sale
  }));
  data.productions = (data.productions || []).map((item) => ({
    team: "",
    ...item
  }));
  data.purchases = (data.purchases || []).map((item) => ({
    supplier: "",
    ...item
  }));
  data.orders = data.orders || [];
  data.expenses = data.expenses || [];
  return data;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
  if (!raw) return clone(seedData);

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return clone(seedData);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const toastEl = el("toast");
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function productById(id) {
  return state.products.find((product) => product.id === id);
}

function ingredientById(id) {
  return state.ingredients.find((ingredient) => ingredient.id === id);
}

function todayRows(collection) {
  return state[collection].filter((row) => row.date === currentDate || row.businessDate === currentDate);
}

function todaySales() {
  return todayRows("sales");
}

function todayProductions() {
  return todayRows("productions");
}

function todayExpenses() {
  return todayRows("expenses");
}

function openOrders() {
  return state.orders
    .filter((order) => order.status !== "Livree")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function saleTotal(sale) {
  return Math.max(0, sale.price * sale.qty - Number(sale.discount || 0));
}

function dayRevenue(sales = todaySales()) {
  return sales.reduce((sum, sale) => sum + saleTotal(sale), 0);
}

function dayCost(sales = todaySales()) {
  return sales.reduce((sum, sale) => sum + sale.cost * sale.qty, 0);
}

function dayExpenseTotal() {
  return todayExpenses().reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function dayWasteValue() {
  return todayProductions().reduce((sum, item) => {
    const product = productById(item.productId);
    return sum + (product ? product.cost * item.waste : 0);
  }, 0);
}

function netMargin() {
  return dayRevenue() - dayCost() - dayWasteValue() - dayExpenseTotal();
}

function groupedSales() {
  const groups = new Map();
  for (const sale of todaySales()) {
    const existing = groups.get(sale.productId) || {
      productId: sale.productId,
      qty: 0,
      revenue: 0,
      margin: 0
    };
    existing.qty += Number(sale.qty || 0);
    existing.revenue += saleTotal(sale);
    existing.margin += saleTotal(sale) - sale.cost * sale.qty;
    groups.set(sale.productId, existing);
  }
  return [...groups.values()].sort((a, b) => b.revenue - a.revenue);
}

function productionRows() {
  return todayProductions().map((item) => {
    const sold = todaySales()
      .filter((sale) => sale.productId === item.productId)
      .reduce((sum, sale) => sum + Number(sale.qty || 0), 0);
    return { ...item, sold, gap: Number(item.qty || 0) - sold - Number(item.waste || 0) };
  });
}

function paymentBreakdown() {
  return todaySales().reduce((acc, sale) => {
    acc[sale.payment] = (acc[sale.payment] || 0) + saleTotal(sale);
    return acc;
  }, {});
}

function buildActions() {
  const actions = [];
  const lowStock = state.ingredients.filter((ingredient) => Number(ingredient.stock) <= Number(ingredient.threshold));
  const revenue = dayRevenue();
  const goal = Number(state.settings.dailyGoal || 0);
  const waste = dayWasteValue();
  const ordersToday = openOrders().filter((order) => order.date <= currentDate);

  for (const ingredient of lowStock.slice(0, 4)) {
    actions.push({
      title: `Stock bas: ${ingredient.name}`,
      meta: `${number.format(ingredient.stock)} ${ingredient.unit} restants`
    });
  }

  if (goal > 0 && revenue < goal) {
    actions.push({
      title: "Objectif CA a pousser",
      meta: `${money.format(goal - revenue)} restants`
    });
  }

  if (waste > revenue * 0.08 && waste > 0) {
    actions.push({
      title: "Pertes elevees",
      meta: `${money.format(waste)} a analyser`
    });
  }

  for (const order of ordersToday.slice(0, 3)) {
    actions.push({
      title: `Commande: ${order.customer}`,
      meta: `${order.product} - ${order.status}`
    });
  }

  return actions;
}

function setSelectOptions(selectId, rows, labelKey = "name") {
  const select = el(selectId);
  if (!select) return;
  select.innerHTML = rows.map((row) => `<option value="${row.id}">${escapeHtml(row[labelKey])}</option>`).join("");
}

function emptyRow(colspan, label) {
  return `<tr><td colspan="${colspan}" class="empty-row">${escapeHtml(label)}</td></tr>`;
}

function renderDashboard() {
  const revenue = dayRevenue();
  const margin = netMargin();
  const goal = Number(state.settings.dailyGoal || 0);
  const tickets = todaySales().length;
  const basket = tickets ? revenue / tickets : 0;
  const rate = revenue ? (margin / revenue) * 100 : 0;
  const progress = goal ? Math.min(999, (revenue / goal) * 100) : 0;
  const alerts = buildActions();

  el("metric-ca").textContent = money.format(revenue);
  el("metric-margin").textContent = money.format(margin);
  el("metric-basket").textContent = money.format(basket);
  el("metric-tickets").textContent = String(tickets);
  el("metric-alerts").textContent = String(alerts.length);
  el("metric-margin-rate").textContent = `${number.format(rate)}% du CA`;
  el("metric-goal-left").textContent = goal ? `${money.format(Math.max(0, goal - revenue))} restants` : "Objectif non defini";
  el("goal-progress").textContent = goal ? `${number.format(progress)}%` : "0%";
  el("side-goal").textContent = money.format(goal);
  el("side-goal-status").textContent = goal ? `${number.format(progress)}% atteint` : "A definir";

  const productRows = groupedSales();
  el("sales-count").textContent = `${productRows.length} lignes`;
  el("dashboard-products").innerHTML = productRows.length
    ? productRows
        .map((row) => {
          const product = productById(row.productId);
          const marginRate = row.revenue ? (row.margin / row.revenue) * 100 : 0;
          return `
            <tr>
              <td>${escapeHtml(product?.name || "Produit supprime")}</td>
              <td>${number.format(row.qty)}</td>
              <td>${money.format(row.revenue)}</td>
              <td>${money.format(row.margin)}</td>
              <td>${number.format(marginRate)}%</td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(5, "Aucune vente pour cette date.");

  el("action-count").textContent = `${alerts.length} action${alerts.length > 1 ? "s" : ""}`;
  el("action-list").innerHTML = alerts.length
    ? alerts.map((item) => `<div class="list-card"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></div>`).join("")
    : `<div class="list-card calm"><strong>Journee stable</strong><span>Aucune action critique.</span></div>`;

  const payments = Object.entries(paymentBreakdown());
  el("payment-count").textContent = `${payments.length} mode${payments.length > 1 ? "s" : ""}`;
  el("payment-breakdown").innerHTML = payments.length
    ? payments.map(([name, total]) => `<div class="list-card"><strong>${escapeHtml(name)}</strong><span>${money.format(total)}</span></div>`).join("")
    : `<div class="list-card calm"><strong>Aucun encaissement</strong><span>La caisse est vide pour cette date.</span></div>`;

  const timeline = [
    ...openOrders().slice(0, 4).map((order) => ({
      date: order.date,
      title: order.customer,
      meta: `${order.product} - ${money.format(order.total)}`
    })),
    ...productionRows().slice(0, 4).map((item) => ({
      date: currentDate,
      title: productById(item.productId)?.name || "Produit",
      meta: `${number.format(item.qty)} fabriques, ${number.format(item.gap)} restants`
    }))
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  el("timeline-count").textContent = `${timeline.length} element${timeline.length > 1 ? "s" : ""}`;
  el("timeline-list").innerHTML = timeline.length
    ? timeline.map((item) => `<div class="timeline-item"><span>${escapeHtml(item.date)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.meta)}</small></div>`).join("")
    : `<div class="timeline-item"><span>${currentDate}</span><strong>Rien a signaler</strong><small>Aucune commande ni production saisie.</small></div>`;
}

function renderSales() {
  const rows = todaySales().slice().reverse();
  el("sales-journal-count").textContent = `${rows.length} vente${rows.length > 1 ? "s" : ""}`;
  el("sales-table").innerHTML = rows.length
    ? rows
        .map((sale) => {
          const product = productById(sale.productId);
          return `
            <tr>
              <td>${escapeHtml(sale.time)}</td>
              <td>${escapeHtml(product?.name || "Produit supprime")}</td>
              <td>${number.format(sale.qty)}</td>
              <td>${escapeHtml(sale.channel)}</td>
              <td>${escapeHtml(sale.payment)}</td>
              <td>${money.format(saleTotal(sale))}</td>
              <td><button class="delete-button" type="button" data-delete-sale="${sale.id}" title="Supprimer">X</button></td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(7, "Aucune vente saisie.");

  el("quick-sale-grid").innerHTML = state.products
    .slice(0, 12)
    .map((product) => {
      const margin = product.price - product.cost;
      return `
        <button class="quick-sale" type="button" data-quick-sale="${product.id}">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${money.format(product.price)}</span>
          <small>Marge ${money.format(margin)}</small>
        </button>
      `;
    })
    .join("");
}

function renderProduction() {
  const rows = productionRows();
  el("production-summary").textContent = `${rows.length} produit${rows.length > 1 ? "s" : ""}`;
  el("production-table").innerHTML = rows.length
    ? rows
        .map((item) => {
          const product = productById(item.productId);
          return `
            <tr>
              <td>${escapeHtml(product?.name || "Produit supprime")}</td>
              <td>${number.format(item.qty)}</td>
              <td>${number.format(item.sold)}</td>
              <td>${number.format(item.waste)}</td>
              <td>${number.format(item.gap)}</td>
              <td>${escapeHtml(item.team || "-")}</td>
              <td><button class="delete-button" type="button" data-delete-production="${item.id}" title="Supprimer">X</button></td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(7, "Aucune production saisie.");
}

function renderCatalog() {
  const query = productSearch.trim().toLowerCase();
  const rows = state.products.filter((product) => {
    if (!query) return true;
    return `${product.name} ${product.family}`.toLowerCase().includes(query);
  });

  el("catalog-count").textContent = `${state.products.length} produits`;
  el("product-list").innerHTML = rows.length
    ? rows
        .map((product) => {
          const margin = product.price - product.cost;
          const rate = product.price ? (margin / product.price) * 100 : 0;
          return `
            <article class="product-card">
              <div>
                <strong>${escapeHtml(product.name)}</strong>
                <span>${escapeHtml(product.family)}</span>
                <div class="pill-row">
                  <span class="pill">PV ${money.format(product.price)}</span>
                  <span class="pill">Cout ${money.format(product.cost)}</span>
                  <span class="pill">Marge ${money.format(margin)} (${number.format(rate)}%)</span>
                  <span class="pill">${number.format(product.minutes || 0)} min</span>
                </div>
              </div>
              <button class="delete-button" type="button" data-delete-product="${product.id}" title="Supprimer">X</button>
            </article>
          `;
        })
        .join("")
    : `<div class="list-card calm"><strong>Aucun resultat</strong><span>Modifie la recherche.</span></div>`;
}

function renderStock() {
  el("ingredient-count").textContent = `${state.ingredients.length} ingredient${state.ingredients.length > 1 ? "s" : ""}`;
  el("ingredient-table").innerHTML = state.ingredients.length
    ? state.ingredients
        .map((ingredient) => {
          const low = Number(ingredient.stock) <= Number(ingredient.threshold);
          return `
            <tr>
              <td>${escapeHtml(ingredient.name)}</td>
              <td>${escapeHtml(ingredient.unit)}</td>
              <td>${number.format(ingredient.stock)}</td>
              <td>${number.format(ingredient.threshold)}</td>
              <td><span class="status ${low ? "bad" : "good"}">${low ? "Bas" : "OK"}</span></td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(5, "Aucun ingredient.");

  el("purchase-table").innerHTML = state.purchases.length
    ? state.purchases
        .slice()
        .reverse()
        .slice(0, 16)
        .map((purchase) => {
          const ingredient = ingredientById(purchase.ingredientId);
          return `
            <tr>
              <td>${escapeHtml(purchase.date)}</td>
              <td>${escapeHtml(ingredient?.name || "Ingredient supprime")}</td>
              <td>${number.format(purchase.qty)}</td>
              <td>${escapeHtml(purchase.supplier || "-")}</td>
              <td>${money.format(purchase.cost)}</td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(5, "Aucun achat saisi.");
}

function renderOrders() {
  const rows = openOrders();
  el("orders-count").textContent = `${rows.length} commande${rows.length > 1 ? "s" : ""}`;
  el("orders-list").innerHTML = rows.length
    ? rows
        .map((order) => {
          const balance = Number(order.total || 0) - Number(order.deposit || 0);
          return `
            <article class="order-card">
              <div>
                <strong>${escapeHtml(order.customer)}</strong>
                <span>${escapeHtml(order.product)} - ${escapeHtml(order.date)}</span>
                <small>${escapeHtml(order.phone || "")}</small>
              </div>
              <div>
                <span class="status ${order.status === "Prete" ? "good" : "warn"}">${escapeHtml(order.status)}</span>
                <strong>${money.format(order.total)}</strong>
                <small>Reste ${money.format(balance)}</small>
              </div>
              <button class="delete-button" type="button" data-delete-order="${order.id}" title="Supprimer">X</button>
            </article>
          `;
        })
        .join("")
    : `<div class="list-card calm"><strong>Aucune commande ouverte</strong><span>Le carnet est a jour.</span></div>`;
}

function renderExpenses() {
  const rows = todayExpenses().slice().reverse();
  el("expense-total").textContent = money.format(dayExpenseTotal());
  el("expense-table").innerHTML = rows.length
    ? rows
        .map((expense) => `
          <tr>
            <td>${escapeHtml(expense.category)}</td>
            <td>${escapeHtml(expense.note || "-")}</td>
            <td>${money.format(expense.amount)}</td>
            <td><button class="delete-button" type="button" data-delete-expense="${expense.id}" title="Supprimer">X</button></td>
          </tr>
        `)
        .join("")
    : emptyRow(4, "Aucune charge pour cette date.");
}

function renderReports() {
  const revenue = dayRevenue();
  const material = dayCost();
  const waste = dayWasteValue();
  const expenses = dayExpenseTotal();
  const margin = netMargin();
  const payments = paymentBreakdown();
  const paymentLines = Object.entries(payments).map(([name, total]) => `- ${name}: ${money.format(total)}`).join("\n") || "- Aucun encaissement";

  el("daily-close").textContent = [
    `Cloture du ${currentDate}`,
    "",
    `CA: ${money.format(revenue)}`,
    `Cout matiere estime: ${money.format(material)}`,
    `Invendus / pertes: ${money.format(waste)}`,
    `Charges saisies: ${money.format(expenses)}`,
    `Marge nette estimee: ${money.format(margin)}`,
    `Tickets: ${todaySales().length}`,
    `Commandes ouvertes: ${openOrders().length}`,
    "",
    "Encaissements",
    paymentLines,
    "",
    "Top produits",
    groupedSales()
      .slice(0, 5)
      .map((row) => `- ${productById(row.productId)?.name || "Produit supprime"}: ${number.format(row.qty)} / ${money.format(row.revenue)}`)
      .join("\n") || "- Aucun produit"
  ].join("\n");

  const byFamily = groupedSales().reduce((acc, row) => {
    const product = productById(row.productId);
    const family = product?.family || "Autre";
    acc[family] = acc[family] || { revenue: 0, margin: 0 };
    acc[family].revenue += row.revenue;
    acc[family].margin += row.margin;
    return acc;
  }, {});

  el("family-margins").innerHTML = Object.keys(byFamily).length
    ? Object.entries(byFamily)
        .map(([family, row]) => {
          const rate = row.revenue ? (row.margin / row.revenue) * 100 : 0;
          return `<div class="list-card"><strong>${escapeHtml(family)}</strong><span>${money.format(row.revenue)} CA - ${money.format(row.margin)} marge - ${number.format(rate)}%</span></div>`;
        })
        .join("")
    : `<div class="list-card calm"><strong>Aucune vente</strong><span>Les marges apparaitront apres saisie.</span></div>`;
}

function renderSelects() {
  setSelectOptions("sale-product", state.products);
  setSelectOptions("production-product", state.products);
  setSelectOptions("purchase-ingredient", state.ingredients);
}

function renderAll() {
  renderSelects();
  renderDashboard();
  renderSales();
  renderProduction();
  renderCatalog();
  renderStock();
  renderOrders();
  renderExpenses();
  renderReports();
}

function addSale(payload = {}) {
  const product = productById(payload.productId || el("sale-product").value);
  const qty = Number(payload.qty ?? el("sale-qty").value);
  if (!product || qty <= 0) return;

  state.sales.push({
    id: uid("sale"),
    date: currentDate,
    time: nowTime(),
    productId: product.id,
    qty,
    price: product.price,
    cost: product.cost,
    discount: Number((payload.discount ?? el("sale-discount").value) || 0),
    channel: payload.channel || el("sale-channel").value,
    payment: payload.payment || el("sale-payment").value
  });

  saveState();
  renderAll();
  toast("Vente ajoutee");
}

function addProduction(event) {
  event.preventDefault();
  const product = productById(el("production-product").value);
  if (!product) return;

  state.productions.push({
    id: uid("prod"),
    date: currentDate,
    productId: product.id,
    qty: Number(el("production-qty").value),
    waste: Number(el("production-waste").value || 0),
    team: el("production-team").value.trim()
  });

  saveState();
  event.target.reset();
  el("production-qty").value = 10;
  el("production-waste").value = 0;
  renderAll();
  toast("Production enregistree");
}

function addProduct(event) {
  event.preventDefault();
  state.products.push({
    id: uid("product"),
    name: el("product-name").value.trim(),
    family: el("product-family").value,
    price: Number(el("product-price").value),
    cost: Number(el("product-cost").value),
    minutes: Number(el("product-minutes").value || 0),
    threshold: Number(el("product-threshold").value || 0)
  });

  saveState();
  event.target.reset();
  el("product-threshold").value = 10;
  el("product-minutes").value = 0;
  renderAll();
  toast("Produit cree");
}

function addIngredient(event) {
  event.preventDefault();
  state.ingredients.push({
    id: uid("ingredient"),
    name: el("ingredient-name").value.trim(),
    unit: el("ingredient-unit").value.trim(),
    stock: Number(el("ingredient-stock").value || 0),
    threshold: Number(el("ingredient-threshold").value || 0)
  });

  saveState();
  event.target.reset();
  el("ingredient-stock").value = 0;
  el("ingredient-threshold").value = 5;
  renderAll();
  toast("Ingredient cree");
}

function addPurchase(event) {
  event.preventDefault();
  const ingredient = ingredientById(el("purchase-ingredient").value);
  if (!ingredient) return;

  const qty = Number(el("purchase-qty").value);
  const cost = Number(el("purchase-cost").value || 0);
  ingredient.stock += qty;
  state.purchases.push({
    id: uid("purchase"),
    date: currentDate,
    ingredientId: ingredient.id,
    qty,
    cost,
    supplier: el("purchase-supplier").value.trim()
  });

  saveState();
  event.target.reset();
  el("purchase-qty").value = 1;
  el("purchase-cost").value = 0;
  renderAll();
  toast("Achat ajoute");
}

function addOrder(event) {
  event.preventDefault();
  state.orders.push({
    id: uid("order"),
    date: el("order-date").value,
    customer: el("order-customer").value.trim(),
    phone: el("order-phone").value.trim(),
    product: el("order-product").value.trim(),
    total: Number(el("order-total").value || 0),
    deposit: Number(el("order-deposit").value || 0),
    status: el("order-status").value
  });

  saveState();
  event.target.reset();
  el("order-date").value = currentDate;
  el("order-total").value = 0;
  el("order-deposit").value = 0;
  renderAll();
  toast("Commande ajoutee");
}

function addExpense(event) {
  event.preventDefault();
  state.expenses.push({
    id: uid("expense"),
    date: currentDate,
    category: el("expense-category").value,
    amount: Number(el("expense-amount").value || 0),
    note: el("expense-note").value.trim()
  });

  saveState();
  event.target.reset();
  renderAll();
  toast("Charge ajoutee");
}

function removeById(collection, id) {
  state[collection] = state[collection].filter((item) => item.id !== id);
  saveState();
  renderAll();
}

function exportRows(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `fournee-erp-v2-${currentDate}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function switchView(viewName) {
  const button = document.querySelector(`.nav-tab[data-view="${viewName}"]`);
  const view = el(`${viewName}-view`);
  if (!button || !view) return;

  document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.remove("active"));
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  view.classList.add("active");
  el("view-title").textContent = view.dataset.title;
}

function bindEvents() {
  el("business-date").value = currentDate;
  el("daily-goal").value = state.settings.dailyGoal;
  el("order-date").value = currentDate;

  el("business-date").addEventListener("change", (event) => {
    currentDate = event.target.value;
    el("order-date").value = currentDate;
    renderAll();
  });

  el("daily-goal").addEventListener("input", (event) => {
    state.settings.dailyGoal = Number(event.target.value || 0);
    saveState();
    renderAll();
  });

  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.dataset.viewJump) switchView(target.dataset.viewJump);
    if (target.dataset.quickSale) addSale({ productId: target.dataset.quickSale, qty: 1, discount: 0, channel: "Boutique", payment: "Carte" });
    if (target.dataset.deleteSale) removeById("sales", target.dataset.deleteSale);
    if (target.dataset.deleteProduction) removeById("productions", target.dataset.deleteProduction);
    if (target.dataset.deleteProduct) removeById("products", target.dataset.deleteProduct);
    if (target.dataset.deleteOrder) removeById("orders", target.dataset.deleteOrder);
    if (target.dataset.deleteExpense) removeById("expenses", target.dataset.deleteExpense);
  });

  el("sale-form").addEventListener("submit", (event) => {
    event.preventDefault();
    addSale();
    event.target.reset();
    el("sale-qty").value = 1;
    el("sale-discount").value = 0;
  });
  el("production-form").addEventListener("submit", addProduction);
  el("product-form").addEventListener("submit", addProduct);
  el("ingredient-form").addEventListener("submit", addIngredient);
  el("purchase-form").addEventListener("submit", addPurchase);
  el("order-form").addEventListener("submit", addOrder);
  el("expense-form").addEventListener("submit", addExpense);

  el("product-search").addEventListener("input", (event) => {
    productSearch = event.target.value;
    renderCatalog();
  });

  el("export-sales").addEventListener("click", () => {
    exportRows(`ventes-${currentDate}.csv`, [
      ["date", "heure", "produit", "quantite", "canal", "paiement", "remise", "total"],
      ...todaySales().map((sale) => [
        sale.date,
        sale.time,
        productById(sale.productId)?.name || "",
        sale.qty,
        sale.channel,
        sale.payment,
        sale.discount || 0,
        saleTotal(sale)
      ])
    ]);
  });

  el("export-purchases").addEventListener("click", () => {
    exportRows("achats.csv", [
      ["date", "ingredient", "quantite", "fournisseur", "cout"],
      ...state.purchases.map((purchase) => [
        purchase.date,
        ingredientById(purchase.ingredientId)?.name || "",
        purchase.qty,
        purchase.supplier || "",
        purchase.cost
      ])
    ]);
  });

  el("export-json").addEventListener("click", exportJson);
  el("copy-close").addEventListener("click", async () => {
    await navigator.clipboard.writeText(el("daily-close").textContent);
    toast("Cloture copiee");
  });

  el("reset-demo").addEventListener("click", () => {
    if (!confirm("Reinitialiser les donnees de demonstration ?")) return;
    state = clone(seedData);
    saveState();
    el("daily-goal").value = state.settings.dailyGoal;
    renderAll();
    toast("Demo reinitialisee");
  });
}

bindEvents();
renderAll();
