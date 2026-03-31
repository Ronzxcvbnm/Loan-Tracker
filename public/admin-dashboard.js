const adminGreeting = document.getElementById("adminGreeting");
const adminIdentity = document.getElementById("adminIdentity");
const adminLogoutButton = document.getElementById("adminLogoutButton");
const lenderForm = document.getElementById("lenderForm");
const lenderNameInput = document.getElementById("lenderNameInput");
const lenderLogoInput = document.getElementById("lenderLogoInput");
const lenderLogoPreviewFrame = document.getElementById("lenderLogoPreviewFrame");
const lenderLogoPreviewImage = document.getElementById("lenderLogoPreviewImage");
const lenderLogoPreviewFallback = document.getElementById("lenderLogoPreviewFallback");
const adminLenderStatus = document.getElementById("adminLenderStatus");
const adminLenderList = document.getElementById("adminLenderList");
const threadList = document.getElementById("threadList");
const replyForm = document.getElementById("replyForm");
const replyMessageInput = document.getElementById("replyMessageInput");
const replyStatus = document.getElementById("replyStatus");
const replyEmptyState = document.getElementById("replyEmptyState");
const replyWorkspace = document.getElementById("replyWorkspace");
const selectedThreadStatus = document.getElementById("selectedThreadStatus");
const selectedThreadSubject = document.getElementById("selectedThreadSubject");
const selectedThreadUser = document.getElementById("selectedThreadUser");
const conversationHistory = document.getElementById("conversationHistory");
const markResolvedButton = document.getElementById("markResolvedButton");
const closeThreadButton = document.getElementById("closeThreadButton");
const metricLenderCount = document.getElementById("metricLenderCount");
const metricOpenCount = document.getElementById("metricOpenCount");
const metricRepliedCount = document.getElementById("metricRepliedCount");
const metricUserCount = document.getElementById("metricUserCount");
const threadCountChip = document.getElementById("threadCountChip");
const adminPasswordForm = document.getElementById("adminPasswordForm");
const adminPasswordStatus = document.getElementById("adminPasswordStatus");
const currentAdminPasswordInput = document.getElementById("currentAdminPasswordInput");
const newAdminPasswordInput = document.getElementById("newAdminPasswordInput");
const confirmAdminPasswordInput = document.getElementById("confirmAdminPasswordInput");

const adminState = {
  admin: null,
  lenders: [],
  threads: [],
  registeredUserCount: 0,
  selectedThreadId: null,
  pendingLogoDataUrl: ""
};

const ACCEPTED_LOGO_TYPE_PATTERN = /^image\/(?:png|jpe?g|webp|gif|avif)$/i;
const MAX_LOGO_FILE_SIZE_BYTES = 850 * 1024;
const needsLenderData = Boolean(adminLenderList || lenderForm || metricLenderCount);
const needsThreadData = Boolean(
  threadList || replyForm || metricOpenCount || metricRepliedCount || metricUserCount || threadCountChip
);
const needsOverviewStats = Boolean(metricUserCount);
const THREAD_OPEN_STATUS = "open";
const THREAD_REPLIED_STATUS = "replied";
const THREAD_SOLVED_STATUS = "solved";
const THREAD_RESOLVED_STATUS = "resolved";
const THREAD_CLOSED_STATUS = "closed";
const DEFAULT_REPLY_PLACEHOLDER = replyMessageInput?.getAttribute("placeholder") || "Write a helpful reply for the user...";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getThreadStatusClass(status) {
  if (status === THREAD_REPLIED_STATUS) {
    return "is-replied";
  }

  if (isTerminalThreadStatus(status)) {
    return "is-resolved";
  }

  return "is-open";
}

function formatThreadStatusLabel(status) {
  if (status === THREAD_REPLIED_STATUS) {
    return "Admin replied";
  }

  if (isTerminalThreadStatus(status)) {
    return "Solved";
  }

  return "Open";
}

