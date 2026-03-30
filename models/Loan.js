const mongoose = require("mongoose");

const LOGO_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i;

const loanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    lenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lender",
      default: null
    },
    lenderName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    lenderLogoDataUrl: {
      type: String,
      default: "",
      maxlength: 1500000,
      validate: {
        validator(value) {
          return !value || LOGO_DATA_URL_PATTERN.test(value);
        },
        message: "Upload a valid image file for the lender logo."
      }
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0.01
    },
    termMonths: {
      type: Number,
      required: true,
      min: 1,
      max: 360
    },
    firstPaymentDate: {
      type: Date,
      required: true
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 240
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Loan", loanSchema);
