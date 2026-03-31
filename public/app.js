const authCard = document.querySelector(".auth-card");
const statusBanner = document.getElementById("statusBanner");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const requestOtpButton = document.getElementById("requestOtpButton");
const verifyOtpButton = document.getElementById("verifyOtpButton");
const otpStateText = document.getElementById("otpStateText");
const modeButtons = document.querySelectorAll("[data-switch-mode]");
const loginHeading = document.getElementById("loginHeading");
const loginDescription = document.getElementById("loginDescription");
const loginAccessTitle = document.getElementById("loginAccessTitle");
const loginAccessCopy = document.getElementById("loginAccessCopy");
const adminEntryButton = document.getElementById("adminEntryButton");
const otpState = {
  verified: false,
  verifiedMobileNumber: "",
  verificationToken: ""
};
const loginState = {
  accessMode: "user"
};

function getApiBaseUrl() {
  if (window.LOAN_TRACKER_API_BASE) {
    return window.LOAN_TRACKER_API_BASE;
  }

  const isFileProtocol = window.location.protocol === "file:";
  const localHost = window.location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
  const isDifferentLocalPort =
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
    window.location.port &&
    window.location.port !== "3000";

  if (isFileProtocol) {
    return "http://localhost:3000";
  }

  return isDifferentLocalPort ? `http://${localHost}:3000` : "";
}

const API_BASE_URL = getApiBaseUrl();

function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function buildAppUrl(path) {
  if (API_BASE_URL) {
    return `${API_BASE_URL}${path}`;
  }

  return new URL(path, window.location.origin).toString();
}

function buildLocalPageUrl(path) {
  return new URL(path, window.location.href).toString();
}

function showStatus(type, message) {
  statusBanner.hidden = false;
  statusBanner.textContent = message;
  statusBanner.className = `status-banner is-${type}`;
}

function clearStatus() {
  statusBanner.hidden = true;
  statusBanner.textContent = "";
  statusBanner.className = "status-banner";
}

function setOtpState(verified, mobileNumber = "", verificationToken = "") {
  otpState.verified = verified;
  otpState.verifiedMobileNumber = mobileNumber;
  otpState.verificationToken = verificationToken;
  otpStateText.textContent = verified
    ? `Mobile number ${mobileNumber} verified.`
    : "Verify your mobile number before creating an account.";
  otpStateText.classList.toggle("is-verified", verified);
}

function syncLoginAccessUi() {
  const isAdminMode = loginState.accessMode === "admin";
  const submitButton = loginForm.querySelector(".action-button");

  authCard.dataset.accessMode = loginState.accessMode;
  loginHeading.textContent = isAdminMode ? "ADMIN ACCESS" : "WELCOME BACK";
  loginDescription.textContent = isAdminMode
    ? "Verified administrators only. Admin accounts always open the restricted admin dashboard."
    : "Sign in to access your loan summary dashboard. Admin accounts are routed to the admin dashboard automatically.";
  loginAccessTitle.textContent = isAdminMode ? "Admin Login" : "Member Login";
  loginAccessCopy.textContent = isAdminMode
    ? "Only admin accounts can continue from this mode. Use it when you want an explicit admin-only sign-in check."
    : "Default access for regular borrowers. Admin accounts are still recognized and sent to the admin dashboard.";
  adminEntryButton.textContent = isAdminMode ? "Back to User Login" : "Admin Access";
  submitButton.textContent = isAdminMode ? "Login as Admin" : "Login";
}

function setAccessMode(mode) {
  loginState.accessMode = mode === "admin" ? "admin" : "user";
  syncLoginAccessUi();
  clearStatus();
}

function setMode(mode) {
  const isLogin = mode === "login";

  authCard.dataset.mode = mode;
  loginForm.classList.toggle("is-active", isLogin);
  registerForm.classList.toggle("is-active", !isLogin);

  if (!isLogin) {
    setAccessMode("user");
  } else {
    clearStatus();
  }

  if (window.location.hash !== `#${mode}`) {
    history.replaceState(null, "", `#${mode}`);
  }
}

function setButtonLoading(button, isLoading, idleLabel, loadingLabel) {
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : idleLabel;
}

