const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserOTPVerificationSchema = new Schema({
    userEmail: String,
    otp: String,
    createdAt: Date,
    expiresAt: Date
});

const UserOTPVerification = new mongoose.model("UserOTPVerification", UserOTPVerificationSchema);

module.exports = UserOTPVerification;