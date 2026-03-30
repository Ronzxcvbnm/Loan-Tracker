const greetingText = document.querySelector("[data-user-greeting]");
const emailText = document.querySelector("[data-user-email]");
const roleText = document.querySelector("[data-user-role]");
const signOutButtons = document.querySelectorAll("[data-sign-out]");
const openLoanModalButtons = document.querySelectorAll("[data-open-loan-modal]");
const lenderSummary = document.getElementById("dashboardLenderSummary");
const paymentScheduleList = document.getElementById("paymentScheduleList");
const activeLoanList = document.getElementById("activeLoanList");
const closedLoanList = document.getElementById("closedLoanList");
const activeTotalValues = document.querySelectorAll("[data-active-total]");
const allTotalValues = document.querySelectorAll("[data-all-total]");
const userMessageForm = document.getElementById("userMessageForm");
const dashboardMessageStatus = document.getElementById("dashboardMessageStatus");
const dashboardThreadList = document.getElementById("dashboardThreadList");

const appState = {
  user: null,
  lenders: [],
  loans: []
};

let loanModalRefs = null;

function getApiBaseUrl() {
  if (window.LOAN_TRACKER_API_BASE) {
    return window.LOAN_TRACKER_API_BASE;
  }

  const localHost = window.location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
  const isDifferentLocalPort =
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
    window.location.port &&
    window.location.port !== "3000";

  return isDifferentLocalPort ? `http://${localHost}:3000` : "";
}

const API_BASE_URL = getApiBaseUrl();

function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function readStoredUser() {
  const serializedUser = sessionStorage.getItem("loanTrackerUser") || localStorage.getItem("loanTrackerUser");

  if (!serializedUser) {
    return null;
  }

  try {
    return JSON.parse(serializedUser);
  } catch (_error) {
    sessionStorage.removeItem("loanTrackerUser");
    localStorage.removeItem("loanTrackerUser");
    return null;
  }
}

