require('dotenv').config();

const express = require('express');
const app = express();
const enforce = require('express-sslify');
app.use(enforce.HTTPS({trustProtoHeader: true}));
const bodyParser = require('body-parser');
const ejs = require('ejs');
const mongoose = require('mongoose');
const UserOTPVerification = require('./models/UserOTPVerification');
const User = require('./models/User');
const bcrypt = require('bcrypt');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { attachment } = require('express/lib/response');
const transporter = require('./nodemailer/nodemailerSettings');
const ActivePlan = require('./models/activePlans');
const PendingWithdrawal = require('./models/pendingWithdrawals');
const Deposit = require('./models/Deposit');
const { response } = require('express');
const multer = require('multer');
const { forEach } = require('lodash');
const kycVerification = require('./models/kycVerifications');



const date = new Date().getFullYear();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

const saltRounds = process.env.SALTROUNDS;


//mongoose connection

//"mongodb://localhost:27017/crypeleteDb" 


mongoose.connect("mongodb+srv://Asht001:xprofit@cluster0.izj7j9w.mongodb.net/crypeleteDb",
    { useNewUrlParser: true, useUnifiedTopology: true }, (err) => {
        if (err) {
            console.log(err)
        } else {
            console.log('connected');
        }
    });
//mongoose.set('useCreateIndex', true);
//storage

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, './kycVerification')
	},
	filename: (req, file, cb) => {
		cb(null, file.fieldname + '_' + Date.now()+'_'+ file.originalname)
	}
});

const upload = multer({ storage: storage });


// Set Ejs as templating engine
app.set('view engine', 'ejs');

app.get('/', (req, res)=> {
    res.render('landing', {date: date});
});

app.get('/about', (req, res)=> {
    res.render('about', {date: date});
});

app.get('/faqs', (req, res)=> {
    res.render('faq', {date: date});
});

app.get('/plans', (req, res)=> {
    res.render('plans', {date: date});
});

app.get('/contact', (req, res)=> {
    res.render('contact', {date: date, message: "Contact Us"});
});

app.post('/contact', (req, res)=> {
    res.render('contact', {date: date, message: "Your Request Has Been Recieved"});
});



app.get('/register', (req, res)=> {
    res.render('signup', {
        message: "Create an Account",
        refererId: "",
        prefix: ""
    })
});
app.post('/register', (req, res)=> {
    const { FName, LName, email, userName, password, confirmPassword} = req.body;
    if (FName == "" || LName == "" || email == "" || userName == "" || password == "" || confirmPassword == "") {
        res.render('signup', {
            message: "Empty Input Field",
            prefix: "",
            refererId: ""
        })
    } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        res.render('signup', {
            message: "Invalid Email",
            prefix: "",
            refererId: ""
        });
    } else if(password.length < 8){
        res.render('signup', {
            message: "Password Must Be >/= 8",
            prefix: "",
            refererId: ""
        })
    } else if (!(password === confirmPassword)) {
        res.render('signup', {
            message: "Password Confirmation Doesn't Match",
            prefix: "",
            refererId: ""
        });
    } else {
        //check if user already exists
        User.find( {email: email} )
        .then((result)=> {
            if(result.length) {
                // user exists
                res.render('signup', {
                    message: "User Already Exists",
                    prefix: "",
                    refererId: ""
                });
            } else {
                //Try to create new user


                const newUserDetails = {
                    firstName: FName,
                    lastName: LName,
                    userName: userName,
                    email: email,
                    password: password,
                    referer: ""
                }

                sendOTPVerificationEmail(newUserDetails, res);
            }
        })
    }
});

//referral
app.get('/register/:referId', (req, res)=> {
    const referId = req.params.referId;
    User.findOne({_id: referId}, (err, items)=> {
        if(err) {
            res.render('signup', {
                message: "Server Error!",
                refererId: "",
                prefix: "../"
            });
        } else if (!items) {
            res.render('signup', {
                message: "Incorrect Referral Link",
                refererId: "",
                prefix: "../"
            });
        } else {
            res.render('signup', {
                message: "Create an Account",
                refererId: referId,
                prefix: "../"
            });
        }
    })
});
app.post('/register/:referId', (req, res)=> {
    const { FName, LName, email, userName, password, confirmPassword, referer} = req.body;
    if (FName == "" || LName == "" || email == "" || userName == "" || password == "" || confirmPassword == "") {
        res.render('signup', {
            message: "Empty Input Field",
            refererId: referId,
            prefix: "../"
        });
    } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        res.render('signup', {
            message: "Invalid Email",
            refererId: referId,
            prefix: "../"
        });
    } else if(password.length < 8){
        res.render('signup', {
            message: "Password Must Be >/= 8",
            refererId: referId,
            prefix: "../"
        });
    } else if (!(password === confirmPassword)) {
        res.render('signup', {
            message: "Password Confirmation Doesn't Match",
            refererId: referId,
            prefix: "../"
        });
    } else {
        //check if user already exists
        User.find( {email: email} )
        .then((result)=> {
            if(result.length) {
                // user exists
                res.render('signup', {
                    message: "User Already Exists",
                    refererId: referId,
                    prefix: "../"
                });
            } else {
                //Try to create new user
                const newUserDetails = new User({
                    firstName: FName,
                    lastName: LName,
                    userName: userName,
                    email: email,
                    password: password,
                    referer: referer,
                    completed: 0,
                    failed: 0,
                    invested: 0,
                    profit: 0,
                    withdrawal: 0,
                    unsettledBalance: 0,
                    referalBonus: 0,
                    kycVerified: false,
                    verified: true
                });
                newUserDetails.save();
                res.redirect('/login');
                
            }
        })
    }
});

// send otp verification email
const sendOTPVerificationEmail = async (newUserDetails, res) => {
    const saltRounds = 10;
        const otp = `${Math.floor(1000 + Math.random() * 9000)}`;

        //mail options
        const mailOptions = {
            from: "admin@crypeleteinvestment.ltd",
            to: newUserDetails.email,
            subject:"Confirm Your Crypelete Registration",
            html: `<div>
            <p>Thank You for choosing Crypelete Workplace. Please enter the otp <b>${otp}</b> to Complete your registration. This OTP <b>expires in an hour</b></p>
            <p>From all of us at <a href="https://crypeleteinvestment.ltd" style="text-decoration: none; color: #10eb89;">Crypelete Investment LTD.</a></p>
            </div>`
        }
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
                    userName: newUserDetails.userName,
                    email: newUserDetails.email,
                    password: newUserDetails.password,
                    completed: 0,
                    failed: 0,
                    invested: 0,
                    profit: 0,
                    withdrawal: 0,
                    unsettledBalance: 0,
                    refererId: newUserDetails.referer,
                    referalBonus: 0,
                    kycVerified: false,
                    verified: false
                });
            if(err) {
                newUser.save();
            } else {
                newUser.save();
                newOTPVerification.save();
                res.render('otp', {
                    message: "Input Otp Received",
                    email: newUserDetails.email,
                    route: "/otp",
                    resendRoute: "/resendOTPVerificationCode"
                });
            }
        });
};

