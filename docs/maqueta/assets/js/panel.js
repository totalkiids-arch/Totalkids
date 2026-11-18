// Maqueta local: no autentica usuarios, no envía correos y no procesa pagos.
const $ = (q) => document.querySelector(q);
const esc = (v = "") =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (v) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(v);
const icon = (name = "box") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{ grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', box: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>', bag: '<path d="M5 7h14l1 14H4zM9 7V5a3 3 0 0 1 6 0v2"/>', users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>', truck: '<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>', tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1"/>', image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 5 5 3-3 4 4"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>', chart: '<path d="M3 3v18h18M7 16v-4M12 16V6M17 16V9"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', check: '<path d="m5 12 4 4L19 6"/>', arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', alert: '<path d="m12 3 10 18H2zM12 9v4M12 17h.01"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', exit: '<path d="M9 3H3v18h6M13 7l5 5-5 5M8 12h13"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>', card: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M6 15h4"/>', settings: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>' }[name] || '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'}</svg>`;
const brand = `<a class="brand" href="../index.html" aria-label="Total Kids, inicio"><svg class="brand-mark" viewBox="0 0 56 56" aria-hidden="true"><rect x="2" y="26" width="26" height="26" rx="6" fill="#1A5299"/><rect x="28" y="26" width="26" height="26" rx="6" fill="#D0352A"/><rect x="15" y="2" width="26" height="26" rx="6" fill="#FFC21F"/><text x="15" y="46" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="18" fill="#FFFFFF">T</text><text x="41" y="46" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="18" fill="#FFFFFF">K</text><path d="M22 15l4 4 8-8" stroke="#1F2A44" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="brand-text"><span class="brand-name"><span class="t1">T</span><span class="t2">O</span><span class="t3">T</span><span class="t4">A</span><span class="t5">L</span> <span class="k1">K</span><span class="k2">I</span><span class="k3">D</span><span class="k4">S</span></span><span class="brand-tag">Aprender jugando</span></span></a>`;
const seed = {
  products: [
    {
      id: 1,
      name: "Mesa con 2 sillas Montessori",
      sku: "TK-MES-001",
      category: "Mesas y sillas",
      color: "Natural",
      material: "Madera",
      age: "3–5 años",
      price: 89990,
      previous: 99990,
      physical: 12,
      reserved: 2,
      active: true,
      description: "Un espacio para crear, aprender y jugar.",
      dimensions: "60 × 60 × 50 cm",
      assembly: 12000,
      personalization: 8000,
    },
    {
      id: 2,
      name: "Cama casita Montessori",
      sku: "TK-CAM-002",
      category: "Camas y cunas",
      color: "Blanco",
      material: "Madera",
      age: "3–5 años",
      price: 189990,
      previous: 0,
      physical: 4,
      reserved: 2,
      active: true,
      dimensions: "190 × 90 × 150 cm",
    },
    {
      id: 3,
      name: "Librero frontal infantil",
      sku: "TK-LIB-003",
      category: "Libreros y estantes",
      color: "Natural",
      material: "Madera",
      age: "0–2 años",
      price: 64990,
      previous: 0,
      physical: 8,
      reserved: 1,
      active: true,
    },
    {
      id: 4,
      name: "Baúl organizador",
      sku: "TK-BAU-004",
      category: "Organizadores y baúles",
      color: "Rosa",
      material: "Madera",
      age: "3–5 años",
      price: 54990,
      physical: 0,
      reserved: 0,
      active: true,
    },
    {
      id: 5,
      name: "Escritorio infantil",
      sku: "TK-ESC-005",
      category: "Escritorios",
      color: "Azul",
      material: "Madera",
      age: "6–9 años",
      price: 99990,
      physical: 6,
      reserved: 0,
      active: false,
    },
  ],
  orders: [
    {
      id: "TK-1048",
      customer: "Camila González",
      email: "camila@example.com",
      date: "2026-11-17",
      state: "confirmado",
      payment: "pagado",
      product: 1,
      qty: 1,
      total: 106980,
      shipping: 4990,
      extra: 12000,
      document: "Factura",
      company: "Jardín Los Colores (ejemplo)",
      rut: "76.000.000-0 (ejemplo)",
      address: "Dirección de demostración, Ñuñoa",
      history: [],
      refund: 0,
    },
    {
      id: "TK-1047",
      customer: "Javier Muñoz",
      email: "javier@example.com",
      date: "2026-11-16",
      state: "preparando",
      payment: "pagado",
      product: 2,
      qty: 1,
      total: 194980,
      shipping: 4990,
      extra: 0,
      document: "Boleta",
      address: "Dirección de demostración, Providencia",
      history: [],
      refund: 0,
    },
    {
      id: "TK-1046",
      customer: "Daniela Rojas",
      email: "daniela@example.com",
      date: "2026-11-16",
      state: "pendiente_pago",
      payment: "pendiente",
      product: 3,
      qty: 1,
      total: 69980,
      shipping: 4990,
      extra: 0,
      document: "Boleta",
      address: "Dirección de demostración, Santiago",
      history: [],
      refund: 0,
    },
    {
      id: "TK-1045",
      customer: "Fernanda Soto",
      email: "fernanda@example.com",
      date: "2026-11-15",
      state: "despachado",
      payment: "pagado",
      product: 1,
      qty: 1,
      total: 94980,
      shipping: 4990,
      extra: 0,
      document: "Boleta",
      address: "Dirección de demostración, La Reina",
      carrier: "Transportista de ejemplo",
      tracking: "DEMO-1045",
      history: [],
      refund: 0,
    },
    {
      id: "TK-1044",
      customer: "Pablo Pérez",
      email: "pablo@example.com",
      date: "2026-11-14",
      state: "revision",
      payment: "incierto",
      product: 2,
      qty: 1,
      total: 194980,
      shipping: 4990,
      extra: 0,
      document: "Boleta",
      address: "Retiro en taller",
      history: [],
      refund: 0,
    },
  ],
  categories: [
    { id: 1, name: "Mesas y sillas", active: true },
    { id: 2, name: "Camas y cunas", active: true },
    { id: 3, name: "Libreros y estantes", active: true },
    { id: 4, name: "Organizadores y baúles", active: true },
    { id: 5, name: "Escritorios", active: true },
  ],
  coupons: [
    {
      id: 1,
      code: "APRENDER10",
      type: "Porcentaje",
      value: 10,
      start: "2026-11-01",
      end: "2026-12-31",
      limit: 100,
      uses: 12,
      active: true,
    },
  ],
  zones: [
    {
      id: 1,
      region: "Metropolitana",
      commune: "Ñuñoa",
      price: 4990,
      days: "3 a 5 días hábiles",
      active: true,
    },
    {
      id: 2,
      region: "Metropolitana",
      commune: "Providencia",
      price: 4990,
      days: "3 a 5 días hábiles",
      active: true,
    },
    {
      id: 3,
      region: "Metropolitana",
      commune: "Santiago",
      price: 5990,
      days: "3 a 5 días hábiles",
      active: true,
    },
  ],
  banners: [
    {
      id: 1,
      title: "Pequeños espacios, grandes aventuras",
      text: "Muebles para aprender jugando.",
      link: "../pages/catalogo.html",
      active: true,
    },
  ],
  requests: [
    {
      id: 1,
      name: "María López",
      email: "maria@example.com",
      type: "Jardines y colegios",
      message:
        "Necesitamos equipar una sala con 8 mesas y 16 sillas. ¿Podemos recibir una cotización?",
      date: "2026-11-17",
      state: "Nueva",
    },
    {
      id: 2,
      name: "Camila González",
      email: "camila@example.com",
      type: "Armado",
      message: "Me gustaría coordinar el armado de mi mesa.",
      date: "2026-11-16",
      state: "En gestión",
    },
  ],
  subscribers: [
    {
      id: 1,
      email: "ana@example.com",
      date: "2026-11-15",
      version: "demo-v1",
      active: true,
    },
    {
      id: 2,
      email: "pedro@example.com",
      date: "2026-11-14",
      version: "demo-v1",
      active: false,
    },
  ],
  users: [
    {
      id: 1,
      name: "Administración Total Kids",
      email: "admin@example.com",
      role: "Administrador",
      active: true,
    },
    {
      id: 2,
      name: "Equipo de operaciones",
      email: "operador@example.com",
      role: "Operador",
      active: true,
    },
  ],
  emails: [
    {
      id: 1,
      event: "Pedido confirmado",
      order: "TK-1048",
      email: "camila@example.com",
      state: "Enviado",
      attempts: 1,
    },
    {
      id: 2,
      event: "Pedido despachado",
      order: "TK-1045",
      email: "fernanda@example.com",
      state: "Fallido",
      attempts: 3,
    },
    {
      id: 3,
      event: "Solicitud recibida",
      order: "SOL-1",
      email: "maria@example.com",
      state: "Enviado",
      attempts: 1,
    },
  ],
  audit: [
    {
      id: 1,
      date: "17 nov 2026, 10:30",
      actor: "Administración",
      action: "Pedido TK-1048 confirmado (ejemplo)",
    },
  ],
  settings: {
    pickup: "Dirección y horario por confirmar con Total Kids",
    free: 150000,
    reservation: 15,
  },
};
let db;
try {
  db = JSON.parse(localStorage.getItem("tk-demo-v1")) || structuredClone(seed);
} catch {
  db = structuredClone(seed);
}
let role;
try {
  role = sessionStorage.getItem("tk-demo-role") || "Administrador";
} catch {
  role = "Administrador";
}
const save = () => {
  try {
    localStorage.setItem("tk-demo-v1", JSON.stringify(db));
    return true;
  } catch {
    toast(
      "No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado.",
    );
    return false;
  }
};
const log = (action) => {
  db.audit.unshift({
    id: Date.now(),
    date: new Date().toLocaleString("es-CL"),
    actor: role,
    action,
  });
  save();
};
const toast = (msg) => {
  $(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 5000);
};
const label = (s) =>
  ({
    pendiente_pago: "Pendiente de pago",
    confirmado: "Confirmado",
    preparando: "En preparación",
    despachado: "Despachado",
    entregado: "Entregado",
    cancelado: "Cancelado",
    revision: "En revisión",
    vencido: "Vencido",
    pagado: "Pagado",
    pendiente: "Pendiente",
    incierto: "Por conciliar",
    rechazado: "Rechazado",
  })[s] || s;
const badge = (s) =>
  `<span class="badge ${["pagado", "confirmado", "entregado", "Enviado", "Resuelta", "Activo"].includes(s) ? "green" : ["pendiente_pago", "pendiente", "Nueva", "En gestión", "preparando"].includes(s) ? "yellow" : ["revision", "incierto", "Fallido", "cancelado", "Inactivo", "rechazado"].includes(s) ? "red" : "blue"}">${esc(label(s))}</span>`;
const btn = (text, href, primary = false) =>
  `<a class="btn ${primary ? "primary" : ""}" href="${href}">${text}</a>`;
const field = (name, title, value = "", type = "text", extra = "") =>
  `<label class="field">${title}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (name, title, values, value) =>
  `<label class="field">${title}<select name="${name}">${values.map((v) => `<option ${v === value ? "selected" : ""} value="${esc(v)}">${esc(label(v))}</option>`).join("")}</select></label>`;
