const greetingText = document.querySelector("[data-user-greeting]");
const emailText = document.querySelector("[data-user-email]");
const heroActions = document.querySelector(".hero-actions");
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
const messageFormHeading = document.getElementById("messageFormHeading");
const messageFormCopy = document.getElementById("messageFormCopy");
const messageComposerMode = document.getElementById("messageComposerMode");
const monthlyChecklistList = document.getElementById("monthlyChecklistList");
const monthlyChecklistStatus = document.getElementById("monthlyChecklistStatus");
const overviewPieChart = document.getElementById("overviewPieChart");
const overviewPaidValue = document.getElementById("overviewPaidValue");
const overviewUpcomingValue = document.getElementById("overviewUpcomingValue");
const overviewOverdueValue = document.getElementById("overviewOverdueValue");
const monthlyTrendChart = document.getElementById("monthlyTrendChart");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const ACCEPTED_PROFILE_IMAGE_TYPE_PATTERN = /^image\/(?:png|jpe?g|webp|gif|avif)$/i;
const MAX_PROFILE_IMAGE_SIZE_BYTES = 850 * 1024;
const THEME_STORAGE_KEY = "loanTrackerTheme";
const THEME_COLOR_MAP = {
  dark: "#08111d",
  light: "#2f718c"
};
const MESSAGE_OPEN_STATUS = "open";
const MESSAGE_REPLIED_STATUS = "replied";
const MESSAGE_SOLVED_STATUS = "solved";
const MESSAGE_RESOLVED_STATUS = "resolved";
const MESSAGE_CLOSED_STATUS = "closed";

const appState = {
  user: null,
  lenders: [],
  loans: [],
  threads: [],
  pendingProfileImageDataUrl: "",
  theme: "dark"
};

let loanModalRefs = null;
let profilePanelRefs = null;

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

function getStoredTheme() {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "";
  } catch (_error) {
    return "";
  }
}

function getPreferredTheme() {
  const storedTheme = getStoredTheme();

  if (storedTheme) {
    return storedTheme;
  }

  const documentTheme = document.documentElement.dataset.theme;
  return documentTheme === "light" || documentTheme === "dark" ? documentTheme : "dark";
}

function updateThemeColorMeta(theme) {
  if (!themeColorMeta) {
    return;
  }

  themeColorMeta.setAttribute("content", THEME_COLOR_MAP[theme] || THEME_COLOR_MAP.dark);
}

function syncThemeUi() {
  if (!profilePanelRefs) {
    return;
  }

  const isDarkTheme = appState.theme === "dark";
  profilePanelRefs.headerThemeButton.textContent = isDarkTheme ? "Light mode" : "Dark mode";
  profilePanelRefs.headerThemeButton.setAttribute("aria-pressed", String(isDarkTheme));
  profilePanelRefs.themeModeLabel.textContent = isDarkTheme ? "Dark mode enabled" : "Light mode enabled";
  profilePanelRefs.themeToggleButton.textContent = isDarkTheme ? "Switch to light mode" : "Switch to dark mode";
}

function applyTheme(theme, options = {}) {
  const nextTheme = theme === "light" ? "light" : "dark";
  const shouldPersist = options.persist !== false;

  appState.theme = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  updateThemeColorMeta(nextTheme);

  if (shouldPersist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (_error) {
      // Ignore storage write failures and still apply the chosen theme in the current session.
    }
  }

  syncThemeUi();
}

function toggleTheme() {
  applyTheme(appState.theme === "dark" ? "light" : "dark");
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

function writeStoredUser(user) {
  const serializedUser = JSON.stringify(user);
  sessionStorage.setItem("loanTrackerUser", serializedUser);
  localStorage.setItem("loanTrackerUser", serializedUser);
}

function getUserDisplayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "Profile";
}

function getUserInitials(user) {
  const fullName = getUserDisplayName(user);
  const words = fullName.split(" ").filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word.charAt(0));
  return initials.join("").toUpperCase() || "LT";
}

function renderUserAvatarMarkup(user, className = "profile-avatar") {
  if (user?.profileImageDataUrl) {
    return `
      <span class="${className} is-image">
        <img src="${escapeHtml(user.profileImageDataUrl)}" alt="" loading="lazy" />
      </span>
    `;
  }

  return `<span class="${className}">${escapeHtml(getUserInitials(user))}</span>`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The profile picture could not be read."));
    reader.readAsDataURL(file);
  });
}

function validateProfileImageFile(file) {
  if (!file.type || !ACCEPTED_PROFILE_IMAGE_TYPE_PATTERN.test(file.type)) {
    return "Upload a PNG, JPG, WEBP, GIF, or AVIF image for the profile picture.";
  }

  if (file.size > MAX_PROFILE_IMAGE_SIZE_BYTES) {
    return "Keep the profile picture under 850 KB so it loads well across the dashboard.";
  }

  return "";
}

function updateProfilePreview() {
  if (!profilePanelRefs) {
    return;
  }

  const previewDataUrl = appState.pendingProfileImageDataUrl || appState.user?.profileImageDataUrl || "";
  const hasImage = Boolean(previewDataUrl);
  const displayName = getUserDisplayName(appState.user);

  profilePanelRefs.previewFrame.classList.toggle("is-image", hasImage);
  profilePanelRefs.previewImage.hidden = !hasImage;
  profilePanelRefs.previewFallback.hidden = hasImage;

  if (hasImage) {
    profilePanelRefs.previewImage.src = previewDataUrl;
    profilePanelRefs.previewImage.alt = `${displayName} profile picture preview`;
    return;
  }

  profilePanelRefs.previewImage.removeAttribute("src");
  profilePanelRefs.previewImage.alt = "";
  profilePanelRefs.previewFallback.textContent = getUserInitials(appState.user);
}

function refreshProfileChrome() {
  if (!profilePanelRefs) {
    return;
  }

  const displayName = getUserDisplayName(appState.user);
  const roleLabel = appState.user?.role === "admin" ? "Admin account" : "Member account";
  profilePanelRefs.triggerAvatar.innerHTML = renderUserAvatarMarkup(appState.user, "profile-avatar");
  profilePanelRefs.panelAvatar.innerHTML = renderUserAvatarMarkup(appState.user, "profile-panel-avatar");
  profilePanelRefs.triggerName.textContent = displayName;
  profilePanelRefs.panelName.textContent = displayName;
  profilePanelRefs.panelEmail.textContent = appState.user?.email || "Signed in to your loan workspace.";
  profilePanelRefs.panelUserType.textContent = roleLabel;
  profilePanelRefs.removeButton.disabled = !(appState.pendingProfileImageDataUrl || appState.user?.profileImageDataUrl);
  updateProfilePreview();
}

function updateUserIdentityUi() {
  const fullName = getUserDisplayName(appState.user);

  if (greetingText) {
    greetingText.textContent = fullName ? `Welcome back, ${fullName}!` : "Welcome back!";
  }

  if (emailText) {
    emailText.textContent = appState.user?.email || "Signed in to your loan workspace.";
  }

  refreshProfileChrome();
}

function syncCurrentUser(nextUser) {
  appState.user = {
    ...appState.user,
    ...nextUser
  };
  writeStoredUser(appState.user);
  updateUserIdentityUi();
}

function openProfilePanel() {
  if (!profilePanelRefs) {
    return;
  }

  profilePanelRefs.modal.hidden = false;
  document.body.classList.add("modal-open");
  clearStatus(profilePanelRefs.photoStatus, "loan-modal-status");
  clearStatus(profilePanelRefs.passwordStatus, "loan-modal-status");
  refreshProfileChrome();
}

