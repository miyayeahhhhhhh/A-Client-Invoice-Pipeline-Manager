/**
 * app.js — FreelanceFlow Main Application Module
 *
 * Responsibilities:
 *  - Initializes only after successful authentication
 *  - Manages a single centralized state object (clients + invoices)
 *  - Persists all state to localStorage on every mutation
 *  - Renders the Kanban pipeline, invoice table, and earnings dashboard
 *  - Handles drag-and-drop for client cards
 *  - Uses event delegation for scalable, performant event handling
 *  - Provides CSV export for invoices
 */

import { initAuth, logout, getCurrentUser } from './auth.js';


// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY_DATA = 'ff_app_data';

const STAGES = ['lead', 'active', 'review', 'completed'];

const STAGE_LABELS = {
  lead:      'Lead',
  active:    'Active',
  review:    'In Review',
  completed: 'Completed',
};

const STATUS_LABELS = {
  draft:   'Draft',
  sent:    'Sent',
  paid:    'Paid',
  overdue: 'Overdue',
};

const TOAST_DURATION = 3200; // ms


// ═══════════════════════════════════════════════════════════════════
// CENTRALIZED STATE
// ═══════════════════════════════════════════════════════════════════

/**
 * The single source of truth for the entire application.
 * All mutations go through dedicated state functions that also
 * trigger persistence and re-render cycles.
 */
const state = {
  clients:        [],  // Array<Client>
  invoices:       [],  // Array<Invoice>
  activeTab:      'pipeline',
  invoiceFilter:  'all',
  dragClientId:   null,
};

/**
 * @typedef {Object} Client
 * @property {string} id
 * @property {string} name
 * @property {string} contact
 * @property {string} email
 * @property {number|null} budget
 * @property {string} stage    - 'lead' | 'active' | 'review' | 'completed'
 * @property {string[]} tags
 * @property {string} notes
 * @property {number} createdAt - Unix timestamp
 */

/**
 * @typedef {Object} Invoice
 * @property {string} id
 * @property {string} clientId
 * @property {string} project
 * @property {number} amount    - Pre-tax subtotal
 * @property {number} taxRate   - Percentage (0-100)
 * @property {number} total     - amount + (amount * taxRate / 100)
 * @property {string} issueDate - ISO date string
 * @property {string} dueDate   - ISO date string
 * @property {string} status    - 'draft' | 'sent' | 'paid' | 'overdue'
 * @property {number} createdAt - Unix timestamp
 */


// ═══════════════════════════════════════════════════════════════════
// PERSISTENCE LAYER
// ═══════════════════════════════════════════════════════════════════

function saveState() {
  const serializable = {
    clients:  state.clients,
    invoices: state.invoices,
  };
  localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(serializable));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY_DATA);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    state.clients  = Array.isArray(parsed.clients)  ? parsed.clients  : [];
    state.invoices = Array.isArray(parsed.invoices) ? parsed.invoices : [];
  } catch {
    localStorage.removeItem(STORAGE_KEY_DATA);
  }
}

/**
 * Seeds the app with demo data for first-time users.
 * Only runs when no persisted data exists.
 */