function isTerminalThreadStatus(status) {
  return status === THREAD_SOLVED_STATUS || status === THREAD_RESOLVED_STATUS || status === THREAD_CLOSED_STATUS;
}

function getTicketLabel(count) {
  return `${count} ticket${count === 1 ? "" : "s"}`;
}

function getLogoInitials(name) {
  const compactName = String(name || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!compactName) {
    return "LD";
  }

  const words = compactName.split(" ").filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word.charAt(0));

  return initials.join("").toUpperCase() || compactName.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "LD";
}

function renderLenderLogoMarkup(name, logoDataUrl, className = "token-logo") {
  if (logoDataUrl) {
    return `
      <span class="${className} is-image">
        <img src="${escapeHtml(logoDataUrl)}" alt="" />
      </span>
    `;
  }

  return `<span class="${className}">${escapeHtml(getLogoInitials(name))}</span>`;
}

function setStatus(element, type, message) {
  if (!element) {
    return;
  }

  element.hidden = false;
  element.className = `inline-status is-${type}`;
  element.textContent = message;
}

function clearStatus(element) {
  if (!element) {
    return;
  }

  element.hidden = true;
  element.className = "inline-status";
  element.textContent = "";
}

function setButtonLoading(button, isLoading, idleLabel, loadingLabel) {
  if (!button) {
    return;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : idleLabel;
}

function updateLenderLogoPreview() {
  if (!lenderNameInput || !lenderLogoPreviewFrame || !lenderLogoPreviewImage || !lenderLogoPreviewFallback) {
    return;
  }

  const lenderName = lenderNameInput.value.trim() || "Lender";
  const hasLogo = Boolean(adminState.pendingLogoDataUrl);

  lenderLogoPreviewFrame.classList.toggle("is-image", hasLogo);
  lenderLogoPreviewImage.hidden = !hasLogo;
  lenderLogoPreviewFallback.hidden = hasLogo;

  if (hasLogo) {
    lenderLogoPreviewImage.src = adminState.pendingLogoDataUrl;
    lenderLogoPreviewImage.alt = `${lenderName} logo preview`;
    return;
  }

  lenderLogoPreviewImage.removeAttribute("src");
  lenderLogoPreviewImage.alt = "";
  lenderLogoPreviewFallback.textContent = getLogoInitials(lenderName);
}

function resetLenderLogoSelection() {
  adminState.pendingLogoDataUrl = "";

  if (lenderLogoInput) {
    lenderLogoInput.value = "";
  }

  updateLenderLogoPreview();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The lender logo could not be read."));
    reader.readAsDataURL(file);
  });
}