function closeProfilePanel() {
  if (!profilePanelRefs) {
    return;
  }

  profilePanelRefs.modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function handleProfileEscape(event) {
  if (event.key === "Escape" && profilePanelRefs && !profilePanelRefs.modal.hidden) {
    closeProfilePanel();
  }
}

async function handleProfileImageSelection(event) {
  if (!profilePanelRefs) {
    return;
  }

  clearStatus(profilePanelRefs.photoStatus, "loan-modal-status");

  const file = event.target.files?.[0];

  if (!file) {
    appState.pendingProfileImageDataUrl = "";
    refreshProfileChrome();
    return;
  }

  const validationMessage = validateProfileImageFile(file);

  if (validationMessage) {
    appState.pendingProfileImageDataUrl = "";
    profilePanelRefs.photoInput.value = "";
    refreshProfileChrome();
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "error", validationMessage);
    return;
  }

  try {
    appState.pendingProfileImageDataUrl = await readFileAsDataUrl(file);
    refreshProfileChrome();
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "info", "Profile picture ready to save.");
  } catch (error) {
    appState.pendingProfileImageDataUrl = "";
    profilePanelRefs.photoInput.value = "";
    refreshProfileChrome();
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "error", error.message);
  }
}

async function handleProfilePhotoSubmit(event) {
  event.preventDefault();

  if (!profilePanelRefs) {
    return;
  }

  const userId = getCurrentUserId();
  const submitButton = profilePanelRefs.photoSubmitButton;
  const profileImageDataUrl = appState.pendingProfileImageDataUrl || appState.user?.profileImageDataUrl || "";

  clearStatus(profilePanelRefs.photoStatus, "loan-modal-status");

  if (!userId) {
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "error", "Your session is missing a user id. Please sign in again.");
    return;
  }

  if (!profileImageDataUrl) {
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "error", "Choose a profile picture before saving.");
    profilePanelRefs.photoInput.focus();
    return;
  }

  setButtonLoading(submitButton, true, "Save photo", "Saving...");

  try {
    const data = await apiRequest("/api/auth/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId,
        profileImageDataUrl
      })
    });

    appState.pendingProfileImageDataUrl = "";
    profilePanelRefs.photoInput.value = "";
    syncCurrentUser(data.user);
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "success", data.message);
  } catch (error) {
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "error", error.message);
  } finally {
    if (document.body.contains(submitButton)) {
      setButtonLoading(submitButton, false, "Save photo", "Saving...");
    }
  }
}

async function handleProfilePhotoRemove() {
  if (!profilePanelRefs) {
    return;
  }

  const userId = getCurrentUserId();
  const removeButton = profilePanelRefs.removeButton;

  clearStatus(profilePanelRefs.photoStatus, "loan-modal-status");

  if (!userId) {
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "error", "Your session is missing a user id. Please sign in again.");
    return;
  }

  if (!appState.pendingProfileImageDataUrl && !appState.user?.profileImageDataUrl) {
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "info", "No profile picture is saved yet.");
    return;
  }

  setButtonLoading(removeButton, true, "Remove photo", "Removing...");

  try {
    const data = await apiRequest("/api/auth/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId,
        profileImageDataUrl: ""
      })
    });

    appState.pendingProfileImageDataUrl = "";
    profilePanelRefs.photoInput.value = "";
    syncCurrentUser(data.user);
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "success", data.message);
  } catch (error) {
    setStatus(profilePanelRefs.photoStatus, "loan-modal-status", "error", error.message);
  } finally {
    if (document.body.contains(removeButton)) {
      setButtonLoading(removeButton, false, "Remove photo", "Removing...");
    }
  }
}

async function handleUserPasswordSubmit(event) {
  event.preventDefault();

  if (!profilePanelRefs) {
    return;
  }

  const userId = getCurrentUserId();
  const submitButton = profilePanelRefs.passwordSubmitButton;
  const currentPassword = profilePanelRefs.currentPasswordInput.value.trim();
  const newPassword = profilePanelRefs.newPasswordInput.value.trim();
  const confirmPassword = profilePanelRefs.confirmPasswordInput.value.trim();

  clearStatus(profilePanelRefs.passwordStatus, "loan-modal-status");

  if (!userId) {
    setStatus(profilePanelRefs.passwordStatus, "loan-modal-status", "error", "Your session is missing a user id. Please sign in again.");
    return;
  }

  if (!currentPassword || !newPassword || !confirmPassword) {
    setStatus(profilePanelRefs.passwordStatus, "loan-modal-status", "error", "Fill in your current password, new password, and confirmation.");
    return;
  }

  if (newPassword.length < 8) {
    setStatus(profilePanelRefs.passwordStatus, "loan-modal-status", "error", "Choose a new password with at least 8 characters.");
    profilePanelRefs.newPasswordInput.focus();
    return;
  }

  if (newPassword !== confirmPassword) {
    setStatus(profilePanelRefs.passwordStatus, "loan-modal-status", "error", "The new password confirmation does not match.");
    profilePanelRefs.confirmPasswordInput.focus();
    return;
  }

  setButtonLoading(submitButton, true, "Update password", "Updating...");

  try {
    const data = await apiRequest("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId,
        currentPassword,
        newPassword,
        confirmPassword
      })
    });

    profilePanelRefs.passwordForm.reset();
    setStatus(profilePanelRefs.passwordStatus, "loan-modal-status", "success", data.message);
  } catch (error) {
    setStatus(profilePanelRefs.passwordStatus, "loan-modal-status", "error", error.message);
  } finally {
    if (document.body.contains(submitButton)) {
      setButtonLoading(submitButton, false, "Update password", "Updating...");
    }
  }
}

