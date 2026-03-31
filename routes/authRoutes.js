const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const OtpVerification = require("../models/OtpVerification");
const { requireAdminApiAccess } = require("../middleware/adminAccess");
const { clearAdminSessionCookie, createAdminSessionCookie, getUserRole, normalizeEmail } = require("../utils/accessControl");

const router = express.Router();
const mobilePattern = /^\+?[0-9]{10,15}$/;
const otpPattern = /^[0-9]{6}$/;
const objectIdPattern = /^[a-f\d]{24}$/i;

function normalizeMobile(value) {
  return value?.trim();
}

function getOtpExpiryDate() {
  const minutes = Number(process.env.OTP_EXPIRY_MINUTES) || 5;
  return new Date(Date.now() + minutes * 60 * 1000);
}

function buildValidationMessage(error) {
  if (error?.name === "ValidationError") {
    return Object.values(error.errors)[0]?.message || "One or more fields are invalid.";
  }

  if (error?.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0];

    if (duplicateField === "email") {
      return "That email address is already registered.";
    }

    if (duplicateField === "mobileNumber") {
      return "That mobile number is already registered.";
    }
  }

  return null;
}

function mapUserSummary(user) {
  return {
    id: String(user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    mobileNumber: user.mobileNumber,
    role: getUserRole(user),
    profileImageDataUrl: user.profileImageDataUrl || ""
  };
}

router.post("/request-otp", async (req, res) => {
  try {
    const mobileNumber = normalizeMobile(req.body.mobileNumber);

    if (!mobilePattern.test(mobileNumber || "")) {
      return res.status(400).json({ message: "Enter a valid mobile number with 10 to 15 digits before requesting OTP." });
    }

    const existingUser = await User.findOne({ mobileNumber });

    if (existingUser) {
      return res.status(409).json({ message: "That mobile number already has an account. Please log in instead." });
    }

    const otpCode = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otpCode, 10);

    await OtpVerification.findOneAndUpdate(
      { mobileNumber },
      {
        mobileNumber,
        otpHash,
        expiresAt: getOtpExpiryDate(),
        verifiedAt: null,
        verificationToken: null
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    console.log(`[OTP] ${mobileNumber}: ${otpCode}`);

    return res.json({
      message: "OTP generated. In this local build, the code is returned for testing instead of sending a real SMS.",
      debugOtp: otpCode
    });
  } catch (error) {
    console.error("OTP request failed:", error);

    const validationMessage = buildValidationMessage(error);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    return res.status(500).json({ message: "We couldn't generate an OTP right now. Please try again." });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const mobileNumber = normalizeMobile(req.body.mobileNumber);
    const code = req.body.code?.trim();

    if (!mobilePattern.test(mobileNumber || "")) {
      return res.status(400).json({ message: "Enter a valid mobile number before verifying OTP." });
    }

    if (!otpPattern.test(code || "")) {
      return res.status(400).json({ message: "Enter the 6-digit OTP code to verify your mobile number." });
    }

    const otpRecord = await OtpVerification.findOne({ mobileNumber });

    if (!otpRecord) {
      return res.status(404).json({ message: "No OTP request was found for that mobile number. Request a new code first." });
    }

    if (otpRecord.expiresAt <= new Date()) {
      await OtpVerification.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ message: "That OTP has expired. Request a new code and try again." });
    }

    const otpMatches = await bcrypt.compare(code, otpRecord.otpHash);

    if (!otpMatches) {
      return res.status(400).json({ message: "The OTP you entered is incorrect." });
    }

    otpRecord.verifiedAt = new Date();
    otpRecord.verificationToken = crypto.randomBytes(24).toString("hex");
    otpRecord.expiresAt = getOtpExpiryDate();
    await otpRecord.save();

    return res.json({
      message: "Mobile number verified. You can finish registration now.",
      verificationToken: otpRecord.verificationToken
    });
  } catch (error) {
    console.error("OTP verification failed:", error);
    return res.status(500).json({ message: "We couldn't verify the OTP right now. Please try again." });
  }
});

