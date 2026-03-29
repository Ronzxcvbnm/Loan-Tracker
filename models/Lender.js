const mongoose = require("mongoose");

function normalizeNameKey(value) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase();
}

const lenderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60
    },
    nameKey: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true
  }
);

lenderSchema.pre("validate", function setNameKey(next) {
  this.name = this.name?.trim().replace(/\s+/g, " ");
  this.nameKey = normalizeNameKey(this.name);
  next();
});

module.exports = mongoose.model("Lender", lenderSchema);
