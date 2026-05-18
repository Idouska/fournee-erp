const STORAGE_KEY = "fournee-erp-v1";

const seedData = {
  products: [
    { id: "p1", name: "Baguette tradition", family: "Pain", price: 1.2, cost: 0.34, threshold: 25 },
    { id: "p2", name: "Croissant beurre", family: "Viennoiserie", price: 1.4, cost: 0.48, threshold: 18 },
    { id: "p3", name: "Pain complet", family: "Pain", price: 2.6, cost: 0.82, threshold: 10 },
    { id: "p4", name: "Sandwich poulet", family: "Snacking", price: 4.9, cost: 1.85, threshold: 8 },
    { id: "p5", name: "Eclair chocolat", family: "Patisserie", price: 2.9, cost: 1.05, threshold: 8 }
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
  purchases: []
};

let state = loadState();
let currentDate = localDate();

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

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(seedData);

  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(seedData);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function todaySales() {
  return state.sales.filter((sale) => sale.date === currentDate);
}

function todayProductions() {
  return state.productions.filter((item) => item.date === currentDate);
}

function dayRevenue(sales = todaySales()) {
  return sales.reduce((sum, sale) => sum + sale.price * sale.qty, 0);
}

function dayCost(sales = todaySales()) {
  return sales.reduce((sum, sale) => sum + sale.cost * sale.qty, 0);
}

function dayWasteValue(productions = todayProductions()) {
  return productions.reduce((sum, item) => {
    const product = productById(item.productId);
    return sum + (product ? product.cost * item.waste : 0);
  }, 0);
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
    existing.qty += sale.qty;
    existing.revenue += sale.price * sale.qty;
    existing.margin += (sale.price - sale.cost) * sale.qty;
    groups.set(sale.productId, existing);
  }
  return [...groups.values()].sort((a, b) => b.revenue - a.revenue);
}

function productionRows() {
  return todayProductions().map((item) => {
    const sold = todaySales()
      .filter((sale) => sale.productId === item.productId)
      .reduce((sum, sale) => sum + sale.qty, 0);
    return { ...item, sold, gap: item.qty - sold - item.waste };
  });
}