// resend otp verification email
const resendsendOTPEmail = async (email, res) => {
    const saltRounds = 10;
        const otp = `${Math.floor(1000 + Math.random() * 9000)}`;

        //mail options
        const mailOptions = {
            from: "admin@crypeleteinvestment.ltd",
            to: email,
            subject:"Confirm Your Crypelete Registration",
            html: `<div>
            <p>Thank You for choosing Crypelete Workplace. Please enter the otp <b>${otp}</b> to Complete your registration. This OTP <b>expires in an hour</b></p>
            <p>From all of us at <a href="https://crypeleteinvestment.ltd" style="text-decoration: none; color: #10eb89;">Crypelete Investment LTD.</a></p>
            </div>`
        }

        const hashedOTP = await bcrypt.hash(otp, saltRounds);
        const newOTPVerification = await new UserOTPVerification({
            userEmail: email,
            otp: hashedOTP,
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000
        });
        //save otp record
        transporter.sendMail(mailOptions, (err, info)=> {
            if(err) {
                console.log(err);
                res.render('otp', {
                    message: 'Internal server error! Please Try Again',
                    email: email,
                    route: "/otp",
                    resendRoute: "/resendOTPVerificationCode"
                });
            } else {
                newOTPVerification.save();
                res.render('otp', {
                    message: "Input Otp Received",
                    email: email,
                    route: "/otp",
                    resendRoute: "/resendOTPVerificationCode"
                });
            }
        });
};


app.post('/otp', (req, res)=> {
    let { email, otp } = req.body;
        if(!email || !otp) {
            throw Error("Empty otp details are not allowed");
        } else {
            UserOTPVerification.findOne({userEmail: email}, (err, user)=> {
                if (err) {
                    throw new Error("Error in finding otp")
                } else {
                    if(!user) {
                        //no record found
                        throw new Error(
                            "Account record doesn't exist or has been verified already."
                        )
                    } else {
                        const { expiresAt } = user;
                        const hashedOTP = user.otp;
                        if(expiresAt < Date.now()) {
                            //user otp record has expires
                            UserOTPVerification.findOneAndDelete({userEmail: email}, (fail, docs)=> {
                                if(fail) {
                                    throw new Error ("Code has expired");
                                } else {
                                    res.render('otp', {
                                        message: "OTP expired",
                                        email: email,
                                        route: "/otp",
                                        resendRoute: "/resendOTPVerificationCode"
                                    });
                                }
                            });
                            
                        } else {
                            bcrypt.compare(otp, hashedOTP, (err, response) => {
                                if(response === true) {
                                    // supplied correct otp
                                    User.findOneAndUpdate({email: email}, {verified: true}, null, (error, docs)=> {
                                        if(error) {
                                            console.log(err);
                                        }
                                    });
                                    UserOTPVerification.findOneAndDelete({userEmail: email}, (error, docs)=> {
                                        if (error) {
                                            console.log(error)
                                        } else {
                                            res.redirect('/login');
                                        }
                                    });
                                } else {
                                    //suppied otp is wrong
                                    res.render('otp', {
                                        message: "Incorrect OTP",
                                        email: email,
                                        route: "/otp",
                                        resendRoute: "/resendOTPVerificationCode"
                                    });
                                }
                            });
                        }
                    }
                }
            });
        }
});


app.post('/resendOTPVerificationCode', (req, res)=> {
    let {email} = req.body;
    if(!email) {
        throw Error("Empty user details not allowed")
    } else {
        //delete existing otp and resend
        UserOTPVerification.findOneAndDelete({userEmail: email}, (error, docs)=> {
            if (error) {
                console.log(error)
            } else {
                resendsendOTPEmail(email, res);
            }
        });
    }
});


app.get('/forgot', (req, res)=> {
    res.render('forgot', {message: "We'd send an OTP to you"})
});
app.post('/forgot', (req, res)=> {
    const {email} = req.body;
    if(email == "") {
        res.render('forgot', {message: "No Email Found"})
    } else {
        User.find( {email: email} )
        .then((result)=> {
            if(result.length) {
                // user exists
                sendOTPpassword(email, res);
            } else {
                //No user
                res.render('forgot', {message: "No Email Found"})
            }
        })
    }
});

app.post('/forgotOtp', (req, res)=> {
    let { email, otp } = req.body;
        if(!email || !otp) {
            throw Error("Empty otp details are not allowed");
        } else {
            UserOTPVerification.findOne({userEmail: email}, (err, user)=> {
                if (err) {
                    throw new Error("Error in finding otp")
                } else {
                    if(!user) {
                        //no record found
                        throw new Error(
                            "Account record doesn't exist or has been verified already."
                        )
                    } else {
                        const { expiresAt } = user;
                        const hashedOTP = user.otp;
                        if(expiresAt < Date.now()) {
                            //user otp record has expires
                            UserOTPVerification.findOneAndDelete({userEmail: email}, (fail, docs)=> {
                                if(fail) {
                                    throw new Error ("Code has expired");
                                } else {
                                    res.render('otp', {
                                        message: "OTP expired",
                                        email: email,
                                        route: "/forgotOtp",
                                        resendRoute: "/resendforgotCode"
                                    });
                                }
                            });
                            
                        } else {
                            bcrypt.compare(otp, hashedOTP, (err, response) => {
                                if(response === true) {
                                    // supplied correct otp
                                    UserOTPVerification.findOneAndDelete({userEmail: email}, (error, docs)=> {
                                        if (error) {
                                            console.log(error);
                                        } else {
                                            res.render('changePassword', {message: "Change Password", email: email});
                                        }
                                    });
                                    
                                } else {
                                    //suppied otp is wrong
                                    res.render('otp', {
                                        message: "Incorrect OTP",
                                        email: email,
                                        route: "/forgotOtp",
                                        resendRoute: "/resendforgotCode"
                                    });
                                }
                            });
                        }
                    }
                }
            });
        }
});

app.post('/resendforgotCode', (req, res)=> {
    let {email} = req.body;
    if(!email) {
        throw Error("Empty user details not allowed")
    } else {
        //delete existing otp and resend
        UserOTPVerification.findOneAndDelete({userEmail: email}, (error, docs)=> {
            if (error) {
                console.log(error)
            } else {
                sendOTPpassword(email, res);
            }
        });
    }
});



