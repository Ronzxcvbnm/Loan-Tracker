const express = require("express");
const mongoose = require("mongoose");
const Lender = require("../models/Lender");
const Loan = require("../models/Loan");
const User = require("../models/User");

const router = express.Router();
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

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

function formatMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildScheduledPaymentDate(firstPaymentDate, monthOffset) {
  const baseDate = new Date(firstPaymentDate);

  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  const targetMonthAnchor = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + monthOffset, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetMonthAnchor.getUTCFullYear(), targetMonthAnchor.getUTCMonth() + 1, 0)
  ).getUTCDate();

  targetMonthAnchor.setUTCDate(Math.min(baseDate.getUTCDate(), lastDayOfTargetMonth));
  return targetMonthAnchor;
}

function getLoanScheduleEntries(loan) {
  const termMonths = Number(loan.termMonths);

  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    return [];
  }

  return Array.from({ length: termMonths }, (_, index) => {
    const dueDate = buildScheduledPaymentDate(loan.firstPaymentDate, index);

    return dueDate
      ? {
          monthKey: formatMonthKey(dueDate),
          dueDate
        }
      : null;
  }).filter(Boolean);
}

function formatMonthKeyLabel(monthKey) {
  const [year, month] = String(monthKey).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function getTodayAtMidnightUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function getMappedLenderId(lenderValue) {
  if (!lenderValue) {
    return null;
  }

  if (typeof lenderValue === "object" && lenderValue._id) {
    return String(lenderValue._id);
  }

  return String(lenderValue);
}

function mapLoan(loan) {
  const mappedLenderId = getMappedLenderId(loan.lenderId);
  const lenderLogoDataUrl =
    loan.lenderLogoDataUrl ||
    (loan.lenderId && typeof loan.lenderId === "object" ? loan.lenderId.logoDataUrl || "" : "");
  const monthlyAmount = Number(loan.monthlyAmount) > 0 ? loan.monthlyAmount : deriveMonthlyAmount(loan.totalAmount, loan.termMonths);

  return {
    id: String(loan._id),
    userId: String(loan.userId),
    lenderId: mappedLenderId,
    lenderName: loan.lenderName,
    lenderLogoDataUrl,
    totalAmount: loan.totalAmount,
    monthlyAmount,
    termMonths: loan.termMonths,
    firstPaymentDate: loan.firstPaymentDate,
    reason: loan.reason,
    status: loan.status,
    payments: Array.isArray(loan.payments)
      ? loan.payments.map((payment) => ({
          monthKey: payment.monthKey,
          paidAt: payment.paidAt
        }))
      : [],
    createdAt: loan.createdAt,
    updatedAt: loan.updatedAt
  };
}

function normalizeText(value) {
  return value?.trim().replace(/\s+/g, " ");
}

router.get("/loans", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid user session is required to load loans." });
    }

    const user = await User.findById(userId).select("_id");

    if (!user) {
      return res.status(404).json({ message: "The signed-in user account was not found." });
    }

    const loans = await Loan.find({ userId })
      .populate({ path: "lenderId", select: "logoDataUrl" })
      .sort({ status: 1, firstPaymentDate: 1, createdAt: -1 });

    return res.json({
      loans: loans.map(mapLoan)
    });
  } catch (error) {
    console.error("Loading loans failed:", error);
    return res.status(500).json({ message: "We couldn't load the loans right now." });
  }
});

router.post("/loans", async (req, res) => {
  try {
    const userId = req.body.userId?.trim();
    const selectedLender = req.body.selectedLender?.trim();
    const otherLenderName = normalizeText(req.body.otherLenderName);
    const reason = normalizeText(req.body.reason);
    const totalAmount = Number(req.body.totalAmount);
    const monthlyAmount = Number(req.body.monthlyAmount);
    const termMonths = Number(req.body.termMonths);
    const firstPaymentDate = new Date(req.body.firstPaymentDate);

    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid user session is required before adding a loan." });
    }

    if (!selectedLender) {
      return res.status(400).json({ message: "Choose a lender before saving the loan." });
    }

    const user = await User.findById(userId).select("_id");

    if (!user) {
      return res.status(404).json({ message: "The signed-in user account was not found." });
    }

    let lenderId = null;
    let lenderName = "";
    let lenderLogoDataUrl = "";

    if (selectedLender === "other") {
      if (!otherLenderName || otherLenderName.length < 2) {
        return res.status(400).json({ message: "Enter the other lender name before saving the loan." });
      }

      lenderName = otherLenderName;
    } else {
      if (!isValidObjectId(selectedLender)) {
        return res.status(400).json({ message: "Choose a valid lender before saving the loan." });
      }

      const lender = await Lender.findById(selectedLender);

      if (!lender) {
        return res.status(404).json({ message: "The selected lender app was not found." });
      }

      lenderId = lender._id;
      lenderName = lender.name;
      lenderLogoDataUrl = lender.logoDataUrl || "";
    }

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ message: "Enter a valid total loan amount greater than zero." });
    }

    if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
      return res.status(400).json({ message: "Enter a valid monthly payment amount greater than zero." });
    }

    if (!Number.isInteger(termMonths) || termMonths <= 0) {
      return res.status(400).json({ message: "Enter a valid loan term in whole months." });
    }

    if (!req.body.firstPaymentDate || Number.isNaN(firstPaymentDate.getTime())) {
      return res.status(400).json({ message: "Choose the first payment date before saving the loan." });
    }

    if (!reason || reason.length < 3) {
      return res.status(400).json({ message: "Enter the reason for the loan before saving it." });
    }

    const loan = await Loan.create({
      userId: user._id,
      lenderId,
      lenderName,
      lenderLogoDataUrl,
      totalAmount,
      monthlyAmount,
      termMonths,
      firstPaymentDate,
      reason,
      status: "active",
      payments: []
    });

    return res.status(201).json({
      message: `${loan.lenderName} was added to your active loans.`,
      loan: mapLoan(loan)
    });
  } catch (error) {
    console.error("Adding loan failed:", error);

    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: Object.values(error.errors)[0]?.message || "One or more loan fields are invalid." });
    }

    return res.status(500).json({ message: "We couldn't save that loan right now." });
  }
});

