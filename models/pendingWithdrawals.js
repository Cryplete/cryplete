const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const pendingWithdrawalSchema = new Schema({
    userId: String,
    amount: String,
    network: String,
    wallet: String,
    status: String
});

const PendingWithdrawal = new mongoose.model("PendingWithdrawal", pendingWithdrawalSchema);

module.exports = PendingWithdrawal;