//  otp password reset email
const sendOTPpassword = async (email, res) => {
    try {
        const saltRounds = 10;
        const otp = `${Math.floor(1000 + Math.random() * 9000)}`;

        //mail options
        const mailOptions = {
            from: "admin@crypeleteinvestment.ltd",
            to: email,
            subject:"Password Reset",
            html: `<div>
            <p>A password reset event has been triggered. Please enter the otp <b>${otp}</b> to reset your password. This OTP <b>expires in an hour</b></p>
            <p>From all of us at <a href="https://crypeleteinvestment.ltd" style="text-decoration: none; color: #10eb89;">Crypelete Investment LTD.</a></p>
            </div>`
        }

        const hashedOTP = await bcrypt.hash(otp, saltRounds);
        const newOTPVerification = await new UserOTPVerification({
            userEmail: email,
            otp: hashedOTP,
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000
        });
        //save otp record
        transporter.sendMail(mailOptions, (err, info)=> {
            if(err) {
                console.log(err);
                res.render('forgot', {
                    message: 'Internal server error! Please Try Again'
                });
            } else {
                newOTPVerification.save();
                res.render('otp', {
                    message: 'Input Otp',
                    email: email,
                    route: "/forgotOtp",
                    resendRoute: "/resendforgotCode"
                });
            }
        });
    } catch (error) {
        res.render('forgot', {
            message: 'Internal server error! Please Try Again'
        });
    }
};

app.post("/changePassword", (req, res)=> {
    const {email, password, confirmPassword} = req.body;
    if(password=="" || confirmPassword =="") {
        res.render('changePassword', {message: "Empty Input Values Not Allowed"});
    } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        res.render('changePassword', {message: "Invalid Email"});
    } else if(password.length < 8) {
        res.render('changePassword', {message: "Password Must be >/= 8"});
    } else if(!(password===confirmPassword)) {
        res.render('changePassword', {message: "Try Again"});
    }
    else {
        User.findOneAndUpdate({email: email}, {password: password}, null, (error, docs)=> {
            if(error) {
                console.log(err);
            } else {
                res.redirect('/login');
            }
        });
    }
});


app.get('/login', (req, res)=> {
    res.render('login', {
        message: "User Login",
        prefix: ""
    });
});
app.post('/login', (req, res)=> {
    const {email, password} = req.body;
    User.findOne({email: email}, (err, items)=> {
        if (err) {
            res.render('login', {
                message: "Server Error! Please try again",
                prefix: ""
            });
        } else if (!items) {
            res.render('login', {
                message: "Invalid Username or Password",
                prefix: ""
            });
        } else if(!(password == items.password)) {
            res.render('login', {
                message: "Invalid Username or Password",
                prefix: ""
            });
        } else if(!items.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                prefix: ""
            });
        } else {
            res.redirect(`/dashboard/${items._id}`);
        }
    });
});

app.get('/dashboard/:userId', (req, res)=> {
    const userId = req.params.userId;
    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.render('login', {
                message: "Server Error! Please Try Again!",
                prefix: "../"
            });
        } else if(!userDetails) {
            res.redirect('/login');
        } else if(!userDetails.verified) {
            res.render('login', {
                message: "Please Verify Account",
                prefix: "../"
            });
        } else {
            ActivePlan.find({userId: userDetails._id}, (error, Activeplans)=> {
                if(error) {
                    res.redirect('/login');
                } else {
                    Deposit.find({userId: userDetails._id, status: "Failed"}, (depositErr, depositItems)=> {
                        if(depositErr) {
                            res.redirect('/login');
                        } else {
                            res.render('dashboard', {
                                date: date,
                                userDetails: userDetails,
                                active: Activeplans.length,
                                failed: depositItems.length,
                                prefix: "../"
                            });
                        }
                    });
                }
            });
        }
    });
});


app.get('/kyc/:userId', (req, res)=> {
    const {userId} = req.params;
    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.redirect(`/dashboard/${userId}`);
        } else if(!userDetails) {
            res.redirect('/login');
        } else if(!userDetails.verified) {
            res.render('login', {
                message: "Please Verify Account",
                prefix: "../"
            });
        } else {
            res.render('kycPending', {
                date: date,
                userDetails: userDetails,
                prefix: '../'
            })
        }
    }) 
});
app.post('/kyc/:userId', (req, res)=> {
    const {userId} = req.params;
    console.log(req.body, req.file);
    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.render('login', {
                message: "Server Error! Please Login Again",
                prefix: ""
            });
        } else if(!userDetails) {
            res.redirect('/login');
        } else {
            console.log(req.file)
            const newkycVerification = new kycVerification({
                userId: userDetails._id,
                idType: req.body.certificate,
                frontPage: {
                    data: req.file,
                    contentType: 'image/jpg, image/jpeg, image/jpg'
                },
                BackPage: {
                    data: req.file,
                    contentType: 'image/jpg, image/jpeg, image/jpg'
                },
            });
            newkycVerification.save()
            .then(()=> {res.redirect(`/kyc/${userDetails._id}`)})
            .catch(err=> {console.log(err)});
        }
    })
});

app.get('/account/:userId', (req, res)=> {
    const userId = req.params.userId;
    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.render('login', {
                message: "Serve Error! Please Try Again",
                prefix: "../"
            });
        } else if(!userDetails) {
            res.redirect('/login');
        }  else if(!userDetails.verified) {
            res.render('login', {
                message: "Please Verify Account",
                prefix: "../"
            });
        } else {
            if(userDetails.refererId.length == 0) {
                res.render('userAccount', {
                    date: date,
                    userDetails: userDetails,
                    referrer: "",
                    prefix: "../"
                });
            } else {
                User.findOne({_id: userDetails.refererId}, (error, referrerItems)=> {
                    if(error) {
                        res.render('login', {
                            message: "Serve Error! Please Try Again",
                            prefix: "../"
                        });
                    } else if (!referrerItems) {
                        res.redirect('/login');
                    } else {
                        res.render('userAccount', {
                            date: date,
                            userDetails: userDetails,
                            referrer: referrerItems,
                            prefix: "../"
                        });
                    }
                });
            }
        }
    });
});
app.post('/account/:userId', (req, res)=> {
    const userId = req.body.id;
    User.findOneAndDelete({_id: userId}, (err, docs)=> {
        if(err) {
            res.redirect(`/account/${userId}`);
        } else {
            res.redirect('/register');
        }
    })
});

