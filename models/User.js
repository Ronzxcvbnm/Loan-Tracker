const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 40
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 40
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      match: [/^\+?[0-9]{10,15}$/, "Use 10 to 15 digits for the mobile number."]
    },
    mobileVerified: {
      type: Boolean,
      default: false
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^\S+@\S+\.\S+$/, "Enter a valid email address."]
    },
    password: {
      type: String,
      required: true,
      minlength: 8
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", userSchema);