function ensureProfilePanel() {
  if (!heroActions) {
    return null;
  }

  if (profilePanelRefs) {
    return profilePanelRefs;
  }

  heroActions.insertAdjacentHTML(
    "beforeend",
    `
      <button type="button" class="theme-toggle-button" id="themeToggleButton" aria-pressed="true">Light mode</button>
      <button type="button" class="profile-trigger" id="profileTrigger">
        <span id="profileTriggerAvatar">${renderUserAvatarMarkup(appState.user, "profile-avatar")}</span>
        <span class="profile-trigger-copy">
          <strong id="profileTriggerName">Profile</strong>
          <span>Photo, password, theme</span>
        </span>
      </button>
    `
  );

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="profile-modal" id="profileModal" hidden>
        <div class="profile-modal-card" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
          <div class="profile-modal-header">
            <div class="profile-modal-identity">
              <div id="profilePanelAvatar">${renderUserAvatarMarkup(appState.user, "profile-panel-avatar")}</div>
              <div>
                <p class="section-kicker">Profile</p>
                <h3 id="profileModalTitle">Account settings</h3>
                <p class="profile-modal-subtext" id="profilePanelName">Profile</p>
                <p class="profile-modal-subtext profile-modal-email" id="profilePanelEmail"></p>
                <p class="profile-modal-subtext profile-user-type">User type: <strong id="profilePanelUserType">Member account</strong></p>
              </div>
            </div>

            <button type="button" class="modal-close-button" id="profileModalCloseButton" aria-label="Close profile section">×</button>
          </div>

          <div class="profile-modal-body">
            <section class="profile-section">
              <div class="panel-header panel-header-stack">
                <h3>Profile picture</h3>
                <p class="panel-subtext">Upload a clear photo or avatar to personalize your account.</p>
              </div>

              <div id="profilePhotoStatus" class="loan-modal-status" hidden></div>

              <form id="profilePhotoForm" class="profile-form" novalidate>
                <div class="profile-picture-row">
                  <div class="profile-picture-frame" id="profilePicturePreviewFrame">
                    <img id="profilePicturePreviewImage" alt="" hidden />
                    <span id="profilePicturePreviewFallback"></span>
                  </div>

                  <div class="profile-picture-copy">
                    <label class="profile-field">
                      <span>Upload photo</span>
                      <input
                        id="profilePhotoInput"
                        name="profilePhoto"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      />
                    </label>
                    <p class="profile-helper">PNG, JPG, WEBP, GIF, or AVIF up to 850 KB.</p>
                  </div>
                </div>

                <div class="profile-form-actions">
                  <button type="submit" class="panel-action-button" data-save-profile-photo>Save photo</button>
                  <button type="button" class="modal-secondary-button profile-remove-button" id="removeProfilePhotoButton">Remove photo</button>
                </div>
              </form>
            </section>

            <section class="profile-section">
              <div class="panel-header panel-header-stack">
                <h3>Change password</h3>
                <p class="panel-subtext">Use your current password before setting a new one.</p>
              </div>

              <div id="profilePasswordStatus" class="loan-modal-status" hidden></div>

              <form id="profilePasswordForm" class="profile-form" novalidate>
                <label class="profile-field">
                  <span>Current password</span>
                  <input id="profileCurrentPasswordInput" name="currentPassword" type="password" autocomplete="current-password" required />
                </label>

                <label class="profile-field">
                  <span>New password</span>
                  <input id="profileNewPasswordInput" name="newPassword" type="password" minlength="8" autocomplete="new-password" required />
                </label>

                <label class="profile-field">
                  <span>Confirm new password</span>
                  <input id="profileConfirmPasswordInput" name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required />
                </label>

                <div class="profile-form-actions">
                  <button type="submit" class="panel-action-button" data-update-user-password>Update password</button>
                </div>
              </form>
            </section>

            <section class="profile-section">
              <div class="panel-header panel-header-stack">
                <h3>Display</h3>
                <p class="panel-subtext">Switch between the richer dark interface and the lighter daytime view.</p>
              </div>

              <div class="theme-panel">
                <div>
                  <strong id="profileThemeModeLabel">Dark mode enabled</strong>
                  <p class="profile-helper">Your theme stays saved on this device across all dashboard tabs.</p>
                </div>

                <button type="button" class="modal-secondary-button theme-modal-button" id="profileThemeToggleButton">Switch to light mode</button>
              </div>
            </section>

            <section class="profile-section">
              <div class="panel-header panel-header-stack">
                <h3>Help</h3>
                <p class="panel-subtext">Quick support for everyday account questions.</p>
              </div>

              <div class="profile-help-card">
                Need help with lender requests, locked payments, or account questions? Open the Tickets tab and send the admin a note.
                Replies will appear in your support tickets so you can track them easily.
              </div>
            </section>

            <section class="profile-section">
              <div class="panel-header panel-header-stack">
                <h3>FAQ</h3>
                <p class="panel-subtext">Common questions about using your loan tracker.</p>
              </div>

              <div class="faq-list">
                <details class="faq-item">
                  <summary>How do I add a new loan?</summary>
                  <p>Use the Add Loan button in the top bar, fill in every required field, then save the loan to place it in your active list.</p>
                </details>

                <details class="faq-item">
                  <summary>Why are some future months locked?</summary>
                  <p>You need to settle the earliest unpaid bill first. Once that month is marked paid, the next scheduled month becomes available.</p>
                </details>

                <details class="faq-item">
                  <summary>How do I request a lender that is not on the list?</summary>
                  <p>Choose Other when adding a loan, type the lender name, and you can also open a support ticket if you want it added permanently.</p>
                </details>

                <details class="faq-item">
                  <summary>When does a loan move to Closed Loans?</summary>
                  <p>A loan moves to Closed Loans automatically after every scheduled month has been settled and the remaining balance reaches zero.</p>
                </details>
              </div>
            </section>

            <section class="profile-section profile-signout-section">
              <div class="panel-header panel-header-stack">
                <h3>Session</h3>
                <p class="panel-subtext">Sign out of your account from here when you're done.</p>
              </div>

              <button type="button" class="session-button profile-signout-button" id="profileSignOutButton">Sign out</button>
            </section>
          </div>
        </div>
      </div>
    `
  );

  profilePanelRefs = {
    headerThemeButton: document.getElementById("themeToggleButton"),
    trigger: document.getElementById("profileTrigger"),
    triggerAvatar: document.getElementById("profileTriggerAvatar"),
    triggerName: document.getElementById("profileTriggerName"),
    modal: document.getElementById("profileModal"),
    closeButton: document.getElementById("profileModalCloseButton"),
    panelAvatar: document.getElementById("profilePanelAvatar"),
    panelName: document.getElementById("profilePanelName"),
    panelEmail: document.getElementById("profilePanelEmail"),
    panelUserType: document.getElementById("profilePanelUserType"),
    photoStatus: document.getElementById("profilePhotoStatus"),
    photoForm: document.getElementById("profilePhotoForm"),
    photoInput: document.getElementById("profilePhotoInput"),
    photoSubmitButton: document.querySelector("[data-save-profile-photo]"),
    previewFrame: document.getElementById("profilePicturePreviewFrame"),
    previewImage: document.getElementById("profilePicturePreviewImage"),
    previewFallback: document.getElementById("profilePicturePreviewFallback"),
    removeButton: document.getElementById("removeProfilePhotoButton"),
    passwordStatus: document.getElementById("profilePasswordStatus"),
    passwordForm: document.getElementById("profilePasswordForm"),
    passwordSubmitButton: document.querySelector("[data-update-user-password]"),
    currentPasswordInput: document.getElementById("profileCurrentPasswordInput"),
    newPasswordInput: document.getElementById("profileNewPasswordInput"),
    confirmPasswordInput: document.getElementById("profileConfirmPasswordInput"),
    themeModeLabel: document.getElementById("profileThemeModeLabel"),
    themeToggleButton: document.getElementById("profileThemeToggleButton"),
    signOutButton: document.getElementById("profileSignOutButton")
  };

  profilePanelRefs.headerThemeButton.addEventListener("click", toggleTheme);
  profilePanelRefs.trigger.addEventListener("click", openProfilePanel);
  profilePanelRefs.closeButton.addEventListener("click", closeProfilePanel);
  profilePanelRefs.modal.addEventListener("click", (event) => {
    if (event.target === profilePanelRefs.modal) {
      closeProfilePanel();
    }
  });
  profilePanelRefs.photoInput.addEventListener("change", handleProfileImageSelection);
  profilePanelRefs.photoForm.addEventListener("submit", handleProfilePhotoSubmit);
  profilePanelRefs.removeButton.addEventListener("click", handleProfilePhotoRemove);
  profilePanelRefs.passwordForm.addEventListener("submit", handleUserPasswordSubmit);
  profilePanelRefs.themeToggleButton.addEventListener("click", toggleTheme);
  profilePanelRefs.signOutButton.addEventListener("click", logout);
  document.addEventListener("keydown", handleProfileEscape);

  refreshProfileChrome();
  syncThemeUi();
  return profilePanelRefs;
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

function resolveMonthlyAmount(loan) {
  if (Number(loan.monthlyAmount) > 0) {
    return Number(loan.monthlyAmount);
  }

  return loan.termMonths > 0 ? loan.totalAmount / loan.termMonths : loan.totalAmount;
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function buildScheduledPaymentDate(firstPaymentDate, monthOffset) {
  const baseDate = new Date(firstPaymentDate);

  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  const targetMonthAnchor = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOffset, 1);
  const lastDayOfTargetMonth = new Date(targetMonthAnchor.getFullYear(), targetMonthAnchor.getMonth() + 1, 0).getDate();

  targetMonthAnchor.setDate(Math.min(baseDate.getDate(), lastDayOfTargetMonth));
  return targetMonthAnchor;
}

function getLoanScheduleEntries(loan) {
  const termMonths = Number(loan.termMonths);

  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    return [];
  }

  return Array.from({ length: termMonths }, (_, index) => {
    const dueDate = buildScheduledPaymentDate(loan.firstPaymentDate, index);

    return dueDate
      ? {
          monthKey: formatMonthKey(dueDate),
          dueDate
        }
      : null;
  }).filter(Boolean);
}

function getLoanPayments(loan) {
  return Array.isArray(loan.payments) ? loan.payments : [];
}

function getLoanPaymentForMonth(loan, monthKey) {
  return getLoanPayments(loan).find((payment) => payment.monthKey === monthKey) || null;
}

function countPaidMonths(loan) {
  const scheduledMonthKeys = new Set(getLoanScheduleEntries(loan).map((entry) => entry.monthKey));

  return getLoanPayments(loan).filter((payment) => scheduledMonthKeys.has(payment.monthKey)).length;
}

function getNextUnpaidScheduleEntry(loan) {
  return getLoanScheduleEntries(loan).find((entry) => !getLoanPaymentForMonth(loan, entry.monthKey)) || null;
}

function getCurrentMonthKey() {
  return formatMonthKey(new Date());
}

function getTodayAtMidnight() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getPaidAmount(loan) {
  return Math.min(countPaidMonths(loan) * resolveMonthlyAmount(loan), Number(loan.totalAmount) || 0);
}

function getRemainingLoanBalance(loan) {
  return Math.max((Number(loan.totalAmount) || 0) - getPaidAmount(loan), 0);
}

function getPaymentStageLabel(dueDate) {
  const today = getTodayAtMidnight();
  const dueMonthKey = formatMonthKey(dueDate);
  const currentMonthKey = formatMonthKey(today);

  if (dueMonthKey > currentMonthKey) {
    return "upcoming";
  }

  if (dueDate < today && dueMonthKey < currentMonthKey) {
    return "overdue";
  }

  return "current";
}

function getSettlementActionLabel(dueDate) {
  const paymentStage = getPaymentStageLabel(dueDate);

  if (paymentStage === "overdue") {
    return "Settle overdue bill";
  }

  if (paymentStage === "upcoming") {
    return "Settle upcoming bill";
  }

  return "Settle current bill";
}

function getVisibleScheduleWindow(loan) {
  const scheduleEntries = getLoanScheduleEntries(loan);

  if (scheduleEntries.length <= 5) {
    return {
      visibleEntries: scheduleEntries,
      hiddenFutureCount: 0
    };
  }

  const firstUnpaidIndex = scheduleEntries.findIndex((entry) => !getLoanPaymentForMonth(loan, entry.monthKey));

  if (firstUnpaidIndex === -1) {
    return {
      visibleEntries: scheduleEntries.slice(-5),
      hiddenFutureCount: 0
    };
  }

  const maxWindowStart = Math.max(scheduleEntries.length - 5, 0);
  const windowStart = Math.min(firstUnpaidIndex, maxWindowStart);
  const visibleEntries = scheduleEntries.slice(windowStart, windowStart + 5);
  const hiddenFutureCount = Math.max(0, scheduleEntries.length - (windowStart + visibleEntries.length));

  return {
    visibleEntries,
    hiddenFutureCount
  };
}

function formatInstallmentMonthName(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long"
  }).format(date);
}

function getLoanProgressPercent(loan) {
  const termMonths = Math.max(Number(loan.termMonths) || 0, 1);
  return Math.max(0, Math.min(100, Math.round((countPaidMonths(loan) / termMonths) * 100)));
}

function getLoanProgressToneClass(loan) {
  const lenderName = String(loan.lenderName || "").toLowerCase();

  if (lenderName.includes("gotyme")) {
    return "is-cyan";
  }

  if (lenderName.includes("maya")) {
    return "is-mint";
  }

  return "is-blue";
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
  const activeTotal = getActiveLoans().reduce((sum, loan) => sum + getRemainingLoanBalance(loan), 0);
  const allTotal = appState.loans.reduce((sum, loan) => sum + loan.totalAmount, 0);

  activeTotalValues.forEach((element) => {
    element.textContent = formatCurrency(activeTotal);
  });

  allTotalValues.forEach((element) => {
    element.textContent = formatCurrency(allTotal);
  });
}

function updateOverviewChart() {
  if (!overviewPieChart || !overviewPaidValue || !overviewUpcomingValue || !overviewOverdueValue) {
    return;
  }

  const today = getTodayAtMidnight();
  let paidCount = 0;
  let upcomingCount = 0;
  let overdueCount = 0;

  appState.loans.forEach((loan) => {
    getLoanScheduleEntries(loan).forEach((entry) => {
      if (getLoanPaymentForMonth(loan, entry.monthKey)) {
        paidCount += 1;
      } else if (entry.dueDate < today) {
        overdueCount += 1;
      } else {
        upcomingCount += 1;
      }
    });
  });

  const totalCount = paidCount + upcomingCount + overdueCount;
  const paidPercent = totalCount ? Math.round((paidCount / totalCount) * 100) : 0;
  const upcomingPercent = totalCount ? Math.round((upcomingCount / totalCount) * 100) : 0;
  const overduePercent = Math.max(0, 100 - paidPercent - upcomingPercent);
  const paidStop = paidPercent;
  const upcomingStop = paidPercent + upcomingPercent;

  overviewPaidValue.textContent = `${paidPercent}%`;
  overviewUpcomingValue.textContent = `${upcomingPercent}%`;
  overviewOverdueValue.textContent = `${overduePercent}%`;
  overviewPieChart.style.background = totalCount
    ? `conic-gradient(#00c662 0 ${paidStop}%, #ffbf58 ${paidStop}% ${upcomingStop}%, #ff4040 ${upcomingStop}% 100%)`
    : "conic-gradient(rgba(255,255,255,0.18) 0 100%)";
  overviewPieChart.innerHTML = `
    <div class="pie-chart-core">
      <strong>${totalCount}</strong>
      <span>${totalCount === 1 ? "Tracked bill" : "Tracked bills"}</span>
    </div>
  `;
}

function formatCompactCurrencyTick(value) {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }

  return String(Math.round(value));
}