app.get('/failed/:userId', (req, res)=> {
    const {userId} = req.params;

    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.redirect('/login');
        } else if(!userDetails) {
            res.redirect('/login');
        } else {
            Deposit.find({userId: userDetails._id, status: "Failed"}, (activeErr, activePlans)=> {
                if(activeErr) {
                    res.redirect('/login');
                } else {
                    res.render('failedTransactions', {
                        prefix: '../',
                        date: date,
                        userDetails: userDetails,
                        activePlans: activePlans
                    });
                }
            });
        }
    });
});

app.get('/plans/:userId', (req, res)=> {
    const {userId} = req.params;
    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.redirect('/login');
        } else if(!userDetails) {
            res.redirect('/login');
        } else {
            ActivePlan.find({userId: userDetails._id}, (activeErr, activePlans)=> {
                if(activeErr) {
                    res.redirect('/login');
                } else {
                    res.render('userActivePlans', {
                        prefix: '../',
                        date: date,
                        userDetails: userDetails,
                        activePlans: activePlans
                    });
                }
            });
        }
    });
});

app.get('/active-plans/:userId/:activeId', (req, res)=> {
    const {userId, activeId} = req.params;

    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.redirect('/login');
        } else if(!userDetails) {
            res.redirect('/login');
        } else {
            ActivePlan.findOne({_id: activeId}, (activeErr, activeDetails)=> {
                if(activeErr) {
                    res.redirect('/login');
                } else if(!activeDetails) {
                    res.redirect('/login');
                } else {
                    res.render('userPlanDetails', {
                        prefix: '../../',
                        date: date,
                        userDetails: userDetails,
                        active: activeDetails
                    });
                }
            });
        }
    })
});

app.get('/failed/:userId/:activeId', (req, res)=> {
    const {userId, activeId} = req.params;

    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.redirect('/login');
        } else if(!userDetails) {
            res.redirect('/login');
        } else {
            Deposit.findOne({_id: activeId}, (activeErr, activeDetails)=> {
                if(activeErr) {
                    res.redirect('/login');
                } else if(!activeDetails) {
                    res.redirect('/login');
                } else {
                    res.render('failedDetails', {
                        prefix: '../../',
                        date: date,
                        userDetails: userDetails,
                        active: activeDetails
                    });
                }
            });
        }
    })
});

app.get('/edit-account/:userId', (req, res)=> {
    const userId = req.params.userId;
    User.findOne({_id: userId}, (err, items)=> {
        if(err) {
            res.redirect(`/account/${userId}`);
        } else if(!items) {
            res.redirect(`/account/${userId}`);
        } else if(!items.verified) {
            res.render('login', {
                message: "Please Verify Account",
                prefix: "../"
            });
        } else {
            res.render('userAccountEdit', {
                user: items,
                message: "Edit User's Details"
            });
        }
    });
});
app.post('/edit-account/:userId', (req, res)=> {
    const {id, FName, LName, userName, email, password} = req.body;
    if(FName == "" || LName == "", userName == "" || email == "" || password == "") {
        User.findOne({_id: id}, (err, items)=> {
            if(err) {
                res.redirect(`/account/${id}`);
            } else if(!items) {
                res.redirect(`/account/${id}`);
            } else if(!items.verified) {
                res.render('login', {
                    message: "Please Verify Your Account",
                    prefix: "../"
                });
            } else {
                res.render('userAccountEdit', {
                    user: items,
                    message: "Empty Values Not Allowed"
                });
            }
        });
    } else if (password.length < 8) {
        User.findOne({_id: id}, (err, items)=> {
            if(err) {
                res.redirect(`/account/${id}`);
            } else if(!items) {
                res.redirect(`/account/${id}`);
            } else if(!items.verified) {
                res.render('login', {
                    message: "Please Verify Your Account",
                    prefix: "../"
                });
            } else {
                res.render('userAccountEdit', {
                    user: items,
                    message: "Passwords must be >/= 8"
                });
            }
        });
    } else {
        User.findOne({_id: id}, (error, useritems)=> {
            if(error) {
                res.redirect(`/acount/${id}`);
            } else if (!useritems.verified) {
                res.render('login', {
                    message: "Please Verify Your Account",
                    prefix: "../"
                });
            } else {
                User.findOneAndUpdate({_id: id}, {
                    firstName: FName,
                    lastName: LName,
                    userName: userName,
                    email: email,
                    password: password
                }, null, (error, docs)=> {
                    if(error) {
                        res.redirect(`/account/${id}`);
                    } else {
                        res.redirect(`/account/${id}`);
                    }
                });
            }
        });
    }
});

app.get('/deposit/:userId', (req, res)=> {
    const {userId} = req.params;
    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.redirect(`/account/${userId}`);
        } else if (!userDetails) {
            res.redirect(`/account/${userId}`);
        } else if (!userDetails.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                prefix: "../"
            });
        } else {
            res.render('deposit', {
                date: date,
                prefix: "../",
                userDetails: userDetails,
                message: "In USD",
                extra: ""
            });
        }
    })
});
app.post('/deposit/:plan/:userId', (req, res)=> {
    const {plan, userId} = req.params;
    const {amount, network} = req.body;

    User.findOne({_id: userId}, ((err, items)=> {
        if(err) {
            res.redirect(`/account/${userId}`);
        } else if (!items) {
            res.redirect(`/account/${userId}`);
        } else if (!items.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                prefix: "../../"
            });
        }  else if (!items.kycVerified) {
            res.render('deposit', {
                date: date,
                prefix: "../../",
                userDetails: items,
                message: "Please Complete Your KYC Verification",
                extra: 'primary'
            });
        } else if(plan === "bronze") {
            if(amount >= 500 && amount <= 4999) {
                res.redirect(`/${plan}/${amount}/${userId}/${network}`);
            } else {
                res.render('deposit', {
                    date: date,
                    prefix: "../../",
                    userDetails: items,
                    message: "Invalid Amount For Said Plan!",
                    extra: 'primary'
                });
            }
        } else if (plan === "silver") {
            if(amount >= 5000 && amount <= 19999) {
                res.redirect(`/${plan}/${amount}/${userId}/${network}`);
            } else {
                res.render('deposit', {
                    date: date,
                    prefix: "../../",
                    userDetails: items,
                    message: "Invalid Amount For Said Plan!",
                    extra: 'secondary'
                });
            }
        } else if (plan === "diamond") {
            if(amount >= 20000 && amount <= 49999) {
                res.redirect(`/${plan}/${amount}/${userId}/${network}`);
            } else {
                res.render('deposit', {
                    date: date,
                    prefix: "../../",
                    userDetails: items,
                    message: "Invalid Amount For Said Plan!",
                    extra: 'diamond'
                });
            }
        } else if (plan === "platinum") {
            if(amount >= 50000 && amount <= 1000000000 ) {
                res.redirect(`/${plan}/${amount}/${userId}/${network}`);
            } else {
                res.render('deposit', {
                    date: date,
                    prefix: "../../",
                    userDetails: items,
                    message: "Invalid Amount For Said Plan!",
                    extra: 'premium'
                });
            }
        }
    }));
});
app.get('/deposit-history/:userId', (req, res)=> {
    const {userId} = req.params;
    User.findOne({_id: userId}, (err, userDetails)=> {
        if(err) {
            res.redirect(`/account/${userId}`);
        } else if (!userDetails) {
            res.redirect(`/account/${userId}`);
        } else if (!userDetails.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                prefix: "../"
            });
        } else {
            Deposit.find({userId: userDetails._id}, (depositErr, depositItems)=> {
                if(depositErr) {
                    res.render('login', {
                        message: "Server Error! Please Login Again",
                        prefix: "../"
                    });
                } else {
                    res.render('deposit-history', {
                        date: date,
                        userDetails: userDetails,
                        prefix: "../",
                        depositItems: depositItems
                    });
                }
            })
        }
    });
});

