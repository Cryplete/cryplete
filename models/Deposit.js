const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const depositSchema = new Schema({
    userId: String,
    amount: String,
    plan: String,
    network: String,
    startDate: Date,
    endDate: Date,
    status: String
});

const Deposit = new mongoose.model("Deposit", depositSchema);

module.exports = Deposit;