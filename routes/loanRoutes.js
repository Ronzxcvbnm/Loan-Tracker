const express = require("express");
const mongoose = require("mongoose");
const Lender = require("../models/Lender");
const Loan = require("../models/Loan");
const User = require("../models/User");

const router = express.Router();

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function mapLoan(loan) {
  return {
    id: String(loan._id),
    userId: String(loan.userId),
    lenderId: loan.lenderId ? String(loan.lenderId) : null,
    lenderName: loan.lenderName,
    totalAmount: loan.totalAmount,
    termMonths: loan.termMonths,
    firstPaymentDate: loan.firstPaymentDate,
    reason: loan.reason,
    status: loan.status,
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

    const loans = await Loan.find({ userId }).sort({ status: 1, firstPaymentDate: 1, createdAt: -1 });

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
    }

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ message: "Enter a valid total loan amount greater than zero." });
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
      totalAmount,
      termMonths,
      firstPaymentDate,
      reason,
      status: "active"
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

module.exports = router;
