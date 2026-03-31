const express = require("express");
const mongoose = require("mongoose");
const MessageThread = require("../models/MessageThread");
const User = require("../models/User");
const { requireAdminApiAccess } = require("../middleware/adminAccess");

const router = express.Router();
const OPEN_THREAD_STATUS = "open";
const REPLIED_THREAD_STATUS = "replied";
const SOLVED_THREAD_STATUS = "solved";
const RESOLVED_THREAD_STATUS = "resolved";
const CLOSED_THREAD_STATUS = "closed";
const ACTIVE_THREAD_STATUSES = [OPEN_THREAD_STATUS, REPLIED_THREAD_STATUS];
const TERMINAL_THREAD_STATUSES = [SOLVED_THREAD_STATUS, RESOLVED_THREAD_STATUS, CLOSED_THREAD_STATUS];

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

function isTerminalThreadStatus(status) {
  return TERMINAL_THREAD_STATUSES.includes(status);
}

function mapThreadStatus(status) {
  return isTerminalThreadStatus(status) ? SOLVED_THREAD_STATUS : status;
}

function buildTicketCode(threadId) {
  return `LT-${String(threadId).slice(-6).toUpperCase()}`;
}

function mapThread(thread) {
  return {
    id: String(thread._id),
    ticketCode: buildTicketCode(thread._id),
    userId: String(thread.userId),
    userName: thread.userName,
    userEmail: thread.userEmail,
    subject: thread.subject,
    status: mapThreadStatus(thread.status),
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
      return res.status(400).json({ message: "A valid user session is required to load your tickets." });
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
    console.error("Loading user tickets failed:", error);
    return res.status(500).json({ message: "We couldn't load your tickets right now." });
  }
});

router.post("/messages", async (req, res) => {
  try {
    const userId = req.body.userId?.trim();
    const subject = normalizeSubject(req.body.subject);
    const body = normalizeBody(req.body.message);

    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid user session is required before opening a support ticket." });
    }

    if (!body || body.length < 5) {
      return res.status(400).json({ message: "Enter a ticket message with at least 5 characters." });
    }

    const user = await User.findById(userId).select("firstName lastName email");

    if (!user) {
      return res.status(404).json({ message: "The signed-in user account was not found." });
    }

    const senderName = getFullName(user) || user.email;
    const activeThread = await MessageThread.findOne({
      userId: user._id,
      status: { $in: ACTIVE_THREAD_STATUSES }
    }).sort({ updatedAt: -1 });

    if (activeThread) {
      activeThread.messages.push({
        senderRole: "user",
        senderName,
        body,
        sentAt: new Date()
      });
      activeThread.status = OPEN_THREAD_STATUS;
      await activeThread.save();

      return res.json({
        message: `Your update was added to your active ticket: ${activeThread.subject}.`,
        thread: mapThread(activeThread),
        reusedThread: true
      });
    }

    if (!subject || subject.length < 3) {
      return res.status(400).json({ message: "Enter a short ticket subject with at least 3 characters." });
    }

    const thread = await MessageThread.create({
      userId: user._id,
      userName: getFullName(user),
      userEmail: user.email,
      subject,
      status: OPEN_THREAD_STATUS,
      messages: [
        {
          senderRole: "user",
          senderName,
          body,
          sentAt: new Date()
        }
      ]
    });

    return res.status(201).json({
      message: "Your support ticket was sent to the admin team.",
      thread: mapThread(thread)
    });
  } catch (error) {
    console.error("Sending user ticket failed:", error);

    const message = buildThreadValidationMessage(error);

    if (message) {
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message: "We couldn't send your support ticket right now." });
  }
});

router.get("/admin/messages", requireAdminApiAccess, async (_req, res) => {
  try {
    const threads = await MessageThread.find().sort({ updatedAt: -1 });
    return res.json({
      threads: threads.map(mapThread)
    });
  } catch (error) {
    console.error("Loading admin tickets failed:", error);
    return res.status(500).json({ message: "We couldn't load the support ticket inbox right now." });
  }
});

router.post("/admin/messages/:threadId/reply", requireAdminApiAccess, async (req, res) => {
  try {
    const reply = normalizeBody(req.body.message);

    if (!reply || reply.length < 2) {
      return res.status(400).json({ message: "Enter a ticket reply before sending." });
    }

    const thread = await MessageThread.findById(req.params.threadId);

    if (!thread) {
      return res.status(404).json({ message: "That support ticket was not found." });
    }

    if (isTerminalThreadStatus(thread.status)) {
      return res.status(400).json({ message: "This ticket is already solved. The user can open a new one instead." });
    }

    const adminName = [req.adminSession.firstName, req.adminSession.lastName].filter(Boolean).join(" ").trim() || "Admin";

    thread.messages.push({
      senderRole: "admin",
      senderName: adminName,
      body: reply,
      sentAt: new Date()
    });
    thread.status = REPLIED_THREAD_STATUS;
    await thread.save();

    return res.json({
      message: `Ticket reply sent to ${thread.userName}.`,
      thread: mapThread(thread)
    });
  } catch (error) {
    console.error("Replying to support ticket failed:", error);

    const message = buildThreadValidationMessage(error);

    if (message) {
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message: "We couldn't send that ticket reply right now." });
  }
});

router.patch("/admin/messages/:threadId/status", requireAdminApiAccess, async (req, res) => {
  try {
    const requestedStatus = normalizeBody(req.body.status)?.toLowerCase();

    if (!TERMINAL_THREAD_STATUSES.includes(requestedStatus)) {
      return res.status(400).json({ message: "Choose solved for the ticket status." });
    }

    const thread = await MessageThread.findById(req.params.threadId);

    if (!thread) {
      return res.status(404).json({ message: "That support ticket was not found." });
    }

    if (isTerminalThreadStatus(thread.status)) {
      return res.status(400).json({
        message: "This ticket is already solved. The user can open a new one instead."
      });
    }

    thread.status = SOLVED_THREAD_STATUS;
    await thread.save();

    return res.json({
      message: `Ticket marked as solved for ${thread.userName}.`,
      thread: mapThread(thread)
    });
  } catch (error) {
    console.error("Updating ticket status failed:", error);

    const message = buildThreadValidationMessage(error);

    if (message) {
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message: "We couldn't update the ticket status right now." });
  }
});

module.exports = router;
