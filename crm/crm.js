// CRM Dentistas RD - logica cliente
// El estado por contacto (estado + notas) se guarda en localStorage bajo "crm_dentistas_state_v1".

const STORAGE_KEY = "crm_dentistas_state_v1";
const ESTADOS = ["pendiente", "contactado", "agendado", "no_responde", "descartado"];
const ESTADO_LABEL = {
    pendiente:   "Pendiente",
    contactado:  "Contactado",
    agendado:    "Agendado",
    no_responde: "No responde",
    descartado:  "Descartado",
};

const state = {
    dentistas: [],
    progreso: {},      // { [id]: { estado, notas, updated } }
    filtros: { texto: "", provincia: "", estado: "" },
};

const els = {
    grid: document.getElementById("grid"),
    search: document.getElementById("search"),
    filterProvincia: document.getElementById("filterProvincia"),
    filterEstado: document.getElementById("filterEstado"),
    btnExport: document.getElementById("btnExport"),
    btnReset: document.getElementById("btnReset"),
    statTotal: document.getElementById("statTotal"),
    statHechos: document.getElementById("statHechos"),
    statPendientes: document.getElementById("statPendientes"),
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
        state.progreso[id] = { estado: "pendiente", notas: "", updated: null };
    }
    return state.progreso[id];
}

// ---------------------------------------------------------------------------
// Carga del dataset
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
    const provincia = state.filtros.provincia;
    const estadoF = state.filtros.estado;
    return state.dentistas.filter((d) => {
        if (provincia && d.provincia !== provincia) return false;
        if (estadoF) {
            const est = getProgreso(d.id).estado;
            if (est !== estadoF) return false;
        }
        if (!q) return true;
        const haystack = normalize(
            [d.nombre, d.telefono, d.telefono_alt, d.direccion, d.ciudad, d.provincia, d.especialidad].join(" ")
        );
        return haystack.includes(q);
    });
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

function buildPhoneLink(phone, isAlt) {
    if (!phone || phone === "verificar") {
        return `<span class="phone-link phone-link--missing">Verificar telefono</span>`;
    }
    const clean = phone.replace(/[^\d+]/g, "");
    const tel = clean.startsWith("+") ? clean : `+1${clean.replace(/^1/, "")}`;
    return `<a class="phone-link${isAlt ? " phone-link--alt" : ""}" href="tel:${tel}">${phone}</a>`;
}

function renderCard(dentista) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const progreso = getProgreso(dentista.id);

    node.dataset.id = dentista.id;
    node.dataset.estado = progreso.estado;

    node.querySelector(".card__name").textContent = dentista.nombre;
    node.querySelector(".card__direccion").textContent = dentista.direccion || "(sin direccion)";
    node.querySelector(".card__provincia").textContent =
        [dentista.ciudad, dentista.provincia].filter(Boolean).join(" · ") || "Sin provincia";
    node.querySelector(".card__especialidad").textContent = dentista.especialidad || "";
    node.querySelector(".card__estado").textContent = ESTADO_LABEL[progreso.estado];
    node.querySelector(".card__fuente").textContent = dentista.fuente ? `Fuente: ${dentista.fuente}` : "";

    const phones = node.querySelector(".card__phones");
    phones.insertAdjacentHTML("beforeend", buildPhoneLink(dentista.telefono, false));
    if (dentista.telefono_alt) {
        phones.insertAdjacentHTML("beforeend", buildPhoneLink(dentista.telefono_alt, true));
    }

    const estadoSelect = node.querySelector(".card__estadoSelect");
    estadoSelect.value = progreso.estado;
    estadoSelect.addEventListener("change", (e) => {
        const nuevo = e.target.value;
        const p = getProgreso(dentista.id);
        p.estado = nuevo;
        p.updated = new Date().toISOString();
        saveProgress();
        node.dataset.estado = nuevo;
        node.querySelector(".card__estado").textContent = ESTADO_LABEL[nuevo];
        updateStats();
        // Si el filtro de estado esta activo y la nueva categoria no coincide, lo escondemos.
        if (state.filtros.estado && state.filtros.estado !== nuevo) {
            node.remove();
        }
    });

    const notasArea = node.querySelector(".card__notas");
    notasArea.value = progreso.notas || "";
    const notasBtn = node.querySelector(".card__notasBtn");
    if (progreso.notas) {
        notasBtn.setAttribute("aria-pressed", "true");
        notasBtn.textContent = "Notas ●";
    }
    notasBtn.addEventListener("click", () => {
        const isOpen = !notasArea.hidden;
        notasArea.hidden = isOpen;
        notasBtn.setAttribute("aria-pressed", isOpen ? "false" : "true");
        if (!isOpen) notasArea.focus();
    });

    let saveTimeout;
    notasArea.addEventListener("input", (e) => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const p = getProgreso(dentista.id);
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
        els.grid.innerHTML = '<div class="empty">No hay contactos que coincidan con los filtros.</div>';
    } else {
        const frag = document.createDocumentFragment();
        filtered.forEach((d) => frag.appendChild(renderCard(d)));
        els.grid.appendChild(frag);
    }
    updateStats();
}

function updateStats() {
    const total = state.dentistas.length;
    let hechos = 0, pendientes = 0;
    state.dentistas.forEach((d) => {
        const est = getProgreso(d.id).estado;
        if (est === "agendado" || est === "contactado") hechos++;
        if (est === "pendiente") pendientes++;
    });
    els.statTotal.textContent = `${total} contactos`;
    els.statHechos.textContent = `${hechos} hechos`;
    els.statPendientes.textContent = `${pendientes} pendientes`;
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------
function exportCSV() {
    const headers = ["id","nombre","telefono","telefono_alt","direccion","ciudad","provincia","especialidad","estado","notas","fuente"];
    const rows = state.dentistas.map((d) => {
        const p = getProgreso(d.id);
        return headers.map((h) => {
            const val = h === "estado" ? ESTADO_LABEL[p.estado]
                     : h === "notas"  ? (p.notas || "")
                     : (d[h] || "");
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
    let searchTimeout;
    els.search.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.filtros.texto = e.target.value;
            render();
        }, 150);
    });
    els.filterProvincia.addEventListener("change", (e) => {
        state.filtros.provincia = e.target.value;
        render();
    });
    els.filterEstado.addEventListener("change", (e) => {
        state.filtros.estado = e.target.value;
        render();
    });
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
