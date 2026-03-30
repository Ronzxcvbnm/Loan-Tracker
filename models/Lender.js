const mongoose = require("mongoose");

function normalizeNameKey(value) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase();
}

const LOGO_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i;

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
    logoDataUrl: {
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

lenderSchema.pre("validate", function setNameKey() {
  this.name = this.name?.trim().replace(/\s+/g, " ");
  this.nameKey = normalizeNameKey(this.name);
});

module.exports = mongoose.model("Lender", lenderSchema);