function redirectToLogin() {
  window.location.assign(new URL("index.html#login", window.location.href).toString());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateOnly(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

async function parseResponse(response) {
  const responseText = await response.text();

  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch (_error) {
    return {
      message: responseText.trim() || "Unexpected response from the server."
    };
  }
}

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(buildApiUrl(path), {
      credentials: "include",
      ...options
    });
  } catch (_error) {
    throw new Error("Cannot reach the API server right now.");
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}.`);
  }

  return data;
}

function setStatus(element, baseClass, type, message) {
  if (!element) {
    return;
  }

  element.hidden = false;
  element.className = `${baseClass} is-${type}`;
  element.textContent = message;
}

function clearStatus(element, baseClass) {
  if (!element) {
    return;
  }

  element.hidden = true;
  element.className = baseClass;
  element.textContent = "";
}

function setButtonLoading(button, isLoading, idleLabel, loadingLabel) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : idleLabel;
}

function getCurrentUserId() {
  return appState.user?.id || appState.user?.userId || "";
}

function getLoanIconLabel(name) {
  const alphanumeric = String(name || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

  return alphanumeric.slice(0, 2) || "LN";
}

function normalizeNameKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function renderLenderAvatar(name, logoDataUrl, className) {
  if (logoDataUrl) {
    return `
      <span class="${className} is-logo-image">
        <img src="${escapeHtml(logoDataUrl)}" alt="" loading="lazy" />
      </span>
    `;
  }

  return `<span class="${className} generic-loan-icon">${escapeHtml(getLoanIconLabel(name))}</span>`;
}

function resolveLoanLogoDataUrl(loan) {
  if (loan.lenderLogoDataUrl) {
    return loan.lenderLogoDataUrl;
  }

  if (loan.lenderId) {
    const lenderById = appState.lenders.find((lender) => lender.id === loan.lenderId);

    if (lenderById?.logoDataUrl) {
      return lenderById.logoDataUrl;
    }
  }

  const lenderByName = appState.lenders.find((lender) => normalizeNameKey(lender.name) === normalizeNameKey(loan.lenderName));
  return lenderByName?.logoDataUrl || "";
}

function getActiveLoans() {
  return appState.loans.filter((loan) => loan.status === "active");
}

function getClosedLoans() {
  return appState.loans.filter((loan) => loan.status === "closed");
}

function renderLenders(lenders) {
  if (!lenderSummary) {
    return;
  }

  if (!lenders.length) {
    lenderSummary.innerHTML = '<span class="empty-chip">No lender apps added yet.</span>';
    return;
  }

  lenderSummary.innerHTML = lenders
    .map(
      (lender) => `
        <span class="lender-chip">
          ${renderLenderAvatar(lender.name, lender.logoDataUrl, "lender-chip-icon")}
          <span>${escapeHtml(lender.name)}</span>
        </span>
      `
    )
    .join("");
}

function renderLoanTotals() {
  const activeTotal = getActiveLoans().reduce((sum, loan) => sum + loan.totalAmount, 0);
  const allTotal = appState.loans.reduce((sum, loan) => sum + loan.totalAmount, 0);

  activeTotalValues.forEach((element) => {
    element.textContent = formatCurrency(activeTotal);
  });

  allTotalValues.forEach((element) => {
    element.textContent = formatCurrency(allTotal);
  });
}

function renderPaymentSchedule() {
  if (!paymentScheduleList) {
    return;
  }

  const scheduledLoans = [...getActiveLoans()].sort(
    (left, right) => new Date(left.firstPaymentDate).getTime() - new Date(right.firstPaymentDate).getTime()
  );

  if (!scheduledLoans.length) {
    paymentScheduleList.innerHTML = '<div class="due-empty">Add your first loan to build your payment schedule.</div>';
    return;
  }

  paymentScheduleList.innerHTML = scheduledLoans
    .slice(0, 3)
    .map(
      (loan) => {
        const lenderLogoDataUrl = resolveLoanLogoDataUrl(loan);

        return `
          <div class="due-item">
            <div class="loan-brand">
              ${renderLenderAvatar(loan.lenderName, lenderLogoDataUrl, "loan-icon")}
              <div>
                <h2>${escapeHtml(loan.lenderName)}</h2>
                <p>${escapeHtml(formatCurrency(loan.totalAmount))}</p>
              </div>
            </div>
            <span class="due-date">${escapeHtml(formatDateOnly(loan.firstPaymentDate))}</span>
          </div>
        `;
      }
    )
    .join("");
}

function renderLoanCards(container, loans, emptyMessage, isClosed = false) {
  if (!container) {
    return;
  }

  if (!loans.length) {
    container.innerHTML = `<div class="loan-empty-state">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  container.innerHTML = loans
    .map((loan) => {
      const monthlyEstimate = loan.termMonths > 0 ? loan.totalAmount / loan.termMonths : loan.totalAmount;
      const lenderLogoDataUrl = resolveLoanLogoDataUrl(loan);

      return `
        <article class="${isClosed ? "closed-card" : "loan-panel"}">
          <div class="loan-panel-top">
            <div class="loan-brand">
              ${renderLenderAvatar(loan.lenderName, lenderLogoDataUrl, "loan-icon")}
              <div>
                <h3>${escapeHtml(loan.lenderName)}</h3>
                <p>Total: ${escapeHtml(formatCurrency(loan.totalAmount))}</p>
                <p>Term: ${escapeHtml(String(loan.termMonths))} month${loan.termMonths === 1 ? "" : "s"}</p>
              </div>
            </div>

            <span class="loan-status-badge ${isClosed ? "is-closed" : ""}">${isClosed ? "Closed" : "Active"}</span>
          </div>

          <div class="installment-list loan-detail-list">
            <div>
              <span>First payment</span>
              <strong>${escapeHtml(formatDateOnly(loan.firstPaymentDate))}</strong>
            </div>
            <div>
              <span>Monthly estimate</span>
              <strong>${escapeHtml(formatCurrency(monthlyEstimate))}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>${escapeHtml(formatDateOnly(loan.createdAt))}</strong>
            </div>
          </div>

          <p class="loan-reason"><strong>Reason:</strong> ${escapeHtml(loan.reason)}</p>
        </article>
      `;
    })
    .join("");
}