function validateLogoFile(file) {
  if (!file.type || !ACCEPTED_LOGO_TYPE_PATTERN.test(file.type)) {
    return "Upload a PNG, JPG, WEBP, GIF, or AVIF image for the lender logo.";
  }

  if (file.size > MAX_LOGO_FILE_SIZE_BYTES) {
    return "Keep the lender logo under 850 KB so it loads well on the dashboard.";
  }

  return "";
}

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { message: text.trim() || "Unexpected response from the server." };
  }
}

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(path, {
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

function getSelectedThread() {
  return adminState.threads.find((thread) => thread.id === adminState.selectedThreadId) || null;
}

function updateMetrics() {
  const openCount = adminState.threads.filter((thread) => thread.status === THREAD_OPEN_STATUS).length;
  const repliedCount = adminState.threads.filter((thread) => thread.status === THREAD_REPLIED_STATUS).length;

  if (metricLenderCount) {
    metricLenderCount.textContent = String(adminState.lenders.length);
  }

  if (metricOpenCount) {
    metricOpenCount.textContent = String(openCount);
  }

  if (metricRepliedCount) {
    metricRepliedCount.textContent = String(repliedCount);
  }

  if (metricUserCount) {
    metricUserCount.textContent = String(adminState.registeredUserCount);
  }

  if (threadCountChip) {
    threadCountChip.textContent = getTicketLabel(adminState.threads.length);
  }
}

function renderLenders() {
  if (!adminLenderList) {
    return;
  }

  if (!adminState.lenders.length) {
    adminLenderList.innerHTML = '<div class="empty-state">No lender apps have been added yet. Add your first one above.</div>';
    return;
  }

  adminLenderList.innerHTML = adminState.lenders
    .map(
      (lender, index) => `
        <article class="token-card">
          <div class="token-card-main">
            <span class="token-order" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
            ${renderLenderLogoMarkup(lender.name, lender.logoDataUrl)}
            <div class="token-card-copy">
              <strong>${escapeHtml(lender.name)}</strong>
              <p class="meta-note">Added ${escapeHtml(formatDate(lender.createdAt))}</p>
            </div>
          </div>
          <span class="lender-state-badge ${lender.logoDataUrl ? "is-ready" : "is-missing"}">
            ${lender.logoDataUrl ? "Logo ready" : "No logo yet"}
          </span>
          <button type="button" class="mini-button" data-delete-lender="${escapeHtml(lender.id)}">Remove</button>
        </article>
      `
    )
    .join("");
}

function renderThreadList() {
  if (!threadList) {
    return;
  }

  if (!adminState.threads.length) {
    threadList.innerHTML = '<div class="empty-state">No support tickets have been submitted yet.</div>';
    return;
  }

  threadList.innerHTML = adminState.threads
    .map((thread) => {
      const lastMessage = thread.messages[thread.messages.length - 1];
      const statusClass = getThreadStatusClass(thread.status);
      const isSelected = thread.id === adminState.selectedThreadId ? "is-selected" : "";

      return `
        <button type="button" class="thread-card ${isSelected}" data-thread-id="${escapeHtml(thread.id)}">
          <div class="thread-header">
            <h4>${escapeHtml(thread.subject)}</h4>
            <span class="status-pill ${statusClass}">${escapeHtml(formatThreadStatusLabel(thread.status))}</span>
          </div>
          <p>${escapeHtml(thread.ticketCode || thread.id)} | ${escapeHtml(thread.userName)} (${escapeHtml(thread.userEmail)})</p>
          <div class="thread-meta">
            <span class="meta-note">${escapeHtml(lastMessage.senderName)}: ${escapeHtml(lastMessage.body.slice(0, 80))}</span>
            <span class="meta-note">${escapeHtml(formatDate(thread.updatedAt))}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderSelectedThread() {
  if (!selectedThreadStatus || !replyEmptyState || !replyWorkspace || !conversationHistory) {
    return;
  }

  const replySubmitButton = replyForm?.querySelector(".panel-action-button");
  const thread = getSelectedThread();

  if (!thread) {
    selectedThreadStatus.textContent = "No selection";
    replyEmptyState.hidden = false;
    replyWorkspace.hidden = true;
    conversationHistory.innerHTML = "";

    if (replyMessageInput) {
      replyMessageInput.disabled = true;
      replyMessageInput.value = "";
      replyMessageInput.placeholder = DEFAULT_REPLY_PLACEHOLDER;
    }

    if (replySubmitButton) {
      replySubmitButton.disabled = true;
      replySubmitButton.textContent = "Send reply";
    }

    if (markResolvedButton) {
      markResolvedButton.hidden = true;
      markResolvedButton.disabled = true;
      markResolvedButton.textContent = "Mark as solved";
    }

    if (closeThreadButton) {
      closeThreadButton.hidden = true;
      closeThreadButton.disabled = true;
      closeThreadButton.textContent = "Close ticket";
    }

    if (selectedThreadSubject) {
      selectedThreadSubject.textContent = "Ticket subject";
    }

    if (selectedThreadUser) {
      selectedThreadUser.textContent = "Ticket code, member name, and email";
    }

    return;
  }

  const isTerminal = isTerminalThreadStatus(thread.status);

  selectedThreadStatus.textContent = formatThreadStatusLabel(thread.status);

  if (selectedThreadSubject) {
    selectedThreadSubject.textContent = thread.subject;
  }

  if (selectedThreadUser) {
    selectedThreadUser.textContent = `${thread.ticketCode || thread.id} | ${thread.userName} (${thread.userEmail})`;
  }

  replyEmptyState.hidden = true;
  replyWorkspace.hidden = false;

  if (replyMessageInput) {
    replyMessageInput.disabled = isTerminal;
    replyMessageInput.placeholder = isTerminal
      ? "This ticket is solved. The user can open a new one now."
      : DEFAULT_REPLY_PLACEHOLDER;

    if (isTerminal) {
      replyMessageInput.value = "";
    }
  }

  if (replySubmitButton) {
    replySubmitButton.disabled = isTerminal;
    replySubmitButton.textContent = "Send ticket reply";
  }

  if (markResolvedButton) {
    markResolvedButton.hidden = false;
    markResolvedButton.disabled = isTerminal;
    markResolvedButton.textContent = isTerminal ? "Solved" : "Mark as solved";
  }

  if (closeThreadButton) {
    closeThreadButton.hidden = false;
    closeThreadButton.disabled = isTerminal;
    closeThreadButton.textContent = thread.status === THREAD_CLOSED_STATUS ? "Closed" : "Close ticket";
  }

  conversationHistory.innerHTML = thread.messages
    .map((message) => {
      const roleClass = message.senderRole === "admin" ? "is-admin" : "is-user";

      return `
        <article class="message-bubble ${roleClass}">
          <header>
            <strong>${escapeHtml(message.senderName)}</strong>
            <time datetime="${escapeHtml(message.sentAt)}">${escapeHtml(formatDate(message.sentAt))}</time>
          </header>
          <p>${escapeHtml(message.body)}</p>
        </article>
      `;
    })
    .join("");
}

async function updateSelectedThreadStatus(nextStatus, actionButton, idleLabel, loadingLabel) {
  clearStatus(replyStatus);

  const thread = getSelectedThread();

  if (!thread) {
    setStatus(replyStatus, "error", "Select a ticket before changing its status.");
    return;
  }

  if (isTerminalThreadStatus(thread.status)) {
    setStatus(replyStatus, "info", "This ticket is already solved. The user can open a new one now.");
    renderSelectedThread();
    return;
  }

  setButtonLoading(actionButton, true, idleLabel, loadingLabel);

  try {
    const data = await apiRequest(`/api/admin/messages/${thread.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: nextStatus })
    });

    if (replyMessageInput) {
      replyMessageInput.value = "";
    }

    setStatus(replyStatus, "success", data.message);
    await loadAdminData();
  } catch (error) {
    setStatus(replyStatus, "error", error.message);
  } finally {
    if (actionButton && document.body.contains(actionButton)) {
      setButtonLoading(actionButton, false, idleLabel, loadingLabel);
    }

    renderSelectedThread();
  }
}

