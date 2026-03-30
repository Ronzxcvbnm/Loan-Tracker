const mongoose = require("mongoose");

const LOGO_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i;
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function deriveMonthlyAmount(totalAmount, termMonths) {
  const amount = Number(totalAmount);
  const months = Number(termMonths);

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  if (!Number.isFinite(months) || months <= 0) {
    return amount;
  }

  return amount / months;
}

const loanPaymentSchema = new mongoose.Schema(
  {
    monthKey: {
      type: String,
      required: true,
      match: [MONTH_KEY_PATTERN, "Use a valid YYYY-MM month key for the paid month."]
    },
    paidAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

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
    monthlyAmount: {
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
    },
    payments: {
      type: [loanPaymentSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

loanSchema.pre("validate", function ensureMonthlyAmount() {
  if (!(Number(this.monthlyAmount) > 0)) {
    const fallbackMonthlyAmount = deriveMonthlyAmount(this.totalAmount, this.termMonths);

    if (fallbackMonthlyAmount > 0) {
      this.monthlyAmount = fallbackMonthlyAmount;
    }
  }
});

module.exports = mongoose.model("Loan", loanSchema);