function renderLoanCollections() {
  renderLoanTotals();
  renderPaymentSchedule();
  renderLoanCards(activeLoanList, getActiveLoans(), "No active loans yet. Use Add Loan to create your first one.");
  renderLoanCards(closedLoanList, getClosedLoans(), "No closed loans are saved yet.", true);
}

function renderThreads(threads) {
  if (!dashboardThreadList) {
    return;
  }

  if (!threads.length) {
    dashboardThreadList.innerHTML =
      '<div class="empty-thread-state">You have not sent any suggestions or questions yet.</div>';
    return;
  }

  dashboardThreadList.innerHTML = threads
    .map((thread) => {
      const statusClass = thread.status === "replied" ? "is-replied" : "is-open";

      return `
        <article class="thread-card-user">
          <header>
            <div>
              <h4>${escapeHtml(thread.subject)}</h4>
              <span class="thread-status ${statusClass}">${escapeHtml(thread.status)}</span>
            </div>
            <time datetime="${escapeHtml(thread.updatedAt)}">${escapeHtml(formatDateTime(thread.updatedAt))}</time>
          </header>

          <div class="thread-message-list">
            ${thread.messages
              .map(
                (message) => `
                  <article class="thread-message ${message.senderRole === "admin" ? "is-admin" : ""}">
                    <div class="thread-message-meta">
                      <strong>${escapeHtml(message.senderName)}</strong>
                      <span>${escapeHtml(formatDateTime(message.sentAt))}</span>
                    </div>
                    <p>${escapeHtml(message.body)}</p>
                  </article>
                `
              )
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function ensureLoanModal() {
  if (loanModalRefs) {
    return loanModalRefs;
  }

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="loan-modal" id="loanModal" hidden>
        <div class="loan-modal-card" role="dialog" aria-modal="true" aria-labelledby="loanModalTitle">
          <div class="loan-modal-header">
            <div>
              <h3 id="loanModalTitle">Add Loan</h3>
              <p>Save a new loan using one of the admin-approved lenders. If it is not listed, choose Other and the lender name field will appear.</p>
            </div>

            <button type="button" class="modal-close-button" data-close-loan-modal aria-label="Close add loan form">x</button>
          </div>

          <div id="loanModalStatus" class="loan-modal-status" hidden></div>

          <form id="loanModalForm" class="loan-modal-form" novalidate>
            <div class="loan-modal-grid">
              <label class="loan-modal-field">
                <span>Lender name</span>
                <select id="loanLenderSelect" name="selectedLender" required></select>
              </label>

              <label class="loan-modal-field" id="otherLenderField" hidden>
                <span>Other lender name</span>
                <input id="otherLenderInput" name="otherLenderName" type="text" maxlength="80" placeholder="Type the lender name" />
              </label>

              <label class="loan-modal-field">
                <span>Total loan amount</span>
                <input name="totalAmount" type="number" min="1" step="0.01" placeholder="5000" required />
              </label>

              <label class="loan-modal-field">
                <span>Loan term in months</span>
                <input name="termMonths" type="number" min="1" step="1" placeholder="6" required />
              </label>

              <label class="loan-modal-field">
                <span>First payment date</span>
                <input name="firstPaymentDate" type="date" required />
              </label>
            </div>

            <label class="loan-modal-field">
              <span>Reason for this loan</span>
              <textarea name="reason" rows="4" maxlength="240" placeholder="What is this loan for?" required></textarea>
            </label>

            <div class="loan-modal-actions">
              <button type="button" class="modal-secondary-button" data-close-loan-modal>Cancel</button>
              <button type="submit" class="modal-primary-button">Save loan</button>
            </div>
          </form>
        </div>
      </div>
    `
  );

  const modal = document.getElementById("loanModal");
  const form = document.getElementById("loanModalForm");
  const lenderSelect = document.getElementById("loanLenderSelect");
  const otherLenderField = document.getElementById("otherLenderField");
  const otherLenderInput = document.getElementById("otherLenderInput");
  const status = document.getElementById("loanModalStatus");

  loanModalRefs = {
    modal,
    form,
    lenderSelect,
    otherLenderField,
    otherLenderInput,
    status,
    submitButton: form.querySelector(".modal-primary-button")
  };

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeLoanModal();
    }
  });

  modal.querySelectorAll("[data-close-loan-modal]").forEach((button) => {
    button.addEventListener("click", closeLoanModal);
  });

  lenderSelect.addEventListener("change", toggleOtherLenderField);
  form.addEventListener("submit", handleLoanSubmit);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeLoanModal();
    }
  });

  return loanModalRefs;
}