function updateMonthlyTrendChart() {
  if (!monthlyTrendChart) {
    return;
  }

  const currentYear = new Date().getFullYear();
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLongLabels = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const monthTotals = new Array(12).fill(0);

  appState.loans.forEach((loan) => {
    const loanMonthDate = new Date(loan.firstPaymentDate || loan.createdAt);

    if (Number.isNaN(loanMonthDate.getTime())) {
      return;
    }

    if (loanMonthDate.getFullYear() === currentYear) {
      monthTotals[loanMonthDate.getMonth()] += Number(loan.totalAmount) || 0;
    }
  });

  const maxValue = Math.max(...monthTotals, 1);
  const paddedMax = Math.ceil(maxValue * 1.2);
  const leftAxisValues = [paddedMax, paddedMax * 0.75, paddedMax * 0.5, paddedMax * 0.25, 0];
  const chartWidth = 460;
  const chartHeight = 248;
  const graphLeft = 56;
  const graphRight = 426;
  const graphTop = 24;
  const graphBottom = 172;
  const labelY = 226;
  const xStep = (graphRight - graphLeft) / (monthTotals.length - 1);
  const yRange = graphBottom - graphTop;
  const pointData = monthTotals.map((value, index) => {
    const x = graphLeft + xStep * index;
    const y = graphBottom - (value / paddedMax) * yRange;
    return {
      label: monthLabels[index],
      value,
      x,
      y
    };
  });
  const points = pointData.map(({ x, y }) => `${x},${y}`).join(" ");
  const areaPoints = `${graphLeft},${graphBottom} ${points} ${graphRight},${graphBottom}`;
  const hoverZones = pointData
    .map(({ x }, index) => {
      const zoneStart = index === 0 ? graphLeft : x - xStep / 2;
      const zoneEnd = index === pointData.length - 1 ? graphRight : x + xStep / 2;

      return `
        <rect
          class="chart-hover-zone"
          data-point-index="${index}"
          x="${zoneStart}"
          y="${graphTop}"
          width="${zoneEnd - zoneStart}"
          height="${yRange}"
        ></rect>
      `;
    })
    .join("");

  monthlyTrendChart.innerHTML = `
    <svg viewBox="0 0 ${chartWidth} ${chartHeight}" role="presentation" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#4a83ff" />
          <stop offset="100%" stop-color="#08d6f1" />
        </linearGradient>
        <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#41dcff" stop-opacity="0.36" />
          <stop offset="100%" stop-color="#41dcff" stop-opacity="0.03" />
        </linearGradient>
      </defs>
      <g class="grid-lines">
        <line x1="${graphLeft}" y1="${graphTop}" x2="${graphRight}" y2="${graphTop}"></line>
        <line x1="${graphLeft}" y1="${graphTop + yRange * 0.25}" x2="${graphRight}" y2="${graphTop + yRange * 0.25}"></line>
        <line x1="${graphLeft}" y1="${graphTop + yRange * 0.5}" x2="${graphRight}" y2="${graphTop + yRange * 0.5}"></line>
        <line x1="${graphLeft}" y1="${graphTop + yRange * 0.75}" x2="${graphRight}" y2="${graphTop + yRange * 0.75}"></line>
        <line x1="${graphLeft}" y1="${graphBottom}" x2="${graphRight}" y2="${graphBottom}"></line>
      </g>
      <polygon class="chart-area" points="${areaPoints}"></polygon>
      <polyline class="chart-stroke" points="${points}"></polyline>
      <g class="chart-points">
        ${pointData
          .map(
            ({ value, x, y }, index) =>
              `<circle class="chart-point${value ? "" : " is-empty"}" data-point-index="${index}" cx="${x}" cy="${y}" r="${value ? 5 : 4}"></circle>`
          )
          .join("")}
      </g>
      <g class="chart-hover-overlay" hidden>
        <line class="chart-hover-line" x1="${graphLeft}" y1="${graphTop}" x2="${graphLeft}" y2="${graphBottom}"></line>
        <circle class="chart-hover-dot" cx="${graphLeft}" cy="${graphBottom}" r="7"></circle>
      </g>
      <g class="chart-hover-zones">
        ${hoverZones}
      </g>
      <g class="axis-labels axis-left">
        <text x="6" y="${graphTop + 4}">${formatCompactCurrencyTick(leftAxisValues[0])}</text>
        <text x="6" y="${graphTop + yRange * 0.25 + 4}">${formatCompactCurrencyTick(leftAxisValues[1])}</text>
        <text x="6" y="${graphTop + yRange * 0.5 + 4}">${formatCompactCurrencyTick(leftAxisValues[2])}</text>
        <text x="6" y="${graphTop + yRange * 0.75 + 4}">${formatCompactCurrencyTick(leftAxisValues[3])}</text>
        <text x="12" y="${graphBottom + 4}">${formatCompactCurrencyTick(leftAxisValues[4])}</text>
      </g>
      <g class="axis-labels axis-bottom">
        ${pointData
          .map(
            ({ label, x }) => `<text x="${x}" y="${labelY}" text-anchor="middle">${label}</text>`
          )
          .join("")}
      </g>
    </svg>
    <div class="line-chart-tooltip" hidden></div>
  `;

  const tooltip = monthlyTrendChart.querySelector(".line-chart-tooltip");
  const hoverOverlay = monthlyTrendChart.querySelector(".chart-hover-overlay");
  const hoverLine = monthlyTrendChart.querySelector(".chart-hover-line");
  const hoverDot = monthlyTrendChart.querySelector(".chart-hover-dot");
  const pointElements = Array.from(monthlyTrendChart.querySelectorAll(".chart-point"));
  const hoverZoneElements = monthlyTrendChart.querySelectorAll(".chart-hover-zone");

  function clearChartHover() {
    if (tooltip) {
      tooltip.hidden = true;
    }

    if (hoverOverlay) {
      hoverOverlay.hidden = true;
    }

    pointElements.forEach((pointElement) => {
      pointElement.classList.remove("is-active");
    });
  }

  function showChartHover(index) {
    const point = pointData[index];

    if (!point || !tooltip || !hoverOverlay || !hoverLine || !hoverDot) {
      return;
    }

    pointElements.forEach((pointElement, pointIndex) => {
      pointElement.classList.toggle("is-active", pointIndex === index);
    });

    hoverOverlay.hidden = false;
    hoverLine.setAttribute("x1", String(point.x));
    hoverLine.setAttribute("x2", String(point.x));
    hoverDot.setAttribute("cx", String(point.x));
    hoverDot.setAttribute("cy", String(point.y));

    const chartBounds = monthlyTrendChart.getBoundingClientRect();
    const relativeX = (point.x / chartWidth) * chartBounds.width;
    const relativeY = (point.y / chartHeight) * chartBounds.height;
    const tooltipX = Math.min(Math.max(relativeX, 84), Math.max(chartBounds.width - 84, 84));
    const tooltipY = Math.max(relativeY - 54, 14);

    tooltip.hidden = false;
    tooltip.innerHTML = `
      <strong>${monthLongLabels[index]} ${currentYear}</strong>
      <span>${escapeHtml(formatCurrency(point.value))}</span>
    `;
    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;
  }

  hoverZoneElements.forEach((zone) => {
    zone.addEventListener("pointerenter", () => {
      showChartHover(Number(zone.dataset.pointIndex));
    });

    zone.addEventListener("pointermove", () => {
      showChartHover(Number(zone.dataset.pointIndex));
    });
  });

  monthlyTrendChart.onpointerleave = clearChartHover;
}

