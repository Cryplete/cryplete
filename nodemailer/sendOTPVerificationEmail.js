const nodemailer = require('nodemailer');
const transporter = require('./nodemailerSettings');
const mongoose = require('mongoose');
const UserOTPVerification = require('../models/UserOTPVerification');
const User = require('../models/User');

// send otp verification email
const sendOTPVerificationEmail = async (newUserDetails, res) => {
    try {
        const otp = `${Math.floor(1000 + Math.random() * 9000)}`;

        //mail options
        const mailOptions = {
            from: "xprofitinvestmentltd@outlook.com",
            to: newUserDetails.email,
            subject:"Verify Your Email",
            html: `<div style="display: flex; flex-direction: column; align-items: center;">
            <img style="width: 8rem;" src="cid:logo.png" alt="logo">
            <p>Hey Cheif, please enter <b>${otp}</b> to complete your registeration.</p>
            <p>This OTP <b>expires in an hour</b></p>
            <p>With ❤ from <a href="http://google.com" style="text-decoration: none; color: #10eb89;">X-Profits Investment LTD.</a></p>
            </div>`,
            attachment: [{
                filename: 'logo.png',
                path: '/public/images/logo.png',
                cid: 'logo.png'
            }]
        }

        const saltRounds = 10;
        const hashedOTP = await bcrypt.hash(otp, saltRounds);
        const newOTPVerification = await new UserOTPVerification({
            userEmail: newUserDetails.email,
            otp: hashedOTP,
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000
        });
        //save otp record
        transporter.sendMail(mailOptions, (err, info)=> {
            const newUser = new User({
                    firstName: newUserDetails.firstName,
                    lastName: newUserDetails.lastName,
                    email: newUserDetails.email,
                    password: newUserDetails.password,
                    completed: 0,
                    pending: 0,
                    failed: 0,
                    verified: false
                });
            if(err) {
                console.log(err);
                res.render('signup', {message: 'Internal Server Error!... Try Again'});
            } else {
                newOTPVerification.save();
                newUser.save();
                res.render('otp', {
                    message: "Input Otp Received",
                    email: newUserDetails.email,
                    route: "/otp",
                    resendRoute: "/resendOTPVerificationCode"
                });
            }
        })
    } catch (error) {
        res.render('signup', {
            message: 'Internal server error! Please Try Again'
        })
    }
};

module.exports = sendOTPVerificationEmail;