function populateLoanLenderOptions() {
  const { lenderSelect } = ensureLoanModal();

  const options = [
    '<option value="">Select lender</option>',
    ...appState.lenders.map((lender) => `<option value="${escapeHtml(lender.id)}">${escapeHtml(lender.name)}</option>`),
    '<option value="other">Other</option>'
  ];

  lenderSelect.innerHTML = options.join("");
}

function toggleOtherLenderField() {
  const { lenderSelect, otherLenderField, otherLenderInput } = ensureLoanModal();
  const isOther = lenderSelect.value === "other";

  otherLenderField.hidden = !isOther;
  otherLenderField.setAttribute("aria-hidden", String(!isOther));
  otherLenderInput.required = isOther;
  otherLenderInput.disabled = !isOther;

  if (!isOther) {
    otherLenderInput.value = "";
    return;
  }

  if (document.activeElement === lenderSelect) {
    window.requestAnimationFrame(() => otherLenderInput.focus());
  }
}

function openLoanModal() {
  const refs = ensureLoanModal();

  refs.form.reset();
  clearStatus(refs.status, "loan-modal-status");
  populateLoanLenderOptions();
  refs.modal.hidden = false;
  refs.lenderSelect.value = "";
  toggleOtherLenderField();
  refs.lenderSelect.focus();
}

function closeLoanModal() {
  const refs = ensureLoanModal();

  refs.modal.hidden = true;
  refs.form.reset();
  clearStatus(refs.status, "loan-modal-status");
  refs.lenderSelect.value = "";
  toggleOtherLenderField();
}

async function handleLoanSubmit(event) {
  event.preventDefault();

  const refs = ensureLoanModal();
  const userId = getCurrentUserId();
  const submitButton = refs.submitButton;
  const formData = new FormData(refs.form);
  const payload = {
    userId,
    selectedLender: String(formData.get("selectedLender") || "").trim(),
    otherLenderName: String(formData.get("otherLenderName") || "").trim(),
    totalAmount: String(formData.get("totalAmount") || "").trim(),
    termMonths: String(formData.get("termMonths") || "").trim(),
    firstPaymentDate: String(formData.get("firstPaymentDate") || "").trim(),
    reason: String(formData.get("reason") || "").trim()
  };

  clearStatus(refs.status, "loan-modal-status");

  if (!userId) {
    setStatus(refs.status, "loan-modal-status", "error", "Your session is missing a user id. Please sign in again.");
    return;
  }

  if (!payload.selectedLender) {
    setStatus(refs.status, "loan-modal-status", "error", "Choose a lender before saving the loan.");
    refs.lenderSelect.focus();
    return;
  }

  if (payload.selectedLender === "other" && payload.otherLenderName.length < 2) {
    setStatus(refs.status, "loan-modal-status", "error", "Enter the other lender name before saving the loan.");
    refs.otherLenderInput.focus();
    return;
  }

  if (!payload.totalAmount || Number(payload.totalAmount) <= 0) {
    setStatus(refs.status, "loan-modal-status", "error", "Enter a valid total loan amount greater than zero.");
    refs.form.elements.totalAmount.focus();
    return;
  }

  if (!payload.termMonths || Number(payload.termMonths) <= 0) {
    setStatus(refs.status, "loan-modal-status", "error", "Enter a valid loan term in months.");
    refs.form.elements.termMonths.focus();
    return;
  }

  if (!payload.firstPaymentDate) {
    setStatus(refs.status, "loan-modal-status", "error", "Choose the first payment date before saving the loan.");
    refs.form.elements.firstPaymentDate.focus();
    return;
  }

  if (payload.reason.length < 3) {
    setStatus(refs.status, "loan-modal-status", "error", "Enter the reason for the loan before saving it.");
    refs.form.elements.reason.focus();
    return;
  }

  setButtonLoading(submitButton, true, "Save loan", "Saving...");

  try {
    const data = await apiRequest("/api/loans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    setStatus(refs.status, "loan-modal-status", "success", data.message);
    await loadLoans(userId);
    window.setTimeout(closeLoanModal, 450);
  } catch (error) {
    setStatus(refs.status, "loan-modal-status", "error", error.message);
  } finally {
    setButtonLoading(submitButton, false, "Save loan", "Saving...");
  }
}

async function loadLenders() {
  try {
    const data = await apiRequest("/api/lenders");
    appState.lenders = data.lenders || [];
  } catch (_error) {
    appState.lenders = [];
  }

  renderLenders(appState.lenders);
  populateLoanLenderOptions();
  renderLoanCollections();
}

async function loadLoans(userId) {
  if (!userId) {
    appState.loans = [];
    renderLoanCollections();
    return;
  }

  try {
    const data = await apiRequest(`/api/loans?userId=${encodeURIComponent(userId)}`);
    appState.loans = data.loans || [];
  } catch (_error) {
    appState.loans = [];
  }

  renderLoanCollections();
}

async function loadThreads(userId) {
  if (!dashboardThreadList || !userId) {
    return;
  }

  try {
    const data = await apiRequest(`/api/messages?userId=${encodeURIComponent(userId)}`);
    renderThreads(data.threads || []);
  } catch (error) {
    dashboardThreadList.innerHTML = `<div class="empty-thread-state">${escapeHtml(error.message)}</div>`;
  }
}

async function logout() {
  try {
    await fetch(buildApiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include"
    });
  } finally {
    sessionStorage.removeItem("loanTrackerUser");
    localStorage.removeItem("loanTrackerUser");
    redirectToLogin();
  }
}