function renderPaymentSchedule() {
  if (!paymentScheduleList) {
    return;
  }

  const scheduledLoans = getActiveLoans()
    .map((loan) => ({
      loan,
      nextDueEntry: getNextUnpaidScheduleEntry(loan)
    }))
    .filter((item) => item.nextDueEntry)
    .sort((left, right) => left.nextDueEntry.dueDate.getTime() - right.nextDueEntry.dueDate.getTime());

  if (!scheduledLoans.length) {
    paymentScheduleList.innerHTML = '<div class="due-empty">Add your first loan to build your payment schedule.</div>';
    return;
  }

  paymentScheduleList.innerHTML = scheduledLoans
    .slice(0, 3)
    .map(
      ({ loan, nextDueEntry }) => {
        const lenderLogoDataUrl = resolveLoanLogoDataUrl(loan);

        return `
          <div class="due-item">
            <div class="loan-brand">
              ${renderLenderAvatar(loan.lenderName, lenderLogoDataUrl, "loan-icon")}
              <div>
                <h2>${escapeHtml(loan.lenderName)}</h2>
                <p>Remaining: ${escapeHtml(formatCurrency(getRemainingLoanBalance(loan)))}</p>
              </div>
            </div>
            <span class="due-date">${escapeHtml(formatDateOnly(nextDueEntry.dueDate))}</span>
          </div>
        `;
      }
    )
    .join("");
}