app.get('/:plan/:amount/:userId/:network', (req, res)=> {
    const {plan, amount, userId, network} = req.params;
    User.findOne({_id: userId}, (err, items)=> {
        if(err) {
            res.redirect(`/account/${userId}`);
        } else if (!items) {
            res.redirect(`/account/${userId}`);
        } else if(!items.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                prefix: "../../"
            });
        } else if(!items.kycVerified) {
            res.render('deposit', {
                date: date,
                prefix: "../../",
                userDetails: items,
                message: "Please Complete Your KYC Verification",
                extra: 'primary',
            });
        } else {
            if (plan === "bronze") {
                res.render('savePlan', {
                    userDetails: items,
                    prefix: "../../../",
                    date: date,
                    plan: plan,
                    amount: amount,
                    mature: "7 Days",
                    interest: "5.0%",
                    network: network

                });
            } else if (plan === "silver") {
                res.render('savePlan', {
                    userDetails: items,
                    prefix: "../../../",
                    date: date,
                    plan: plan,
                    amount: amount,
                    mature: "7 Days",
                    interest: "6.5%",
                    network: network
                });
            } else if (plan === "diamond") {
                res.render('savePlan', {
                    userDetails: items,
                    prefix: "../../../",
                    date: date,
                    plan: plan,
                    amount: amount,
                    mature: "7 Days",
                    interest: "7.5%",
                    network: network
                });
            } else if(plan === "platinum") {
                res.render('savePlan', {
                    userDetails: items,
                    prefix: "../../../",
                    date: date,
                    plan: plan,
                    amount: amount,
                    mature: "7 Days",
                    interest: "10.0%",
                    network: network
                });
            }
        }
    });
});
app.post('/:plan/:amount/:userId/:network', (req, res)=> {
    const {plan, amount, userId, network} = req.params;
    const today = new Date();
    //604800000
    const endDate = new Date(today.getTime() + 604800000)
    const newDeposit = new Deposit ({
        userId: userId,
        amount: amount,
        plan: plan,
        network: network,
        startDate: today,
        endDate: endDate,
        status: "Pending"
    });
    User.findOne({_id: userId}, ((err, items)=> {
        if(err) {
            res.redirect(`/${plan}/${amount}/${userId}`);
        } else if (!items) {
            res.redirect(`/${plan}/${amount}/${userId}`);
        } else if(!items.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                prefix: "../../../"
            });
        } else if(!items.kycVerified) {
            res.render('deposit', {
                date: date,
                prefix: "../../../",
                userDetails: items,
                message: "Please Complete Your KYC Verification",
                extra: 'primary'
            });
        } else {
            newDeposit.save();
            let address;
            if(network === "BTC") {
                address = "bc1qx8r564y9pdkrfnh6yzmvmltqq9xt6u4qkx998k"
            } else if(network === "ETH") {
                address = "0xe7b8A9ab8a643f48c6ab26EECeaAb6459b52a853"
            } else if(network === "TRC 20") {
                address = "TKtRF9hAnjz1TG8PiKLEquUX2sLQXeVaik"
            }
            res.render('payment', {
                date: date,
                prefix: "../../../",
                userDetails: items,
                network: network,
                address: address
            });
        }
    }));
});

app.get('/withdraw/:userId', (req, res)=> {
    const {userId} = req.params;
    User.findOne({_id: userId}, (err, items)=> {
        if(err) {
            res.render('login', {
                message: "Server Error! Please Try Again",
                prefix: "../"
            });
        } else if (!items) {
            res.redirect('/login');
        } else if (!items.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                 prefix: "../"
            });
        } else {
            res.render('withdraw', {
                date: date,
                prefix: "../",
                userDetails: items,
                message: "Input Your Withdrawal Amount"
            });
        }
    });
});
app.post('/withdraw/:userId', (req, res)=> {
    const {userId} = req.params;
    const {amount, network} = req.body;

    User.findOne({_id: userId}, (err, items)=> {
        if(err) {
            res.render('login', {
                message: "Server Error! Please Try Again",
                prefix: "../"
            });
        } else if (!items) {
            res.redirect('/login');
        } else if (!items.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                 prefix: "../"
            });
        } else if (amount > items.profit) {
            res.render('withdraw', {
                date: date,
                prefix: "../",
                userDetails: items,
                message: `Insufficient Balance, Your Available Balance is $${items.profit}`
            });
        } else if(!items.kycVerified) {
            res.render('withdraw', {
                date: date,
                prefix: "../",
                userDetails: items,
                message: `Please complete your KYC verification before making further actions`
            });
        } else {
            res.redirect(`/withdraw/confirm/${amount}/${userId}/${network}`);
        }
    });
});

app.get('/withdrawal/:userId', (req, res)=> {
    const {userId} = req.params;
    User.findOne({_id: userId}, (err, items)=> {
        if(err) {
            res.render('login', {
                message: "Server Error! Please Try Again",
                prefix: "../"
            });
        } else if (!items) {
            res.redirect('/login');
        } else if (!items.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                 prefix: "../"
            });
        } else {
            PendingWithdrawal.find({userId: userId}, (withErr, withItems)=> {
                if(withErr) {
                    res.render('login', {
                        message: "Server Error! Please Try Again",
                        prefix: "../"
                    });
                } else {
                    res.render('withdrawHistory', {
                        date: date,
                        prefix: "../",
                        userDetails: items,
                        message: "Input Your Withdrawal Amount",
                        withItems: withItems
                    });
                }
            })
        }
    });
});