const check = (name, title, on = false) =>
  `<label class="checkbox"><input type="checkbox" name="${name}" ${on ? "checked" : ""}>${title}</label>`;
const heading = (title, desc, actions = "") =>
  `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div><div class="actions">${actions}</div></div>`;
const table = (
  headers,
  rows,
  empty = "No hay resultados. Prueba con otros filtros.",
) =>
  `<div class="table-wrap" tabindex="0" role="region" aria-label="Tabla de datos; desplázate horizontalmente para ver todas las columnas"><table><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}" class="empty">${empty}</td></tr>`}</tbody></table></div><div class="table-foot">${rows.length} registro${rows.length !== 1 ? "s" : ""} · Datos de demostración</div>`;
const stat = (title, value, note = "") =>
  `<div class="metric"><span>${title}</span><strong>${value}</strong><small>${note}</small></div>`;
const totalPaid = () =>
  db.orders
    .filter((o) => o.payment === "pagado")
    .reduce((n, o) => n + o.total, 0);
const totalRefund = () => db.orders.reduce((n, o) => n + (o.refund || 0), 0);
const orderRows = (orders) =>
  orders.map((o) => [
    `<a href="pedido.html?id=${o.id}"><strong>#${o.id}</strong></a><small>${o.date.split("-").reverse().join("/")}</small>`,
    `${esc(o.customer)}<small>${esc(o.email)}</small>`,
    badge(o.state),
    badge(o.payment),
    money(o.total),
    `<a href="pedido.html?id=${o.id}" class="text-link">Ver pedido</a>`,
  ]);
const nav = [
  [
    "Principal",
    [
      ["index", "Resumen", "grid"],
      ["pedidos", "Pedidos", "bag"],
      ["pagos", "Pagos y conciliación", "card"],
    ],
  ],
  [
    "Tienda",
    [
      ["productos", "Productos", "box"],
      ["categorias", "Categorías", "grid"],
      ["inventario", "Inventario", "box"],
      ["cupones", "Cupones", "tag"],
      ["despachos", "Despacho y retiro", "truck"],
      ["banners", "Banners", "image"],
    ],
  ],
  [
    "Relaciones",
    [
      ["solicitudes", "Solicitudes", "mail"],
      ["suscriptores", "Suscriptores", "users"],
      ["correos", "Correos", "mail"],
    ],
  ],
  [
    "Administración",
    [
      ["reportes", "Reportes", "chart"],
      ["usuarios", "Usuarios y roles", "users"],
      ["auditoria", "Historial de actividad", "clock"],
    ],
  ],
];
const operatorViews = [
  "index",
  "pedidos",
  "pedido",
  "pagos",
  "solicitudes",
  "correos",
  "reportes",
];
const admin = location.pathname.includes("/admin/");
const route =
  location.pathname.split("/").pop().replace(".html", "") || "index";
