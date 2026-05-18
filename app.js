const STORAGE_KEY = "fournee-erp-v2";
const LEGACY_KEY = "fournee-erp-v1";

const seedData = {
  settings: {
    businessName: "Fournee ERP",
    subtitle: "Atelier & boutique",
    currency: "MAD",
    accent: "#c85b7d",
    dailyGoal: 2500,
    families: ["Pain", "Viennoiserie", "Patisserie", "Snacking", "Boisson", "Traiteur"],
    channels: ["Boutique", "Livraison", "Click & collect", "Traiteur"],
    payments: ["Carte", "Especes", "Livraison", "Credit client"],
    orderStatuses: ["A preparer", "En production", "Prete", "Livree"]
  },
  products: [
    { id: "p1", name: "Baguette tradition", family: "Pain", price: 1.2, cost: 0.34, threshold: 25, minutes: 4, photo: "" },
    { id: "p2", name: "Croissant beurre", family: "Viennoiserie", price: 1.4, cost: 0.48, threshold: 18, minutes: 8, photo: "" },
    { id: "p3", name: "Pain complet", family: "Pain", price: 2.6, cost: 0.82, threshold: 10, minutes: 6, photo: "" },
    { id: "p4", name: "Sandwich poulet", family: "Snacking", price: 4.9, cost: 1.85, threshold: 8, minutes: 7, photo: "" },
    { id: "p5", name: "Eclair chocolat", family: "Patisserie", price: 2.9, cost: 1.05, threshold: 8, minutes: 12, photo: "" },
    { id: "p6", name: "Tartelette fruits", family: "Patisserie", price: 3.6, cost: 1.22, threshold: 6, minutes: 14, photo: "" }
  ],
  ingredients: [
    { id: "i1", name: "Farine T65", unit: "kg", stock: 85, threshold: 30, sensitive: false, dlc: "", storage: "Sec", temp: "" },
    { id: "i2", name: "Beurre", unit: "kg", stock: 14, threshold: 8, sensitive: true, dlc: "", storage: "Frais 0-4 C", temp: 3 },
    { id: "i3", name: "Oeufs", unit: "piece", stock: 90, threshold: 30, sensitive: true, dlc: "", storage: "Frais 4-8 C", temp: 5 },
    { id: "i4", name: "Levure", unit: "kg", stock: 4, threshold: 3, sensitive: true, dlc: "", storage: "Frais 0-4 C", temp: 3 },
    { id: "i5", name: "Chocolat", unit: "kg", stock: 7, threshold: 5, sensitive: true, dlc: "", storage: "Frais 4-8 C", temp: 7 },
    { id: "i6", name: "Emballages", unit: "piece", stock: 320, threshold: 120, sensitive: false, dlc: "", storage: "Ambiant", temp: "" }
  ],
  sellers: [
    { id: "s1", name: "Amina", role: "Matin", goal: 900 },
    { id: "s2", name: "Salma", role: "Apres-midi", goal: 900 }
  ],
  sales: [],
  productions: [],
  purchases: [],
  orders: [],
  expenses: [],
  documents: []
};

