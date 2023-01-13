const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    userName: String,
    email: String,
    password: String,
    completed: Number,
    failed: Number,
    invested: Number,
    profit: Number,
    withdrawal: Number,
    unsettledBalance: Number,
    refererId: String,
    referalBonus: Number,
    kycVerified: Boolean,
    verified: Boolean
});

const User = new mongoose.model('User', userSchema);

module.exports = User;