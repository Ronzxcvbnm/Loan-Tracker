const welcomeMessage = document.getElementById("welcomeMessage");
const logoutButton = document.getElementById("logoutButton");

function buildPageUrl(path) {
  return new URL(path, window.location.href).toString();
}

function getStoredUser() {
  return sessionStorage.getItem("loanTrackerUser") || localStorage.getItem("loanTrackerUser");
}

function clearStoredUser() {
  sessionStorage.removeItem("loanTrackerUser");
  localStorage.removeItem("loanTrackerUser");
}

function redirectToLogin() {
  window.location.replace(buildPageUrl("index.html"));
}

const storedUser = getStoredUser();

if (!storedUser) {
  redirectToLogin();
} else {
  try {
    const user = JSON.parse(storedUser);
    welcomeMessage.textContent = `Welcome back, ${user.firstName}. Your dashboard is ready for the next features.`;
  } catch (_error) {
    clearStoredUser();
    redirectToLogin();
  }
}

logoutButton.addEventListener("click", () => {
  clearStoredUser();
  redirectToLogin();
});
