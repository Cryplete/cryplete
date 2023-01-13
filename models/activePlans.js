const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const activePlanSchema = new Schema({
    userId: String,
    plan: String,
    amount: String,
    network: String,
    startDate: Date,
    endDate: Date
});

const ActivePlan = new mongoose.model("ActivePlan", activePlanSchema);

module.exports = ActivePlan;