async function parseResponse(response) {
  const responseText = await response.text();

  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch (_error) {
    if (responseText.includes("<!DOCTYPE html") || responseText.includes("<html")) {
      return {
        message:
          "The request reached an HTML page instead of the API. Open the app from http://localhost:3000 or keep the API server running there."
      };
    }

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
    throw new Error("Cannot reach the API server. Start the Node app and open http://localhost:3000.");
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}.`);
  }

  return data;
}

function saveAuthenticatedUser(user) {
  const serializedUser = JSON.stringify(user);
  sessionStorage.setItem("loanTrackerUser", serializedUser);
  localStorage.setItem("loanTrackerUser", serializedUser);
}

function getStoredUser() {
  return sessionStorage.getItem("loanTrackerUser") || localStorage.getItem("loanTrackerUser");
}

function getTrimmedMobile() {
  return registerForm.elements.mobileNumber.value.trim();
}

function resetOtpIfMobileChanged() {
  const currentMobile = getTrimmedMobile();

  if (!currentMobile || otpState.verifiedMobileNumber !== currentMobile) {
    setOtpState(false);
  }
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setMode(button.dataset.switchMode);
  });
});

adminEntryButton.addEventListener("click", () => {
  setAccessMode(loginState.accessMode === "admin" ? "user" : "admin");
});

registerForm.elements.mobileNumber.addEventListener("input", resetOtpIfMobileChanged);

requestOtpButton.addEventListener("click", async () => {
  const mobileInput = registerForm.elements.mobileNumber;
  const mobileNumber = getTrimmedMobile();

  if (!/^\+?[0-9]{10,15}$/.test(mobileNumber)) {
    showStatus("error", "Enter a valid mobile number with 10 to 15 digits before requesting OTP.");
    mobileInput.focus();
    return;
  }

  clearStatus();
  setOtpState(false);
  setButtonLoading(requestOtpButton, true, "Send OTP", "Sending...");

  try {
    const data = await apiRequest("/api/auth/request-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ mobileNumber })
    });

    if (data.debugOtp) {
      registerForm.elements.otpCode.value = data.debugOtp;
      showStatus("info", `${data.message} Dev OTP: ${data.debugOtp}`);
    } else {
      showStatus("info", data.message);
    }

    registerForm.elements.otpCode.focus();
  } catch (error) {
    showStatus("error", error.message);
  } finally {
    setButtonLoading(requestOtpButton, false, "Send OTP", "Sending...");
  }
});

verifyOtpButton.addEventListener("click", async () => {
  const mobileNumber = getTrimmedMobile();
  const otpCode = registerForm.elements.otpCode.value.trim();

  if (!/^\+?[0-9]{10,15}$/.test(mobileNumber)) {
    showStatus("error", "Enter your mobile number before verifying OTP.");
    registerForm.elements.mobileNumber.focus();
    return;
  }

  if (!/^[0-9]{6}$/.test(otpCode)) {
    showStatus("error", "Enter the 6-digit OTP code before verifying.");
    registerForm.elements.otpCode.focus();
    return;
  }

  clearStatus();
  setButtonLoading(verifyOtpButton, true, "Verify OTP", "Verifying...");

  try {
    const data = await apiRequest("/api/auth/verify-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mobileNumber,
        code: otpCode
      })
    });

    setOtpState(true, mobileNumber, data.verificationToken);
    showStatus("success", data.message);
  } catch (error) {
    setOtpState(false);
    showStatus("error", error.message);
  } finally {
    setButtonLoading(verifyOtpButton, false, "Verify OTP", "Verifying...");
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  const submitButton = registerForm.querySelector(".action-button");
  const mobileNumber = getTrimmedMobile();
  const payload = {
    firstName: registerForm.elements.firstName.value.trim(),
    lastName: registerForm.elements.lastName.value.trim(),
    mobileNumber,
    email: registerForm.elements.email.value.trim(),
    password: registerForm.elements.password.value,
    otpVerificationToken: otpState.verificationToken
  };

  if (payload.password.length < 8) {
    showStatus("error", "Create a password with at least 8 characters.");
    registerForm.elements.password.focus();
    return;
  }

  if (!otpState.verified || otpState.verifiedMobileNumber !== mobileNumber) {
    showStatus("error", "Verify your mobile number with OTP before creating an account.");
    registerForm.elements.otpCode.focus();
    return;
  }

  setButtonLoading(submitButton, true, "Create Account", "Creating...");

  try {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    registerForm.reset();
    setOtpState(false);
    loginForm.elements.email.value = payload.email;
    setMode("login");
    showStatus("success", data.message);
  } catch (error) {
    showStatus("error", error.message);
  } finally {
    setButtonLoading(submitButton, false, "Create Account", "Creating...");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  const submitButton = loginForm.querySelector(".action-button");
  const isAdminMode = loginState.accessMode === "admin";
  const idleLabel = isAdminMode ? "Login as Admin" : "Login";
  const loadingLabel = isAdminMode ? "Opening admin..." : "Signing in...";
  const payload = {
    email: loginForm.elements.email.value.trim(),
    password: loginForm.elements.password.value,
    loginMode: loginState.accessMode
  };

  setButtonLoading(submitButton, true, idleLabel, loadingLabel);

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    saveAuthenticatedUser(data.user);
    loginForm.reset();

    const targetPath = data.redirectTo || (data.adminSessionActive ? "/admin/dashboard" : "/dashboard.html");

    if (data.adminSessionActive) {
      window.location.assign(buildAppUrl(targetPath));
    } else {
      window.location.assign(buildLocalPageUrl(targetPath.replace(/^\/+/, "")));
    }
  } catch (error) {
    showStatus("error", error.message);
  } finally {
    syncLoginAccessUi();
    submitButton.disabled = false;
  }
});

const initialMode = window.location.hash === "#register" ? "register" : "login";
setMode(initialMode);
setOtpState(false);
setAccessMode("user");

const storedUser = getStoredUser();

if (storedUser && initialMode === "login") {
  try {
    const user = JSON.parse(storedUser);
    const roleLabel = user.role === "admin" ? "admin account" : "member account";
    showStatus("info", `Signed in locally as ${user.firstName} ${user.lastName} (${roleLabel}).`);
  } catch (_error) {
    sessionStorage.removeItem("loanTrackerUser");
    localStorage.removeItem("loanTrackerUser");
  }
}
