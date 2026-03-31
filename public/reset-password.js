const statusBanner = document.getElementById("statusBanner");
const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetPasswordDescription = document.getElementById("resetPasswordDescription");
const resetPasswordIdentity = document.getElementById("resetPasswordIdentity");
const backToLoginButtons = document.querySelectorAll("[data-back-to-login]");
const submitButton = resetPasswordForm?.querySelector(".action-button");
const resetToken = new URLSearchParams(window.location.search).get("token")?.trim() || "";

let isResetTokenValid = false;

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

function showStatus(type, message) {
  statusBanner.hidden = false;
  statusBanner.textContent = message;
  statusBanner.className = `status-banner is-${type}`;
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
    throw new Error("Cannot reach the API server. Start the Node app and open http://localhost:3000.");
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}.`);
  }

  return data;
}

function setButtonLoading(button, isLoading, idleLabel, loadingLabel) {
  if (!button) {
    return;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : idleLabel;
}

function setFormEnabled(enabled) {
  if (!resetPasswordForm) {
    return;
  }

  resetPasswordForm.querySelectorAll("input").forEach((input) => {
    input.disabled = !enabled;
  });

  if (submitButton) {
    submitButton.disabled = !enabled;
  }
}

async function validateResetToken() {
  if (!resetToken) {
    setFormEnabled(false);
    showStatus("error", "This password reset link is missing its token.");
    resetPasswordDescription.textContent = "Request a new password reset link and try again.";
    return;
  }

  setFormEnabled(false);

  try {
    const data = await apiRequest(`/api/auth/reset-password/validate?token=${encodeURIComponent(resetToken)}`);

    isResetTokenValid = true;
    resetPasswordDescription.textContent = "Create a new password for your account.";
    resetPasswordIdentity.hidden = false;
    resetPasswordIdentity.textContent = `Reset link confirmed for ${data.email}.`;
    showStatus("info", "Reset link verified. Enter your new password below.");
    setFormEnabled(true);
    resetPasswordForm.elements.newPassword.focus();
  } catch (error) {
    isResetTokenValid = false;
    setFormEnabled(false);
    resetPasswordDescription.textContent = "This reset link is no longer valid.";
    showStatus("error", error.message);
  }
}

if (resetPasswordForm) {
  resetPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isResetTokenValid) {
      showStatus("error", "This password reset link is no longer valid. Request a new one and try again.");
      return;
    }

    const newPassword = resetPasswordForm.elements.newPassword.value;
    const confirmPassword = resetPasswordForm.elements.confirmPassword.value;

    if (newPassword.trim().length < 8) {
      showStatus("error", "Choose a new password with at least 8 characters.");
      resetPasswordForm.elements.newPassword.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      showStatus("error", "The new password confirmation does not match.");
      resetPasswordForm.elements.confirmPassword.focus();
      return;
    }

    setButtonLoading(submitButton, true, "Reset Password", "Resetting...");

    try {
      const data = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token: resetToken,
          newPassword,
          confirmPassword
        })
      });

      isResetTokenValid = false;
      resetPasswordForm.reset();
      setFormEnabled(false);
      showStatus("success", data.message);

      window.setTimeout(() => {
        window.location.assign(buildAppUrl("/#login"));
      }, 1200);
    } catch (error) {
      showStatus("error", error.message);
      setFormEnabled(true);
    } finally {
      setButtonLoading(submitButton, false, "Reset Password", "Resetting...");

      if (!isResetTokenValid && submitButton) {
        submitButton.disabled = true;
      }
    }
  });
}

backToLoginButtons.forEach((button) => {
  button.addEventListener("click", () => {
    window.location.assign(buildAppUrl("/#login"));
  });
});

validateResetToken();
