const mongoose = require("mongoose");

const otpVerificationSchema = new mongoose.Schema(
  {
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    otpHash: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    verificationToken: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("OtpVerification", otpVerificationSchema);