function syncSelectedThread() {
  if (adminState.selectedThreadId && getSelectedThread()) {
    return;
  }

  adminState.selectedThreadId = adminState.threads[0]?.id || null;
}

async function loadAdminOverviewStats() {
  const data = await apiRequest("/api/auth/admin/stats");
  adminState.registeredUserCount = Number(data.registeredUserCount) || 0;
}

async function loadLenderData() {
  const data = await apiRequest("/api/lenders");
  adminState.lenders = data.lenders || [];
}

async function loadThreadData() {
  const data = await apiRequest("/api/admin/messages");
  adminState.threads = data.threads || [];
}

async function loadAdminData() {
  const requests = [];

  if (needsLenderData) {
    requests.push(loadLenderData());
  }

  if (needsThreadData) {
    requests.push(loadThreadData());
  }

  if (needsOverviewStats) {
    requests.push(loadAdminOverviewStats());
  }

  if (!requests.length) {
    return;
  }

  await Promise.all(requests);
  syncSelectedThread();
  updateMetrics();
  renderLenders();
  renderThreadList();
  renderSelectedThread();
}

async function loadAdminSession() {
  const data = await apiRequest("/api/admin/session");
  return data.admin;
}

function showDataLoadError(message) {
  const safeMessage = message || "We couldn't load this admin page right now.";

  if (adminIdentity) {
    adminIdentity.textContent = safeMessage;
  }

  if (adminLenderStatus) {
    setStatus(adminLenderStatus, "error", safeMessage);
  }

  if (replyStatus) {
    setStatus(replyStatus, "error", safeMessage);
  }

  if (adminLenderList) {
    adminLenderList.innerHTML = `<div class="empty-state">${escapeHtml(safeMessage)}</div>`;
  }

  if (threadList) {
    threadList.innerHTML = `<div class="empty-state">${escapeHtml(safeMessage)}</div>`;
  }
}