const params = new URLSearchParams(location.search);
function shell(content) {
  if (admin && route !== "acceso") {
    $("#app").innerHTML =
      `<a class="skip" href="#main">Saltar al contenido</a><aside class="sidebar" id="navigation">${brand}<nav aria-label="Administración">${nav
        .map(([group, items]) => {
          const allowed = items.filter(
            ([r]) => role === "Administrador" || operatorViews.includes(r),
          );
          return allowed.length
            ? `<div class="nav-group">${group}</div>${allowed.map(([r, title, i]) => `<a href="${r}.html" ${r === route || (route === "producto" && r === "productos") || (route === "pedido" && r === "pedidos") ? 'aria-current="page"' : ""}>${icon(i)}${title}</a>`).join("")}`
            : "";
        })
        .join(
          "",
        )}</nav><div class="sidebar-footer"><a href="../index.html">${icon("arrow")} Ver tienda</a><br><a href="acceso.html" id="logout">Cerrar sesión de demo</a></div></aside><div class="workspace"><header class="topbar"><div class="actions"><button class="btn small mobile-menu" aria-controls="navigation" aria-expanded="false" aria-label="Abrir menú">${icon("menu")}</button><p>Total Kids <span class="muted">/ Administración</span></p></div><div class="profile"><span class="demo">Maqueta interactiva</span><span class="avatar">TK</span><span style="font-size:13px">${esc(role)}</span></div></header><main class="main" id="main">${content}</main></div>`;
    const menuButton = $(".mobile-menu"),
      sidebar = $(".sidebar"),
      mobile = matchMedia("(max-width:760px)");
    const setMenu = (open) => {
      sidebar.classList.toggle("open", open);
      sidebar.inert = mobile.matches && !open;
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute(
        "aria-label",
        open ? "Cerrar menú" : "Abrir menú",
      );
    };
    const syncMenu = () => setMenu(false);
    syncMenu();
    mobile.addEventListener("change", syncMenu);
    menuButton?.addEventListener("click", () => {
      const open = !sidebar.classList.contains("open");
      setMenu(open);
      if (open) sidebar.querySelector("[aria-current]")?.focus();
    });
    $("#logout")?.addEventListener("click", () => {
      try {
        sessionStorage.removeItem("tk-demo-role");
      } catch {}
    });
    document.onkeydown = (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("open")) {
        setMenu(false);
        menuButton.focus();
      }
    };
  } else {
    document.body.classList.add("public-body");
    $("#app").innerHTML =
      `<a class="skip" href="#main">Saltar al contenido</a><header class="public-header">${brand}<nav aria-label="Principal"><a href="../index.html">Inicio</a><a href="../pages/catalogo.html">Catálogo</a><a href="../pages/servicios.html">Servicios</a><a href="../pages/cuenta.html">Mi cuenta</a><a href="../pages/carrito.html">Carrito</a></nav></header><main class="public-main" id="main"><div class="notice">${icon("alert")}<p>Maqueta de demostración. Usa datos ficticios. Las acciones se guardan solo en este navegador; no se envían pagos, correos ni solicitudes reales.</p></div>${content}</main><footer class="public-footer"><span>© 2026 Total Kids · Aprender jugando</span><a href="../pages/politicas.html">Políticas y privacidad</a><a href="../pages/mapa.html">Todas las pantallas</a></footer>`;
  }
}
function dashboard() {
  shell(
    heading(
      "Cada pequeño pedido cuenta",
      "Aquí tienes el resumen de tu tienda. Martes 17 de noviembre de 2026.",
      btn("Ver pedidos", "pedidos.html", true),
    ) +
      `<div class="notice">${icon("alert")}<p><strong>${db.orders.filter((o) => o.payment === "incierto").length} pago por conciliar</strong> · Revisa el cobro antes de liberar la reserva. <a href="pagos.html">Revisar pagos</a></p></div><section class="metrics" aria-label="Resumen de la tienda">${stat("Cobros registrados", money(totalPaid()), "Período de demostración")}${stat("Pedidos por preparar", db.orders.filter((o) => o.state === "confirmado").length, "Con pago confirmado")}${stat("Productos con stock bajo", db.products.filter((p) => p.physical - p.reserved < 3).length, "Menos de 3 unidades disponibles")}${stat("Solicitudes nuevas", db.requests.filter((s) => s.state === "Nueva").length, "Esperan una respuesta")}</section><div class="cols"><section class="panel flush"><div class="panel-head"><h2>Últimos pedidos</h2><a href="pedidos.html">Ver todos</a></div>${table(
        ["Pedido", "Cliente", "Estado", "Total"],
        orderRows(db.orders.slice(0, 4)).map((r) => [r[0], r[1], r[2], r[4]]),
      )}</section><section class="panel"><h2>Para tener en cuenta</h2><div class="list-item"><span class="icon-box">${icon("box")}</span><div class="grow"><strong>Revisa el inventario</strong><p>${db.products.filter((p) => p.physical - p.reserved < 3).length} variantes con pocas unidades.</p><a href="inventario.html">Gestionar stock</a></div></div><div class="list-item"><span class="icon-box">${icon("mail")}</span><div class="grow"><strong>Mensajes por responder</strong><p>Armado, personalización y proyectos.</p><a href="solicitudes.html">Ver solicitudes</a></div></div><div class="list-item"><span class="icon-box">${icon("mail")}</span><div class="grow"><strong>Correos con incidencias</strong><p>${db.emails.filter((e) => e.state === "Fallido").length} envío requiere revisión.</p><a href="correos.html">Revisar envíos</a></div></div></section></div><section class="panel"><h2>Tu tienda, a mano</h2><div class="actions">${btn("Agregar producto", "producto.html")}${btn("Crear cupón", "cupones.html#editor")}${btn("Consultar reportes", "reportes.html")}${btn("Ver todas las pantallas", "../pages/mapa.html")}</div><p class="section-note">Los datos de este panel son ficticios y permiten recorrer las operaciones de la SRS.</p></section>`,
  );
}
function orders() {
  shell(
    heading(
      "Pedidos",
      "Consulta compras y acompaña cada pedido hasta su entrega.",
      `<button class="btn" id="export">${icon("download")} Exportar CSV</button>`,
    ) +
      `<div class="toolbar"><label class="field search">Buscar pedido o cliente<input id="search" type="search" placeholder="N.º de pedido, nombre o correo"></label>${select("status", "Estado", ["Todos", "pendiente_pago", "confirmado", "preparando", "despachado", "entregado", "revision", "cancelado", "vencido"], "Todos")}</div><section class="panel flush" id="results"></section>`,
  );
  const update = () => {
    $("#results").innerHTML = table(
      ["Pedido / fecha", "Cliente", "Estado", "Pago", "Total", "Acción"],
      orderRows(
        db.orders.filter(
          (o) =>
            `${o.id} ${o.customer} ${o.email}`
              .toLowerCase()
              .includes($("#search").value.toLowerCase()) &&
            ($("[name=status]").value === "Todos" ||
              o.state === $("[name=status]").value),
        ),
      ),
    );
  };
  $("#search").oninput = update;
  $("[name=status]").onchange = update;
  $("#export").onclick = () =>
    csv(
      "pedidos",
      ["Pedido", "Cliente", "Estado", "Pago", "Total"],
      db.orders.map((o) => [o.id, o.customer, o.state, o.payment, o.total]),
    );
  update();
}
function orderDetail(customer = false) {
  const o = db.orders.find(
    (o) =>
      o.id === (params.get("id") || "TK-1048") &&
      (!customer || o.email === "camila@example.com"),
  );
  if (!o) {
    shell(
      heading(
        "Pedido no encontrado",
        "Vuelve a la lista para elegir un pedido disponible.",
        btn("Ver pedidos", customer ? "cuenta.html" : "pedidos.html"),
      ),
    );
    return;
  }
  const p = seed.products.find((p) => p.id === o.product); // Snapshot independiente del catálogo editable.
  const next =
    {
      pendiente_pago: ["cancelado", "vencido"],
      confirmado: ["preparando", "cancelado"],
      preparando: ["despachado", "cancelado"],
      despachado: ["entregado"],
      revision: ["confirmado", "cancelado"],
    }[o.state] || [];
  shell(
    `<div class="crumb"><a href="${customer ? "cuenta.html" : "pedidos.html"}">${customer ? "Mis pedidos" : "Pedidos"}</a> / #${o.id}</div>` +
      heading(
        `Pedido #${o.id}`,
        `Realizado el ${o.date.split("-").reverse().join("/")} · ${o.customer}`,
        badge(o.state) + badge(o.payment),
      ) +
      `<div class="cols"><div><section class="panel flush"><div class="panel-head"><h2>Productos del pedido</h2></div>${table(["Producto", "Cantidad", "Importe"], [[`<strong>${esc(p.name)}</strong><small>${esc(p.sku)} · ${esc(p.color)} · Precio al comprar</small>${o.extra ? "<small>Extra: armado · " + money(o.extra) + "</small>" : ""}`, o.qty, money(p.price * o.qty + o.extra)]])}</section><section class="panel"><h2>Historial del pedido</h2><ol class="timeline">${(
        o.history || []
      )
        .slice()
        .reverse()
        .map(
          (h) =>
            `<li><strong>${esc(h.action)}</strong><small>${esc(h.date)} · ${esc(h.actor)}</small></li>`,
        )
        .join(
          "",
        )}<li><strong>Pedido recibido</strong><small>${o.date} · Total Kids</small></li></ol></section>${!customer ? `<section class="panel"><h2>Gestionar pedido</h2>${next.length ? `<form id="status-form">${select("state", "Nuevo estado", next, next[0])}<div class="split">${field("carrier", "Transportista", o.carrier || "")}${field("tracking", "Código o referencia de seguimiento", o.tracking || "")}</div>${field("reason", "Motivo del cambio", "", "text", "required")}<p class="muted">Para despachar se requiere pago confirmado, transportista y seguimiento. Cancelar no devuelve dinero.</p><div class="error" id="status-error" role="alert"></div><button class="btn primary">Guardar cambio</button></form>` : '<p class="muted">Este estado no admite más transiciones en la maqueta.</p>'}</section>${o.payment === "pagado" && role === "Administrador" ? `<section class="panel"><h2>Registrar reembolso manual</h2><p class="muted">Registra una devolución ya realizada por un mecanismo externo. Esta acción no mueve dinero.</p><p>Registrado: <strong>${money(o.refund || 0)}</strong> / ${money(o.total)}</p><form id="refund-form"><div class="split">${field("amount", "Monto CLP", "", "number", `required min="1" max="${o.total - (o.refund || 0)}" step="1"`)}${field("date", "Fecha del reembolso", "2026-11-17", "date", "required")}</div>${field("reference", "Referencia del comprobante", "", "text", "required")}<div id="refund-error" class="error" role="alert"></div><button class="btn danger" ${o.refund >= o.total ? "disabled" : ""}>Registrar devolución externa</button></form></section>` : ""}` : ""}</div><div><section class="panel"><h2>Resumen de pago</h2><dl class="detail-list"><dt>Productos y extras</dt><dd>${money(o.total - o.shipping)}</dd><dt>Descuento</dt><dd>$0</dd><dt>Despacho</dt><dd>${money(o.shipping)}</dd><dt class="total">Total</dt><dd class="total">${money(o.total)}</dd><dt>Medio de pago</dt><dd>Flow</dd></dl></section><section class="panel"><h2>Entrega</h2><p>${esc(o.address)}</p><p class="muted">Plazo registrado: 3 a 5 días hábiles.</p>${o.tracking ? `<p><strong>${esc(o.carrier)}</strong><br>Seguimiento: ${esc(o.tracking)}</p>` : ""}</section><section class="panel"><h2>Datos de facturación</h2><p>${esc(o.document)}<br>${esc(o.customer)}<br>${esc(o.email)}</p>${o.document === "Factura" ? `<p>${esc(o.company)}<br>${esc(o.rut)}<br>Giro: educación (ejemplo)<br>${esc(o.address)}</p>` : ""}<p class="muted">La emisión del documento tributario se realiza externamente.</p></section>${customer ? "" : `<section class="panel"><h2>Comunicaciones</h2><p class="muted">Consulta el estado y reenvía una notificación de demostración.</p>${btn("Ver correos del pedido", `correos.html?pedido=${o.id}`)}</section>`}</div></div>`,
  );
  $("#status-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      state = f.get("state");
    if (
      (state === "despachado" || state === "confirmado") &&
      o.payment !== "pagado"
    ) {
      $("#status-error").textContent =
        "Primero concilia y confirma el pago en Pagos y conciliación.";
      return;
    }
    if (
      state === "despachado" &&
      (!f.get("carrier").trim() || !f.get("tracking").trim())
    ) {
      $("#status-error").textContent =
        "Ingresa transportista y seguimiento para despachar.";
      return;
    }
    o.state = state;
    o.carrier = f.get("carrier");
    o.tracking = f.get("tracking");
    const action = `Estado: ${label(state)}. ${f.get("reason")}`;
    o.history.push({
      action,
      date: new Date().toLocaleString("es-CL"),
      actor: role,
    });
    log(`${o.id}: ${action}`);
    orderDetail();
    toast("Cambio guardado en la maqueta.");
  });
  $("#refund-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      amount = Number(f.get("amount"));
    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount + (o.refund || 0) > o.total
    ) {
      $("#refund-error").textContent =
        "El monto debe ser entero y no superar el saldo del pedido.";
      return;
    }
    o.refund = (o.refund || 0) + amount;
    const action = `Reembolso externo registrado: ${money(amount)} · ${f.get("reference")} · ${f.get("date")}`;
    o.history.push({
      action,
      date: new Date().toLocaleString("es-CL"),
      actor: role,
    });
    log(`${o.id}: ${action}`);
    orderDetail();
    toast("Reembolso registrado. No se ejecutó una devolución de dinero.");
  });
}
function products() {
  shell(
    heading(
      "Productos",
      "Organiza los muebles que acompañan cada etapa.",
      btn(`${icon("plus")} Nuevo producto`, "producto.html", true),
    ) +
      `<div class="toolbar"><label class="field search">Buscar producto<input id="search" type="search" placeholder="Nombre o SKU"></label>${select("active", "Publicación", ["Todos", "Activo", "Inactivo"], "Todos")}</div><section class="panel flush" id="results"></section>`,
  );
  const update = () => {
    $("#results").innerHTML = table(
      [
        "Producto / variante",
        "Precio",
        "Disponible",
        "Publicación",
        "Acciones",
      ],
      db.products
        .filter(
          (p) =>
            `${p.name} ${p.sku}`
              .toLowerCase()
              .includes($("#search").value.toLowerCase()) &&
            ($("[name=active]").value === "Todos" ||
              p.active === ($("[name=active]").value === "Activo")),
        )
        .map((p) => [
          `<strong><span class="product-mark">${icon("box")}</span>${esc(p.name)}</strong><small>${esc(p.sku)} · ${esc(p.color)} · ${esc(p.category)}</small>`,
          money(p.price),
          `${p.physical - p.reserved} un.`,
          badge(p.active ? "Activo" : "Inactivo"),
          `<a class="text-link" href="producto.html?id=${p.id}">Editar</a> <button class="text-link" data-toggle="${p.id}">${p.active ? "Desactivar" : "Activar"}</button>`,
        ]),
    );
    document.querySelectorAll("[data-toggle]").forEach(
      (b) =>
        (b.onclick = () => {
          const p = db.products.find((p) => p.id == b.dataset.toggle);
          p.active = !p.active;
          log(`Producto ${p.sku}: ${p.active ? "activado" : "desactivado"}`);
          update();
          toast(
            "Publicación actualizada. Los pedidos históricos se conservan.",
          );
        }),
    );
  };
  $("#search").oninput = update;
  $("[name=active]").onchange = update;
  update();
}
function product() {
  const p = db.products.find((p) => p.id == params.get("id")) || {};
  shell(
    `<div class="crumb"><a href="productos.html">Productos</a> / ${p.id ? "Editar" : "Nuevo"}</div>` +
      heading(
        p.id ? "Editar producto" : "Nuevo producto",
        "Configura la ficha y su variante. Los pedidos anteriores conservan sus datos.",
      ) +
      `<form id="product-form"><div class="cols"><div><section class="panel"><h2>Información del mueble</h2>${field("name", "Nombre del producto", p.name || "", "text", 'required maxlength="120"')}${select(
        "category",
        "Categoría",
        db.categories.filter((c) => c.active).map((c) => c.name),
        p.category,
      )}<label class="field">Descripción<textarea name="description" required>${esc(p.description || "")}</textarea></label><div class="split">${field("dimensions", "Medidas (ancho × fondo × alto)", p.dimensions || "")}${field("material", "Material", p.material || "Madera", "text", "required")}</div>${field("age", "Edad recomendada", p.age || "3–5 años")}</section><section class="panel"><h2>Variante e inventario</h2><div class="split">${field("sku", "SKU único", p.sku || "", "text", "required")}${field("color", "Color de la variante", p.color || "Natural", "text", "required")}${field("price", "Precio CLP", p.price ?? "", "number", 'required min="0" step="1"')}${field("previous", "Precio anterior CLP", p.previous || 0, "number", 'min="0" step="1"')}${field("physical", "Stock físico", p.physical || 0, "number", `required min="${p.reserved || 0}" step="1"`)}</div><p class="muted">${p.reserved || 0} unidades reservadas. El stock físico no puede ser menor que las reservas. Cada ficha de demostración administra una variante con SKU propio.</p></section><section class="panel"><h2>Extras compatibles</h2><div class="split">${field("assembly", "Armado CLP (0 = no disponible)", p.assembly || 0, "number", 'min="0" step="1"')}${field("personalization", "Personalización CLP (0 = no disponible)", p.personalization || 0, "number", 'min="0" step="1"')}</div>${field("textLimit", "Límite de caracteres del nombre", p.textLimit || 20, "number", 'min="1" max="100"')}</section></div><div><section class="panel"><h2>Publicación</h2>${check("active", "Visible en el catálogo", p.active !== false)}<p class="muted">Desactivar conserva el producto y sus pedidos históricos.</p></section><section class="panel"><h2>Imagen del producto</h2><label class="field">Seleccionar imagen<input name="image" type="file" accept="image/png,image/jpeg,image/webp"><small>JPG, PNG o WebP. Máximo 2 MB. Vista previa local.</small></label><img id="image-preview" alt="Vista previa del producto" ${p.image ? `src="${esc(p.image)}"` : "hidden"} style="width:100%;border-radius:8px">${field("alt", "Descripción de la imagen", p.alt || "")}</section></div></div><div id="form-error" class="error" role="alert"></div><div class="form-buttons"><button class="btn primary">Guardar producto</button>${btn("Cancelar", "productos.html")}</div></form>`,
  );
  let image = p.image || "";
  $("[name=image]").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      $("#form-error").textContent =
        "Selecciona JPG, PNG o WebP de hasta 2 MB.";
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      image = reader.result;
      $("#image-preview").src = image;
      $("#image-preview").hidden = false;
    };
    reader.readAsDataURL(file);
  };
  $("#product-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      item = Object.fromEntries(f);
    delete item.image;
    for (const k of [
      "price",
      "previous",
      "physical",
      "assembly",
      "personalization",
      "textLimit",
    ])
      item[k] = Number(item[k]);
    if (
      db.products.some(
        (x) =>
          x.id !== p.id &&
          x.sku.toLowerCase() === item.sku.trim().toLowerCase(),
      )
    ) {
      $("#form-error").textContent = "Ese SKU ya existe. Usa un código único.";
      return;
    }
    if (item.physical < (p.reserved || 0)) {
      $("#form-error").textContent =
        "El stock físico no puede ser menor que las unidades reservadas.";
      return;
    }
    if (item.previous && item.previous < item.price) {
      $("#form-error").textContent =
        "El precio anterior debe ser igual o mayor al precio actual.";
      return;
    }
    Object.assign(item, {
      id: p.id || Date.now(),
      active: f.has("active"),
      reserved: p.reserved || 0,
      image,
    });
    if (p.id) Object.assign(p, item);
    else db.products.push(item);
    log(`Producto guardado: ${item.sku}`);
    if (save()) location.href = "productos.html";
  };
}
function inventory() {
  shell(
    heading(
      "Inventario",
      "Disponible = stock físico − reservas. Los ajustes quedan registrados.",
    ) +
      `<section class="panel flush">${table(
        ["Producto / variante", "Físico", "Reservado", "Disponible", "Ajuste"],
        db.products.map((p) => [
          `<strong>${esc(p.name)}</strong><small>${esc(p.sku)} · ${esc(p.color)}</small>`,
          p.physical,
          p.reserved,
          badge(
            p.physical - p.reserved < 3
              ? "Stock bajo"
              : `${p.physical - p.reserved} un.`,
          ),
          `<button class="text-link" data-adjust="${p.id}">Ajustar stock</button>`,
        ]),
      )}</section><section class="panel" id="editor"><h2>Ajuste de inventario</h2><form id="stock-form"><div class="split"><label class="field">Variante<select name="id">${db.products.map((p) => `<option value="${p.id}">${esc(p.sku)} · ${esc(p.name)}</option>`).join("")}</select></label>${field("physical", "Nuevo stock físico", "", "number", 'required min="0" step="1"')}</div>${field("reason", "Motivo del ajuste", "", "text", "required")}<div class="error" id="form-error" role="alert"></div><button class="btn primary">Registrar ajuste</button></form></section>`,
  );
  document.querySelectorAll("[data-adjust]").forEach(
    (b) =>
      (b.onclick = () => {
        $("[name=id]").value = b.dataset.adjust;
        $("[name=physical]").value = db.products.find(
          (p) => p.id == b.dataset.adjust,
        ).physical;
        $("#editor").scrollIntoView({ behavior: "smooth" });
        $("[name=physical]").focus();
      }),
  );
  $("#stock-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      p = db.products.find((p) => p.id == f.get("id")),
      stock = Number(f.get("physical"));
    if (!Number.isInteger(stock) || stock < p.reserved) {
      $("#form-error").textContent =
        `El stock debe ser un entero de al menos ${p.reserved}, por las reservas vigentes.`;
      return;
    }
    const before = p.physical;
    p.physical = stock;
    log(`Stock ${p.sku}: ${before} → ${stock}. ${f.get("reason")}`);
    inventory();
    toast("Ajuste registrado con responsable, fecha y motivo.");
  };
}
const configs = {
  categorias: {
    collection: "categories",
    title: "Categorías",
    desc: "Ordena los productos del catálogo.",
    columns: ["Nombre", "Estado"],
    values: (x) => [esc(x.name), badge(x.active ? "Activo" : "Inactivo")],
    fields: (x) => field("name", "Nombre", x.name || "", "text", "required"),
  },
  cupones: {
    collection: "coupons",
    title: "Cupones",
    desc: "Descuentos para nuevas compras, con vigencia y límite de uso.",
    columns: ["Código", "Descuento", "Vigencia", "Usos", "Estado"],
    values: (x) => [
      esc(x.code),
      x.type === "Porcentaje" ? x.value + "%" : money(x.value),
      `${x.start} / ${x.end}`,
      `${x.uses || 0} / ${x.limit}`,
      badge(x.active ? "Activo" : "Inactivo"),
    ],
    fields: (x) =>
      `<div class="split">${field("code", "Código", x.code || "", "text", "required")}${select("type", "Tipo", ["Porcentaje", "Monto fijo"], x.type || "Porcentaje")}${field("value", "Valor", x.value || "", "number", 'required min="1" step="1"')}${field("limit", "Máximo de usos", x.limit || 100, "number", 'required min="1" step="1"')}${field("start", "Inicio", x.start || "2026-11-17", "date", "required")}${field("end", "Término", x.end || "2026-12-31", "date", "required")}</div><p class="muted">Un cupón por pedido. No descuenta despacho. Los usos se consumen al pagar.</p>`,
  },
  despachos: {
    collection: "zones",
    title: "Despacho y retiro",
    desc: "Cobertura, tarifas y plazos para nuevas compras.",
    columns: ["Región / comuna", "Tarifa", "Plazo", "Estado"],
    values: (x) => [
      `${esc(x.region)}<small>${esc(x.commune)}</small>`,
      money(x.price),
      esc(x.days),
      badge(x.active ? "Activo" : "Inactivo"),
    ],
    fields: (x) =>
      `<div class="split">${field("region", "Región", x.region || "Metropolitana", "text", "required")}${field("commune", "Comuna", x.commune || "", "text", "required")}${field("price", "Tarifa CLP", x.price ?? "", "number", 'required min="0" step="1"')}${field("days", "Plazo informado", x.days || "3 a 5 días hábiles", "text", "required")}</div>`,
  },
  banners: {
    collection: "banners",
    title: "Banners",
    desc: "Administra los mensajes y enlaces destacados de la tienda.",
    columns: ["Título", "Destino", "Estado"],
    values: (x) => [
      esc(x.title),
      esc(x.link),
      badge(x.active ? "Activo" : "Inactivo"),
    ],
    fields: (x) =>
      `${field("title", "Título", x.title || "", "text", "required")}${field("text", "Texto de apoyo", x.text || "", "text", "required")}${field("link", "Destino interno", x.link || "../pages/catalogo.html", "text", 'required pattern="\\.\\./pages/[a-z-]+\\.html"')}<p class="muted">Usa una página de la maqueta, por ejemplo ../pages/catalogo.html.</p>`,
  },
  usuarios: {
    collection: "users",
    title: "Usuarios y roles",
    desc: "Cuentas internas y responsabilidades del equipo.",
    columns: ["Nombre", "Correo", "Rol", "Estado"],
    values: (x) => [
      esc(x.name),
      esc(x.email),
      esc(x.role),
      badge(x.active ? "Activo" : "Inactivo"),
    ],
    fields: (x) =>
      `${field("name", "Nombre", x.name || "", "text", "required")}${field("email", "Correo", x.email || "", "email", "required")}${select("role", "Rol", ["Administrador", "Operador"], x.role || "Operador")}<p class="muted">Crear una cuenta aquí solo añade un registro ficticio. No se envían invitaciones.</p>`,
  },
};
function collection(view, editId = null) {
  const c = configs[view],
    rows = db[c.collection],
    item = rows.find((x) => x.id === editId) || {};
  shell(
    heading(
      c.title,
      c.desc,
      `<a class="btn primary" href="#editor">${icon("plus")} ${view === "usuarios" ? "Agregar usuario" : "Agregar"}</a>`,
    ) +
      `<section class="panel flush">${table(
        [...c.columns, "Acciones"],
        rows.map((x) => [
          ...c.values(x),
          `<button class="text-link" data-edit="${x.id}">Editar</button><button class="text-link" data-active="${x.id}">${x.active ? "Desactivar" : "Activar"}</button>`,
        ]),
      )}</section>${
        view === "banners"
          ? `<section class="panel"><h2>Vista previa</h2>${
              db.banners
                .filter((x) => x.active)
                .map(
                  (x) =>
                    `<div class="preview-banner"><div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div>${btn("Ver destino", safeLink(x.link))}</div>`,
                )
                .join("") || '<p class="muted">No hay banners activos.</p>'
            }</section>`
          : ""
      }${view === "usuarios" ? permissions() : ""}<section class="panel" id="editor"><h2>${item.id ? "Editar registro" : "Nuevo registro"}</h2><form id="editor-form">${c.fields(item)}${check("active", "Activo", item.active !== false)}<div id="form-error" role="alert" class="error"></div><div class="form-buttons"><button class="btn primary">Guardar</button>${item.id ? '<button type="button" class="btn" id="cancel-edit">Cancelar edición</button>' : ""}</div></form></section>${view === "despachos" ? `<section class="panel"><h2>Retiro y condiciones generales</h2><form id="settings-form">${field("pickup", "Dirección y horario de retiro", db.settings.pickup, "text", "required")}${field("free", "Umbral de despacho gratis CLP", db.settings.free, "number", 'required min="0" step="1"')}${field("reservation", "Duración de reserva (minutos)", db.settings.reservation, "number", 'required min="1" max="120" step="1"')}<p class="muted">El retiro es gratuito. El umbral aplica solo a las zonas habilitadas.</p><button class="btn primary">Guardar condiciones</button></form></section>` : ""}`,
  );
  document.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        collection(view, Number(b.dataset.edit));
        $("#editor").scrollIntoView({ behavior: "smooth" });
        $("#editor input")?.focus();
      }),
  );
  $("#cancel-edit")?.addEventListener("click", () => collection(view));
  document.querySelectorAll("[data-active]").forEach(
    (b) =>
      (b.onclick = () => {
        const x = rows.find((x) => x.id == b.dataset.active);
        if (
          view === "usuarios" &&
          x.role === "Administrador" &&
          x.active &&
          rows.filter((u) => u.role === "Administrador" && u.active).length ===
            1
        ) {
          toast("Debe quedar al menos un administrador activo.");
          return;
        }
        x.active = !x.active;
        log(`${c.title}: ${x.active ? "activado" : "desactivado"} #${x.id}`);
        collection(view);
        toast("Estado actualizado.");
      }),
  );
  $("#editor-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      x = Object.fromEntries(f);
    x.active = f.has("active");
    for (const key of ["price", "value", "limit"])
      if (key in x) x[key] = Number(x[key]);
    const error = (msg) => {
      $("#form-error").textContent = msg;
    };
    if (view === "cupones") {
      if (x.type === "Porcentaje" && x.value > 100)
        return error("El porcentaje no puede superar 100.");
      if (x.end < x.start)
        return error(
          "La fecha de término debe ser posterior o igual al inicio.",
        );
      if (x.limit < (item.uses || 0))
        return error(
          "El límite no puede ser menor que los usos ya consumidos.",
        );
      if (
        rows.some(
          (r) =>
            r.id !== item.id && r.code.toUpperCase() === x.code.toUpperCase(),
        )
      )
        return error("Ese código ya existe.");
      x.code = x.code.trim().toUpperCase();
    }
    if (view === "usuarios") {
      if (
        rows.some(
          (r) =>
            r.id !== item.id && r.email.toLowerCase() === x.email.toLowerCase(),
        )
      )
        return error("Ese correo ya existe.");
      if (
        item.role === "Administrador" &&
        item.active &&
        (!x.active || x.role !== "Administrador") &&
        rows.filter((u) => u.role === "Administrador" && u.active).length === 1
      )
        return error("Debe quedar al menos un administrador activo.");
    }
    if (view === "banners" && !/^\.\.\/pages\/[a-z-]+\.html$/.test(x.link))
      return error("Selecciona un destino interno de la maqueta.");
    if (item.id) Object.assign(item, x);
    else rows.push({ ...x, id: Date.now(), uses: 0 });
    log(`${c.title}: registro guardado`);
    collection(view);
    toast("Cambios guardados en este navegador.");
  };
  $("#settings-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    db.settings = {
      pickup: f.get("pickup"),
      free: Number(f.get("free")),
      reservation: Number(f.get("reservation")),
    };
    log("Condiciones de despacho y retiro actualizadas");
    toast("Condiciones guardadas.");
  });
}
function safeLink(link) {
  return /^\.\.\/pages\/[a-z-]+\.html$/.test(link)
    ? esc(link)
    : "../pages/catalogo.html";
}
function permissions() {
  return `<section class="panel flush"><div class="panel-head"><h2>Permisos por rol</h2></div>${table(
    ["Función", "Administrador", "Operador"],
    [
      ["Pedidos y solicitudes", "Gestionar", "Gestionar"],
      ["Reportes y correos", "Consultar / reenviar", "Consultar / reenviar"],
      ["Catálogo, precios y configuración", "Gestionar", "Sin acceso"],
      ["Usuarios y exportar suscriptores", "Gestionar", "Sin acceso"],
    ],
  )}<p class="section-note" style="padding:0 22px">La maqueta oculta vistas según el rol elegido. La autorización real en backend queda fuera de esta entrega.</p></section>`;
}
function requests() {
  const s = db.requests.find((x) => x.id == params.get("id"));
  shell(
    heading(
      "Solicitudes",
      "Armado, diseño, personalización, instituciones, regalos y garantía.",
      `<button id="export" class="btn">${icon("download")} Exportar CSV</button>`,
    ) +
      `<section class="panel flush">${table(
        ["Solicitud", "Cliente", "Servicio", "Estado", "Acción"],
        db.requests.map((r) => [
          `#SOL-${r.id}<small>${r.date}</small>`,
          `${esc(r.name)}<small>${esc(r.email)}</small>`,
          esc(r.type),
          badge(r.state),
          `<a href="solicitudes.html?id=${r.id}#detail">Ver solicitud</a>`,
        ]),
      )}</section>${s ? `<section class="panel" id="detail"><h2>Solicitud #SOL-${s.id}</h2><p><strong>${esc(s.type)}</strong> · ${esc(s.name)}</p><p>${esc(s.message)}</p><form id="request-form">${select("state", "Estado", ["Nueva", "En gestión", "Resuelta"], s.state)}<label class="field">Nota interna<textarea name="note">${esc(s.note || "")}</textarea></label><button class="btn primary">Guardar seguimiento</button></form></section>` : '<p class="muted">Selecciona una solicitud para consultar su mensaje y gestionar su seguimiento.</p>'}`,
  );
  $("#export").onclick = () =>
    csv(
      "solicitudes",
      ["ID", "Nombre", "Correo", "Servicio", "Estado"],
      db.requests.map((r) => [r.id, r.name, r.email, r.type, r.state]),
    );
  $("#request-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    s.state = f.get("state");
    s.note = f.get("note");
    log(`Solicitud SOL-${s.id}: ${s.state}`);
    requests();
    toast("Seguimiento actualizado.");
  });
}
function subscribers() {
  shell(
    heading(
      "Suscriptores",
      "Consentimiento explícito, versión del texto y baja de suscripción.",
      `<button class="btn" id="export">${icon("download")} Exportar CSV</button>`,
    ) +
      `<section class="panel flush">${table(
        ["Correo", "Fecha de consentimiento", "Versión", "Estado", "Acción"],
        db.subscribers.map((s) => [
          esc(s.email),
          s.date,
          esc(s.version),
          badge(s.active ? "Activo" : "Inactivo"),
          s.active
            ? `<button class="text-link" data-unsubscribe="${s.id}">Registrar baja</button>`
            : "Baja registrada",
        ]),
      )}</section><p class="muted">La exportación de suscriptores está disponible únicamente para el administrador.</p>`,
  );
  $("#export").onclick = () =>
    csv(
      "suscriptores",
      ["Correo", "Fecha", "Versión", "Activo"],
      db.subscribers.map((s) => [s.email, s.date, s.version, s.active]),
    );
  document.querySelectorAll("[data-unsubscribe]").forEach(
    (b) =>
      (b.onclick = () => {
        db.subscribers.find((s) => s.id == b.dataset.unsubscribe).active =
          false;
        log("Baja de suscripción registrada");
        subscribers();
        toast("Baja registrada.");
      }),
  );
}
function emails() {
  const filter = params.get("pedido");
  const rows = db.emails.filter((e) => !filter || e.order === filter);
  shell(
    heading(
      "Correos transaccionales",
      "Consulta entregas e intentos. Los reenvíos de esta maqueta no generan correos reales.",
    ) +
      `<section class="panel flush">${table(
        ["Evento / referencia", "Destinatario", "Estado", "Intentos", "Acción"],
        rows.map((e) => [
          `${esc(e.event)}<small>${esc(e.order)}</small>`,
          esc(e.email),
          badge(e.state),
          e.attempts,
          `<button class="text-link" data-resend="${e.id}">Simular reenvío</button>`,
        ]),
      )}</section><section class="panel"><h2>Vista previa de la plantilla</h2><div class="preview-banner"><div><h3>¡Gracias por crecer con nosotros!</h3><p>Tu pedido #TK-1048 está confirmado. Puedes consultar su estado en Mi cuenta.</p><small>Ejemplo de correo · Total Kids</small></div></div></section>`,
  );
  document.querySelectorAll("[data-resend]").forEach(
    (b) =>
      (b.onclick = () => {
        const e = db.emails.find((x) => x.id == b.dataset.resend);
        e.attempts++;
        e.state = "Enviado";
        log(`Reenvío simulado: ${e.event}, ${e.order}`);
        emails();
        toast("Reenvío simulado y registrado. No se envió un correo real.");
      }),
  );
}
function payments() {
  shell(
    heading(
      "Pagos y conciliación",
      "Revisa pagos pendientes e inciertos sin asumir que el retorno del navegador confirma un cobro.",
    ) +
      `<div class="notice">${icon("alert")}<p>Las respuestas de Flow se simulan. Solo una verificación real del backend puede acreditar un pago y consumir reservas.</p></div><section class="panel flush">${table(
        ["Pedido", "Proveedor", "Monto", "Pago", "Acción"],
        db.orders.map((o) => [
          `<a href="pedido.html?id=${o.id}">#${o.id}</a>`,
          "Flow",
          money(o.total),
          badge(o.payment),
          ["incierto", "pendiente"].includes(o.payment)
            ? `<a href="pagos.html?id=${o.id}#reconcile">Revisar conciliación</a>`
            : "Conciliado (demo)",
        ]),
      )}</section><section class="panel" id="reconcile"><h2>Simular respuesta de conciliación</h2><form id="reconcile-form"><div class="split"><label class="field">Pedido<select name="order">${db.orders
        .filter((o) => ["incierto", "pendiente"].includes(o.payment))
        .map(
          (o) =>
            `<option value="${o.id}" ${params.get("id") === o.id ? "selected" : ""}>${o.id}</option>`,
        )
        .join(
          "",
        )}</select></label>${select("response", "Respuesta simulada de Flow", ["Sin respuesta", "Pago confirmado", "Pago rechazado", "Monto discrepante"], "Sin respuesta")}</div>${field("reason", "Motivo / referencia de la revisión", "", "text", "required")}<button class="btn primary" ${db.orders.every((o) => !["incierto", "pendiente"].includes(o.payment)) ? "disabled" : ""}>Registrar simulación</button></form><p class="section-note">Sin respuesta o con discrepancia, el pedido y su reserva permanecen en revisión. Esta vista no ejecuta movimientos de stock.</p></section>`,
  );
  $("#reconcile-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      o = db.orders.find((o) => o.id === f.get("order"));
    if (!o) return;
    const response = f.get("response");
    o.payment =
      response === "Pago confirmado"
        ? "pagado"
        : response === "Pago rechazado"
          ? "rechazado"
          : "incierto";
    o.state =
      response === "Pago confirmado"
        ? "confirmado"
        : response === "Pago rechazado"
          ? "cancelado"
          : "revision";
    const action = `Conciliación simulada: ${response}. ${f.get("reason")}`;
    o.history.push({
      action,
      date: new Date().toLocaleString("es-CL"),
      actor: role,
    });
    log(`${o.id}: ${action}`);
    payments();
    toast("Respuesta de ejemplo registrada.");
  };
}
function reports() {
  shell(
    heading(
      "Reportes de ventas",
      "Fecha de cobro de ejemplo. Los reembolsos registrados se muestran por separado.",
      `<button class="btn" id="export">${icon("download")} Exportar CSV</button>`,
    ) +
      `<form class="toolbar" id="report-filter">${field("from", "Desde", "2026-11-01", "date", "required")}${field("to", "Hasta", "2026-11-30", "date", "required")}<button class="btn primary">Aplicar período</button></form><div class="error" id="report-error" role="alert"></div><div id="report-results"></div>`,
  );
  let list = [];
  const update = () => {
    const from = $("[name=from]").value,
      to = $("[name=to]").value;
    if (from > to) {
      $("#report-error").textContent =
        "La fecha inicial debe ser anterior o igual a la final.";
      return;
    }
    $("#report-error").textContent = "";
    list = db.orders.filter(
      (o) => o.payment === "pagado" && o.date >= from && o.date <= to,
    );
    const gross = list.reduce((n, o) => n + o.total, 0),
      refund = list.reduce((n, o) => n + (o.refund || 0), 0);
    $("#report-results").innerHTML =
      `<div class="metrics">${stat("Cobros", money(gross))}${stat("Reembolsos registrados", money(refund))}${stat("Neto registrado", money(gross - refund))}${stat("Pedidos pagados", list.length)}</div><section class="panel flush"><div class="panel-head"><h2>Ventas por producto</h2></div>${table(
        ["Producto", "Unidades", "Productos y extras"],
        seed.products.map((p) => {
          const os = list.filter((o) => o.product === p.id);
          return [
            esc(p.name),
            os.reduce((n, o) => n + o.qty, 0),
            money(os.reduce((n, o) => n + o.total - o.shipping, 0)),
          ];
        }),
      )}</section><section class="panel flush"><div class="panel-head"><h2>Ventas por medio de pago</h2></div>${table(["Medio", "Pedidos pagados", "Cobros", "Reembolsos"], [["Flow", list.length, money(gross), money(refund)]])}</section><p class="muted">La fecha del pedido se utiliza como fecha de cobro de ejemplo. No se incluyen pedidos pendientes, rechazados ni inciertos. Neto = cobros menos reembolsos registrados.</p>`;
  };
  $("#report-filter").onsubmit = (e) => {
    e.preventDefault();
    update();
  };
  $("#export").onclick = () =>
    csv(
      "ventas",
      ["Pedido", "Fecha de ejemplo", "Medio", "Cobro", "Reembolso"],
      list.map((o) => [o.id, o.date, "Flow", o.total, o.refund || 0]),
    );
  update();
}
function audit() {
  shell(
    heading(
      "Historial de actividad",
      "Cambios de estado, inventario y configuración con responsable y fecha.",
    ) +
      `<section class="panel flush">${table(
        ["Fecha", "Responsable", "Acción"],
        db.audit.map((a) => [
          esc(a.date),
          esc(a.actor),
          `<span style="white-space:normal">${esc(a.action)}</span>`,
        ]),
      )}</section>`,
  );
}
function csv(name, headers, rows) {
  const cell = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[\s]*[=+@-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const blob = new Blob(
      [
        "\ufeff" +
          [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `total-kids-${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  log(`Exportación CSV: ${name}`);
}
function auth(view) {
  const internal = admin;
  const register = view === "registro",
    recover = view === "recuperar",
    reset = view === "restablecer";
  const title = internal
    ? "Bienvenido al panel"
    : register
      ? "Crea tu cuenta"
      : recover
        ? "Recupera tu acceso"
        : reset
          ? "Elige una nueva contraseña"
          : "Qué bueno verte de nuevo";
  shell(
    `<div class="auth-layout"><section class="auth-intro"><h1>${internal ? "Todo para hacer crecer tu tienda." : "Un espacio para grandes aventuras."}</h1><p>${internal ? "Pedidos, muebles y pequeños detalles. Administra Total Kids desde un mismo lugar." : "Consulta tus pedidos y acompaña cada paso de tus muebles favoritos."}</p><p class="muted">${internal ? "Elige un rol para recorrer sus pantallas. El acceso es una simulación y no protege datos reales." : "Recorrido de ejemplo de registro, acceso y recuperación. No se crean credenciales reales."}</p>${internal ? btn("Ver inventario de pantallas", "../pages/mapa.html") : btn("Explorar el catálogo", "catalogo.html")}</section><section class="panel auth-form"><h1>${title}</h1><form id="auth-form">${internal ? select("role", "Entrar a la demo como", ["Administrador", "Operador"], "Administrador") : ""}${register ? field("name", "Nombre completo", "", "text", 'required autocomplete="name"') : ""}${!reset ? field("email", "Correo electrónico", internal ? "admin@example.com" : "", "email", 'required autocomplete="email"') : ""}${!recover ? field("password", "Contraseña de ejemplo", "", "password", `required minlength="8" autocomplete="${register || reset ? "new-password" : "current-password"}"`) : ""}${reset ? field("confirm", "Repite tu contraseña", "", "password", 'required minlength="8" autocomplete="new-password"') : ""}${register ? check("terms", "Acepto la política de privacidad (texto de demostración)") : ""}<div id="auth-error" role="alert" class="error"></div><button class="btn primary">${internal ? "Entrar a la demo" : register ? "Crear cuenta de ejemplo" : recover ? "Simular recuperación" : reset ? "Restablecer contraseña de ejemplo" : "Entrar a mi cuenta de ejemplo"}</button></form><div id="auth-message" role="status"></div>${!internal ? `<div class="auth-footer">${view === "acceso" ? '<a href="registro.html">Crear cuenta</a><a href="recuperar.html">Olvidé mi contraseña</a>' : '<a href="acceso.html">Volver a iniciar sesión</a>'}</div>` : ""}</section></div>`,
  );
  $("#auth-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (register && !f.has("terms")) {
      $("#auth-error").textContent =
        "Acepta la política de privacidad para continuar.";
      return;
    }
    if (reset && f.get("password") !== f.get("confirm")) {
      $("#auth-error").textContent = "Las contraseñas no coinciden.";
      return;
    }
    if (recover) {
      $("#auth-message").innerHTML =
        `<p class="success" style="margin-top:18px">Si existe una cuenta con ese correo, recibiría un enlace. En esta demo no se envía correo.</p>${btn("Abrir enlace de recuperación de ejemplo", "restablecer.html?token=demostracion")}`;
      return;
    }
    if (reset) {
      $("#auth-message").innerHTML =
        `<p class="success">Recuperación simulada. En el sistema real el enlace tendrá vencimiento y será de un solo uso.</p>${btn("Iniciar sesión", "acceso.html")}`;
      return;
    }
    if (internal) {
      try {
        sessionStorage.setItem("tk-demo-role", f.get("role"));
      } catch {}
      location.href = "index.html";
    } else {
      try {
        sessionStorage.setItem(
          "tk-demo-customer",
          f.get("name") || "Camila González",
        );
      } catch {}
      location.href = "cuenta.html";
    }
  };
}
function account() {
  let name;
  try {
    name = sessionStorage.getItem("tk-demo-customer");
  } catch {}
  name = name || "Camila González";
  const own = db.orders.filter((o) => o.email === "camila@example.com");
  shell(
    heading(
      `Hola, ${esc(name.split(" ")[0])}`,
      "Este es el historial de una cuenta de demostración.",
      btn("Salir de la cuenta", "acceso.html"),
    ) +
      `<section class="panel flush"><div class="panel-head"><h2>Mis pedidos</h2><a href="catalogo.html">Seguir explorando</a></div>${table(
        ["Pedido", "Fecha", "Estado", "Total", ""],
        own.map((o) => [
          `<strong>#${o.id}</strong>`,
          o.date,
          badge(o.state),
          money(o.total),
          `<a href="pedido.html?id=${o.id}">Ver detalle y seguimiento</a>`,
        ]),
      )}</section><section class="panel"><h2>Mi información</h2><p>${esc(name)}<br>camila@example.com · Cuenta ficticia</p><div class="actions">${btn("Cambiar contraseña de ejemplo", "recuperar.html")}${btn("Gestionar suscripción", "suscripcion.html")}</div></section><p class="muted">Esta vista representa el historial propio (RF-23). El aislamiento real entre cuentas requiere autenticación y autorización en backend.</p>`,
  );
}
function payment() {
  shell(
    heading(
      "Paga de forma segura con Flow",
      "Revisa el resumen antes de continuar. Paso 3 de 4.",
      btn("Volver a mis datos", "facturacion.html"),
    ) +
      `<div class="cols"><section class="panel"><h2>Medio de pago</h2><div class="flow">flow</div><p>Flow aloja la página de pago para completar tu compra. Total Kids no recibe ni almacena datos de tarjeta.</p><p class="muted">Esta maqueta no abre una pasarela real. Puedes recorrer los estados posibles del pago.</p><form id="payment-form">${check("terms", 'He revisado las <a href="politicas.html">condiciones de compra, despacho y privacidad de ejemplo</a>.')}<div id="payment-error" class="error" role="alert"></div><button class="btn primary">${icon("card")} Continuar con Flow · Demo</button></form></section><section class="panel"><h2>Resumen de tu pedido</h2><p>Mesa con 2 sillas Montessori<br><span class="muted">Natural · 1 unidad · Extra de armado</span></p><dl class="detail-list"><dt>Producto</dt><dd>$89.990</dd><dt>Armado</dt><dd>$12.000</dd><dt>Descuento</dt><dd>$0</dd><dt>Despacho</dt><dd>$4.990</dd><dt class="total">Total CLP</dt><dd class="total">$106.980</dd></dl><p class="section-note">Importes de ejemplo. En el sistema real los calcula y valida la API.</p></section></div>`,
  );
  $("#payment-form").onsubmit = (e) => {
    e.preventDefault();
    if (!new FormData(e.target).has("terms")) {
      $("#payment-error").textContent =
        "Revisa y acepta las condiciones para continuar.";
      return;
    }
    location.href = "resultado-pago.html?estado=pendiente";
  };
}
function result() {
  const state = [
    "pagado",
    "pendiente",
    "rechazado",
    "revision",
    "vencido",
  ].includes(params.get("estado"))
    ? params.get("estado")
    : "pendiente";
  const descriptions = {
    pagado: [
      "¡Tu compra está confirmada!",
      "Estado pagado de demostración. Prepararemos tus muebles para su próxima aventura.",
    ],
    pendiente: [
      "Estamos verificando tu pago",
      "Volver de Flow no confirma el cobro. Espera la verificación antes de intentar pagar nuevamente.",
    ],
    rechazado: [
      "No se pudo completar el pago",
      "El intento anterior se muestra como rechazado. En el sistema real se verifica que ya no sea pagable antes de permitir un nuevo intento.",
    ],
    revision: [
      "Tu pago necesita una revisión",
      "No podemos descartar un cobro. Conservamos el pedido en revisión y el equipo debe conciliarlo.",
    ],
    vencido: [
      "El plazo de pago terminó",
      "La reserva de ejemplo venció. Vuelve al carrito para revisar precio y disponibilidad antes de crear otra compra.",
    ],
  };
  shell(
    `<div class="result"><div class="result-icon">${icon(state === "pagado" ? "check" : state === "pendiente" ? "clock" : "alert")}</div><h1>${descriptions[state][0]}</h1><p>${descriptions[state][1]}</p><div class="panel"><h2>Pedido #TK-1048</h2>${badge(state)}<dl class="detail-list"><dt>Comprador de ejemplo</dt><dd>Camila González</dd><dt>Medio de pago</dt><dd>Flow</dd><dt>Total CLP</dt><dd>$106.980</dd></dl><div class="actions">${state === "pagado" ? btn("Ver mi pedido", "pedido.html?id=TK-1048", true) : state === "rechazado" ? btn("Simular reintento conciliado", "pago.html", true) : state === "vencido" ? btn("Volver al carrito", "carrito.html", true) : btn("Volver a consultar estado de ejemplo", `resultado-pago.html?estado=${state}`, true)}${btn("Volver a la tienda", "../index.html")}</div></div><p class="muted">Selector de escenarios para la presentación. Elegir un estado no acredita un pago ni modifica el pedido.</p><div class="screen-links">${["pagado", "pendiente", "rechazado", "revision", "vencido"].map((s) => `<a href="resultado-pago.html?estado=${s}" ${state === s ? 'aria-current="page"' : ""}>${label(s)}</a>`).join("")}</div></div>`,
  );
}
function subscription() {
  shell(
    `<section class="panel prose"><h1>Novedades para crecer jugando</h1><p>Recorrido de ejemplo de suscripción y baja del newsletter.</p><form id="subscribe-form">${field("email", "Tu correo", "", "email", 'required autocomplete="email"')}${check("consent", 'Quiero recibir novedades y acepto la <a href="politicas.html#privacidad">política de privacidad de ejemplo</a> (demo-v1).')}<div id="subscription-error" role="alert" class="error"></div><div class="actions"><button class="btn primary" name="action" value="subscribe">Suscribirme en la demo</button><button class="btn" name="action" value="unsubscribe">Dar de baja en la demo</button></div><p class="section-note">El consentimiento no está premarcado. Su fecha y versión quedan visibles en el panel.</p></form><div id="subscription-message" role="status"></div></section>`,
  );
  $("#subscribe-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      email = f.get("email").trim().toLowerCase(),
      unsubscribe = e.submitter.value === "unsubscribe";
    if (!unsubscribe && !f.has("consent")) {
      $("#subscription-error").textContent =
        "Marca el consentimiento si deseas suscribirte.";
      return;
    }
    $("#subscription-error").textContent = "";
    let s = db.subscribers.find((s) => s.email === email);
    if (unsubscribe) {
      if (s) s.active = false;
      log("Solicitud de baja de newsletter (demo)");
      $("#subscription-message").innerHTML =
        '<p class="success">Si ese correo estaba suscrito, se ha registrado su baja en la demo.</p>';
    } else {
      if (!s) {
        s = { id: Date.now(), email };
        db.subscribers.push(s);
      }
      Object.assign(s, {
        active: true,
        date: new Date().toLocaleDateString("en-CA"),
        version: "demo-v1",
      });
      log("Consentimiento newsletter demo-v1 registrado");
      $("#subscription-message").innerHTML =
        '<p class="success">Suscripción registrada en este navegador. No se enviarán correos reales.</p>';
    }
  };
}
function serviceRequest() {
  shell(
    heading(
      "Cuéntanos tu idea",
      "Armado, diseño, personalización, instituciones, regalos y garantía.",
    ) +
      `<section class="panel prose"><form id="service-form"><div class="split">${field("name", "Tu nombre", "", "text", "required")}${field("email", "Correo", "", "email", "required")}</div>${select("type", "Servicio", ["Armado", "Diseño", "Personalización", "Jardines y colegios", "Regalos", "Garantía"], params.get("tipo") || "Armado")}<label class="field">¿Cómo podemos ayudarte?<textarea name="message" required minlength="10" maxlength="2000"></textarea></label>${check("consent", 'Acepto la <a href="politicas.html#privacidad">política de privacidad de ejemplo</a>.')}<div id="service-error" class="error" role="alert"></div><button class="btn primary">Registrar solicitud de ejemplo</button></form><div id="service-message" role="status"></div></section>`,
  );
  $("#service-form").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (!f.has("consent")) {
      $("#service-error").textContent =
        "Acepta la política de privacidad para registrar la solicitud.";
      return;
    }
    const r = {
      ...Object.fromEntries(f),
      id: Date.now(),
      date: new Date().toLocaleDateString("en-CA"),
      state: "Nueva",
    };
    delete r.consent;
    db.requests.unshift(r);
    db.emails.unshift({
      id: Date.now(),
      event: "Solicitud recibida",
      order: `SOL-${r.id}`,
      email: r.email,
      state: "Enviado",
      attempts: 1,
    });
    log(`Solicitud de ejemplo registrada: ${r.type}`);
    $("#service-form").hidden = true;
    $("#service-message").innerHTML =
      `<h2>¡Recibimos tu idea en la demo!</h2><p>Referencia SOL-${r.id}. Puedes verla en el panel de solicitudes. No se ha enviado un correo real.</p>${btn("Volver a servicios", "servicios.html")}`;
  };
}
function policies() {
  shell(
    `<article class="prose"><h1>Condiciones y privacidad</h1><div class="notice"><p>Contenido provisional para revisar la maqueta. Total Kids debe aportar y aprobar las políticas definitivas antes de publicar.</p></div><h2 id="compra">Compra y precios</h2><p>Los importes se presentan en pesos chilenos. El resumen de compra debe informar productos, extras, descuentos y despacho antes del pago.</p><h2 id="despacho">Despacho y retiro</h2><p>La compra ofrece zonas habilitadas con tarifa y plazo, o retiro sin costo. La dirección y el horario definitivos están pendientes de confirmación.</p><h2 id="cambios">Retracto, cambios y garantía</h2><p>Texto comercial y condiciones pendientes de aprobación por Total Kids. Puedes recorrer la solicitud de garantía desde Servicios especiales.</p><h2 id="factura">Boleta y factura</h2><p>Los datos se recopilan en el checkout. La emisión tributaria es externa y no se realiza automáticamente en la maqueta.</p><h2 id="cancelaciones">Cancelaciones y reembolsos</h2><p>Cancelar un pedido no devuelve dinero automáticamente. La devolución manual se registra en el panel con monto, fecha y referencia.</p><h2 id="privacidad">Privacidad y newsletter</h2><p>Esta maqueta almacena únicamente datos de demostración en este navegador. No ingreses información personal real. El newsletter requiere consentimiento separado y permite la baja.</p><p>Responsable, contacto, retención y versión legal definitiva: pendientes de aprobación por Total Kids.</p><div class="actions">${btn("Gestionar suscripción", "suscripcion.html")}${btn("Solicitar ayuda o garantía", "solicitud-servicio.html")}</div></article>`,
  );
}
function sitemap() {
  shell(
    heading(
      "Toda la maqueta, en un lugar",
      "Inventario de pantallas basado en la SRS Total Kids v1.1. Las funciones técnicas requieren una implementación posterior.",
    ) +
      `<section class="panel"><h2>Tienda y compra</h2><div class="screen-links">${[
        ["../index.html", "Inicio"],
        ["catalogo.html", "Catálogo y búsqueda"],
        ["producto.html", "Ficha de producto"],
        ["carrito.html", "Carrito"],
        ["facturacion.html", "Datos y facturación"],
        ["pago.html", "Pago Flow"],
        ["resultado-pago.html", "Resultado de pago"],
        ["servicios.html", "Servicios"],
        ["solicitud-servicio.html", "Solicitar servicio"],
        ["suscripcion.html", "Suscripción y baja"],
        ["politicas.html", "Políticas"],
      ]
        .map(([href, name]) => `<a href="${href}">${name}</a>`)
        .join(
          "",
        )}</div></section><section class="panel"><h2>Cuenta del comprador</h2><div class="screen-links">${[
        ["acceso", "Iniciar sesión"],
        ["registro", "Crear cuenta"],
        ["recuperar", "Recuperar acceso"],
        ["restablecer", "Restablecer contraseña"],
        ["cuenta", "Historial de pedidos"],
        ["pedido", "Detalle y seguimiento"],
      ]
        .map(([href, name]) => `<a href="${href}.html">${name}</a>`)
        .join(
          "",
        )}</div></section><section class="panel"><h2>Panel administrativo</h2><div class="screen-links"><a href="../admin/acceso.html">Acceso por rol</a>${nav
        .flatMap(([, items]) => items)
        .map(([href, name]) => `<a href="../admin/${href}.html">${name}</a>`)
        .join(
          "",
        )}<a href="../admin/producto.html">Crear / editar producto</a><a href="../admin/pedido.html">Detalle de pedido y reembolso</a></div></section><section class="panel"><h2>Estados de pago</h2><div class="screen-links">${["pagado", "pendiente", "rechazado", "revision", "vencido"].map((s) => `<a href="resultado-pago.html?estado=${s}">${label(s)}</a>`).join("")}</div></section><section class="panel"><h2>Datos de la presentación</h2><p>Las altas y cambios se conservan en este navegador. Puedes restaurar los ejemplos para comenzar otro recorrido.</p><button class="btn danger" id="reset-demo">Restaurar datos de ejemplo</button><div id="reset-confirm"></div></section>`,
  );
  $("#reset-demo").onclick = () => {
    $("#reset-confirm").innerHTML =
      '<p style="margin-top:16px">Se borrarán los cambios locales de esta maqueta.</p><button class="btn danger" id="confirm-reset">Sí, restaurar ejemplos</button>';
    $("#confirm-reset").onclick = () => {
      db = structuredClone(seed);
      save();
      sitemap();
      toast("Datos de ejemplo restaurados.");
    };
  };
}
if (admin) {
  if (route === "acceso") auth(route);
  else if (role === "Operador" && !operatorViews.includes(route))
    shell(
      heading(
        "Acceso restringido en la demo",
        "El rol Operador gestiona pedidos y solicitudes. Catálogo, configuración y usuarios requieren el rol Administrador.",
        btn("Volver al resumen", "index.html", true),
      ),
    );
  else if (configs[route]) collection(route);
  else
    (
      ({
        index: dashboard,
        pedidos: orders,
        pedido: () => orderDetail(),
        productos: products,
        producto: product,
        inventario: inventory,
        solicitudes: requests,
        suscriptores: subscribers,
        correos: emails,
        pagos: payments,
        reportes: reports,
        auditoria: audit,
      })[route] || dashboard
    )();
} else if (["acceso", "registro", "recuperar", "restablecer"].includes(route))
  auth(route);
else
  (
    ({
      cuenta: account,
      pedido: () => orderDetail(true),
      pago: payment,
      "resultado-pago": result,
      suscripcion: subscription,
      "solicitud-servicio": serviceRequest,
      politicas: policies,
      mapa: sitemap,
    })[route] || sitemap
  )();