const user = readStoredUser();

if (!user) {
  redirectToLogin();
} else {
  appState.user = user;
  ensureLoanModal();

  const storedUserId = getCurrentUserId();
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const roleLabel = user.role === "admin" ? "Admin account" : "Member account";

  if (greetingText) {
    greetingText.textContent = fullName ? `Welcome back, ${fullName}!` : "Welcome back!";
  }

  if (emailText) {
    emailText.textContent = user.email || "Signed in to your loan workspace.";
  }

  if (roleText) {
    roleText.textContent = roleLabel;
  }

  openLoanModalButtons.forEach((button) => {
    button.addEventListener("click", openLoanModal);
  });

  Promise.allSettled([loadLenders(), loadLoans(storedUserId), loadThreads(storedUserId)]);

  if (userMessageForm) {
    userMessageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearStatus(dashboardMessageStatus, "dashboard-inline-status");

      const submitButton = userMessageForm.querySelector(".panel-action-button");
      const subject = userMessageForm.elements.subject.value.trim();
      const message = userMessageForm.elements.message.value.trim();

      if (!storedUserId) {
        setStatus(
          dashboardMessageStatus,
          "dashboard-inline-status",
          "error",
          "Your session is missing a user id. Please sign in again."
        );
        return;
      }

      if (subject.length < 3) {
        setStatus(dashboardMessageStatus, "dashboard-inline-status", "error", "Enter a subject with at least 3 characters.");
        userMessageForm.elements.subject.focus();
        return;
      }

      if (message.length < 5) {
        setStatus(dashboardMessageStatus, "dashboard-inline-status", "error", "Enter a message with at least 5 characters.");
        userMessageForm.elements.message.focus();
        return;
      }

      setButtonLoading(submitButton, true, "Send message", "Sending...");

      try {
        const data = await apiRequest("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            userId: storedUserId,
            subject,
            message
          })
        });

        userMessageForm.reset();
        setStatus(dashboardMessageStatus, "dashboard-inline-status", "success", data.message);
        await loadThreads(storedUserId);
      } catch (error) {
        setStatus(dashboardMessageStatus, "dashboard-inline-status", "error", error.message);
      } finally {
        setButtonLoading(submitButton, false, "Send message", "Sending...");
      }
    });
  }
}

signOutButtons.forEach((button) => {
  button.addEventListener("click", logout);
});