async function handleLenderLogoChange(event) {
  clearStatus(adminLenderStatus);
  const file = event.target.files?.[0];

  if (!file) {
    resetLenderLogoSelection();
    return;
  }

  const validationMessage = validateLogoFile(file);

  if (validationMessage) {
    resetLenderLogoSelection();
    setStatus(adminLenderStatus, "error", validationMessage);
    return;
  }

  try {
    adminState.pendingLogoDataUrl = await readFileAsDataUrl(file);
    updateLenderLogoPreview();
  } catch (error) {
    resetLenderLogoSelection();
    setStatus(adminLenderStatus, "error", error.message);
  }
}

async function logoutAdmin() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include"
    });
  } finally {
    sessionStorage.removeItem("loanTrackerUser");
    localStorage.removeItem("loanTrackerUser");
    window.location.assign("/#login");
  }
}

if (adminLogoutButton) {
  adminLogoutButton.addEventListener("click", logoutAdmin);
}

if (lenderLogoInput) {
  lenderLogoInput.addEventListener("change", handleLenderLogoChange);
}

if (lenderNameInput) {
  lenderNameInput.addEventListener("input", updateLenderLogoPreview);
}

if (lenderForm) {
  lenderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus(adminLenderStatus);

    const submitButton = lenderForm.querySelector(".panel-action-button");
    const name = lenderNameInput.value.trim();

    if (!name) {
      setStatus(adminLenderStatus, "error", "Enter a lender app name before saving.");
      lenderNameInput.focus();
      return;
    }

    setButtonLoading(submitButton, true, "Add lender", "Saving...");

    try {
      const data = await apiRequest("/api/admin/lenders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          logoDataUrl: adminState.pendingLogoDataUrl
        })
      });

      lenderForm.reset();
      resetLenderLogoSelection();
      setStatus(adminLenderStatus, "success", data.message);
      await loadAdminData();
      lenderNameInput.focus();
    } catch (error) {
      setStatus(adminLenderStatus, "error", error.message);
    } finally {
      setButtonLoading(submitButton, false, "Add lender", "Saving...");
    }
  });
}

if (adminLenderList) {
  adminLenderList.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-lender]");

    if (!deleteButton) {
      return;
    }

    clearStatus(adminLenderStatus);
    const lenderId = deleteButton.dataset.deleteLender;

    setButtonLoading(deleteButton, true, "Remove", "Removing...");

    try {
      const data = await apiRequest(`/api/admin/lenders/${lenderId}`, {
        method: "DELETE"
      });

      setStatus(adminLenderStatus, "success", data.message);
      await loadAdminData();
    } catch (error) {
      setStatus(adminLenderStatus, "error", error.message);
    } finally {
      if (document.body.contains(deleteButton)) {
        setButtonLoading(deleteButton, false, "Remove", "Removing...");
      }
    }
  });
}