app.get('/withdraw/confirm/:amount/:userId/:network', (req, res)=> {
    const {amount, userId, network} = req.params;
    User.findOne({_id: userId}, (err, items)=> {
        if(err) {
            res.render('login', {
                message: "Server Error! Please Try Again",
                prefix: "../../../../"
            });
        } else if (!items) {
            res.redirect('/login');
        } else if (!items.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                 prefix: "../../../../"
            });
        } else {
            res.render('confirmWithdrawal', {
                date: date,
                prefix: "../../../../",
                userDetails: items,
                amount: amount,
                network: network
            });
        }
    });
});
app.post('/withdraw/confirm/:amount/:userId/:network', (req, res)=> {
    const {amount, userId, network} = req.params;
    const {wallet} = req.body;

    User.findOne({_id: userId}, (err, items)=> {
        if(err) {
            res.render('login', {
                message: "Server Error! Please Try Again",
                prefix: "../../../../"
            });
        } else if (!items) {
            res.redirect('/login');
        } else if (!items.verified) {
            res.render('login', {
                message: "Please Verify Your Account",
                 prefix: "../../../../"
            });
        } else {

            const withdrawal = new PendingWithdrawal({
                userId: userId,
                amount: amount,
                network: network,
                wallet: wallet,
                status: "Pending"
            });
    
            //save active plan
                    withdrawal.save();
                    res.render('afterWithdraw', {
                        prefix: "../../../../",
                        date: date,
                        userDetails: items,
                        wallet: withdrawal.wallet
                    });
        } 
    });
});

const sendWithdrawalConfirmation = async (withdrawal, items, res) => {
    try {
        //mail options
        const mailOptions = {
            from: "admin@crypeleteinvestment.ltd",
            to: items.email,
            subject:"Withdrawal Initiated",
            html: `<div>
            <p>Hey there <b>${items.firstName}</b>,</p>
            <p>This is to tell you that your withdrawal of <b>$${withdrawal.amount}</b> has been recieved and is being processed. Do enjoy your plans with us.</p>
            <p>From all of us at <a href="https://crypeleteinvestment.ltd" style="text-decoration: none; color: #10eb89;">Crypelete Investment LTD.</a></p>
            </div>`
        };


        const newWithdrawal = await new PendingWithdrawal({
            userId: withdrawal.userId,
            amount: withdrawal.amount,
            network: withdrawal.network,
            wallet: withdrawal.wallet,
            status: withdrawal.status
        });

        //save active plan
        transporter.sendMail(mailOptions, (err, info)=> {
            if(err) {
                console.log(err);
                res.redirect('/login');
            } else {
                newWithdrawal.save();
                res.render('afterWithdraw', {
                    prefix: "../../../../",
                    date: date,
                    userDetails: items,
                    wallet: withdrawal.wallet
                });
            }
        });
    }
    catch {
        res.redirect('/login');
    }
}

app.get('/logout', (req, res)=> {
    res.redirect('/login');
});


// 6307cbab83e0cb60e1c6b308
app.get('/admin-acess', (req, res)=> {
    res.render('adminForm', {message: "Input Admin Access Token"});
});
app.post('/admin-acess', (req, res)=> {
    const {password} = req.body;
    if (password === "Ab660932") {
        PendingWithdrawal.find({}, (err, pendingItems)=> {
            if (err) {
                res.render('adminForm', {message: "Server Error! Please Try Again"});
            } else {
                ActivePlan.find({}, (acterr, actitems)=> {
                    if (acterr) {
                        res.render('adminForm', {message: "Server Error! Please Try Again"});
                    } else {
                        Deposit.find({}, (depositError, depositItems)=> {
                            if(depositError) {
                                res.render('adminForm', {message: "Server Error! Please Try Again"});
                            } else {
                                User.find({}, (usererr, useritems)=> {
                                    if(usererr) {
                                        res.render('adminForm', {message: "Server Error! Please Try Again"});
                                    } else {
                                        res.render('admin', {
                                            prefix: "",
                                            pending: pendingItems.length,
                                            active: actitems.length,
                                            users: useritems.length,
                                            deposit: depositItems.length,
                                            date: date
                                        });
                                    }
                                });
                            }
                        })
                    };
                });
            };
        });
    } else {
        res.render('adminForm', {message: "Incorrect Password"});
    }
});

app.get('/admin-acess-users', (req, res)=> {
    User.find({}, (err, users)=> {
        if (err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.render('userAdmin', {
                users: users,
                date: date,
                prefix: ""
            });
        }
    })
});

app.get('/admin/:userId', (req, res)=> {
    const userId = req.params.userId;
    User.findOne({_id: userId}, (err, items)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again."});
        } else {
            Deposit.find({userId: userId}, (depositError, depositItems)=> {
                if(depositError) {
                    res.render('adminForm', {message: "Server Error! Please Try Again."});
                } else {
                    if(items.refererId === "") {
                        res.render('user', {
                            date: date,
                            user: items,
                            referrer: {},
                            prefix: "../",
                            deposit: depositItems.length
                        });
                    } else {
                        User.findOne({_id: items.refererId}, (error, referrerItems)=> {
                            if(error) {
                                res.render('adminForm', {message: "Server Error! Please Try Again."});
                                console.log(items);
                                console.log('Or Here!');
                            } else if (!referrerItems) {
                                res.render('user', {
                                    date: date,
                                    user: items,
                                    referrer: {},
                                    prefix: "../",
                                    deposit: depositItems.length
                                });
                            } else {
                                res.render('user', {
                                    date: date,
                                    user: items,
                                    referrer: referrerItems,
                                    prefix: "../",
                                    deposit: depositItems.length
                                });
                            }
                        });
                    }
                }
            })
        }
    });
});

