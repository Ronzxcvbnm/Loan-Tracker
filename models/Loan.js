const mongoose = require("mongoose");

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