function setSelectOptions(selectId, rows, labelKey = "name") {
  const select = el(selectId);
  select.innerHTML = rows.map((row) => `<option value="${row.id}">${escapeHtml(row[labelKey])}</option>`).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDashboard() {
  const sales = todaySales();
  const revenue = dayRevenue(sales);
  const margin = revenue - dayCost(sales) - dayWasteValue();
  const waste = dayWasteValue();

  el("metric-ca").textContent = money.format(revenue);
  el("metric-margin").textContent = money.format(margin);
  el("metric-tickets").textContent = String(sales.length);
  el("metric-waste").textContent = money.format(waste);
  el("sales-count").textContent = `${groupedSales().length} lignes`;

  const productRows = groupedSales();
  el("dashboard-products").innerHTML = productRows.length
    ? productRows
        .map((row) => {
          const product = productById(row.productId);
          return `
            <tr>
              <td>${escapeHtml(product?.name || "Produit supprime")}</td>
              <td>${row.qty}</td>
              <td>${money.format(row.revenue)}</td>
              <td>${money.format(row.margin)}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="4" class="empty-row">Aucune vente pour cette date.</td></tr>`;

  const alerts = state.ingredients.filter((ingredient) => ingredient.stock <= ingredient.threshold);
  el("stock-alert-count").textContent = String(alerts.length);
  el("stock-alerts").innerHTML = alerts.length
    ? alerts
        .map(
          (ingredient) => `
            <div class="alert-item">
              <strong>${escapeHtml(ingredient.name)}</strong><br />
              Stock ${number.format(ingredient.stock)} ${escapeHtml(ingredient.unit)}.
              Seuil ${number.format(ingredient.threshold)} ${escapeHtml(ingredient.unit)}.
            </div>
          `
        )
        .join("")
    : `<div class="alert-item">Aucune alerte stock.</div>`;
}

function renderSales() {
  const rows = todaySales().slice().reverse();
  el("sales-table").innerHTML = rows.length
    ? rows
        .map((sale) => {
          const product = productById(sale.productId);
          return `
            <tr>
              <td>${escapeHtml(sale.time)}</td>
              <td>${escapeHtml(product?.name || "Produit supprime")}</td>
              <td>${sale.qty}</td>
              <td>${escapeHtml(sale.payment)}</td>
              <td>${money.format(sale.price * sale.qty)}</td>
              <td><button class="delete-button" type="button" data-delete-sale="${sale.id}" title="Supprimer">X</button></td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="6" class="empty-row">Aucune vente saisie.</td></tr>`;
}

function renderProduction() {
  const rows = productionRows();
  el("production-summary").textContent = `${rows.length} produits`;
  el("production-table").innerHTML = rows.length
    ? rows
        .map((item) => {
          const product = productById(item.productId);
          return `
            <tr>
              <td>${escapeHtml(product?.name || "Produit supprime")}</td>
              <td>${item.qty}</td>
              <td>${item.sold}</td>
              <td>${item.waste}</td>
              <td>${item.gap}</td>
              <td><button class="delete-button" type="button" data-delete-production="${item.id}" title="Supprimer">X</button></td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="6" class="empty-row">Aucune production saisie.</td></tr>`;
}

function renderCatalog() {
  el("catalog-count").textContent = `${state.products.length} produits`;
  el("product-list").innerHTML = state.products
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
            </div>
          </div>
          <button class="delete-button" type="button" data-delete-product="${product.id}" title="Supprimer">X</button>
        </article>
      `;
    })
    .join("");
}

function renderStock() {
  el("ingredient-count").textContent = String(state.ingredients.length);
  el("ingredient-table").innerHTML = state.ingredients
    .map((ingredient) => {
      const low = ingredient.stock <= ingredient.threshold;
      return `
        <tr>
          <td>${escapeHtml(ingredient.name)}</td>
          <td>${escapeHtml(ingredient.unit)}</td>
          <td>${number.format(ingredient.stock)}</td>
          <td class="${low ? "status-low" : "status-ok"}">${low ? "Bas" : "OK"}</td>
        </tr>
      `;
    })
    .join("");

  el("purchase-table").innerHTML = state.purchases.length
    ? state.purchases
        .slice()
        .reverse()
        .slice(0, 12)
        .map((purchase) => {
          const ingredient = ingredientById(purchase.ingredientId);
          return `
            <tr>
              <td>${escapeHtml(purchase.date)}</td>
              <td>${escapeHtml(ingredient?.name || "Ingredient supprime")}</td>
              <td>${number.format(purchase.qty)}</td>
              <td>${money.format(purchase.cost)}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="4" class="empty-row">Aucun achat saisi.</td></tr>`;
}

function renderReports() {
  const sales = todaySales();
  const revenue = dayRevenue(sales);
  const cost = dayCost(sales);
  const waste = dayWasteValue();
  const margin = revenue - cost - waste;
  const payments = sales.reduce((acc, sale) => {
    acc[sale.payment] = (acc[sale.payment] || 0) + sale.price * sale.qty;
    return acc;
  }, {});

  const paymentLines = Object.entries(payments)
    .map(([payment, total]) => `- ${payment}: ${money.format(total)}`)
    .join("\n") || "- Aucun encaissement";

  el("daily-close").textContent = [
    `Cloture du ${currentDate}`,
    "",
    `CA: ${money.format(revenue)}`,
    `Cout matiere estime: ${money.format(cost)}`,
    `Invendus / pertes: ${money.format(waste)}`,
    `Marge brute estimee: ${money.format(margin)}`,
    `Tickets: ${sales.length}`,
    "",
    "Encaissements",
    paymentLines,
    "",
    "Top produits",
    groupedSales()
      .slice(0, 5)
      .map((row) => `- ${productById(row.productId)?.name || "Produit supprime"}: ${row.qty} / ${money.format(row.revenue)}`)
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
          return `
            <div class="family-item">
              <strong>${escapeHtml(family)}</strong><br />
              <span>${money.format(row.revenue)} de CA - ${money.format(row.margin)} de marge - ${number.format(rate)}%</span>
            </div>
          `;
        })
        .join("")
    : `<div class="family-item">Aucune vente pour calculer les marges.</div>`;
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
  renderReports();
}

function addSale(event) {
  event.preventDefault();
  const product = productById(el("sale-product").value);
  const qty = Number(el("sale-qty").value);
  if (!product || qty <= 0) return;

  state.sales.push({
    id: uid("sale"),
    date: currentDate,
    time: nowTime(),
    productId: product.id,
    qty,
    price: product.price,
    cost: product.cost,
    payment: el("sale-payment").value
  });

  saveState();
  event.target.reset();
  el("sale-qty").value = 1;
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
    waste: Number(el("production-waste").value || 0)
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
    threshold: Number(el("product-threshold").value || 0)
  });

  saveState();
  event.target.reset();
  el("product-threshold").value = 10;
  renderAll();
  toast("Produit cree");
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
    cost
  });

  saveState();
  event.target.reset();
  el("purchase-qty").value = 1;
  el("purchase-cost").value = 0;
  renderAll();
  toast("Achat ajoute");
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
  link.download = `fournee-erp-${currentDate}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function bindEvents() {
  el("business-date").value = currentDate;
  el("business-date").addEventListener("change", (event) => {
    currentDate = event.target.value;
    renderAll();
  });

  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      const view = el(`${button.dataset.view}-view`);
      view.classList.add("active");
      el("view-title").textContent = view.dataset.title;
    });
  });

  el("sale-form").addEventListener("submit", addSale);
  el("production-form").addEventListener("submit", addProduction);
  el("product-form").addEventListener("submit", addProduct);
  el("purchase-form").addEventListener("submit", addPurchase);

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.deleteSale) removeById("sales", target.dataset.deleteSale);
    if (target.dataset.deleteProduction) removeById("productions", target.dataset.deleteProduction);
    if (target.dataset.deleteProduct) removeById("products", target.dataset.deleteProduct);
  });

  el("export-sales").addEventListener("click", () => {
    exportRows(`ventes-${currentDate}.csv`, [
      ["date", "heure", "produit", "quantite", "paiement", "total"],
      ...todaySales().map((sale) => [
        sale.date,
        sale.time,
        productById(sale.productId)?.name || "",
        sale.qty,
        sale.payment,
        sale.price * sale.qty
      ])
    ]);
  });

  el("export-purchases").addEventListener("click", () => {
    exportRows("achats.csv", [
      ["date", "ingredient", "quantite", "cout"],
      ...state.purchases.map((purchase) => [
        purchase.date,
        ingredientById(purchase.ingredientId)?.name || "",
        purchase.qty,
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
    state = structuredClone(seedData);
    saveState();
    renderAll();
    toast("Demo reinitialisee");
  });
}

bindEvents();
renderAll();