app.get('/edit-user/:userId', (req, res)=> {
    const userId = req.params.userId;
    User.findOne({_id: userId}, (err, items)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else if(!items) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.render('userEditForm', {
                user: items,
                message: "Edit User's Details"
            });
        }
    });
});
app.post('/edit-user/:userId', (req, res)=> {
    const {id, FName, LName, userName, email, password,completed, failed, invested, profit, withdrawal, referalBonus, suspend, unsettled, kycVerified} = req.body;
    if(FName == "" || LName == "", userName == "" || email == "" || password == "" || completed == "" || failed == "" || invested == "" || profit == "" || withdrawal == "" || referalBonus == "" || unsettled == "") {
        User.findOne({_id: id}, (err, items)=> {
            if(err) {
                res.render('adminForm', {message: "Server Error! Please Try Again"});
            } else if(!items) {
                res.render('adminForm', {message: "Server Error! Please Try Again"});
            } else {
                res.render('userEditForm', {
                    user: items,
                    message: "Empty Values Not Allowed"
                });
            }
        });
    } else if (password.length < 8) {
        User.findOne({_id: id}, (err, items)=> {
            if(err) {
                res.render('adminForm', {message: "Server Error! Please Try Again"});
            } else if(!items) {
                res.render('adminForm', {message: "Server Error! Please Try Again"});
            } else {
                res.render('userEditForm', {
                    user: items,
                    message: "Passwords must be >/= 8"
                });
            }
        });
    } else {
        if (!suspend && !kycVerified) {
            User.findOneAndUpdate({_id: id}, {
                firstName: FName,
                lastName: LName,
                userName: userName,
                email: email,
                password: password,
                completed: completed,
                failed: failed,
                invested: invested,
                profit: profit,
                withdrawal: withdrawal,
                unsettledBalance: unsettled,
                referalBonus: referalBonus,
                kycVerified: false,
                verified: true
            }, null, (error, docs)=> {
                if(error) {
                    User.findOne({_id: id}, (err, items)=> {
                        if(err) {
                            res.render('adminForm', {message: "Server Error! Please Try Again"});
                        } else if(!items) {
                            res.render('adminForm', {message: "Server Error! Please Try Again"});
                        } else {
                            res.render('userEditForm', {
                                user: items,
                                message: "Server Error, Please Try Again"
                            });
                        }
                    });
                } else {
                    res.redirect(`/admin/${id}`);
                }
            });
        } else if(!suspend && kycVerified) {
            User.findOneAndUpdate({_id: id}, {
                firstName: FName,
                lastName: LName,
                userName: userName,
                email: email,
                password: password,
                completed: completed,
                failed: failed,
                invested: invested,
                profit: profit,
                withdrawal: withdrawal,
                unsettledBalance: unsettled,
                referalBonus: referalBonus,
                kycVerified: true,
                verified: true
            }, null, (error, docs)=> {
                if(error) {
                    User.findOne({_id: id}, (err, items)=> {
                        if(err) {
                            res.render('adminForm', {message: "Server Error! Please Try Again"});
                        } else if(!items) {
                            res.render('adminForm', {message: "Server Error! Please Try Again"});
                        } else {
                            res.render('userEditForm', {
                                user: items,
                                message: "Server Error, Please Try Again"
                            });
                        }
                    });
                } else {
                    res.redirect(`/admin/${id}`);
                }
            });
        }  else if(suspend && !kycVerified) {
            User.findOneAndUpdate({_id: id}, {
                firstName: FName,
                lastName: LName,
                userName: userName,
                email: email,
                password: password,
                completed: completed,
                failed: failed,
                invested: invested,
                profit: profit,
                withdrawal: withdrawal,
                unsettledBalance: unsettled,
                referalBonus: referalBonus,
                kycVerified: false,
                verified: false
            }, null, (error, docs)=> {
                if(error) {
                    User.findOne({_id: id}, (err, items)=> {
                        if(err) {
                            res.render('adminForm', {message: "Server Error! Please Try Again"});
                        } else if(!items) {
                            res.render('adminForm', {message: "Server Error! Please Try Again"});
                        } else {
                            res.render('userEditForm', {
                                user: items,
                                message: "Server Error, Please Try Again"
                            });
                        }
                    });
                } else {
                    res.redirect(`/admin/${id}`);
                }
            });
        } else {
            User.findOneAndUpdate({_id: id}, {
                firstName: FName,
                lastName: LName,
                userName: userName,
                email: email,
                password: password,
                completed: completed,
                failed: failed,
                invested: invested,
                profit: profit,
                withdrawal: withdrawal,
                referalBonus: referalBonus,
                kycVerified: true,
                verified: false
            }, null, (error, docs)=> {
                if(error) {
                    User.findOne({_id: id}, (err, items)=> {
                        if(err) {
                            res.render('adminForm', {message: "Server Error! Please Try Again"});
                        } else if(!items) {
                            res.render('adminForm', {message: "Server Error! Please Try Again"});
                        } else {
                            res.render('userEditForm', {
                                user: items,
                                message: "Server Error, Please Try Again"
                            });
                        }
                    });
                } else {
                    res.redirect(`/admin/${id}`);
                }
            });
        }
    }
});

app.get('/edit-deposit/:depositId', (req, res)=> {
    const {depositId} = req.params;
    Deposit.findOne({_id: depositId}, (err, depositItems)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else if(!depositItems) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            User.findOne({_id: depositItems.userId}, (err, userDetails)=> {
                if(err) {
                    res.render('adminForm', {message: "Server Error! Please Try Again"});
                } else if(!userDetails) {
                    res.render('adminForm', {message: "Server Error! Please Try Again"});
                } else {
                    res.render('depositEditForm', {
                        user: userDetails,
                        message: "Edit User's Details",
                        depositDetails: depositItems
                    });
                }
            })
        }
    });
});
app.post('/edit-deposit/:depositId', (req, res)=> {
    const {depositId} = req.params;
    const {status} = req.body;

    const parameters = {
        depositId: depositId,
        status: status
    };
    console.log(status);
    Deposit.findOne({_id: depositId}, (err, depositItems)=> {
        if(err) {
            res.redirect('/admin-acess');
        } else if(!depositItems) {
            res.redirect('/admin-acess');
        } else {
            if(status === "Confirmed") {
                ActivePlan.findOne({userId: depositItems.userId, plan: depositItems.plan, amount: depositItems.amount, startDate: depositItems.startDate, endDate: depositItems.endDate}, (activeErr, activeItems)=> {
                    if(activeErr) {
                        res.redirect('/admin-acess');
                    } else if(!activeItems) {
                        const newActive = {
                            userId: depositItems.userId,
                            plan: depositItems.plan,
                            amount: depositItems.amount,
                            network: depositItems.network,
                            startDate: depositItems.startDate,
                            endDate: depositItems.endDate
                        };
                        User.findOne({_id: depositItems.userId}, (error, user)=> {
                            if(error) {
                                res.redirect('/admin-acess');
                            } else if(!user) {
                                res.redirect('/admin-acess');
                            } else {
                                sendDepositeVerification(newActive, user, parameters, res);
                            }
                        });
                    }
                });
            } else {
                Deposit.findOneAndUpdate({_id: depositId}, {
                    status: parameters.status
                }, null, (error, docs)=> {
                    if(err) {
                        console.log(error)
                        res.redirect(`/edit-deposit/${parameters.depositId}`);
                    } else {
                        res.redirect(`/admin-plan/${parameters.depositId}`);
                    }
                });
            }
        }
    });
});