function renderMonthlyChecklist() {
  if (!monthlyChecklistList) {
    return;
  }

  const currentMonthKey = getCurrentMonthKey();
  const currentMonthLabel = formatMonthLabel(new Date());
  const dueThisMonth = getActiveLoans()
    .map((loan) => ({
      loan,
      currentMonthEntry: getLoanScheduleEntries(loan).find((entry) => entry.monthKey === currentMonthKey) || null
    }))
    .filter((item) => item.currentMonthEntry)
    .sort((left, right) => left.currentMonthEntry.dueDate.getTime() - right.currentMonthEntry.dueDate.getTime());

  if (!dueThisMonth.length) {
    monthlyChecklistList.innerHTML = `<div class="due-empty">No loan payments are scheduled for ${escapeHtml(currentMonthLabel)}.</div>`;
    return;
  }

  monthlyChecklistList.innerHTML = dueThisMonth
    .map(({ loan, currentMonthEntry }) => {
      const lenderLogoDataUrl = resolveLoanLogoDataUrl(loan);
      const isPaid = Boolean(getLoanPaymentForMonth(loan, currentMonthKey));

      return `
        <label class="payment-check-item ${isPaid ? "is-paid" : ""}">
          <div class="payment-check-main">
            ${renderLenderAvatar(loan.lenderName, lenderLogoDataUrl, "loan-icon")}
            <div class="payment-check-copy">
              <strong>${escapeHtml(loan.lenderName)}</strong>
              <span class="payment-check-meta">Monthly payment • ${escapeHtml(formatCurrency(resolveMonthlyAmount(loan)))}</span>
              <span class="payment-check-meta">Due ${escapeHtml(formatDateOnly(currentMonthEntry.dueDate))}</span>
            </div>
          </div>

          <span class="payment-check-toggle">
            <input
              class="payment-check-input"
              type="checkbox"
              data-loan-payment-toggle
              data-loan-id="${escapeHtml(loan.id)}"
              data-month-key="${escapeHtml(currentMonthKey)}"
              ${isPaid ? "checked" : ""}
            />
            <span>${isPaid ? "Paid" : "Mark paid"}</span>
          </span>
        </label>
      `;
    })
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
      const lenderLogoDataUrl = resolveLoanLogoDataUrl(loan);
      const monthlyAmount = resolveMonthlyAmount(loan);
      const paidMonths = countPaidMonths(loan);
      const nextDueEntry = getNextUnpaidScheduleEntry(loan);

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
              <span>Monthly payment</span>
              <strong>${escapeHtml(formatCurrency(monthlyAmount))}</strong>
            </div>
            <div>
              <span>Paid months</span>
              <strong>${escapeHtml(`${paidMonths}/${loan.termMonths}`)}</strong>
            </div>
            <div>
              <span>${isClosed ? "Closed on" : "Next due"}</span>
              <strong>${escapeHtml(formatDateOnly(isClosed ? loan.updatedAt : nextDueEntry?.dueDate || loan.firstPaymentDate))}</strong>
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
  renderMonthlyChecklist();
  renderLoanCards(activeLoanList, getActiveLoans(), "No active loans yet. Use Add Loan to create your first one.");
  renderLoanCards(closedLoanList, getClosedLoans(), "No closed loans are saved yet.", true);
}

function isActiveThreadStatus(status) {
  return status === MESSAGE_OPEN_STATUS || status === MESSAGE_REPLIED_STATUS;
}

function isTerminalThreadStatus(status) {
  return status === MESSAGE_SOLVED_STATUS || status === MESSAGE_RESOLVED_STATUS || status === MESSAGE_CLOSED_STATUS;
}

function getThreadStatusClass(status) {
  if (status === MESSAGE_REPLIED_STATUS) {
    return "is-replied";
  }

  if (isTerminalThreadStatus(status)) {
    return "is-resolved";
  }

  return "is-open";
}

function formatThreadStatusLabel(status) {
  if (status === MESSAGE_REPLIED_STATUS) {
    return "Admin replied";
  }

  if (isTerminalThreadStatus(status)) {
    return "Solved";
  }

  return "Open";
}

function getActiveMessageThread() {
  return appState.threads.find((thread) => isActiveThreadStatus(thread.status)) || null;
}

function updateMessageComposer() {
  if (!userMessageForm) {
    return;
  }

  const subjectInput = userMessageForm.elements.subject;
  const messageInput = userMessageForm.elements.message;
  const submitButton = userMessageForm.querySelector(".panel-action-button");
  const activeThread = getActiveMessageThread();

  if (!subjectInput || !messageInput || !submitButton) {
    return;
  }

  if (activeThread) {
    subjectInput.value = activeThread.subject;
    subjectInput.disabled = true;
    subjectInput.setAttribute("aria-disabled", "true");
    subjectInput.dataset.lockedThreadSubject = activeThread.subject;
    submitButton.textContent = "Send ticket update";

    if (messageFormHeading) {
      messageFormHeading.textContent = "Update current ticket";
    }

    if (messageFormCopy) {
      messageFormCopy.textContent = "You already have an active ticket. Keep replying here until the admin marks it solved.";
    }

    if (messageComposerMode) {
      messageComposerMode.hidden = false;
      messageComposerMode.innerHTML = `
        <strong>Active ticket:</strong>
        <span>${escapeHtml(activeThread.subject)}</span>
      `;
    }

    messageInput.placeholder = "Add your ticket update here...";
    return;
  }

  subjectInput.disabled = false;
  subjectInput.removeAttribute("aria-disabled");
  submitButton.textContent = "Open ticket";

  if (messageFormHeading) {
    messageFormHeading.textContent = "Open a support ticket";
  }

  if (messageFormCopy) {
    messageFormCopy.textContent = "Send support requests, lender suggestions, or account concerns from your dashboard.";
  }

  if (messageComposerMode) {
    messageComposerMode.hidden = true;
    messageComposerMode.textContent = "";
  }

  if (subjectInput.value === subjectInput.dataset.lockedThreadSubject) {
    subjectInput.value = "";
  }

  delete subjectInput.dataset.lockedThreadSubject;

  messageInput.placeholder = "Describe your request or issue here...";
}

function renderThreads(threads) {
  if (!dashboardThreadList) {
    return;
  }

  if (!threads.length) {
    dashboardThreadList.innerHTML = '<div class="empty-thread-state">You have not opened any support tickets yet.</div>';
    return;
  }

  dashboardThreadList.innerHTML = threads
    .map((thread) => {
      const statusClass = getThreadStatusClass(thread.status);
      const statusLabel = formatThreadStatusLabel(thread.status);
      const isActiveThread = isActiveThreadStatus(thread.status);
      const threadNote = isActiveThread
        ? "This is your active ticket. Keep replying here until the admin marks it solved."
        : "This ticket is solved. You can open a new one when needed.";

      return `
        <article class="thread-card-user ${isActiveThread ? "is-active-thread" : ""}">
          <header>
            <div>
              <h4>${escapeHtml(thread.subject)}</h4>
              <p class="thread-ticket-id">${escapeHtml(thread.ticketCode || thread.id)}</p>
              <span class="thread-status ${statusClass}">${escapeHtml(statusLabel)}</span>
            </div>
            <time datetime="${escapeHtml(thread.updatedAt)}">${escapeHtml(formatDateTime(thread.updatedAt))}</time>
          </header>
          <p class="thread-card-note">${escapeHtml(threadNote)}</p>

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
                <span>Monthly payment amount</span>
                <input name="monthlyAmount" type="number" min="1" step="0.01" placeholder="1000" required />
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
    monthlyAmount: String(formData.get("monthlyAmount") || "").trim(),
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

  if (!payload.monthlyAmount || Number(payload.monthlyAmount) <= 0) {
    setStatus(refs.status, "loan-modal-status", "error", "Enter a valid monthly payment amount greater than zero.");
    refs.form.elements.monthlyAmount.focus();
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

async function handleMonthlyChecklistChange(event) {
  const checkbox = event.target.closest("[data-loan-payment-toggle]");

  if (!checkbox) {
    return;
  }

  const userId = getCurrentUserId();
  const loanId = checkbox.dataset.loanId;
  const monthKey = checkbox.dataset.monthKey;
  const paid = checkbox.checked;

  clearStatus(monthlyChecklistStatus, "dashboard-inline-status");

  if (!userId) {
    checkbox.checked = !paid;
    setStatus(monthlyChecklistStatus, "dashboard-inline-status", "error", "Your session is missing a user id. Please sign in again.");
    return;
  }

  checkbox.disabled = true;

  try {
    const data = await apiRequest(`/api/loans/${encodeURIComponent(loanId)}/payments/${encodeURIComponent(monthKey)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId,
        paid
      })
    });

    appState.loans = appState.loans.map((loan) => (loan.id === data.loan.id ? data.loan : loan));
    renderLoanCollections();
    setStatus(monthlyChecklistStatus, "dashboard-inline-status", "success", data.message);
  } catch (error) {
    checkbox.checked = !paid;
    setStatus(monthlyChecklistStatus, "dashboard-inline-status", "error", error.message);
  } finally {
    if (document.body.contains(checkbox)) {
      checkbox.disabled = false;
    }
  }
}

