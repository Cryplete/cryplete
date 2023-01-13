const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const kycVerificationSchema = new Schema({
    userId: {
		type: String,
		required: true
	},
	idType: {
		type: String,
		required: true
	},
	frontPage: {
		data: Buffer,
		contentType: String
	},
	backPage: {
		data: Buffer,
		contentType: String
	}
    
});

const kycVerification = new mongoose.model("Kycverification", kycVerificationSchema);

module.exports = kycVerification;