router.post("/register", async (req, res) => {
  try {
    const firstName = req.body.firstName?.trim();
    const lastName = req.body.lastName?.trim();
    const mobileNumber = normalizeMobile(req.body.mobileNumber);
    const email = normalizeEmail(req.body.email);
    const password = req.body.password?.trim();
    const otpVerificationToken = req.body.otpVerificationToken?.trim();

    if (!firstName || !lastName || !mobileNumber || !email || !password) {
      return res.status(400).json({ message: "Fill in every registration field before creating your account." });
    }

    if (!mobilePattern.test(mobileNumber)) {
      return res.status(400).json({ message: "Enter a valid mobile number with 10 to 15 digits." });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Choose a password with at least 8 characters." });
    }

    if (!otpVerificationToken) {
      return res.status(400).json({ message: "Verify your mobile number with OTP before creating an account." });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { mobileNumber }]
    });

    if (existingUser) {
      const duplicateField = existingUser.email === email ? "email address" : "mobile number";
      return res.status(409).json({ message: `That ${duplicateField} is already registered.` });
    }

    const otpRecord = await OtpVerification.findOne({
      mobileNumber,
      verificationToken: otpVerificationToken
    });

    if (!otpRecord || !otpRecord.verifiedAt) {
      return res.status(400).json({ message: "Your OTP verification is missing or expired. Please verify your mobile number again." });
    }

    if (otpRecord.expiresAt <= new Date()) {
      await OtpVerification.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ message: "Your verified OTP session expired. Please request a new OTP." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      mobileNumber,
      mobileVerified: true,
      email,
      password: hashedPassword
    });

    await OtpVerification.deleteOne({ _id: otpRecord._id });

    return res.status(201).json({
      message: "Registration complete. You can log in with your new account now.",
      user: mapUserSummary(user)
    });
  } catch (error) {
    console.error("Registration failed:", error);

    const validationMessage = buildValidationMessage(error);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    return res.status(500).json({ message: "We couldn't create the account right now. Please try again." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password?.trim();
    const loginMode = req.body.loginMode === "admin" ? "admin" : "user";

    if (!email || !password) {
      res.setHeader("Set-Cookie", clearAdminSessionCookie());
      return res.status(400).json({ message: "Enter both your email address and password to continue." });
    }

    const user = await User.findOne({ email });

    if (!user) {
      res.setHeader("Set-Cookie", clearAdminSessionCookie());
      return res.status(401).json({ message: "No account matched that email address." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      res.setHeader("Set-Cookie", clearAdminSessionCookie());
      return res.status(401).json({ message: "The password you entered is incorrect." });
    }

    const role = getUserRole(user);
    const isAdmin = role === "admin";

    if (loginMode === "admin" && !isAdmin) {
      res.setHeader("Set-Cookie", clearAdminSessionCookie());
      return res.status(403).json({ message: "This account does not have admin access." });
    }

    res.setHeader("Set-Cookie", isAdmin ? createAdminSessionCookie(user) : clearAdminSessionCookie());

    return res.json({
      message:
        isAdmin
          ? `Welcome back, ${user.firstName}! Admin access granted.`
          : `Welcome back, ${user.firstName}! Login successful.`,
      redirectTo: isAdmin ? "/admin/dashboard" : "/dashboard.html",
      adminSessionActive: isAdmin,
      user: mapUserSummary(user)
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.setHeader("Set-Cookie", clearAdminSessionCookie());
    return res.status(500).json({ message: "We couldn't log you in right now. Please try again." });
  }
});

router.get("/me", async (req, res) => {
  try {
    const userId = req.query.userId?.trim();

    if (!userId || !objectIdPattern.test(userId)) {
      return res.status(400).json({ message: "A valid user session is required to load the profile." });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "The signed-in user account was not found." });
    }

    return res.json({ user: mapUserSummary(user) });
  } catch (error) {
    console.error("Loading user profile failed:", error);
    return res.status(500).json({ message: "We couldn't load the profile right now." });
  }
});

router.patch("/profile", async (req, res) => {
  try {
    const userId = req.body.userId?.trim();
    const profileImageDataUrl = req.body.profileImageDataUrl?.trim() || "";

    if (!userId || !objectIdPattern.test(userId)) {
      return res.status(400).json({ message: "A valid user session is required before updating the profile." });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "The signed-in user account was not found." });
    }

    user.profileImageDataUrl = profileImageDataUrl;
    await user.save();

    return res.json({
      message: profileImageDataUrl ? "Your profile picture was updated." : "Your profile picture was removed.",
      user: mapUserSummary(user)
    });
  } catch (error) {
    console.error("Updating user profile failed:", error);

    const validationMessage = buildValidationMessage(error);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    return res.status(500).json({ message: "We couldn't update the profile right now." });
  }
});

router.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearAdminSessionCookie());
  return res.json({ message: "Signed out." });
});

router.post("/change-password", async (req, res) => {
  try {
    const userId = req.body.userId?.trim();
    const currentPassword = req.body.currentPassword?.trim();
    const newPassword = req.body.newPassword?.trim();
    const confirmPassword = req.body.confirmPassword?.trim();

    if (!userId || !objectIdPattern.test(userId)) {
      return res.status(400).json({ message: "A valid user session is required before changing the password." });
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "Fill in your current password, new password, and confirmation." });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Choose a new password with at least 8 characters." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "The new password confirmation does not match." });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "The signed-in user account was not found." });
    }

    const currentPasswordMatches = await bcrypt.compare(currentPassword, user.password);

    if (!currentPasswordMatches) {
      return res.status(400).json({ message: "Your current password is incorrect." });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      return res.status(400).json({ message: "Choose a different new password from the one you already use." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({ message: "Your password was updated successfully." });
  } catch (error) {
    console.error("Changing user password failed:", error);
    return res.status(500).json({ message: "We couldn't change the password right now." });
  }
});

router.post("/admin/change-password", requireAdminApiAccess, async (req, res) => {
  try {
    const currentPassword = req.body.currentPassword?.trim();
    const newPassword = req.body.newPassword?.trim();
    const confirmPassword = req.body.confirmPassword?.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "Fill in your current password, new password, and confirmation." });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Choose a new password with at least 8 characters." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "The new password confirmation does not match." });
    }

    const adminUser = await User.findById(req.adminSession.userId);

    if (!adminUser) {
      res.setHeader("Set-Cookie", clearAdminSessionCookie());
      return res.status(404).json({ message: "The admin account for this session was not found. Please sign in again." });
    }

    if (getUserRole(adminUser) !== "admin") {
      res.setHeader("Set-Cookie", clearAdminSessionCookie());
      return res.status(403).json({ message: "This account no longer has admin access." });
    }

    const currentPasswordMatches = await bcrypt.compare(currentPassword, adminUser.password);

    if (!currentPasswordMatches) {
      return res.status(400).json({ message: "Your current admin password is incorrect." });
    }

    const isSamePassword = await bcrypt.compare(newPassword, adminUser.password);

    if (isSamePassword) {
      return res.status(400).json({ message: "Choose a different new password from the one you already use." });
    }

    adminUser.password = await bcrypt.hash(newPassword, 10);
    await adminUser.save();

    res.setHeader("Set-Cookie", createAdminSessionCookie(adminUser));
    return res.json({ message: "Your admin password was updated successfully." });
  } catch (error) {
    console.error("Changing admin password failed:", error);
    return res.status(500).json({ message: "We couldn't change the admin password right now." });
  }
});

module.exports = router;