if (threadList) {
  threadList.addEventListener("click", (event) => {
    const threadButton = event.target.closest("[data-thread-id]");

    if (!threadButton) {
      return;
    }

    adminState.selectedThreadId = threadButton.dataset.threadId;
    clearStatus(replyStatus);
    renderThreadList();
    renderSelectedThread();
  });
}

if (replyForm) {
  replyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus(replyStatus);

    const thread = getSelectedThread();
    const submitButton = replyForm.querySelector(".panel-action-button");
    const message = replyMessageInput.value.trim();

    if (!thread) {
      setStatus(replyStatus, "error", "Select a ticket before sending a reply.");
      return;
    }

    if (isTerminalThreadStatus(thread.status)) {
      setStatus(replyStatus, "error", "This ticket is already solved. The user can open a new one now.");
      renderSelectedThread();
      return;
    }

    if (!message) {
      setStatus(replyStatus, "error", "Enter a ticket reply before sending.");
      replyMessageInput.focus();
      return;
    }

    setButtonLoading(submitButton, true, "Send ticket reply", "Sending...");

    try {
      const data = await apiRequest(`/api/admin/messages/${thread.id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
      });

      replyForm.reset();
      setStatus(replyStatus, "success", data.message);
      await loadAdminData();
    } catch (error) {
      setStatus(replyStatus, "error", error.message);
    } finally {
      setButtonLoading(submitButton, false, "Send ticket reply", "Sending...");
    }
  });
}

if (markResolvedButton) {
  markResolvedButton.addEventListener("click", () => {
    updateSelectedThreadStatus(
      THREAD_SOLVED_STATUS,
      markResolvedButton,
      "Mark as solved",
      "Saving..."
    );
  });
}

if (closeThreadButton) {
  closeThreadButton.addEventListener("click", () => {
    updateSelectedThreadStatus(
      THREAD_CLOSED_STATUS,
      closeThreadButton,
      "Close ticket",
      "Saving..."
    );
  });
}

if (adminPasswordForm) {
  adminPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus(adminPasswordStatus);

    const submitButton = adminPasswordForm.querySelector(".panel-action-button");
    const currentPassword = currentAdminPasswordInput.value.trim();
    const newPassword = newAdminPasswordInput.value.trim();
    const confirmPassword = confirmAdminPasswordInput.value.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatus(adminPasswordStatus, "error", "Fill in your current password, new password, and confirmation.");
      return;
    }

    if (newPassword.length < 8) {
      setStatus(adminPasswordStatus, "error", "Choose a new password with at least 8 characters.");
      newAdminPasswordInput.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus(adminPasswordStatus, "error", "The new password confirmation does not match.");
      confirmAdminPasswordInput.focus();
      return;
    }

    setButtonLoading(submitButton, true, "Update password", "Updating...");

    try {
      const data = await apiRequest("/api/auth/admin/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        })
      });

      adminPasswordForm.reset();
      setStatus(adminPasswordStatus, "success", data.message);
      currentAdminPasswordInput.focus();
    } catch (error) {
      setStatus(adminPasswordStatus, "error", error.message);
    } finally {
      setButtonLoading(submitButton, false, "Update password", "Updating...");
    }
  });
}

async function initializeAdminDashboard() {
  updateLenderLogoPreview();

  try {
    const admin = await loadAdminSession();

    adminState.admin = admin;
    const serializedAdmin = JSON.stringify(admin);

    sessionStorage.setItem("loanTrackerUser", serializedAdmin);
    localStorage.setItem("loanTrackerUser", serializedAdmin);

    if (adminGreeting) {
      adminGreeting.textContent = `Welcome back, ${admin.firstName}!`;
    }

    if (adminIdentity) {
      adminIdentity.textContent = `${admin.email} - ${admin.role.toUpperCase()} access confirmed`;
    }
  } catch (_error) {
    window.location.assign("/#login");
    return;
  }

  try {
    await loadAdminData();
  } catch (error) {
    showDataLoadError(error.message);
  }
}

initializeAdminDashboard();
