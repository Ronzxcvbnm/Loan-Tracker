const adminGreeting = document.getElementById("adminGreeting");
const adminIdentity = document.getElementById("adminIdentity");
const adminLogoutButton = document.getElementById("adminLogoutButton");
const lenderForm = document.getElementById("lenderForm");
const lenderNameInput = document.getElementById("lenderNameInput");
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
const metricLenderCount = document.getElementById("metricLenderCount");
const metricOpenCount = document.getElementById("metricOpenCount");
const metricRepliedCount = document.getElementById("metricRepliedCount");
const metricUserCount = document.getElementById("metricUserCount");
const threadCountChip = document.getElementById("threadCountChip");

const adminState = {
  admin: null,
  lenders: [],
  threads: [],
  selectedThreadId: null
};

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

function setStatus(element, type, message) {
  element.hidden = false;
  element.className = `inline-status is-${type}`;
  element.textContent = message;
}

function clearStatus(element) {
  element.hidden = true;
  element.className = "inline-status";
  element.textContent = "";
}

function setButtonLoading(button, isLoading, idleLabel, loadingLabel) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : idleLabel;
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
  const openCount = adminState.threads.filter((thread) => thread.status === "open").length;
  const repliedCount = adminState.threads.filter((thread) => thread.status === "replied").length;
  const userCount = new Set(adminState.threads.map((thread) => thread.userId)).size;

  metricLenderCount.textContent = String(adminState.lenders.length);
  metricOpenCount.textContent = String(openCount);
  metricRepliedCount.textContent = String(repliedCount);
  metricUserCount.textContent = String(userCount);
  threadCountChip.textContent = `${adminState.threads.length} thread${adminState.threads.length === 1 ? "" : "s"}`;
}

function renderLenders() {
  if (!adminState.lenders.length) {
    adminLenderList.innerHTML = '<div class="empty-state">No lender apps have been added yet. Add your first one above.</div>';
    return;
  }

  adminLenderList.innerHTML = adminState.lenders
    .map(
      (lender) => `
        <article class="token-card">
          <div>
            <strong>${escapeHtml(lender.name)}</strong>
            <p class="meta-note">Added ${escapeHtml(formatDate(lender.createdAt))}</p>
          </div>
          <button type="button" class="mini-button" data-delete-lender="${escapeHtml(lender.id)}">Delete</button>
        </article>
      `
    )
    .join("");
}

function renderThreadList() {
  if (!adminState.threads.length) {
    threadList.innerHTML = '<div class="empty-state">No user suggestions or messages have been sent yet.</div>';
    return;
  }

  threadList.innerHTML = adminState.threads
    .map((thread) => {
      const lastMessage = thread.messages[thread.messages.length - 1];
      const statusClass = thread.status === "replied" ? "is-replied" : "is-open";
      const isSelected = thread.id === adminState.selectedThreadId ? "is-selected" : "";

      return `
        <button type="button" class="thread-card ${isSelected}" data-thread-id="${escapeHtml(thread.id)}">
          <div class="thread-header">
            <h4>${escapeHtml(thread.subject)}</h4>
            <span class="status-pill ${statusClass}">${escapeHtml(thread.status)}</span>
          </div>
          <p>${escapeHtml(thread.userName)} (${escapeHtml(thread.userEmail)})</p>
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
  const thread = getSelectedThread();

  if (!thread) {
    selectedThreadStatus.textContent = "No selection";
    replyEmptyState.hidden = false;
    replyWorkspace.hidden = true;
    conversationHistory.innerHTML = "";
    return;
  }

  selectedThreadStatus.textContent = thread.status === "replied" ? "Replied thread" : "Open thread";
  selectedThreadSubject.textContent = thread.subject;
  selectedThreadUser.textContent = `${thread.userName} (${thread.userEmail})`;
  replyEmptyState.hidden = true;
  replyWorkspace.hidden = false;
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

function syncSelectedThread() {
  if (adminState.selectedThreadId && getSelectedThread()) {
    return;
  }

  adminState.selectedThreadId = adminState.threads[0]?.id || null;
}

async function loadAdminData() {
  const [lenderData, messageData] = await Promise.all([apiRequest("/api/lenders"), apiRequest("/api/admin/messages")]);

  adminState.lenders = lenderData.lenders || [];
  adminState.threads = messageData.threads || [];
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

adminLogoutButton.addEventListener("click", logoutAdmin);

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
      body: JSON.stringify({ name })
    });

    lenderForm.reset();
    setStatus(adminLenderStatus, "success", data.message);
    await loadAdminData();
    lenderNameInput.focus();
  } catch (error) {
    setStatus(adminLenderStatus, "error", error.message);
  } finally {
    setButtonLoading(submitButton, false, "Add lender", "Saving...");
  }
});

adminLenderList.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-lender]");

  if (!deleteButton) {
    return;
  }

  clearStatus(adminLenderStatus);
  const lenderId = deleteButton.dataset.deleteLender;

  setButtonLoading(deleteButton, true, "Delete", "Removing...");

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
      setButtonLoading(deleteButton, false, "Delete", "Removing...");
    }
  }
});

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

replyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus(replyStatus);

  const thread = getSelectedThread();
  const submitButton = replyForm.querySelector(".panel-action-button");
  const message = replyMessageInput.value.trim();

  if (!thread) {
    setStatus(replyStatus, "error", "Select a thread before sending a reply.");
    return;
  }

  if (!message) {
    setStatus(replyStatus, "error", "Enter a reply before sending.");
    replyMessageInput.focus();
    return;
  }

  setButtonLoading(submitButton, true, "Send reply", "Sending...");

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
    setButtonLoading(submitButton, false, "Send reply", "Sending...");
  }
});

async function initializeAdminDashboard() {
  try {
    const admin = await loadAdminSession();

    adminState.admin = admin;
    const serializedAdmin = JSON.stringify(admin);

    sessionStorage.setItem("loanTrackerUser", serializedAdmin);
    localStorage.setItem("loanTrackerUser", serializedAdmin);
    adminGreeting.textContent = `Welcome back, ${admin.firstName}!`;
    adminIdentity.textContent = `${admin.email} - ${admin.role.toUpperCase()} access confirmed`;
  } catch (_error) {
    window.location.assign("/#login");
    return;
  }

  try {
    await loadAdminData();
  } catch (error) {
    setStatus(adminLenderStatus, "error", error.message);
    threadList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

initializeAdminDashboard();