function renderLoanTotals() {
  const activeTotal = getActiveLoans().reduce((sum, loan) => sum + getRemainingLoanBalance(loan), 0);
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

  const scheduledLoans = getActiveLoans()
    .map((loan) => ({
      loan,
      nextDueEntry: getNextUnpaidScheduleEntry(loan)
    }))
    .filter((item) => item.nextDueEntry)
    .sort((left, right) => left.nextDueEntry.dueDate.getTime() - right.nextDueEntry.dueDate.getTime());

  if (!scheduledLoans.length) {
    paymentScheduleList.innerHTML = '<div class="due-empty">Add your first loan to build your payment schedule.</div>';
    return;
  }

  paymentScheduleList.innerHTML = scheduledLoans
    .slice(0, 3)
    .map(({ loan, nextDueEntry }) => {
      const lenderLogoDataUrl = resolveLoanLogoDataUrl(loan);

      return `
        <div class="due-item">
          <div class="loan-brand">
            ${renderLenderAvatar(loan.lenderName, lenderLogoDataUrl, "loan-icon")}
            <div>
              <h2>${escapeHtml(loan.lenderName)}</h2>
              <p>Remaining: ${escapeHtml(formatCurrency(getRemainingLoanBalance(loan)))}</p>
            </div>
          </div>
          <span class="due-date">${escapeHtml(formatDateOnly(nextDueEntry.dueDate))}</span>
        </div>
      `;
    })
    .join("");
}

function renderMonthlyChecklist() {
  if (!monthlyChecklistList) {
    return;
  }

  const activeLoans = getActiveLoans();

  if (!activeLoans.length) {
    monthlyChecklistList.innerHTML = '<div class="due-empty">No active loans yet. Add a loan to build the payment checklist.</div>';
    return;
  }

  monthlyChecklistList.innerHTML = activeLoans
    .map((loan) => {
      const lenderLogoDataUrl = resolveLoanLogoDataUrl(loan);
      const remainingBalance = getRemainingLoanBalance(loan);
      const nextUnpaidEntry = getNextUnpaidScheduleEntry(loan);
      const { visibleEntries, hiddenFutureCount } = getVisibleScheduleWindow(loan);
      const scheduleMarkup = visibleEntries
        .map((entry) => {
          const isPaid = Boolean(getLoanPaymentForMonth(loan, entry.monthKey));
          const isActionable = Boolean(nextUnpaidEntry && nextUnpaidEntry.monthKey === entry.monthKey);
          const paymentStage = getPaymentStageLabel(entry.dueDate);
          const rowClass = isPaid ? "is-paid" : isActionable ? `is-actionable is-${paymentStage}` : "is-locked";

          return `
            <div class="settlement-row ${rowClass}">
              <div class="settlement-row-copy">
                <strong>${escapeHtml(formatMonthLabel(entry.dueDate))}</strong>
                <span>Due ${escapeHtml(formatDateOnly(entry.dueDate))} | ${escapeHtml(formatCurrency(resolveMonthlyAmount(loan)))}</span>
              </div>
              ${
                isPaid
                  ? '<span class="settlement-state is-paid">Paid</span>'
                  : isActionable
                    ? `<button type="button" class="settlement-button" data-settle-loan-payment data-loan-id="${escapeHtml(loan.id)}" data-month-key="${escapeHtml(entry.monthKey)}">${escapeHtml(getSettlementActionLabel(entry.dueDate))}</button>`
                    : '<span class="settlement-state is-locked">Locked</span>'
              }
            </div>
          `;
        })
        .join("");
      const overflowNote =
        hiddenFutureCount > 0
          ? `<p class="settlement-overflow-note">${escapeHtml(String(hiddenFutureCount))} more month${hiddenFutureCount === 1 ? "" : "s"} will appear after you settle the earlier bills.</p>`
          : "";

      return `
        <article class="settlement-card">
          <header class="settlement-card-header">
            ${renderLenderAvatar(loan.lenderName, lenderLogoDataUrl, "loan-icon")}
            <div class="settlement-card-copy">
              <strong>${escapeHtml(loan.lenderName)}</strong>
              <span class="settlement-card-meta">Monthly payment | ${escapeHtml(formatCurrency(resolveMonthlyAmount(loan)))}</span>
              <span class="settlement-card-meta">Remaining balance | ${escapeHtml(formatCurrency(remainingBalance))}</span>
            </div>
          </header>
          <div class="settlement-list">${scheduleMarkup}</div>
          ${overflowNote}
        </article>
      `;
    })
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
      const lenderLogoDataUrl = resolveLoanLogoDataUrl(loan);
      const monthlyAmount = resolveMonthlyAmount(loan);
      const termMonths = Number(loan.termMonths) || 0;
      const paidMonths = countPaidMonths(loan);
      const nextDueEntry = getNextUnpaidScheduleEntry(loan);
      const remainingBalance = getRemainingLoanBalance(loan);

      if (!isClosed) {
        const progressPercent = getLoanProgressPercent(loan);
        const progressToneClass = getLoanProgressToneClass(loan);
        const { visibleEntries, hiddenFutureCount } = getVisibleScheduleWindow(loan);
        const scheduleMarkup = visibleEntries
          .map((entry) => {
            const isPaid = Boolean(getLoanPaymentForMonth(loan, entry.monthKey));
            const isActionable = Boolean(nextDueEntry && nextDueEntry.monthKey === entry.monthKey);
            const paymentStage = getPaymentStageLabel(entry.dueDate);
            const rowClass = isPaid ? "is-paid" : isActionable ? `is-actionable is-${paymentStage}` : "is-locked";

            return `
              <div class="active-loan-row ${rowClass}">
                <div class="active-loan-row-copy">
                  <strong>${escapeHtml(formatInstallmentMonthName(entry.dueDate))}</strong>
                  <span>Due date: ${escapeHtml(formatDateOnly(entry.dueDate))}</span>
                </div>
                <strong class="active-loan-row-amount">${escapeHtml(formatCurrency(monthlyAmount))}</strong>
                <div class="active-loan-row-action">
                  ${
                    isPaid
                      ? '<span class="settlement-state is-paid">Paid</span>'
                      : isActionable
                        ? `<button type="button" class="settlement-button active-loan-action" data-settle-loan-payment data-loan-id="${escapeHtml(loan.id)}" data-month-key="${escapeHtml(entry.monthKey)}">${escapeHtml(getSettlementActionLabel(entry.dueDate))}</button>`
                        : '<span class="settlement-state is-locked">Locked</span>'
                  }
                </div>
              </div>
            `;
          })
          .join("");
        const overflowNote =
          hiddenFutureCount > 0
            ? `<p class="settlement-overflow-note active-loan-note">${escapeHtml(String(hiddenFutureCount))} more month${hiddenFutureCount === 1 ? "" : "s"} will appear after you settle the earlier bills.</p>`
            : "";

        return `
          <article class="loan-panel active-loan-card">
            <div class="loan-panel-top active-loan-header">
              <div class="loan-brand">
                ${renderLenderAvatar(loan.lenderName, lenderLogoDataUrl, "loan-icon")}
                <div class="active-loan-copy">
                  <h3>${escapeHtml(loan.lenderName)}</h3>
                  <p>Total: ${escapeHtml(formatCurrency(loan.totalAmount))}</p>
                  <p>Term: ${escapeHtml(String(termMonths))} month${termMonths === 1 ? "" : "s"}</p>
                </div>
              </div>

              <div class="progress-shell active-progress-shell">
                <div class="progress-bar ${progressToneClass}" style="--progress-width: ${progressPercent}%;"></div>
                <span class="progress-tag">${escapeHtml(`${progressPercent}% paid`)}</span>
                <span class="active-progress-caption">${escapeHtml(`${paidMonths}/${termMonths} settled | ${formatCurrency(remainingBalance)} left`)}</span>
              </div>
            </div>

            <div class="active-loan-summary">
              <span>Monthly payment: <strong>${escapeHtml(formatCurrency(monthlyAmount))}</strong></span>
              <span>Next due: <strong>${escapeHtml(formatDateOnly(nextDueEntry?.dueDate || loan.firstPaymentDate))}</strong></span>
            </div>

            <div class="active-loan-schedule">${scheduleMarkup}</div>
            ${overflowNote}
          </article>
        `;
      }

      return `
        <article class="${isClosed ? "closed-card" : "loan-panel"}">
          <div class="loan-panel-top">
            <div class="loan-brand">
              ${renderLenderAvatar(loan.lenderName, lenderLogoDataUrl, "loan-icon")}
              <div>
                <h3>${escapeHtml(loan.lenderName)}</h3>
                <p>${escapeHtml(isClosed ? "Original amount" : "Remaining balance")}: ${escapeHtml(formatCurrency(isClosed ? loan.totalAmount : remainingBalance))}</p>
                <p>Term: ${escapeHtml(String(termMonths))} month${termMonths === 1 ? "" : "s"}</p>
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
              <span>Monthly payment</span>
              <strong>${escapeHtml(formatCurrency(monthlyAmount))}</strong>
            </div>
            <div>
              <span>Paid months</span>
              <strong>${escapeHtml(`${paidMonths}/${termMonths}`)}</strong>
            </div>
            <div>
              <span>${isClosed ? "Closed on" : "Next due"}</span>
              <strong>${escapeHtml(formatDateOnly(isClosed ? loan.updatedAt : nextDueEntry?.dueDate || loan.firstPaymentDate))}</strong>
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
  updateOverviewChart();
  updateMonthlyTrendChart();
  renderPaymentSchedule();
  renderMonthlyChecklist();
  renderLoanCards(activeLoanList, getActiveLoans(), "No active loans yet. Use Add Loan to create your first one.");
  renderLoanCards(closedLoanList, getClosedLoans(), "No closed loans are saved yet.", true);
}

async function handleMonthlyChecklistChange(event) {
  const settleButton = event.target.closest("[data-settle-loan-payment]");

  if (!settleButton) {
    return;
  }

  const userId = getCurrentUserId();
  const loanId = settleButton.dataset.loanId;
  const monthKey = settleButton.dataset.monthKey;
  const idleLabel = settleButton.textContent;

  clearStatus(monthlyChecklistStatus, "dashboard-inline-status");

  if (!userId) {
    setStatus(monthlyChecklistStatus, "dashboard-inline-status", "error", "Your session is missing a user id. Please sign in again.");
    return;
  }

  setButtonLoading(settleButton, true, idleLabel, "Settling...");

  try {
    const data = await apiRequest(`/api/loans/${encodeURIComponent(loanId)}/payments/${encodeURIComponent(monthKey)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId,
        paid: true
      })
    });

    appState.loans = appState.loans.map((loan) => (loan.id === data.loan.id ? data.loan : loan));
    renderLoanCollections();
    setStatus(monthlyChecklistStatus, "dashboard-inline-status", "success", data.message);
  } catch (error) {
    setStatus(monthlyChecklistStatus, "dashboard-inline-status", "error", error.message);
  } finally {
    if (document.body.contains(settleButton)) {
      setButtonLoading(settleButton, false, idleLabel, "Settling...");
    }
  }
}