router.patch("/loans/:loanId/payments/:monthKey", async (req, res) => {
  try {
    const userId = req.body.userId?.trim();
    const monthKey = req.params.monthKey?.trim();
    const paid = normalizeBoolean(req.body.paid);

    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid user session is required before updating a payment." });
    }

    if (!isValidObjectId(req.params.loanId)) {
      return res.status(400).json({ message: "Choose a valid loan before updating its payment status." });
    }

    if (!MONTH_KEY_PATTERN.test(monthKey || "")) {
      return res.status(400).json({ message: "Use a valid payment month before updating the checklist." });
    }

    if (paid === null) {
      return res.status(400).json({ message: "Tell the server whether this month is paid or unpaid." });
    }

    const user = await User.findById(userId).select("_id");

    if (!user) {
      return res.status(404).json({ message: "The signed-in user account was not found." });
    }

    const loan = await Loan.findOne({ _id: req.params.loanId, userId: user._id });

    if (!loan) {
      return res.status(404).json({ message: "That loan was not found for the current user." });
    }

    const scheduledEntries = getLoanScheduleEntries(loan);
    const scheduledMonthKeys = new Set(scheduledEntries.map((entry) => entry.monthKey));

    if (!scheduledMonthKeys.has(monthKey)) {
      return res.status(400).json({ message: "That month is outside this loan's payment schedule." });
    }

    loan.payments = Array.isArray(loan.payments) ? loan.payments : [];
    const existingPaymentIndex = loan.payments.findIndex((payment) => payment.monthKey === monthKey);
    const nextUnpaidEntry =
      scheduledEntries.find((entry) => !loan.payments.some((payment) => payment.monthKey === entry.monthKey)) || null;
    const latestPaidEntry =
      [...scheduledEntries].reverse().find((entry) => loan.payments.some((payment) => payment.monthKey === entry.monthKey)) || null;

    if (paid && nextUnpaidEntry?.monthKey !== monthKey) {
      return res.status(400).json({ message: "Settle the earliest unpaid bill first before moving to the next month." });
    }

    if (!paid && latestPaidEntry?.monthKey !== monthKey) {
      return res.status(400).json({ message: "Only the most recently settled bill can be undone." });
    }

    if (paid && existingPaymentIndex === -1) {
      loan.payments.push({
        monthKey,
        paidAt: new Date()
      });
    }

    if (!paid && existingPaymentIndex >= 0) {
      loan.payments.splice(existingPaymentIndex, 1);
    }

    const paidScheduledCount = loan.payments.filter((payment) => scheduledMonthKeys.has(payment.monthKey)).length;
    loan.status = paidScheduledCount >= scheduledEntries.length && scheduledEntries.length ? "closed" : "active";

    await loan.save();

    const settledEntry = scheduledEntries.find((entry) => entry.monthKey === monthKey);
    const todayAtMidnightUtc = getTodayAtMidnightUtc();
    const isOverdueSettlement = paid && settledEntry && settledEntry.dueDate < todayAtMidnightUtc;
    const isUpcomingSettlement = paid && settledEntry && settledEntry.dueDate > todayAtMidnightUtc;

    return res.json({
      message: paid
        ? `${isOverdueSettlement ? "Overdue" : isUpcomingSettlement ? "Upcoming" : "Current"} bill settled for ${loan.lenderName} in ${formatMonthKeyLabel(monthKey)}.`
        : `The paid mark for ${loan.lenderName} in ${formatMonthKeyLabel(monthKey)} was removed.`,
      loan: mapLoan(loan)
    });
  } catch (error) {
    console.error("Updating loan payment failed:", error);

    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: Object.values(error.errors)[0]?.message || "One or more payment fields are invalid." });
    }

    return res.status(500).json({ message: "We couldn't update that monthly payment right now." });
  }
});

module.exports = router;
