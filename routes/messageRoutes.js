const express = require("express");
const mongoose = require("mongoose");
const MessageThread = require("../models/MessageThread");
const User = require("../models/User");
const { requireAdminApiAccess } = require("../middleware/adminAccess");

const router = express.Router();

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function getFullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

function normalizeSubject(value) {
  return value?.trim().replace(/\s+/g, " ");
}

function normalizeBody(value) {
  return value?.trim();
}

function mapThread(thread) {
  return {
    id: String(thread._id),
    userId: String(thread.userId),
    userName: thread.userName,
    userEmail: thread.userEmail,
    subject: thread.subject,
    status: thread.status,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messages: thread.messages.map((message) => ({
      senderRole: message.senderRole,
      senderName: message.senderName,
      body: message.body,
      sentAt: message.sentAt
    }))
  };
}

function buildThreadValidationMessage(error) {
  if (error?.name === "ValidationError") {
    return Object.values(error.errors)[0]?.message || "One or more message fields are invalid.";
  }

  return null;
}

router.get("/messages", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid user session is required to load messages." });
    }

    const user = await User.findById(userId).select("email");

    if (!user) {
      return res.status(404).json({ message: "The signed-in user account was not found." });
    }

    const threads = await MessageThread.find({ userId }).sort({ updatedAt: -1 });

    return res.json({
      threads: threads.map(mapThread)
    });
  } catch (error) {
    console.error("Loading user messages failed:", error);
    return res.status(500).json({ message: "We couldn't load your messages right now." });
  }
});

router.post("/messages", async (req, res) => {
  try {
    const userId = req.body.userId?.trim();
    const subject = normalizeSubject(req.body.subject);
    const body = normalizeBody(req.body.message);

    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid user session is required before sending a message." });
    }

    if (!subject || subject.length < 3) {
      return res.status(400).json({ message: "Enter a short subject with at least 3 characters." });
    }

    if (!body || body.length < 5) {
      return res.status(400).json({ message: "Enter a message with at least 5 characters." });
    }

    const user = await User.findById(userId).select("firstName lastName email");

    if (!user) {
      return res.status(404).json({ message: "The signed-in user account was not found." });
    }

    const thread = await MessageThread.create({
      userId: user._id,
      userName: getFullName(user),
      userEmail: user.email,
      subject,
      status: "open",
      messages: [
        {
          senderRole: "user",
          senderName: getFullName(user) || user.email,
          body,
          sentAt: new Date()
        }
      ]
    });

    return res.status(201).json({
      message: "Your message was sent to the admin team.",
      thread: mapThread(thread)
    });
  } catch (error) {
    console.error("Sending user message failed:", error);

    const message = buildThreadValidationMessage(error);

    if (message) {
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message: "We couldn't send your message right now." });
  }
});

router.get("/admin/messages", requireAdminApiAccess, async (_req, res) => {
  try {
    const threads = await MessageThread.find().sort({ updatedAt: -1 });
    return res.json({
      threads: threads.map(mapThread)
    });
  } catch (error) {
    console.error("Loading admin messages failed:", error);
    return res.status(500).json({ message: "We couldn't load the user inbox right now." });
  }
});

router.post("/admin/messages/:threadId/reply", requireAdminApiAccess, async (req, res) => {
  try {
    const reply = normalizeBody(req.body.message);

    if (!reply || reply.length < 2) {
      return res.status(400).json({ message: "Enter a reply before sending." });
    }

    const thread = await MessageThread.findById(req.params.threadId);

    if (!thread) {
      return res.status(404).json({ message: "That user thread was not found." });
    }

    const adminName = [req.adminSession.firstName, req.adminSession.lastName].filter(Boolean).join(" ").trim() || "Admin";

    thread.messages.push({
      senderRole: "admin",
      senderName: adminName,
      body: reply,
      sentAt: new Date()
    });
    thread.status = "replied";
    await thread.save();

    return res.json({
      message: `Reply sent to ${thread.userName}.`,
      thread: mapThread(thread)
    });
  } catch (error) {
    console.error("Replying to user message failed:", error);

    const message = buildThreadValidationMessage(error);

    if (message) {
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message: "We couldn't send that admin reply right now." });
  }
});

module.exports = router;