const sendDepositeVerification = async (newActive, user, parameters, res) => {
    try {
        //mail options
        const mailOptions = {
            from: "admin@crypeleteinvestment.ltd",
            to: user.email,
            subject:"Deposit Confirmed",
            html: `<div>
            <p>Hey there <b>${user.firstName}</b>,</p>
            <p>This is to tell you that your deposit of <b>$${newActive.amount}</b> has been confirmed and your account would be credited as soon as possible. Do enjoy your plan with us.</p>
            <p>From all of us at <a href="https://crypeleteinvestment.ltd" style="text-decoration: none; color: #10eb89;">Crypelete Investment LTD.</a></p>
            </div>`
        };


        const newActivePlan = await new ActivePlan({
            userId: newActive.userId,
            plan: newActive.plan,
            amount: newActive.amount,
            network: newActive.network,
            startDate: newActive.startDate,
            endDate: newActive.endDate
        });
        //save active plan
        transporter.sendMail(mailOptions, (err, info)=> {
            if(err) {
                console.log(err);
                res.redirect('/admin-acess');
            } else {
                newActivePlan.save();
                Deposit.findOneAndUpdate({_id: parameters.depositId}, {
                    status: parameters.status
                }, null, (error, docs)=> {
                    if(err) {
                        console.log(error)
                        res.redirect(`/edit-deposit/${parameters.depositId}`);
                    } else {
                        res.redirect(`/admin-plan/${parameters.depositId}`);
                    }
                });
            }
        });
    }
    catch {
        res.redirect(`/edit-deposit/${parameters.depositId}`);
    }
};

app.get('/admin-plan/:planId', (req, res)=> {
    const {planId} = req.params;
    Deposit.findOne({_id: planId}, (err, deposit)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else if(!deposit) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            User.findOne({_id: deposit.userId}, (error, user)=> {
                if(error) {
                    res.render('adminForm', {message: "Server Error! Please Try Again!"});
                } else if(!user) {
                    res.render('adminForm', {message: "Server Error! Plase Try Again"});
                } else {
                    res.render('depositDetails', {
                        date: date,
                        prefix: "../",
                        deposit: deposit,
                        user: user
                    });
                }
            })
        }
    });
});

app.post('/delete-user', (req, res)=> {
    const {id} = req.body;
    User.findOneAndDelete({_id: id}, (err, docs)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.redirect('/admin-acess-users');
        }
    })
});

app.get('/admin-acess-deposit', (req, res)=> {
    Deposit.find({}, (err, items)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.render('depositsAdmin', {
                prefix: "",
                items: items,
                date: date
            });
        }
    })
});

app.post('/delete-deposit', (req, res)=> {
    const {id} = req.body;
    Deposit.findOneAndDelete({_id: id}, (err, docs)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.redirect('/admin-acess-users');
        }
    });
});

app.get('/admin-acess-active', (req, res)=> {
    ActivePlan.find({}, (err, items)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.render('adminActivePlans', {
                date: date,
                prefix: "",
                activePlans: items
            })
        }
    });
});

app.get('/admin-active/:activeId', (req, res)=> {
    const {activeId} = req.params;
    ActivePlan.findOne({_id: activeId}, (err, active)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else if(!active) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            User.findOne({_id: active.userId}, (error, user)=> {
                if(error) {
                    res.render('adminForm', {message: "Server Error! Please Try Again!"});
                } else if(!user) {
                    res.render('adminForm', {message: "Server Error! Plase Try Again"});
                } else {
                    res.render('activePlanDetails', {
                        date: date,
                        prefix: "../",
                        active: active,
                        user: user
                    });
                }
            })
        }
    });
});

app.post('/delete-active', (req, res)=> {
    const {id} = req.body;
    ActivePlan.findOneAndDelete({_id: id}, (err, docs)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.redirect('/admin-acess-users');
        }
    });
});

app.get('/admin-acess-pending', (req, res)=> {
    PendingWithdrawal.find({}, (err, items)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.render('PendingAdmin', {
                prefix: "",
                items: items,
                date: date
            });
        }
    })
});

app.get('/admin-pending/:pendingId', (req, res)=> {
    const {pendingId} = req.params;
    PendingWithdrawal.findOne({_id: pendingId}, (err, pending)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else if(!pending) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            User.findOne({_id: pending.userId}, (error, user)=> {
                if(error) {
                    res.render('adminForm', {message: "Server Error! Please Try Again!"});
                } else if(!user) {
                    res.render('adminForm', {message: "Server Error! Plase Try Again"});
                } else {
                    res.render('pendingAdminDetails', {
                        date: date,
                        prefix: "../",
                        pending: pending,
                        user: user
                    });
                }
            })
        }
    });
});

app.get('/edit-withdrawal/:pendingId', (req, res)=> {
    const {pendingId} = req.params;
    PendingWithdrawal.findOne({_id: pendingId}, (err, items)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else if(!items) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.render('withdrawalEditForm', {
                pending: items,
                message: "Edit Widrawal Details"
            });
        }
    });
});
app.post('/edit-withdrawal/:pendingId', (req, res)=> {
    const {id, amount, wallet, status} = req.body;
    if(amount == "" || wallet == "", status == "") {
        PendingWithdrawal.findOne({_id: id}, (err, items)=> {
            if(err) {
                res.render('adminForm', {message: "Server Error! Please Try Again"});
            } else if(!items) {
                res.render('adminForm', {message: "Server Error! Please Try Again"});
            } else {
                res.render('withdrawalEditForm', {
                    pending: items,
                    message: "Empty Values Not Allowed"
                });
            }
        });
    } else {
        PendingWithdrawal.findOneAndUpdate({_id: id}, {
            amount: amount,
            wallet: wallet,
            status: status
        }, null, (error, docs)=> {
            if(error) {
                PendingWithdrawal.findOne({_id: id}, (err, items)=> {
                    if(err) {
                        res.render('adminForm', {message: "Server Error! Please Try Again"});
                    } else if(!items) {
                        res.render('adminForm', {message: "Server Error! Please Try Again"});
                    } else {
                        res.render('withdrawalEditForm', {
                            pending: items,
                            message: "Server Error, Please Try Again"
                        });
                    }
                });
            } else {
                res.redirect(`/admin-pending/${id}`);
            }
        });
    }
});

app.post('/delete-pending', (req, res)=> {
    const {id} = req.body;
    PendingWithdrawal.findOneAndDelete({_id: id}, (err, docs)=> {
        if(err) {
            res.render('adminForm', {message: "Server Error! Please Try Again"});
        } else {
            res.redirect('/admin-acess-users');
        }
    });
});



let port = process.env.PORT;

app.listen(port || 4500, err => {
    if (err)
        throw err
    console.log('Server listening on port ' + port)
});