async function loadThreads(userId) {
  if (!userId) {
    return;
  }

  try {
    const data = await apiRequest(`/api/messages?userId=${encodeURIComponent(userId)}`);
    appState.threads = data.threads || [];
    renderThreads(appState.threads);
    updateMessageComposer();
  } catch (error) {
    appState.threads = [];
    updateMessageComposer();

    if (dashboardThreadList) {
      dashboardThreadList.innerHTML = `<div class="empty-thread-state">${escapeHtml(error.message)}</div>`;
    }
  }
}

async function loadCurrentUserProfile(userId) {
  if (!userId) {
    return;
  }

  try {
    const data = await apiRequest(`/api/auth/me?userId=${encodeURIComponent(userId)}`);
    appState.pendingProfileImageDataUrl = "";
    syncCurrentUser(data.user);
  } catch (error) {
    console.error("Loading current user profile failed:", error);
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

applyTheme(getPreferredTheme(), { persist: false });

const user = readStoredUser();

if (!user) {
  redirectToLogin();
} else {
  appState.user = user;
  ensureLoanModal();
  ensureProfilePanel();

  const storedUserId = getCurrentUserId();
  updateUserIdentityUi();

  openLoanModalButtons.forEach((button) => {
    button.addEventListener("click", openLoanModal);
  });

  if (activeLoanList) {
    activeLoanList.addEventListener("click", handleMonthlyChecklistChange);
  }

  if (monthlyChecklistList) {
    monthlyChecklistList.addEventListener("click", handleMonthlyChecklistChange);
  }

  Promise.allSettled([loadCurrentUserProfile(storedUserId), loadLenders(), loadLoans(storedUserId), loadThreads(storedUserId)]);
  updateMessageComposer();

  if (userMessageForm) {
    userMessageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearStatus(dashboardMessageStatus, "dashboard-inline-status");

      const submitButton = userMessageForm.querySelector(".panel-action-button");
      const activeThread = getActiveMessageThread();
      const subject = userMessageForm.elements.subject.value.trim();
      const message = userMessageForm.elements.message.value.trim();
      const idleLabel = activeThread ? "Send ticket update" : "Open ticket";
      const loadingLabel = activeThread ? "Sending..." : "Opening...";

      if (!storedUserId) {
        setStatus(
          dashboardMessageStatus,
          "dashboard-inline-status",
          "error",
          "Your session is missing a user id. Please sign in again."
        );
        return;
      }

      if (!activeThread && subject.length < 3) {
        setStatus(
          dashboardMessageStatus,
          "dashboard-inline-status",
          "error",
          "Enter a ticket subject with at least 3 characters."
        );
        userMessageForm.elements.subject.focus();
        return;
      }

      if (message.length < 5) {
        setStatus(
          dashboardMessageStatus,
          "dashboard-inline-status",
          "error",
          "Enter a ticket message with at least 5 characters."
        );
        userMessageForm.elements.message.focus();
        return;
      }

      setButtonLoading(submitButton, true, idleLabel, loadingLabel);

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
        setButtonLoading(submitButton, false, idleLabel, loadingLabel);
        updateMessageComposer();
      }
    });
  }
}

signOutButtons.forEach((button) => {
  button.addEventListener("click", logout);
});