function seedDemoData() {
  const today     = new Date();
  const fmt       = (d) => d.toISOString().split('T')[0];
  const daysFrom  = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };

  const clients = [
    { id: uid(), name: 'Apex Digital Agency', contact: 'Maria Torres', email: 'maria@apex.io',   budget: 12000, stage: 'active',    tags: ['branding', 'web'],    notes: 'Full brand identity + website rebuild. Q3 deadline.',   createdAt: Date.now() - 8e7 },
    { id: uid(), name: 'Northgate Consulting', contact: 'James Liu',   email: 'james@ngc.co',   budget: 4500,  stage: 'review',    tags: ['consulting'],         notes: 'UX audit and recommendations report. Awaiting sign-off.', createdAt: Date.now() - 5e7 },
    { id: uid(), name: 'Luna Startup Studio', contact: 'Priya Shah',  email: 'priya@luna.dev',  budget: 7800,  stage: 'lead',      tags: ['mvp', 'urgent'],      notes: 'MVP scoping in progress. Promising lead.',              createdAt: Date.now() - 3e7 },
    { id: uid(), name: 'Terracycle Co.',       contact: 'Ben Adams',   email: 'ben@terracycle.com', budget: 3200, stage: 'completed', tags: ['print', 'packaging'], notes: 'Packaging design completed and delivered.',             createdAt: Date.now() - 9e7 },
  ];

  const c = clients; // shorthand for client id references

  const invoices = [
    { id: uid(), clientId: c[0].id, project: 'Brand Identity Phase 1', amount: 4000, taxRate: 10, total: 4400,  issueDate: daysFrom(-30), dueDate: daysFrom(-10), status: 'paid',    createdAt: Date.now() - 2.6e6 },
    { id: uid(), clientId: c[0].id, project: 'Website Redesign',       amount: 6000, taxRate: 10, total: 6600,  issueDate: daysFrom(-5),  dueDate: daysFrom(25),  status: 'sent',    createdAt: Date.now() - 4.3e5 },
    { id: uid(), clientId: c[1].id, project: 'UX Audit Report',        amount: 4500, taxRate: 0,  total: 4500,  issueDate: daysFrom(-15), dueDate: daysFrom(-2),  status: 'overdue', createdAt: Date.now() - 1.3e6 },
    { id: uid(), clientId: c[2].id, project: 'MVP Scope Document',     amount: 800,  taxRate: 5,  total: 840,   issueDate: daysFrom(-2),  dueDate: daysFrom(28),  status: 'draft',   createdAt: Date.now() - 1.7e5 },
    { id: uid(), clientId: c[3].id, project: 'Packaging Design Suite', amount: 3200, taxRate: 8,  total: 3456,  issueDate: daysFrom(-60), dueDate: daysFrom(-35), status: 'paid',    createdAt: Date.now() - 5.2e6 },
  ];

  state.clients  = clients;
  state.invoices = invoices;
  saveState();
}


// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/** Generates a short unique ID */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Formats a number as USD currency */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style:    'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Formats an ISO date string as a readable date */
function formatDate(isoString) {
  if (!isoString) return '—';
  const [year, month, day] = isoString.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Returns today's date as an ISO string (YYYY-MM-DD) */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Returns an ISO date string N days from today */
function dateInDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

/** Escapes a string for safe CSV inclusion */
function escapeCSV(value) {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Returns a client object by id, or null.
 * @param {string} id
 * @returns {Client|null}
 */
function getClientById(id) {
  return state.clients.find((c) => c.id === id) || null;
}

/**
 * Returns an invoice object by id, or null.
 * @param {string} id
 * @returns {Invoice|null}
 */
function getInvoiceById(id) {
  return state.invoices.find((i) => i.id === id) || null;
}

/** Calculates the total for an invoice given amount and tax rate */
function calcTotal(amount, taxRate) {
  const sub = parseFloat(amount) || 0;
  const tax = parseFloat(taxRate) || 0;
  return Math.round((sub + (sub * tax / 100)) * 100) / 100;
}


// ═══════════════════════════════════════════════════════════════════
// TOAST NOTIFICATION
// ═══════════════════════════════════════════════════════════════════

let _toastTimer = null;

/**
 * Displays a transient toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = 'success') {
  const toast   = document.getElementById('toast');
  const iconEl  = document.getElementById('toast-icon');
  const msgEl   = document.getElementById('toast-message');

  const icons = { success: '✓', error: '✕', info: 'ℹ' };

  // Remove existing type classes
  toast.classList.remove('toast--success', 'toast--error', 'toast--info', 'hidden');
  toast.classList.add(`toast--${type}`);
  iconEl.textContent  = icons[type] ?? '●';
  msgEl.textContent   = message;

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, TOAST_DURATION);
}


// ═══════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Activates the given tab and its corresponding view panel.
 * Triggers a re-render of the dashboard whenever it becomes active.
 * @param {string} tabName
 */
function activateTab(tabName) {
  state.activeTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('nav-tab--active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  // Update view panels
  document.querySelectorAll('.app-view').forEach((panel) => {
    const isActive = panel.id === `view-${tabName}`;
    panel.classList.toggle('app-view--active', isActive);
  });

  // Dashboard needs fresh data every time it's opened
  if (tabName === 'dashboard') {
    renderDashboard();
  }
}


// ═══════════════════════════════════════════════════════════════════
// ── KANBAN PIPELINE RENDERER ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Builds and injects the full Kanban board from state.clients.
 * Clears and re-renders all columns.
 */
function renderPipeline() {
  STAGES.forEach((stage) => {
    const column = document.getElementById(`stage-${stage}`);
    const countEl = document.getElementById(`count-${stage}`);
    const clientsInStage = state.clients.filter((c) => c.stage === stage);

    column.innerHTML = '';
    countEl.textContent = clientsInStage.length;

    if (clientsInStage.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'kanban-empty-hint';
      emptyEl.style.cssText = 'padding: 16px 0; text-align: center; font-size: 0.75rem; color: var(--color-neutral-400);';
      emptyEl.textContent = 'Drop cards here';
      column.appendChild(emptyEl);
      return;
    }

    clientsInStage.forEach((client) => {
      column.appendChild(buildClientCard(client));
    });
  });
}

/**
 * Creates a draggable client card DOM element.
 * @param {Client} client
 * @returns {HTMLElement}
 */
function buildClientCard(client) {
  const card = document.createElement('div');
  card.className = 'client-card';
  card.dataset.clientId = client.id;
  card.setAttribute('draggable', 'true');
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `${client.name}, ${STAGE_LABELS[client.stage]} stage`);
  card.tabIndex = 0;

  const budgetHtml = client.budget
    ? `<span class="client-card__budget">${formatCurrency(client.budget)}</span>`
    : '';

  const tagsHtml = client.tags && client.tags.length > 0
    ? `<div class="client-card__tags">${client.tags.map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>`
    : '';

  card.innerHTML = `
    <p class="client-card__name">${escapeHTML(client.name)}</p>
    ${client.contact ? `<p class="client-card__contact">${escapeHTML(client.contact)}${client.email ? ` · ${escapeHTML(client.email)}` : ''}</p>` : ''}
    <div class="client-card__meta">
      ${budgetHtml}
    </div>
    ${tagsHtml}
  `;

  // Drag events
  card.addEventListener('dragstart', handleCardDragStart);
  card.addEventListener('dragend',   handleCardDragEnd);

  // Click to edit
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    openClientModal(client.id);
  });

  // Keyboard: Enter or Space to open
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openClientModal(client.id);
    }
  });

  return card;
}

