const adminGreeting = document.getElementById("adminGreeting");
const adminIdentity = document.getElementById("adminIdentity");
const adminLogoutButton = document.getElementById("adminLogoutButton");

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

async function loadAdminSession() {
  const response = await fetch("/api/admin/session", {
    credentials: "include"
  });
  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(data.message || "Admin session not found.");
  }

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

loadAdminSession()
  .then((admin) => {
    const serializedAdmin = JSON.stringify(admin);

    sessionStorage.setItem("loanTrackerUser", serializedAdmin);
    localStorage.setItem("loanTrackerUser", serializedAdmin);
    adminGreeting.textContent = `Welcome back, ${admin.firstName}!`;
    adminIdentity.textContent = `${admin.email} - ${admin.role.toUpperCase()} access confirmed`;
  })
  .catch((_error) => {
    window.location.assign("/#login");
  });
