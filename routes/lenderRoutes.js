const express = require("express");
const Lender = require("../models/Lender");
const { requireAdminApiAccess } = require("../middleware/adminAccess");

const router = express.Router();

function mapLender(lender) {
  return {
    id: String(lender._id),
    name: lender.name,
    logoDataUrl: lender.logoDataUrl || "",
    createdAt: lender.createdAt
  };
}

function buildLenderErrorMessage(error) {
  if (error?.code === 11000) {
    return "That lender app name already exists.";
  }

  if (error?.name === "ValidationError") {
    return Object.values(error.errors)[0]?.message || "Enter a valid lender app name.";
  }

  return null;
}

router.get("/lenders", async (_req, res) => {
  try {
    const lenders = await Lender.find().sort({ nameKey: 1 });
    return res.json({
      lenders: lenders.map(mapLender)
    });
  } catch (error) {
    console.error("Loading lenders failed:", error);
    return res.status(500).json({ message: "We couldn't load the lender apps right now." });
  }
});

router.post("/admin/lenders", requireAdminApiAccess, async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const logoDataUrl = typeof req.body.logoDataUrl === "string" ? req.body.logoDataUrl.trim() : "";

    if (!name) {
      return res.status(400).json({ message: "Enter a lender app name before saving." });
    }

    const lender = await Lender.create({
      name,
      logoDataUrl,
      createdBy: req.adminSession.userId
    });

    return res.status(201).json({
      message: `${lender.name} was added to the lender list.`,
      lender: mapLender(lender)
    });
  } catch (error) {
    console.error("Adding lender failed:", error);

    const message = buildLenderErrorMessage(error);

    if (message) {
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message: "We couldn't save that lender app right now." });
  }
});

router.delete("/admin/lenders/:lenderId", requireAdminApiAccess, async (req, res) => {
  try {
    const lender = await Lender.findByIdAndDelete(req.params.lenderId);

    if (!lender) {
      return res.status(404).json({ message: "That lender app was not found." });
    }

    return res.json({ message: `${lender.name} was removed from the lender list.` });
  } catch (error) {
    console.error("Deleting lender failed:", error);
    return res.status(500).json({ message: "We couldn't delete that lender app right now." });
  }
});

module.exports = router;
