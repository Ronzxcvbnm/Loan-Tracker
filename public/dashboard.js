const greetingText = document.querySelector("[data-user-greeting]");
const emailText = document.querySelector("[data-user-email]");
const roleText = document.querySelector("[data-user-role]");
const signOutButtons = document.querySelectorAll("[data-sign-out]");

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
}

signOutButtons.forEach((button) => {
  button.addEventListener("click", logout);
});
