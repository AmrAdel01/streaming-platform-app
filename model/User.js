const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "username must be required"],
      unique: true,
    },
    email: {
      type: String,
      required: [true, "email must be required"],
      unique: true,
    },
    password: {
      type: String,
      required: [true, "password must be required"],
      minlength: [8, "password must be at least 8 characters long"],
      select: false, // hide password from the database
    },
    role: {
      type: String,
      enum: ["user", "streamer", "admin"],
      default: "user",
    }, // New field for role
    avatar: { type: String, default: "default-avatar.png" }, // New field
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Custom method to compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const userModel = mongoose.model("User", userSchema);

module.exports = userModel;