/** Minimal HTML escaping to prevent XSS from user-entered data */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ═══════════════════════════════════════════════════════════════════
// ── DRAG AND DROP ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

function handleCardDragStart(event) {
  const card = event.currentTarget;
  state.dragClientId = card.dataset.clientId;
  card.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', state.dragClientId);
}

function handleCardDragEnd(event) {
  event.currentTarget.classList.remove('is-dragging');
  state.dragClientId = null;
  // Clear all drop-zone highlights
  document.querySelectorAll('.kanban-column__body').forEach((col) => {
    col.classList.remove('drag-over');
  });
}

function handleColumnDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const column = event.currentTarget;
  document.querySelectorAll('.kanban-column__body').forEach((c) => c.classList.remove('drag-over'));
  column.classList.add('drag-over');
}

function handleColumnDragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}

function handleColumnDrop(event) {
  event.preventDefault();
  const column   = event.currentTarget;
  const newStage = column.dataset.stage;
  column.classList.remove('drag-over');

  const clientId = event.dataTransfer.getData('text/plain') || state.dragClientId;
  if (!clientId) return;

  const client = getClientById(clientId);
  if (!client || client.stage === newStage) return;

  const oldStage   = client.stage;
  client.stage     = newStage;
  saveState();
  renderPipeline();
  showToast(`"${client.name}" moved to ${STAGE_LABELS[newStage]}.`, 'info');
}

/**
 * Attaches drag-and-drop event listeners to all Kanban column bodies.
 */
function initDragAndDrop() {
  STAGES.forEach((stage) => {
    const col = document.getElementById(`stage-${stage}`);
    col.addEventListener('dragover',   handleColumnDragOver);
    col.addEventListener('dragleave',  handleColumnDragLeave);
    col.addEventListener('drop',       handleColumnDrop);
  });
}


// ═══════════════════════════════════════════════════════════════════
// ── CLIENT MODAL ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Opens the client modal in "add" mode (no clientId) or "edit" mode.
 * @param {string|null} clientId
 * @param {string|null} presetStage
 */
function openClientModal(clientId = null, presetStage = null) {
  const modal      = document.getElementById('client-modal');
  const titleEl    = document.getElementById('client-modal-title');
  const deleteBtn  = document.getElementById('delete-client-btn');
  const idField    = document.getElementById('client-id-field');

  // Clear form
  document.getElementById('client-form').reset();
  document.getElementById('client-name-error').textContent = '';

  if (clientId) {
    const client = getClientById(clientId);
    if (!client) return;

    titleEl.textContent = 'Edit Client';
    deleteBtn.classList.remove('hidden');
    idField.value = client.id;

    document.getElementById('client-name').value    = client.name;
    document.getElementById('client-contact').value = client.contact || '';
    document.getElementById('client-email').value   = client.email || '';
    document.getElementById('client-budget').value  = client.budget !== null ? client.budget : '';
    document.getElementById('client-stage').value   = client.stage;
    document.getElementById('client-tags').value    = (client.tags || []).join(', ');
    document.getElementById('client-notes').value   = client.notes || '';

  } else {
    titleEl.textContent = 'Add Client';
    deleteBtn.classList.add('hidden');
    idField.value = '';

    if (presetStage) {
      document.getElementById('client-stage').value = presetStage;
    }
  }

  modal.classList.remove('hidden');
  document.getElementById('client-name').focus();
}

