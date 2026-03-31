const mongoose = require("mongoose");

const messageEntrySchema = new mongoose.Schema(
  {
    senderRole: {
      type: String,
      enum: ["user", "admin"],
      required: true
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1200
    },
    sentAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

const messageThreadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    userName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120
    },
    status: {
      type: String,
      enum: ["open", "replied", "solved", "resolved", "closed"],
      default: "open"
    },
    messages: {
      type: [messageEntrySchema],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one message entry is required."
      }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("MessageThread", messageThreadSchema);
