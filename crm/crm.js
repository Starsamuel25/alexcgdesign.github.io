// CRM Dentistas RD - logica cliente
// Estado por contacto (estado + notas) en localStorage bajo "crm_dentistas_state_v2".
// v2: pipeline de ventas (prospecto -> cerrado_ganado/perdido) en vez de estados de llamada.

const STORAGE_KEY = "crm_dentistas_state_v2";

const ESTADOS = [
    "prospecto",
    "auditado",
    "contactado",
    "cita_agendada",
    "propuesta_enviada",
    "cerrado_ganado",
    "cerrado_perdido",
];
const ESTADO_LABEL = {
    prospecto:         "Prospecto",
    auditado:          "Auditado",
    contactado:        "Contactado",
    cita_agendada:     "Cita agendada",
    propuesta_enviada: "Propuesta enviada",
    cerrado_ganado:    "Cliente ganado",
    cerrado_perdido:   "Cerrado perdido",
};
const SCORE_LABEL = { alto: "🔥 Alto", medio: "Medio", bajo: "Bajo" };

const state = {
    dentistas: [],
    progreso: {},
    filtros: { texto: "", provincia: "", estado: "", score: "", web: "" },
};

const els = {
    grid: document.getElementById("grid"),
    search: document.getElementById("search"),
    filterProvincia: document.getElementById("filterProvincia"),
    filterEstado: document.getElementById("filterEstado"),
    filterScore: document.getElementById("filterScore"),
    filterWeb: document.getElementById("filterWeb"),
    btnExport: document.getElementById("btnExport"),
    btnReset: document.getElementById("btnReset"),
    statTotal: document.getElementById("statTotal"),
    statGanados: document.getElementById("statGanados"),
    statActivos: document.getElementById("statActivos"),
    statAlto: document.getElementById("statAlto"),
    template: document.getElementById("cardTemplate"),
};

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------
function loadProgress() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.warn("No se pudo leer el progreso:", err);
        return {};
    }
}

function saveProgress() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progreso));
    } catch (err) {
        console.warn("No se pudo guardar el progreso:", err);
    }
}