let state = loadState();
let currentDate = localDate();
let productSearch = "";
let pendingProductPhoto = "";

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
    photo: "",
    ...product
  }));
  data.ingredients = (data.ingredients || []).map((ingredient) => ({
    sensitive: false,
    dlc: "",
    storage: "Ambiant",
    temp: "",
    ...ingredient
  }));
  data.sellers = data.sellers || clone(seedData.sellers);
  data.sales = (data.sales || []).map((sale) => ({
    discount: 0,
    channel: "Boutique",
    sellerId: "",
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
  data.documents = data.documents || [];
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

function cash(value) {
  return `${number.format(Number(value || 0))} ${state.settings.currency || "MAD"}`;
}

function sellerById(id) {
  return state.sellers.find((seller) => seller.id === id);
}

function orderById(id) {
  return state.orders.find((order) => order.id === id);
}

function daysUntil(dateString) {
  if (!dateString) return null;
  const oneDay = 24 * 60 * 60 * 1000;
  const target = new Date(`${dateString}T00:00:00`);
  const today = new Date(`${currentDate}T00:00:00`);
  return Math.ceil((target - today) / oneDay);
}

function storageTempRange(storage) {
  if (storage === "Frais 0-4 C") return [0, 4];
  if (storage === "Frais 4-8 C") return [4, 8];
  if (storage === "Congele") return [-24, -12];
  return null;
}

function ingredientStatus(ingredient) {
  const notes = [];
  const low = Number(ingredient.stock) <= Number(ingredient.threshold);
  const dlcDays = daysUntil(ingredient.dlc);
  const range = storageTempRange(ingredient.storage);
  const temp = ingredient.temp === "" || ingredient.temp == null ? null : Number(ingredient.temp);

  if (low) notes.push("Stock bas");
  if (ingredient.sensitive && !ingredient.dlc) notes.push("DLC absente");
  if (dlcDays !== null && dlcDays < 0) notes.push("DLC depassee");
  if (dlcDays !== null && dlcDays >= 0 && dlcDays <= 3) notes.push(`DLC J-${dlcDays}`);
  if (range && temp !== null && (temp < range[0] || temp > range[1])) notes.push("Temperature anomalie");
  if (ingredient.sensitive && range && temp === null) notes.push("Temperature non saisie");

  return {
    level: notes.length ? "bad" : ingredient.sensitive ? "warn" : "good",
    label: notes.length ? notes.join(", ") : ingredient.sensitive ? "Sensible OK" : "OK"
  };
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

function revenueForDate(date) {
  return state.sales.filter((sale) => sale.date === date).reduce((sum, sale) => sum + saleTotal(sale), 0);
}

function lastDays(count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${currentDate}T00:00:00`);
    date.setDate(date.getDate() - (count - 1 - index));
    return localDate(date);
  });
}

function renderBarChart(containerId, rows, formatter = cash) {
  const max = Math.max(1, ...rows.map((row) => Number(row.value || 0)));
  el(containerId).innerHTML = rows.length
    ? rows
        .map((row) => `
          <div class="bar-row">
            <span>${escapeHtml(row.label)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (row.value / max) * 100)}%"></div></div>
            <strong>${escapeHtml(formatter(row.value))}</strong>
          </div>
        `)
        .join("")
    : `<div class="list-card calm"><strong>Aucune donnee</strong><span>Les graphiques apparaitront apres saisie.</span></div>`;
}

function renderCharts() {
  const days = lastDays(7);
  const dayRows = days.map((date) => ({
    label: date.slice(5),
    value: revenueForDate(date)
  }));
  renderBarChart("daily-chart", dayRows);

  const sellerRows = state.sellers.map((seller) => ({
    label: seller.name,
    value: todaySales()
      .filter((sale) => sale.sellerId === seller.id)
      .reduce((sum, sale) => sum + saleTotal(sale), 0)
  }));
  renderBarChart("seller-chart", sellerRows);

  const familyRows = groupedSales().reduce((acc, row) => {
    const family = productById(row.productId)?.family || "Autre";
    acc[family] = (acc[family] || 0) + row.revenue;
    return acc;
  }, {});
  const total = Math.max(1, Object.values(familyRows).reduce((sum, value) => sum + value, 0));
  el("family-chart").innerHTML = Object.keys(familyRows).length
    ? Object.entries(familyRows)
        .map(([family, value]) => `
          <div class="donut-row">
            <span>${escapeHtml(family)}</span>
            <div class="mini-meter"><div style="width:${(value / total) * 100}%"></div></div>
            <strong>${number.format((value / total) * 100)}%</strong>
          </div>
        `)
        .join("")
    : `<div class="list-card calm"><strong>Aucune vente</strong><span>Le mix familles apparaitra ici.</span></div>`;
}

function buildActions() {
  const actions = [];
  const lowStock = state.ingredients.filter((ingredient) => Number(ingredient.stock) <= Number(ingredient.threshold));
  const sensitiveIssues = state.ingredients
    .map((ingredient) => ({ ingredient, status: ingredientStatus(ingredient) }))
    .filter((row) => row.status.level === "bad");
  const revenue = dayRevenue();
  const goal = Number(state.settings.dailyGoal || 0);
  const waste = dayWasteValue();
  const ordersToday = openOrders().filter((order) => order.date <= currentDate);
  const unpaidDocs = state.documents.filter((doc) => doc.type === "Facture" && doc.status !== "Paye");

  for (const ingredient of lowStock.slice(0, 4)) {
    actions.push({
      title: `Stock bas: ${ingredient.name}`,
      meta: `${number.format(ingredient.stock)} ${ingredient.unit} restants`
    });
  }

  for (const row of sensitiveIssues.slice(0, 4)) {
    actions.push({
      title: `Stock sensible: ${row.ingredient.name}`,
      meta: row.status.label
    });
  }

  if (goal > 0 && revenue < goal) {
    actions.push({
      title: "Objectif CA a pousser",
      meta: `${cash(goal - revenue)} restants`
    });
  }

  if (waste > revenue * 0.08 && waste > 0) {
    actions.push({
      title: "Pertes elevees",
      meta: `${cash(waste)} a analyser`
    });
  }

  for (const order of ordersToday.slice(0, 3)) {
    actions.push({
      title: `Commande: ${order.customer}`,
      meta: `${order.product} - ${order.status}`
    });
  }

  if (unpaidDocs.length) {
    actions.push({
      title: "Factures a suivre",
      meta: `${unpaidDocs.length} facture${unpaidDocs.length > 1 ? "s" : ""} non payee${unpaidDocs.length > 1 ? "s" : ""}`
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

  el("metric-ca").textContent = cash(revenue);
  el("metric-margin").textContent = cash(margin);
  el("metric-basket").textContent = cash(basket);
  el("metric-tickets").textContent = String(tickets);
  el("metric-alerts").textContent = String(alerts.length);
  el("metric-margin-rate").textContent = `${number.format(rate)}% du CA`;
  el("metric-goal-left").textContent = goal ? `${cash(Math.max(0, goal - revenue))} restants` : "Objectif non defini";
  el("goal-progress").textContent = goal ? `${number.format(progress)}%` : "0%";
  el("side-goal").textContent = cash(goal);
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
              <td>${cash(row.revenue)}</td>
              <td>${cash(row.margin)}</td>
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
    ? payments.map(([name, total]) => `<div class="list-card"><strong>${escapeHtml(name)}</strong><span>${cash(total)}</span></div>`).join("")
    : `<div class="list-card calm"><strong>Aucun encaissement</strong><span>La caisse est vide pour cette date.</span></div>`;

  const timeline = [
    ...openOrders().slice(0, 4).map((order) => ({
      date: order.date,
      title: order.customer,
      meta: `${order.product} - ${cash(order.total)}`
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

  renderCharts();
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
              <td>${escapeHtml(sellerById(sale.sellerId)?.name || "-")}</td>
              <td>${escapeHtml(sale.payment)}</td>
              <td>${cash(saleTotal(sale))}</td>
              <td><button class="delete-button" type="button" data-delete-sale="${sale.id}" title="Supprimer">X</button></td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(8, "Aucune vente saisie.");

  el("quick-sale-grid").innerHTML = state.products
    .slice(0, 12)
    .map((product) => {
      const margin = product.price - product.cost;
      return `
        <button class="quick-sale" type="button" data-quick-sale="${product.id}">
          ${product.photo ? `<img src="${product.photo}" alt="" />` : `<div class="photo-fallback">${escapeHtml(product.name.slice(0, 2).toUpperCase())}</div>`}
          <strong>${escapeHtml(product.name)}</strong>
          <span>${cash(product.price)}</span>
          <small>Marge ${cash(margin)}</small>
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
              ${product.photo ? `<img class="product-photo" src="${product.photo}" alt="" />` : `<div class="product-photo placeholder">${escapeHtml(product.name.slice(0, 2).toUpperCase())}</div>`}
              <div>
                <strong>${escapeHtml(product.name)}</strong>
                <span>${escapeHtml(product.family)}</span>
                <div class="pill-row">
                  <span class="pill">PV ${cash(product.price)}</span>
                  <span class="pill">Cout ${cash(product.cost)}</span>
                  <span class="pill">Marge ${cash(margin)} (${number.format(rate)}%)</span>
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
          const status = ingredientStatus(ingredient);
          return `
            <tr>
              <td>${escapeHtml(ingredient.name)}</td>
              <td>${escapeHtml(ingredient.unit)}</td>
              <td>${number.format(ingredient.stock)}</td>
              <td>${number.format(ingredient.threshold)}</td>
              <td>${escapeHtml(ingredient.dlc || "-")}</td>
              <td>${escapeHtml(ingredient.storage || "-")}${ingredient.temp !== "" && ingredient.temp != null ? ` / ${number.format(ingredient.temp)} C` : ""}</td>
              <td><span class="status ${status.level}">${escapeHtml(status.label)}</span></td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(7, "Aucun ingredient.");

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
              <td>${escapeHtml(purchase.dlc || "-")}</td>
              <td>${purchase.temp === "" || purchase.temp == null ? "-" : `${number.format(purchase.temp)} C`}</td>
              <td>${cash(purchase.cost)}</td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(7, "Aucun achat saisi.");
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
                <strong>${cash(order.total)}</strong>
                <small>Reste ${cash(balance)}</small>
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
  el("expense-total").textContent = cash(dayExpenseTotal());
  el("expense-table").innerHTML = rows.length
    ? rows
        .map((expense) => `
          <tr>
            <td>${escapeHtml(expense.category)}</td>
            <td>${escapeHtml(expense.note || "-")}</td>
            <td>${cash(expense.amount)}</td>
            <td><button class="delete-button" type="button" data-delete-expense="${expense.id}" title="Supprimer">X</button></td>
          </tr>
        `)
        .join("")
    : emptyRow(4, "Aucune charge pour cette date.");
}

function renderSellers() {
  const rows = state.sellers;
  el("seller-count").textContent = `${rows.length} vendeuse${rows.length > 1 ? "s" : ""}`;
  el("seller-list").innerHTML = rows.length
    ? rows
        .map((seller) => {
          const sellerSales = todaySales().filter((sale) => sale.sellerId === seller.id);
          const revenue = sellerSales.reduce((sum, sale) => sum + saleTotal(sale), 0);
          const goal = Number(seller.goal || 0);
          const progress = goal ? Math.min(100, (revenue / goal) * 100) : 0;
          return `
            <article class="seller-card">
              <div>
                <strong>${escapeHtml(seller.name)}</strong>
                <span>${escapeHtml(seller.role || "Vente")}</span>
              </div>
              <div class="seller-meter">
                <span>${cash(revenue)} / ${cash(goal)}</span>
                <div class="mini-meter"><div style="width:${progress}%"></div></div>
              </div>
              <button class="delete-button" type="button" data-delete-seller="${seller.id}" title="Supprimer">X</button>
            </article>
          `;
        })
        .join("")
    : `<div class="list-card calm"><strong>Aucune vendeuse</strong><span>Ajoute les personnes en caisse.</span></div>`;
}

function renderDocuments() {
  const rows = state.documents.slice().reverse();
  el("documents-count").textContent = `${rows.length} document${rows.length > 1 ? "s" : ""}`;
  el("documents-list").innerHTML = rows.length
    ? rows
        .map((doc) => {
          const order = orderById(doc.orderId);
          return `
            <article class="document-card">
              <div>
                <strong>${escapeHtml(doc.type)} ${escapeHtml(doc.number)}</strong>
                <span>${escapeHtml(doc.customer)}${order ? ` - lie a ${escapeHtml(order.product)}` : ""}</span>
                <small>${escapeHtml(doc.note || "")}</small>
              </div>
              <div>
                <span class="status ${doc.status === "Paye" || doc.status === "Accepte" ? "good" : doc.status === "Annule" ? "bad" : "warn"}">${escapeHtml(doc.status)}</span>
                <strong>${cash(doc.amount)}</strong>
                <small>${escapeHtml(doc.date)}</small>
              </div>
              <button class="delete-button" type="button" data-delete-document="${doc.id}" title="Supprimer">X</button>
            </article>
          `;
        })
        .join("")
    : `<div class="list-card calm"><strong>Aucun document</strong><span>Devis, bons, factures et avoirs apparaitront ici.</span></div>`;
}

function renderSettings() {
  document.documentElement.style.setProperty("--rose", state.settings.accent || "#c85b7d");
  document.querySelector(".brand strong").textContent = state.settings.businessName || "Fournee ERP";
  document.querySelector(".brand span").textContent = state.settings.subtitle || "Atelier & boutique";
  el("setting-business-name").value = state.settings.businessName || "";
  el("setting-subtitle").value = state.settings.subtitle || "";
  el("setting-currency").value = state.settings.currency || "MAD";
  el("setting-daily-goal").value = state.settings.dailyGoal || 0;
  el("setting-accent").value = state.settings.accent || "#c85b7d";
  el("setting-families").value = (state.settings.families || []).join("\n");
  el("setting-channels").value = (state.settings.channels || []).join("\n");
  el("setting-payments").value = (state.settings.payments || []).join("\n");
  el("setting-order-statuses").value = (state.settings.orderStatuses || []).join("\n");
}

function renderReports() {
  const revenue = dayRevenue();
  const material = dayCost();
  const waste = dayWasteValue();
  const expenses = dayExpenseTotal();
  const margin = netMargin();
  const payments = paymentBreakdown();
  const paymentLines = Object.entries(payments).map(([name, total]) => `- ${name}: ${cash(total)}`).join("\n") || "- Aucun encaissement";

  el("daily-close").textContent = [
    `Cloture du ${currentDate}`,
    "",
    `CA: ${cash(revenue)}`,
    `Cout matiere estime: ${cash(material)}`,
    `Invendus / pertes: ${cash(waste)}`,
    `Charges saisies: ${cash(expenses)}`,
    `Marge nette estimee: ${cash(margin)}`,
    `Tickets: ${todaySales().length}`,
    `Commandes ouvertes: ${openOrders().length}`,
    "",
    "Encaissements",
    paymentLines,
    "",
    "Top produits",
    groupedSales()
      .slice(0, 5)
      .map((row) => `- ${productById(row.productId)?.name || "Produit supprime"}: ${number.format(row.qty)} / ${cash(row.revenue)}`)
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
          return `<div class="list-card"><strong>${escapeHtml(family)}</strong><span>${cash(row.revenue)} CA - ${cash(row.margin)} marge - ${number.format(rate)}%</span></div>`;
        })
        .join("")
    : `<div class="list-card calm"><strong>Aucune vente</strong><span>Les marges apparaitront apres saisie.</span></div>`;
}

function renderSelects() {
  setSelectOptions("sale-product", state.products);
  setSelectOptions("production-product", state.products);
  setSelectOptions("purchase-ingredient", state.ingredients);
  setSelectOptions("sale-seller", state.sellers);

  el("product-family").innerHTML = state.settings.families.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  el("sale-channel").innerHTML = state.settings.channels.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  el("sale-payment").innerHTML = state.settings.payments.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  el("order-status").innerHTML = state.settings.orderStatuses.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  el("document-order").innerHTML = `<option value="">Sans commande liee</option>` + state.orders.map((order) => `<option value="${order.id}">${escapeHtml(order.customer)} - ${escapeHtml(order.product)}</option>`).join("");
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
  renderSellers();
  renderDocuments();
  renderSettings();
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
    sellerId: payload.sellerId ?? el("sale-seller").value,
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
    threshold: Number(el("product-threshold").value || 0),
    photo: pendingProductPhoto
  });

  saveState();
  event.target.reset();
  pendingProductPhoto = "";
  el("product-photo-preview").textContent = "Aucune photo";
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
    threshold: Number(el("ingredient-threshold").value || 0),
    dlc: el("ingredient-dlc").value,
    storage: el("ingredient-storage").value,
    temp: el("ingredient-temp").value === "" ? "" : Number(el("ingredient-temp").value),
    sensitive: el("ingredient-sensitive").checked
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
  const dlc = el("purchase-dlc").value;
  const temp = el("purchase-temp").value;
  ingredient.stock += qty;
  if (dlc) ingredient.dlc = dlc;
  if (temp !== "") ingredient.temp = Number(temp);
  state.purchases.push({
    id: uid("purchase"),
    date: currentDate,
    ingredientId: ingredient.id,
    qty,
    cost,
    supplier: el("purchase-supplier").value.trim(),
    dlc,
    temp: temp === "" ? "" : Number(temp)
  });

  saveState();
  event.target.reset();
  el("purchase-qty").value = 1;
  el("purchase-cost").value = 0;
  el("purchase-dlc").value = "";
  el("purchase-temp").value = "";
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

function addSeller(event) {
  event.preventDefault();
  state.sellers.push({
    id: uid("seller"),
    name: el("seller-name").value.trim(),
    role: el("seller-role").value.trim(),
    goal: Number(el("seller-goal").value || 0)
  });

  saveState();
  event.target.reset();
  el("seller-goal").value = 0;
  renderAll();
  toast("Vendeuse ajoutee");
}

function addDocument(event) {
  event.preventDefault();
  const type = el("document-type").value;
  const prefix = { Devis: "DEV", "Bon de commande": "BC", "Bon de livraison": "BL", Facture: "FAC", Avoir: "AV" }[type] || "DOC";
  state.documents.push({
    id: uid("doc"),
    number: `${prefix}-${String(state.documents.length + 1).padStart(4, "0")}`,
    date: currentDate,
    type,
    customer: el("document-customer").value.trim(),
    orderId: el("document-order").value,
    amount: Number(el("document-amount").value || 0),
    status: el("document-status").value,
    note: el("document-note").value.trim()
  });

  saveState();
  event.target.reset();
  el("document-amount").value = 0;
  renderAll();
  toast("Document cree");
}

function parseLines(value) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

function saveSettings(event) {
  event.preventDefault();
  state.settings.businessName = el("setting-business-name").value.trim() || "Fournee ERP";
  state.settings.subtitle = el("setting-subtitle").value.trim() || "Atelier & boutique";
  state.settings.currency = el("setting-currency").value.trim() || "MAD";
  state.settings.dailyGoal = Number(el("setting-daily-goal").value || 0);
  state.settings.accent = el("setting-accent").value || "#c85b7d";
  el("daily-goal").value = state.settings.dailyGoal;
  saveState();
  renderAll();
  toast("Reglages enregistres");
}

function saveLists(event) {
  event.preventDefault();
  state.settings.families = parseLines(el("setting-families").value).length ? parseLines(el("setting-families").value) : clone(seedData.settings.families);
  state.settings.channels = parseLines(el("setting-channels").value).length ? parseLines(el("setting-channels").value) : clone(seedData.settings.channels);
  state.settings.payments = parseLines(el("setting-payments").value).length ? parseLines(el("setting-payments").value) : clone(seedData.settings.payments);
  state.settings.orderStatuses = parseLines(el("setting-order-statuses").value).length ? parseLines(el("setting-order-statuses").value) : clone(seedData.settings.orderStatuses);
  saveState();
  renderAll();
  toast("Listes mises a jour");
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
    if (target.dataset.deleteSeller) removeById("sellers", target.dataset.deleteSeller);
    if (target.dataset.deleteDocument) removeById("documents", target.dataset.deleteDocument);
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
  el("seller-form").addEventListener("submit", addSeller);
  el("document-form").addEventListener("submit", addDocument);
  el("settings-form").addEventListener("submit", saveSettings);
  el("lists-form").addEventListener("submit", saveLists);

  el("product-photo").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      pendingProductPhoto = "";
      el("product-photo-preview").textContent = "Aucune photo";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      pendingProductPhoto = String(reader.result || "");
      el("product-photo-preview").innerHTML = `<img src="${pendingProductPhoto}" alt="" />`;
    };
    reader.readAsDataURL(file);
  });

  el("product-search").addEventListener("input", (event) => {
    productSearch = event.target.value;
    renderCatalog();
  });

  el("export-sales").addEventListener("click", () => {
    exportRows(`ventes-${currentDate}.csv`, [
      ["date", "heure", "produit", "quantite", "canal", "vendeuse", "paiement", "remise", "total"],
      ...todaySales().map((sale) => [
        sale.date,
        sale.time,
        productById(sale.productId)?.name || "",
        sale.qty,
        sale.channel,
        sellerById(sale.sellerId)?.name || "",
        sale.payment,
        sale.discount || 0,
        saleTotal(sale)
      ])
    ]);
  });

  el("export-purchases").addEventListener("click", () => {
    exportRows("achats.csv", [
      ["date", "ingredient", "quantite", "fournisseur", "dlc", "temperature", "cout"],
      ...state.purchases.map((purchase) => [
        purchase.date,
        ingredientById(purchase.ingredientId)?.name || "",
        purchase.qty,
        purchase.supplier || "",
        purchase.dlc || "",
        purchase.temp ?? "",
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