function closeClientModal() {
  document.getElementById('client-modal').classList.add('hidden');
}

/**
 * Reads and validates the client form, then saves or updates.
 */
function handleSaveClient() {
  const nameVal    = document.getElementById('client-name').value.trim();
  const nameError  = document.getElementById('client-name-error');

  nameError.textContent = '';

  if (!nameVal) {
    nameError.textContent = 'Client name is required.';
    document.getElementById('client-name').focus();
    return;
  }

  const id         = document.getElementById('client-id-field').value;
  const contactVal = document.getElementById('client-contact').value.trim();
  const emailVal   = document.getElementById('client-email').value.trim();
  const budgetVal  = document.getElementById('client-budget').value;
  const stageVal   = document.getElementById('client-stage').value;
  const tagsVal    = document.getElementById('client-tags').value;
  const notesVal   = document.getElementById('client-notes').value.trim();

  const parsedBudget = budgetVal !== '' ? parseFloat(budgetVal) : null;
  const parsedTags   = tagsVal
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (id) {
    // Edit existing
    const client = getClientById(id);
    if (!client) return;
    client.name    = nameVal;
    client.contact = contactVal;
    client.email   = emailVal;
    client.budget  = parsedBudget;
    client.stage   = stageVal;
    client.tags    = parsedTags;
    client.notes   = notesVal;
    saveState();
    renderPipeline();
    closeClientModal();
    showToast(`"${nameVal}" updated.`, 'success');
  } else {
    // Create new
    const newClient = {
      id:        uid(),
      name:      nameVal,
      contact:   contactVal,
      email:     emailVal,
      budget:    parsedBudget,
      stage:     stageVal,
      tags:      parsedTags,
      notes:     notesVal,
      createdAt: Date.now(),
    };
    state.clients.push(newClient);
    saveState();
    renderPipeline();
    closeClientModal();
    showToast(`"${nameVal}" added to ${STAGE_LABELS[stageVal]}.`, 'success');
  }
}

/**
 * Deletes a client and all their associated invoices.
 */
function handleDeleteClient() {
  const id = document.getElementById('client-id-field').value;
  if (!id) return;

  const client = getClientById(id);
  if (!client) return;

  const invoiceCount = state.invoices.filter((i) => i.clientId === id).length;
  const msg = invoiceCount > 0
    ? `Delete "${client.name}" and their ${invoiceCount} invoice(s)? This cannot be undone.`
    : `Delete "${client.name}"? This cannot be undone.`;

  if (!confirm(msg)) return;

  state.clients  = state.clients.filter((c) => c.id !== id);
  state.invoices = state.invoices.filter((i) => i.clientId !== id);
  saveState();
  renderPipeline();
  renderInvoiceTable();
  closeClientModal();
  showToast(`"${client.name}" and their invoices deleted.`, 'error');
}


// ═══════════════════════════════════════════════════════════════════
// ── INVOICE TABLE RENDERER ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Filters and renders the invoice table based on the active filter chip.
 */