function getProgreso(id) {
    if (!state.progreso[id]) {
        state.progreso[id] = { estado: "prospecto", notas: "", updated: null };
    }
    return state.progreso[id];
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------
async function loadDataset() {
    const res = await fetch("dentists.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("No se pudo cargar dentists.json");
    const data = await res.json();
    state.dentistas = data.dentistas || [];
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------
function normalize(text) {
    return (text || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
}

function applyFilters() {
    const q = normalize(state.filtros.texto.trim());
    const { provincia, estado, score, web } = state.filtros;
    return state.dentistas.filter((d) => {
        if (provincia && d.provincia !== provincia) return false;
        if (score && d.lead_score !== score) return false;
        if (web === "con_web" && !d.web) return false;
        if (web === "sin_web" &&  d.web) return false;
        if (web === "obsoleta" && !["wordpress_gratis", "basica"].includes(d.web_calidad)) return false;
        if (estado) {
            const est = getProgreso(d.id).estado;
            if (est !== estado) return false;
        }
        if (!q) return true;
        const haystack = normalize(
            [d.nombre, d.telefono, d.telefono_alt, d.direccion, d.ciudad, d.provincia, d.especialidad, d.web].join(" ")
        );
        return haystack.includes(q);
    });
}

// ---------------------------------------------------------------------------
// Helpers de links externos
// ---------------------------------------------------------------------------
function telLink(phone) {
    const clean = phone.replace(/[^\d+]/g, "");
    return "tel:+1" + clean.replace(/^1/, "");
}
function waLink(phone) {
    const clean = phone.replace(/\D/g, "");
    const n = clean.length === 11 && clean.startsWith("1") ? clean : "1" + clean;
    return "https://wa.me/" + n;
}
function googleSearchLink(d) {
    const q = encodeURIComponent(`"${d.nombre}" ${d.ciudad || d.provincia} dentista`);
    return "https://www.google.com/search?q=" + q;
}
function googleMapsLink(d) {
    const q = encodeURIComponent(`${d.nombre} ${d.ciudad || ""} ${d.provincia || ""} Republica Dominicana`);
    return "https://www.google.com/maps/search/" + q;
}
function instagramSearchLink(d) {
    const q = encodeURIComponent(d.nombre);
    return "https://www.google.com/search?q=site%3Ainstagram.com+" + q;
}
function pageSpeedLink(url) {
    return "https://pagespeed.web.dev/analysis?url=" + encodeURIComponent(url);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function renderProvincias() {
    const provincias = Array.from(
        new Set(state.dentistas.map((d) => d.provincia).filter(Boolean))
    ).sort();
    els.filterProvincia.innerHTML =
        '<option value="">Todas las provincias</option>' +
        provincias.map((p) => `<option value="${p}">${p}</option>`).join("");
}

function renderPhoneRow(d, phone, isAlt) {
    if (!phone || phone === "verificar") {
        return `
            <div class="phone-row phone-row--missing">
                <span class="phone-row__label">Sin teléfono</span>
                <a class="btn btn--mini" href="${googleSearchLink(d)}" target="_blank" rel="noopener">🔍 Buscar</a>
                <a class="btn btn--mini" href="${googleMapsLink(d)}" target="_blank" rel="noopener">📍 Maps</a>
                <a class="btn btn--mini" href="${instagramSearchLink(d)}" target="_blank" rel="noopener">📷 IG</a>
            </div>`;
    }
    return `
        <div class="phone-row">
            <a class="phone-link${isAlt ? " phone-link--alt" : ""}" href="${telLink(phone)}">📞 ${phone}</a>
            <a class="btn btn--wa" href="${waLink(phone)}" target="_blank" rel="noopener" title="Abrir WhatsApp">WA</a>
        </div>`;
}

function renderWebRow(d) {
    if (d.web) {
        const obsoleta = ["wordpress_gratis", "basica"].includes(d.web_calidad);
        const tag = d.web_calidad === "wordpress_gratis" ? "WordPress gratis — pitch fácil"
                  : d.web_calidad === "basica"           ? "Web básica — rediseño"
                  : d.web_calidad === "institucional"    ? "Institucional"
                  : "Web moderna";
        return `
            <div class="web-row">
                <a class="btn btn--web" href="${d.web}" target="_blank" rel="noopener">🌐 ${new URL(d.web).hostname}</a>
                <a class="btn btn--audit" href="${pageSpeedLink(d.web)}" target="_blank" rel="noopener" title="Auditar con PageSpeed Insights">⚡ Auditar</a>
                <span class="web-tag ${obsoleta ? "web-tag--opp" : ""}">${tag}</span>
            </div>`;
    }
    return `
        <div class="web-row web-row--missing">
            <span class="no-web">🚫 Sin web — oportunidad</span>
            <a class="btn btn--mini" href="${googleSearchLink(d)}" target="_blank" rel="noopener">Verificar</a>
        </div>`;
}

function renderCard(d) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const progreso = getProgreso(d.id);

    node.dataset.id = d.id;
    node.dataset.estado = progreso.estado;
    node.dataset.score = d.lead_score;

    node.querySelector(".card__name").textContent = d.nombre;
    node.querySelector(".card__direccion").textContent = d.direccion || "(sin dirección)";
    node.querySelector(".card__provincia").textContent =
        [d.ciudad, d.provincia].filter(Boolean).join(" · ") || "Sin provincia";
    node.querySelector(".card__especialidad").textContent = d.especialidad || "";
    node.querySelector(".card__estado").textContent = ESTADO_LABEL[progreso.estado];
    node.querySelector(".card__score").textContent = SCORE_LABEL[d.lead_score] || "";
    node.querySelector(".card__fuente").textContent = d.fuente ? `Fuente: ${d.fuente}` : "";

    const contacto = node.querySelector(".card__contacto");
    contacto.insertAdjacentHTML("beforeend", renderPhoneRow(d, d.telefono, false));
    if (d.telefono_alt) {
        contacto.insertAdjacentHTML("beforeend", renderPhoneRow(d, d.telefono_alt, true));
    }
    contacto.insertAdjacentHTML("beforeend", renderWebRow(d));

    const estadoSelect = node.querySelector(".card__estadoSelect");
    estadoSelect.innerHTML = ESTADOS.map(
        (e) => `<option value="${e}">${ESTADO_LABEL[e]}</option>`
    ).join("");
    estadoSelect.value = progreso.estado;
    estadoSelect.addEventListener("change", (e) => {
        const p = getProgreso(d.id);
        p.estado = e.target.value;
        p.updated = new Date().toISOString();
        saveProgress();
        node.dataset.estado = p.estado;
        node.querySelector(".card__estado").textContent = ESTADO_LABEL[p.estado];
        updateStats();
        if (state.filtros.estado && state.filtros.estado !== p.estado) node.remove();
    });

    const notasArea = node.querySelector(".card__notas");
    notasArea.value = progreso.notas || "";
    const notasBtn = node.querySelector(".card__notasBtn");
    if (progreso.notas) {
        notasBtn.setAttribute("aria-pressed", "true");
        notasBtn.textContent = "Notas ●";
    }
    notasBtn.addEventListener("click", () => {
        const open = !notasArea.hidden;
        notasArea.hidden = open;
        notasBtn.setAttribute("aria-pressed", open ? "false" : "true");
        if (!open) notasArea.focus();
    });
    let saveTimeout;
    notasArea.addEventListener("input", (e) => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const p = getProgreso(d.id);
            p.notas = e.target.value;
            p.updated = new Date().toISOString();
            saveProgress();
            notasBtn.textContent = p.notas ? "Notas ●" : "Notas";
        }, 300);
    });

    return node;
}

function render() {
    const filtered = applyFilters();
    els.grid.innerHTML = "";
    if (!filtered.length) {
        els.grid.innerHTML = '<div class="empty">No hay prospectos que coincidan con los filtros.</div>';
    } else {
        // Ordena por lead_score (alto primero) para que veas los mejores primero
        filtered.sort((a, b) => {
            const order = { alto: 0, medio: 1, bajo: 2 };
            return (order[a.lead_score] ?? 9) - (order[b.lead_score] ?? 9);
        });
        const frag = document.createDocumentFragment();
        filtered.forEach((d) => frag.appendChild(renderCard(d)));
        els.grid.appendChild(frag);
    }
    updateStats();
}

function updateStats() {
    const total = state.dentistas.length;
    let ganados = 0, activos = 0, alto = 0;
    state.dentistas.forEach((d) => {
        const est = getProgreso(d.id).estado;
        if (est === "cerrado_ganado") ganados++;
        if (["contactado", "cita_agendada", "propuesta_enviada", "auditado"].includes(est)) activos++;
        if (d.lead_score === "alto" && est !== "cerrado_perdido" && est !== "cerrado_ganado") alto++;
    });
    els.statTotal.textContent = `${total} prospectos`;
    els.statGanados.textContent = `${ganados} ganados`;
    els.statActivos.textContent = `${activos} en proceso`;
    els.statAlto.textContent = `${alto} 🔥 alto`;
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------
function exportCSV() {
    const headers = [
        "id","nombre","telefono","telefono_alt","whatsapp",
        "direccion","ciudad","provincia","especialidad",
        "web","web_calidad","lead_score",
        "estado","notas","fuente",
    ];
    const rows = state.dentistas.map((d) => {
        const p = getProgreso(d.id);
        const tel = d.telefono && d.telefono !== "verificar" ? d.telefono : "";
        const wa  = tel ? waLink(tel) : "";
        return headers.map((h) => {
            const val =
                h === "estado"   ? ESTADO_LABEL[p.estado] :
                h === "notas"    ? (p.notas || "") :
                h === "whatsapp" ? wa :
                (d[h] || "");
            return `"${String(val).replace(/"/g, '""')}"`;
        }).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-dentistas-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
function wireEvents() {
    let t;
    els.search.addEventListener("input", (e) => {
        clearTimeout(t);
        t = setTimeout(() => { state.filtros.texto = e.target.value; render(); }, 150);
    });
    els.filterProvincia.addEventListener("change", (e) => { state.filtros.provincia = e.target.value; render(); });
    els.filterEstado.addEventListener("change",    (e) => { state.filtros.estado    = e.target.value; render(); });
    els.filterScore.addEventListener("change",     (e) => { state.filtros.score     = e.target.value; render(); });
    els.filterWeb.addEventListener("change",       (e) => { state.filtros.web       = e.target.value; render(); });
    els.btnExport.addEventListener("click", exportCSV);
    els.btnReset.addEventListener("click", () => {
        if (confirm("Borrar todos los estados y notas guardados?")) {
            state.progreso = {};
            localStorage.removeItem(STORAGE_KEY);
            render();
        }
    });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async function init() {
    try {
        state.progreso = loadProgress();
        await loadDataset();
        renderProvincias();
        wireEvents();
        render();
    } catch (err) {
        console.error(err);
        els.grid.innerHTML = `<div class="empty">Error cargando datos: ${err.message}</div>`;
    }
})();