function renderInvoiceTable() {
  const tbody   = document.getElementById('invoice-table-body');
  const emptyEl = document.getElementById('invoice-empty');

  const filtered = state.invoiceFilter === 'all'
    ? state.invoices
    : state.invoices.filter((i) => i.status === state.invoiceFilter);

  // Sort newest first
  const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);

  tbody.innerHTML = '';

  if (sorted.length === 0) {
    emptyEl.classList.remove('hidden');
    document.getElementById('invoice-table').style.display = 'none';
    return;
  }

  emptyEl.classList.add('hidden');
  document.getElementById('invoice-table').style.display = '';

  sorted.forEach((invoice, idx) => {
    const client  = getClientById(invoice.clientId);
    const clientName = client ? client.name : '(Deleted Client)';
    const invoiceNumber = `INV-${String(invoice.createdAt).slice(-5)}`;

    const row = document.createElement('tr');
    row.dataset.invoiceId = invoice.id;

    row.innerHTML = `
      <td class="col-number">${escapeHTML(invoiceNumber)}</td>
      <td>${escapeHTML(clientName)}</td>
      <td>${escapeHTML(invoice.project)}</td>
      <td class="col-amount">${formatCurrency(invoice.total)}</td>
      <td>${formatDate(invoice.dueDate)}</td>
      <td><span class="status-pill status-pill--${invoice.status}">${STATUS_LABELS[invoice.status]}</span></td>
      <td>
        <button class="table-action-btn" data-action="edit-invoice" data-invoice-id="${invoice.id}" aria-label="Edit invoice ${invoiceNumber}">Edit</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}


// ═══════════════════════════════════════════════════════════════════
// ── INVOICE MODAL ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Populates the client dropdown in the invoice form.
 */
function populateInvoiceClientDropdown(selectedClientId = '') {
  const select = document.getElementById('invoice-client');
  select.innerHTML = '<option value="">— Select client —</option>';
  state.clients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((client) => {
      const opt = document.createElement('option');
      opt.value = client.id;
      opt.textContent = client.name;
      if (client.id === selectedClientId) opt.selected = true;
      select.appendChild(opt);
    });
}

/**
 * Opens the invoice modal in add or edit mode.
 * @param {string|null} invoiceId
 */
function openInvoiceModal(invoiceId = null) {
  const modal     = document.getElementById('invoice-modal');
  const titleEl   = document.getElementById('invoice-modal-title');
  const deleteBtn = document.getElementById('delete-invoice-btn');
  const idField   = document.getElementById('invoice-id-field');

  // Clear form and errors
  document.getElementById('invoice-form').reset();
  ['invoice-client-error', 'invoice-project-error', 'invoice-amount-error', 'invoice-due-error'].forEach((id) => {
    document.getElementById(id).textContent = '';
  });

  populateInvoiceClientDropdown();

  // Reset total preview
  updateInvoiceTotalPreview(0, 0);

  if (invoiceId) {
    const invoice = getInvoiceById(invoiceId);
    if (!invoice) return;

    titleEl.textContent = 'Edit Invoice';
    deleteBtn.classList.remove('hidden');
    idField.value = invoice.id;

    populateInvoiceClientDropdown(invoice.clientId);
    document.getElementById('invoice-project').value    = invoice.project;
    document.getElementById('invoice-amount').value     = invoice.amount;
    document.getElementById('invoice-tax').value        = invoice.taxRate;
    document.getElementById('invoice-issue-date').value = invoice.issueDate;
    document.getElementById('invoice-due-date').value   = invoice.dueDate;
    document.getElementById('invoice-status').value     = invoice.status;
    updateInvoiceTotalPreview(invoice.amount, invoice.taxRate);

  } else {
    titleEl.textContent = 'New Invoice';
    deleteBtn.classList.add('hidden');
    idField.value = '';

    // Set sensible defaults for new invoices
    document.getElementById('invoice-issue-date').value = todayISO();
    document.getElementById('invoice-due-date').value   = dateInDays(30);
    document.getElementById('invoice-tax').value        = '0';
  }

  modal.classList.remove('hidden');
  document.getElementById('invoice-client').focus();
}

function closeInvoiceModal() {
  document.getElementById('invoice-modal').classList.add('hidden');
}

/**
 * Updates the live total preview section inside the invoice modal.
 * @param {number} amount
 * @param {number} taxRate
 */
function updateInvoiceTotalPreview(amount, taxRate) {
  const sub   = parseFloat(amount) || 0;
  const rate  = parseFloat(taxRate) || 0;
  const tax   = sub * rate / 100;
  const total = sub + tax;

  document.getElementById('preview-subtotal').textContent = formatCurrency(sub);
  document.getElementById('preview-tax').textContent      = formatCurrency(tax);
  document.getElementById('preview-total').textContent    = formatCurrency(total);
}

/**
 * Validates and saves the invoice form.
 */
function handleSaveInvoice() {
  const clientId  = document.getElementById('invoice-client').value;
  const project   = document.getElementById('invoice-project').value.trim();
  const amount    = document.getElementById('invoice-amount').value;
  const taxRate   = document.getElementById('invoice-tax').value || '0';
  const issueDate = document.getElementById('invoice-issue-date').value;
  const dueDate   = document.getElementById('invoice-due-date').value;
  const status    = document.getElementById('invoice-status').value;
  const id        = document.getElementById('invoice-id-field').value;

  let hasError = false;

  if (!clientId) {
    document.getElementById('invoice-client-error').textContent = 'Please select a client.';
    hasError = true;
  } else {
    document.getElementById('invoice-client-error').textContent = '';
  }

  if (!project) {
    document.getElementById('invoice-project-error').textContent = 'Project description is required.';
    hasError = true;
  } else {
    document.getElementById('invoice-project-error').textContent = '';
  }

  const parsedAmount = parseFloat(amount);
  if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
    document.getElementById('invoice-amount-error').textContent = 'Enter a valid amount greater than $0.';
    hasError = true;
  } else {
    document.getElementById('invoice-amount-error').textContent = '';
  }

  if (!dueDate) {
    document.getElementById('invoice-due-error').textContent = 'A due date is required.';
    hasError = true;
  } else {
    document.getElementById('invoice-due-error').textContent = '';
  }

  if (hasError) return;

  const parsedTax   = parseFloat(taxRate) || 0;
  const parsedTotal = calcTotal(parsedAmount, parsedTax);

  if (id) {
    // Edit existing
    const invoice = getInvoiceById(id);
    if (!invoice) return;
    invoice.clientId  = clientId;
    invoice.project   = project;
    invoice.amount    = parsedAmount;
    invoice.taxRate   = parsedTax;
    invoice.total     = parsedTotal;
    invoice.issueDate = issueDate;
    invoice.dueDate   = dueDate;
    invoice.status    = status;
    saveState();
    renderInvoiceTable();
    closeInvoiceModal();
    showToast('Invoice updated.', 'success');
  } else {
    // Create new
    const newInvoice = {
      id:        uid(),
      clientId,
      project,
      amount:    parsedAmount,
      taxRate:   parsedTax,
      total:     parsedTotal,
      issueDate,
      dueDate,
      status,
      createdAt: Date.now(),
    };
    state.invoices.push(newInvoice);
    saveState();
    renderInvoiceTable();
    closeInvoiceModal();
    showToast('Invoice created.', 'success');
  }

  // Refresh dashboard if it's currently visible
  if (state.activeTab === 'dashboard') renderDashboard();
}

/**
 * Deletes an invoice after confirmation.
 */
function handleDeleteInvoice() {
  const id = document.getElementById('invoice-id-field').value;
  if (!id) return;

  if (!confirm('Delete this invoice? This cannot be undone.')) return;

  state.invoices = state.invoices.filter((i) => i.id !== id);
  saveState();
  renderInvoiceTable();
  closeInvoiceModal();
  showToast('Invoice deleted.', 'error');

  if (state.activeTab === 'dashboard') renderDashboard();
}


// ═══════════════════════════════════════════════════════════════════
// ── CSV EXPORT ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Generates a CSV file from all invoices and triggers a browser download.
 */
function exportInvoicesCSV() {
  if (state.invoices.length === 0) {
    showToast('No invoices to export.', 'info');
    return;
  }

  const headers = ['Invoice #', 'Client', 'Project', 'Subtotal', 'Tax Rate (%)', 'Total', 'Issue Date', 'Due Date', 'Status'];

  const rows = state.invoices
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((invoice) => {
      const client = getClientById(invoice.clientId);
      const invoiceNumber = `INV-${String(invoice.createdAt).slice(-5)}`;
      return [
        escapeCSV(invoiceNumber),
        escapeCSV(client ? client.name : 'Deleted Client'),
        escapeCSV(invoice.project),
        escapeCSV(invoice.amount.toFixed(2)),
        escapeCSV(invoice.taxRate.toFixed(1)),
        escapeCSV(invoice.total.toFixed(2)),
        escapeCSV(formatDate(invoice.issueDate)),
        escapeCSV(formatDate(invoice.dueDate)),
        escapeCSV(STATUS_LABELS[invoice.status] || invoice.status),
      ].join(',');
    });

  const csvContent   = [headers.join(','), ...rows].join('\n');
  const blob         = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url          = URL.createObjectURL(blob);
  const link         = document.createElement('a');
  const timestamp    = new Date().toISOString().slice(0, 10);

  link.href     = url;
  link.download = `freelanceflow-invoices-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Exported ${state.invoices.length} invoice(s) to CSV.`, 'success');
}


// ═══════════════════════════════════════════════════════════════════
// ── DASHBOARD RENDERER ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Computes aggregated earnings data from invoices.
 * @returns {Object} Aggregated stats
 */
function computeDashboardStats() {
  const paidInvoices    = state.invoices.filter((i) => i.status === 'paid');
  const pendingInvoices = state.invoices.filter((i) => i.status === 'sent' || i.status === 'draft');
  const overdueInvoices = state.invoices.filter((i) => i.status === 'overdue');

  const totalRevenue  = paidInvoices.reduce((sum, i) => sum + i.total, 0);
  const outstanding   = pendingInvoices.reduce((sum, i) => sum + i.total, 0);
  const overdueTotals = overdueInvoices.reduce((sum, i) => sum + i.total, 0);

  const activeClients = state.clients.filter((c) => c.stage === 'active').length;

  return {
    totalRevenue,
    outstanding,
    overdueTotals,
    paidCount:   paidInvoices.length,
    pendingCount: pendingInvoices.length,
    overdueCount: overdueInvoices.length,
    activeClients,
    totalClients: state.clients.length,
  };
}

/**
 * Builds per-client breakdown: total billed, total paid, progress.
 * @returns {Array<Object>}
 */
function computeClientBreakdown() {
  return state.clients
    .map((client) => {
      const clientInvoices = state.invoices.filter((i) => i.clientId === client.id);
      const totalBilled    = clientInvoices.reduce((sum, i) => sum + i.total, 0);
      const totalPaid      = clientInvoices
        .filter((i) => i.status === 'paid')
        .reduce((sum, i) => sum + i.total, 0);
      const progress = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
      return { client, totalBilled, totalPaid, progress, invoiceCount: clientInvoices.length };
    })
    .filter((row) => row.invoiceCount > 0)
    .sort((a, b) => b.totalBilled - a.totalBilled);
}

/**
 * Renders KPI cards and the per-client breakdown table.
 */
function renderDashboard() {
  const stats = computeDashboardStats();

  document.getElementById('kpi-total-revenue').textContent = formatCurrency(stats.totalRevenue);
  document.getElementById('kpi-paid-invoices').textContent = `${stats.paidCount} invoice${stats.paidCount !== 1 ? 's' : ''} paid`;

  document.getElementById('kpi-outstanding').textContent = formatCurrency(stats.outstanding);
  document.getElementById('kpi-pending-count').textContent = `${stats.pendingCount} unpaid invoice${stats.pendingCount !== 1 ? 's' : ''}`;

  document.getElementById('kpi-active-clients').textContent = stats.activeClients;
  document.getElementById('kpi-pipeline-total').textContent = `${stats.totalClients} total in pipeline`;

  document.getElementById('kpi-overdue').textContent = formatCurrency(stats.overdueTotals);
  document.getElementById('kpi-overdue-count').textContent = `${stats.overdueCount} overdue invoice${stats.overdueCount !== 1 ? 's' : ''}`;

  // Per-client breakdown
  const breakdown     = computeClientBreakdown();
  const breakdownEl   = document.getElementById('client-breakdown');
  const emptyEl       = document.getElementById('breakdown-empty');

  breakdownEl.innerHTML = '';

  if (breakdown.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');

  breakdown.forEach(({ client, totalBilled, totalPaid, progress }) => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `
      <div class="breakdown-row__header">
        <span class="breakdown-row__name">${escapeHTML(client.name)}</span>
        <div class="breakdown-row__amounts">
          <span class="breakdown-row__paid">${formatCurrency(totalPaid)} paid</span>
          <span class="breakdown-row__total">of ${formatCurrency(totalBilled)}</span>
          <span class="tag">${progress}%</span>
        </div>
      </div>
      <div class="progress-bar" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${client.name} payment progress">
        <div class="progress-bar__fill" style="width: ${progress}%"></div>
      </div>
    `;
    breakdownEl.appendChild(row);
  });
}


// ═══════════════════════════════════════════════════════════════════
// ── EVENT DELEGATION ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Single top-level click handler using event delegation.
 * Routes clicks to the correct handler based on data attributes.
 * @param {MouseEvent} event
 */
function handleGlobalClick(event) {
  const target = event.target;

  // ── Tab navigation ───────────────────────────────────────────
  const navTab = target.closest('.nav-tab');
  if (navTab) {
    activateTab(navTab.dataset.tab);
    return;
  }

  // ── Logout ───────────────────────────────────────────────────
  if (target.closest('#logout-btn')) {
    if (confirm('Sign out of FreelanceFlow?')) {
      logout();
    }
    return;
  }

  // ── Add Client (header button) ───────────────────────────────
  if (target.closest('#add-client-btn')) {
    openClientModal(null, 'lead');
    return;
  }

  // ── Add Client (per-column button) ───────────────────────────
  const addCardBtn = target.closest('.kanban-add-card');
  if (addCardBtn) {
    openClientModal(null, addCardBtn.dataset.stage);
    return;
  }

  // ── Client modal controls ────────────────────────────────────
  if (target.closest('#save-client-btn'))   { handleSaveClient();   return; }
  if (target.closest('#delete-client-btn')) { handleDeleteClient(); return; }
  if (target.closest('#close-client-modal') || target.closest('#cancel-client-btn')) {
    closeClientModal();
    return;
  }

  // ── Invoice modal open (new) ─────────────────────────────────
  if (target.closest('#add-invoice-btn')) {
    openInvoiceModal();
    return;
  }

  // ── Invoice modal open (edit via table row button) ───────────
  const editInvoiceBtn = target.closest('[data-action="edit-invoice"]');
  if (editInvoiceBtn) {
    openInvoiceModal(editInvoiceBtn.dataset.invoiceId);
    return;
  }

  // ── Invoice modal controls ───────────────────────────────────
  if (target.closest('#save-invoice-btn'))   { handleSaveInvoice();   return; }
  if (target.closest('#delete-invoice-btn')) { handleDeleteInvoice(); return; }
  if (target.closest('#close-invoice-modal') || target.closest('#cancel-invoice-btn')) {
    closeInvoiceModal();
    return;
  }

  // ── Invoice filter chips ─────────────────────────────────────
  const filterChip = target.closest('.filter-chip');
  if (filterChip) {
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('filter-chip--active'));
    filterChip.classList.add('filter-chip--active');
    state.invoiceFilter = filterChip.dataset.filter;
    renderInvoiceTable();
    return;
  }

  // ── Export CSV ───────────────────────────────────────────────
  if (target.closest('#export-csv-btn')) {
    exportInvoicesCSV();
    return;
  }

  // ── Click on modal overlay backdrop to close ─────────────────
  if (target.classList.contains('modal-overlay')) {
    document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
    return;
  }
}

/**
 * Handles live input changes inside the invoice modal to update
 * the total preview as the user types.
 * @param {Event} event
 */
function handleInvoiceFormInput(event) {
  const target = event.target;
  if (target.id === 'invoice-amount' || target.id === 'invoice-tax') {
    const amount  = document.getElementById('invoice-amount').value;
    const taxRate = document.getElementById('invoice-tax').value;
    updateInvoiceTotalPreview(amount, taxRate);
  }
}

/**
 * Handles keyboard events:
 * - Escape closes open modals
 */
function handleKeyDown(event) {
  if (event.key === 'Escape') {
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
    openModals.forEach((m) => m.classList.add('hidden'));
  }
}


// ═══════════════════════════════════════════════════════════════════
// ── USER DISPLAY ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Populates nav bar elements with the current user's info.
 * @param {Object} user
 */
function renderUserInfo(user) {
  const nameDisplay = document.getElementById('user-name-display');
  const avatar      = document.getElementById('user-avatar');

  if (nameDisplay) nameDisplay.textContent = user.name?.split(' ')[0] || 'User';
  if (avatar)      avatar.textContent      = user.initials || (user.name ? user.name[0].toUpperCase() : 'U');
}


// ═══════════════════════════════════════════════════════════════════
// ── APPLICATION BOOTSTRAP ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * Main app initializer. Called by auth.js after a successful login.
 * Sets up all event listeners, loads data, and renders initial views.
 *
 * @param {Object} user - The authenticated user object from auth.js
 */
function initApp(user) {
  // ── Load data from localStorage (or seed demo data) ──────────
  loadState();

  if (state.clients.length === 0 && state.invoices.length === 0) {
    seedDemoData();
  }

  // ── Populate user info in the navbar ─────────────────────────
  renderUserInfo(user);

  // ── Attach global event listeners ────────────────────────────
  document.addEventListener('click',   handleGlobalClick);
  document.addEventListener('keydown', handleKeyDown);

  // Invoice modal live total update
  document.getElementById('invoice-modal').addEventListener('input', handleInvoiceFormInput);

  // ── Initialize drag-and-drop ──────────────────────────────────
  initDragAndDrop();

  // ── Initial renders ───────────────────────────────────────────
  renderPipeline();
  renderInvoiceTable();

  // ── Activate default tab ──────────────────────────────────────
  activateTab('pipeline');
}


// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

/**
 * Bootstrap sequence:
 * 1. auth.js handles session check / login UI
 * 2. On successful auth, auth.js calls our initApp callback
 */
document.addEventListener('DOMContentLoaded', () => {
  initAuth(initApp);
});
