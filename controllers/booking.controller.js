const Booking = require('../models/Booking.model');
const Room = require('../models/Room.model');
const User = require('../models/User.model');
const Promotion = require('../models/Promotion.model');
const SiteConfig = require('../models/SiteConfig.model');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const emailController = require('./email.controller');
const { updateBookingStatusValidationRules, updateBookingDetailsValidationRules, validate } = require('../Validator/booking.validator');

// ==========================================
// 1. AVAILABILITY LOGIC (Universal Overlap)
// ==========================================
exports.checkAvailability = async (req, res) => {
    try {
        const { roomId, checkIn, checkOut } = req.body;
        const newStart = new Date(checkIn);
        const newEnd = new Date(checkOut);

        const conflict = await Booking.findOne({
            room: roomId,
            status: { $in: ['pending', 'confirmed', 'completed'] },
            $and: [
                { checkInDate: { $lt: newEnd } }, // Existing starts before new ends
                { checkOutDate: { $gt: newStart } } // Existing ends after new starts
            ]
        });

        if (conflict) {
            return res.json({ available: false, message: 'Time slot conflict.' });
        }
        return res.json({ available: true });
    } catch (error) {
        res.status(500).json({ available: false, error: error.message });
    }
};

// ==========================================
// 2. STAFF MANUAL BOOKING
// ==========================================
exports.getManualBooking = async (req, res) => {
    try {
        const rooms = await Room.find({ isActive: true });
        
        // FETCH CONFIG
        const config = await SiteConfig.findOne(); 

        res.render('Staff/manual-booking', { 
            rooms, 
            user: req.user,
            config: config || { feeSmallRoom: 500, feeLargeRoom: 1000 } // Pass config with fallback
        });
    } catch (error) {
        res.status(500).send('Server Error');
    }
};

// @desc    Staff Manual Booking
exports.postManualBooking = async (req, res) => {
    try {
        const { 
            roomId, checkIn, checkOut, 
            guestFirstName, guestMiddleName, guestLastName, guestEmail, guestPhone, 
            guestIdType, guestIdNumber, guestDateOfBirth,
            specialRequests,
            compName, compAge, compGender, compContact, compDateOfBirth, 
            promoId, finalPrice, extraFee, 
            amountPaid 
        } = req.body;

        // --- FIX: VALIDATE REQUIRED FIELDS ---
        if (!guestPhone || guestPhone.trim() === "") {
            return res.send(`
                <script>
                    alert("Error: Guest Phone Number is required for manual bookings.");
                    window.history.back();
                </script>
            `);
        }

        if (!guestEmail || guestEmail.trim() === "") {
            return res.send(`
                <script>
                    alert("Error: Guest Email is required.");
                    window.history.back();
                </script>
            `);
        }
        // ---------------------------------------

        // 1. Fetch Room for Capacity Check
        const room = await Room.findById(roomId);
        if (!room) return res.send('Error: Room not found');

        // 2. Countable Guests Logic (Exclude Infants 0-1yr)
        let totalCountableGuests = 1; 

        if (guestDateOfBirth) {
            const dob = new Date(guestDateOfBirth);
            const ageDifMs = Date.now() - dob.getTime();
            const ageDate = new Date(ageDifMs);
            const age = Math.abs(ageDate.getUTCFullYear() - 1970);
            if (age < 2) totalCountableGuests = 0; 
        }

        if (compDateOfBirth) {
            const dobs = Array.isArray(compDateOfBirth) ? compDateOfBirth : [compDateOfBirth];
            dobs.forEach(dob => {
                if (dob) {
                    const birthDate = new Date(dob);
                    const today = new Date();
                    let age = today.getFullYear() - birthDate.getFullYear();
                    const m = today.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) { age--; }
                    if (age >= 2) { totalCountableGuests++; }
                } else {
                    totalCountableGuests++;
                }
            });
        }

        if (totalCountableGuests > room.capacity) {
            return res.send(`Error: Room capacity exceeded. Max is ${room.capacity}, but you have ${totalCountableGuests} countable guests.`);
        }

        // 3. Payment Validation (50% Rule)
        const totalAmount = parseFloat(finalPrice);
        const downpayment = parseFloat(amountPaid) || 0;
        
        if (downpayment < (totalAmount * 0.5)) {
            return res.send(`
                <script>
                alert("Error: Downpayment must be at least 50% (₱${(totalAmount * 0.5).toLocaleString()}). Booking NOT created.");
                window.history.back();
                </script>
            `);
        }

        // 4. Determine Payment Status
        let paymentStatus = 'unpaid';
        if (downpayment >= totalAmount) paymentStatus = 'paid';
        else if (downpayment > 0) paymentStatus = 'partial';

        // 5. Check for Overlap
        const conflict = await Booking.findOne({
            room: roomId,
            status: { $in: ['pending', 'confirmed', 'completed'] },
            $and: [{ checkInDate: { $lt: new Date(checkOut) } }, { checkOutDate: { $gt: new Date(checkIn) } }]
        });
        if (conflict) return res.send('Error: Room is already booked for these dates.');

        // 6. Handle User Account
        let user = await User.findOne({ email: guestEmail });
        if (!user) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('temp1234', salt);
            user = await User.create({
                firstName: guestFirstName,
                middleName: guestMiddleName,
                lastName: guestLastName,
                dateOfBirth: guestDateOfBirth,
                displayName: `${guestFirstName} ${guestLastName}`,
                email: guestEmail,
                password: hashedPassword,
                role: 'user'
            });
        }

        // 7. Handle Primary ID Image
        let primaryIdPath = '';
        if (req.files && req.files.length > 0) {
            const primaryFile = req.files.find(f => f.fieldname === 'primaryIdImage');
            if (primaryFile) primaryIdPath = primaryFile.path || '/uploads/' + primaryFile.filename;
        }

        // 8. Handle Companions
        let companionsList = [];
        if (compName) {
            const names = Array.isArray(compName) ? compName : [compName];
            const ages = Array.isArray(compAge) ? compAge : [compAge];
            const genders = Array.isArray(compGender) ? compGender : [compGender];
            const contacts = Array.isArray(compContact) ? compContact : [compContact];
            const dobs = Array.isArray(compDateOfBirth) ? compDateOfBirth : [compDateOfBirth];

            for (let i = 0; i < names.length; i++) {
                const fileKey = `compIdImage_${i}`;
                const compFile = req.files.find(f => f.fieldname === fileKey);
                const compIdPath = compFile ? (compFile.path || '/uploads/' + compFile.filename) : '';

                companionsList.push({
                    name: names[i],
                    dateOfBirth: dobs[i],
                    age: ages[i],
                    gender: genders[i],
                    contact: contacts[i],
                    idImage: compIdPath
                });
            }
        }

        // 9. Create Booking
        await Booking.create({
            user: user._id,
            room: roomId,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            totalPrice: totalAmount,
            amountPaid: downpayment,
            extraFee: extraFee || 0,
            promoApplied: promoId || null,
            guestPhone,
            guestIdType,
            guestIdNumber,
            guestIdImage: primaryIdPath,
            specialRequests,
            companions: companionsList,
            status: 'confirmed',
            paymentStatus: paymentStatus,
            adminNotes: `Manual booking by Staff: ${req.user.firstName}`
        });

        if (['admin', 'superadmin'].includes(req.user.role)) {
            res.redirect('/admin');
        } else {
            res.redirect('/staff/book?status=success');
        }

    } catch (error) {
        console.error(error);
        res.status(500).send('Manual booking failed: ' + error.message);
    }
};
// ==========================================
// 3. GUEST CHECKOUT & CONFIRM
// ==========================================
exports.getCheckout = async (req, res) => {
    try {
        const { roomId, checkIn, checkOut, guests, extraFee } = req.query;
        const room = await Room.findById(roomId);
        if (!room) return res.redirect('/');

        const nights = Math.ceil(Math.abs(new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
        const timeFee = parseInt(extraFee) || 0;
        const totalPrice = (nights * room.pricePerNight) + timeFee;

        res.render('Booking/checkout', {
            title: 'Checkout',
            room,
            bookingData: { checkIn, checkOut, guests, nights, totalPrice, extraFee: timeFee },
            user: req.user
        });
    } catch (error) {
        res.redirect('/');
    }
};

// @desc    Confirm Booking (With Transaction)
// @route   POST /booking/confirm
exports.postBooking = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction(); // START TRANSACTION

    try {
        const { 
            roomId, checkIn, checkOut, finalPrice, promoId, 
            guestPhone, specialRequests, extraFee, 
            compName, compAge, compGender, compContact, 
            compDateOfBirth 
        } = req.body;

        const newStart = new Date(checkIn);
        const newEnd = new Date(checkOut);

        // 1. FETCH ROOM & CHECK CAPACITY (Infant Exclusion Logic)
        const room = await Room.findById(roomId).session(session);
        if (!room) throw new Error('Room not found');

        let totalCountableGuests = 1; // Assume Primary Guest is Adult (Countable)

        // Check Companions
        if (compDateOfBirth) {
            const dobs = Array.isArray(compDateOfBirth) ? compDateOfBirth : [compDateOfBirth];
            
            dobs.forEach(dob => {
                if (dob) {
                    const birthDate = new Date(dob);
                    const today = new Date();
                    let age = today.getFullYear() - birthDate.getFullYear();
                    const m = today.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                        age--;
                    }
                    
                    // Only count if age is 2 or older
                    if (age >= 2) {
                        totalCountableGuests++;
                    }
                } else {
                    // No DOB provided? Assume Adult/Countable
                    totalCountableGuests++;
                }
            });
        }

        if (totalCountableGuests > room.capacity) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).send(`<h3>Error: Room Capacity Exceeded</h3><p>Max capacity is ${room.capacity}. You have ${totalCountableGuests} countable guests (excluding infants 0-1yr).</p><a href="/">Back</a>`);
        }

        // 2. ATOMIC CHECK: Check overlap INSIDE the transaction
        const conflict = await Booking.findOne({
            room: roomId,
            status: { $in: ['pending', 'confirmed', 'completed'] },
            $and: [
                { checkInDate: { $lt: newEnd } },
                { checkOutDate: { $gt: newStart } }
            ]
        }).session(session);

        if (conflict) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).send('<h3>Error: This room was just booked by another user. Please try again.</h3><a href="/">Back to Home</a>');
        }

        // 3. Handle Images (Cloudinary or Local)
        const primaryFile = req.files.find(f => f.fieldname === 'primaryIdImage');
        const primaryIdPath = primaryFile ? primaryFile.path : ''; 

        // 4. Process Companions
        let companionsList = [];
        if (compName) {
            const names = Array.isArray(compName) ? compName : [compName];
            const ages = Array.isArray(compAge) ? compAge : [compAge];
            const genders = Array.isArray(compGender) ? compGender : [compGender];
            const contacts = Array.isArray(compContact) ? compContact : [compContact];
            const dobs = compDateOfBirth ? (Array.isArray(compDateOfBirth) ? compDateOfBirth : [compDateOfBirth]) : [];
            
            const compFiles = req.files.filter(f => f.fieldname === 'compIdImage');

            for (let i = 0; i < names.length; i++) {
                companionsList.push({
                    name: names[i], 
                    age: ages[i], 
                    dateOfBirth: dobs[i] || null, 
                    gender: genders[i], 
                    contact: contacts[i],
                    idImage: compFiles[i] ? compFiles[i].path : '' 
                });
            }
        }

        // 5. Create Booking (Pass Session)
        await Booking.create([{
            user: req.user._id,
            room: roomId,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            totalPrice: finalPrice,
            extraFee: extraFee || 0,
            promoApplied: promoId || null,
            guestPhone,
            guestIdImage: primaryIdPath,
            specialRequests,
            companions: companionsList,
            status: 'pending',
            paymentStatus: 'unpaid'
        }], { session: session });

        // 6. Commit Transaction
        await session.commitTransaction();
        session.endSession();

        res.redirect('/dashboard');

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Booking Transaction Failed:", error);
        res.status(500).send('Booking failed due to server error.');
    }
};
// ==========================================
// 4. EDIT, CANCEL, DOWNLOAD
// ==========================================
exports.getEditBooking = async (req, res) => {
    try {
        const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id }).populate('room');
        if (!booking || booking.status !== 'pending') return res.redirect('/dashboard');
        res.render('Booking/edit', { title: 'Edit Booking', booking, room: booking.room, user: req.user });
    } catch (error) {
        res.redirect('/dashboard');
    }
};

exports.postEditBooking = async (req, res) => {
    try {
        const { guestPhone, specialRequests, compName, compAge, compGender, compContact } = req.body;
        const booking = await Booking.findById(req.params.id);
        if (!booking || booking.status !== 'pending') return res.send('Unauthorized');

        booking.guestPhone = guestPhone;
        booking.specialRequests = specialRequests;

        const primaryFile = req.files.find(f => f.fieldname === 'primaryIdImage');
        if (primaryFile) booking.guestIdImage = '/uploads/' + primaryFile.filename;

        let companionsList = [];
        if (compName) {
            const names = Array.isArray(compName) ? compName : [compName];
            const ages = Array.isArray(compAge) ? compAge : [compAge];
            const genders = Array.isArray(compGender) ? compGender : [compGender];
            const contacts = Array.isArray(compContact) ? compContact : [compContact];
            const compFiles = req.files.filter(f => f.fieldname === 'compIdImage');

            for (let i = 0; i < names.length; i++) {
                companionsList.push({
                    name: names[i], age: ages[i], gender: genders[i], contact: contacts[i],dateOfBirth: compDateOfBirth[i],
                    idImage: compFiles[i] ? '/uploads/' + compFiles[i].filename : (booking.companions[i] ? booking.companions[i].idImage : '')
                });
            }
        }
        booking.companions = companionsList;
        await booking.save();
        res.redirect('/dashboard');
    } catch (error) {
        res.status(500).send('Update failed');
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;
        const booking = await Booking.findOne({ _id: bookingId, user: req.user._id });
        if (!booking || booking.status !== 'pending') return res.status(400).send('Cannot cancel');
        
        booking.status = 'cancelled';
        await booking.save();
        res.redirect('/dashboard');
    } catch (error) {
        res.status(500).send('Error');
    }
};

// @desc    Download Booking PDF Ticket
// @route   GET /booking/download/:id
// @desc    Download Guest Registration Form PDF
exports.downloadBookingPDF = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id).populate('room').populate('user');
        if (!booking) return res.status(404).send('Booking not found');

        let config = await SiteConfig.findOne();
        if(!config) config = new SiteConfig();

        // --- 1. GUEST DATA PREPARATION ---
        let adults = 0;
        let kids = 0;
        let infants = 0;

        const allGuests = [];

        // A. Primary Guest
        allGuests.push({ 
            name: `${booking.user.firstName} ${booking.user.lastName}`, 
            age: 'Adult', 
            dob: booking.user.dateOfBirth ? new Date(booking.user.dateOfBirth) : null,
            type: 'ADULT'
        });
        adults++;

        // B. Companions
        if(booking.companions && booking.companions.length > 0) {
            booking.companions.forEach(comp => {
                const age = parseInt(comp.age) || 0;
                let type = 'ADULT';

                if (age <= 1) {
                    type = 'INFANT';
                    infants++;
                } else if (age >= 2 && age <= 12) {
                    type = 'KID';
                    kids++;
                } else {
                    adults++;
                }

                allGuests.push({
                    name: comp.name,
                    age: age.toString(),
                    dob: comp.dateOfBirth ? new Date(comp.dateOfBirth) : null,
                    type: type
                });
            });
        }

        // --- 2. PDF SETUP ---
        // 1 inch = 72 points. Setting top margin to 72.
        const doc = new PDFDocument({ margin: 45, size: 'A4' });
        res.setHeader('Content-disposition', `attachment; filename="GuestForm-${booking._id}.pdf"`);
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        // --- 3. HEADER & LOGOS ---
        const picoLogo = path.join(__dirname, '../public/images/picologo.png');
        const greenMistLogo = path.join(__dirname, '../public/images/greenmist.png');
        const signature = path.join(__dirname, '../public/images/Signature.png');

        // Y Position starts at 72 (1 inch)
        const logoY = 45; 
        
        // Logos
        if (fs.existsSync(picoLogo)) doc.image(picoLogo, 60, logoY, { width: 110 });
        if (fs.existsSync(greenMistLogo)) doc.image(greenMistLogo, 440, logoY, { width: 100 });

        // Header Text
        const headerTextY = logoY + 20;
        //doc.font('Helvetica-Bold').fontSize(10).text('PICO DE LORO COVE CONDOMINIUMS', 100, headerTextY, { align: 'center', width: 400 });
        doc.font('Helvetica').fontSize(8).text(config.propertyAddress, 100, headerTextY + 27, { align: 'center', width: 400 });
        doc.text(config.propertyTel, 100, headerTextY + 39, { align: 'center', width: 400 });

        // Title Box
        const titleY = headerTextY + 50;
        const titleBoxWidth = 400; // Renamed variable
        const titleBoxX = (595 - titleBoxWidth) / 2; 

        doc.rect(titleBoxX, titleY, titleBoxWidth, 20).fill('#333333');
        
        doc.fillColor('white').font('Helvetica-Bold').fontSize(16)
           .text('GUEST REGISTRATION FORM', titleBoxX, titleY + 5, { align: 'center', width: titleBoxWidth });
        
        doc.fillColor('black');

        // --- 4. INFO GRID ---
        let y = titleY + 30;
        const col1X = 30;
        const col2X = 300;
        const rowHeight = 18;
        const boxWidth = 535;

        doc.font('Helvetica-Bold').fontSize(8);

        function drawDoubleRow(label1, value1, label2, value2, yPos) {
            doc.rect(col1X, yPos, boxWidth, rowHeight).stroke();
            doc.moveTo(col2X, yPos).lineTo(col2X, yPos + rowHeight).stroke();
            doc.font('Helvetica-Bold').text(label1, col1X + 5, yPos + 5);
            doc.font('Helvetica').text(value1, col1X + 110, yPos + 5);
            doc.font('Helvetica-Bold').text(label2, col2X + 5, yPos + 5);
            doc.font('Helvetica').text(value2, col2X + 110, yPos + 5);
        }

        const checkIn = new Date(booking.checkInDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const checkOut = new Date(booking.checkOutDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        drawDoubleRow("UNIT OWNER'S NAME:", config.ownerName, "MEMBERSHIP NO.:", config.membershipNo, y);
        y += rowHeight;
        drawDoubleRow("CONDO UNIT:", booking.room.name, "ARRIVAL DATE:", checkIn, y);
        y += rowHeight;
        drawDoubleRow("RESIDENTIAL ADDRESS:", config.ownerAddress, "DEPARTURE DATE:", checkOut, y);
        y += rowHeight;
        drawDoubleRow("LANDLINE/MOBILE NO.:", config.ownerTel, "NO. OF ADULTS:", adults.toString(), y);
        y += rowHeight;
        drawDoubleRow("EMAIL ADDRESS:", config.ownerEmail, "NO. OF KIDS & INFANT:", (kids + infants).toString(), y);
        y += rowHeight;

        // --- 5. GUEST LIST TABLE ---
        y += 5;
        
        // Header
        doc.rect(col1X, y, boxWidth, 25).fill('#dddddd').stroke();
        doc.fillColor('black');
        doc.font('Helvetica-Bold').fontSize(8);
        
        doc.text("GUEST'S NAME", col1X + 20, y + 8);
        doc.text("RELATIONSHIP TO OWNER", 300, y + 4, { width: 80, align: 'center' });
        doc.text("DATE OF BIRTH", 400, y + 8, { width: 80, align: 'center' });
        doc.text("AGE", 490, y + 8, { width: 40, align: 'center' });
        
        y += 25;

        // Guest Rows (12 Rows Fixed)
        const totalRows = 12; 
        const guestRowHeight = 16; 

        for (let i = 0; i < totalRows; i++) {
            doc.rect(col1X, y, boxWidth, guestRowHeight).stroke();
            
            doc.font('Helvetica').text((i + 1).toString(), col1X + 5, y + 4);
            doc.moveTo(col1X + 20, y).lineTo(col1X + 20, y + guestRowHeight).stroke();

            if (i < allGuests.length) {
                const g = allGuests[i];
                doc.text(g.name, col1X + 25, y + 4);
                doc.moveTo(300, y).lineTo(300, y + guestRowHeight).stroke();
                doc.moveTo(400, y).lineTo(400, y + guestRowHeight).stroke();
                doc.moveTo(490, y).lineTo(490, y + guestRowHeight).stroke();
                doc.text('Guest', 300, y + 4, { width: 80, align: 'center' });
                if (g.dob) {
                    const dobStr = g.dob.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    doc.text(dobStr, 400, y + 4, { width: 80, align: 'center' });
                }
                doc.text(g.age, 490, y + 4, { width: 40, align: 'center' });
            } else {
                doc.moveTo(300, y).lineTo(300, y + guestRowHeight).stroke();
                doc.moveTo(400, y).lineTo(400, y + guestRowHeight).stroke();
                doc.moveTo(490, y).lineTo(490, y + guestRowHeight).stroke();
            }
            y += guestRowHeight;
        }

        y += 10;

        // --- 6. LEGAL TEXT TABLE ---
        const legalY = y;
        const halfWidth = boxWidth / 2; 
        const sectionHeight = 130; 
        const midY = legalY + (sectionHeight / 2); 
        
        // Outer Box & Vertical Divider
        doc.rect(col1X, legalY, boxWidth, sectionHeight).stroke();
        doc.moveTo(col1X + halfWidth, legalY).lineTo(col1X + halfWidth, legalY + sectionHeight).stroke();

        // TEXT CONTENT
        doc.font('Helvetica-Bold').fontSize(8);
        const pad = 5;
        const textWidth = halfWidth - 10;

        doc.text('Data Privacy and Protection', col1X + pad, legalY + pad, { underline: true });
        doc.font('Helvetica').fontSize(7).text(
            "I hereby authorize Pico de Loro Condominium Corporation, to collect and process the data indicated herein. I understand that my personal information is protected by RA 10173, Data Privacy Act of 2012, and that I am required by RA 11469, Bayanihan to Heal as One Act, to provide truthful information.",
            col1X + pad, legalY + 15, { width: textWidth, align: 'justify' }
        );

        doc.font('Helvetica-Bold').fontSize(8).text('Certificate of Non-Rental (Guest)', col1X + pad, midY + pad, { underline: true });
        doc.font('Helvetica').fontSize(7).text(
            `"We hereby certify that I/We have not rented the unit nor did I/We pay any fee in relation to my/our stay in the above unit. I understand that if Pico Condominium Corporation verifies otherwise and/or if violation/s in the existing guidelines are committed, then I/we may be ejected from the premises of Pico de Loro Cove and Hamilo Coast immediately."`,
            col1X + pad, midY + 15, { width: textWidth, align: 'justify' }
        );

        doc.font('Helvetica-Bold').fontSize(8).text('House Rules and Regulations Orientation', col1X + halfWidth + pad, legalY + pad, { underline: true });
        doc.font('Helvetica').fontSize(7).text(
            "This is to certify that I have oriented my guest(s) on the existing house rules and regulations of Pico de Loro Cove Condominium Corporation including the guidelines released in relation to COVID-19 and that any violations that will be committed by my guest(s) will be my liability to the Condominium Corporation.",
            col1X + halfWidth + pad, legalY + 15, { width: textWidth, align: 'justify' }
        );

        doc.font('Helvetica-Bold').fontSize(8).text('Certificate of Non-Rental (Owner)', col1X + halfWidth + pad, midY + pad,{ underline: true });
        doc.font('Helvetica').fontSize(7).text(
            `"I/We hereby certify that I/We have not leased the unit nor did I/We receive any form of payment in relation to my/our guest/s stay in my/our unit. I understand that if Pico Condominium Corporation verifies otherwise, then I will be subject to penalties set forth by PDLCCC including fines up to P100,000.00"`,
            col1X + halfWidth + pad, midY + 15, { width: textWidth, align: 'justify' }
        );

        y = legalY + sectionHeight + 5;

        // --- 7. SIGNATURES (CONNECTED BOXES) ---
        const sigBoxHeight = 40; 
        const labelBoxHeight = 20; 
        const rightSigX = col1X + halfWidth;

        // --- LEFT: Principal Guest ---
        doc.rect(col1X, y, halfWidth, sigBoxHeight).stroke();
        doc.rect(col1X, y + sigBoxHeight, halfWidth, labelBoxHeight).stroke();
        doc.font('Helvetica-Bold').fontSize(8).text("Principal Guest's Printed Name & Signature", col1X, y + sigBoxHeight + 6, { width: halfWidth, align: 'center' });

        // --- RIGHT: Unit Owner ---
        doc.rect(rightSigX, y, halfWidth, sigBoxHeight).stroke();
        
        if (fs.existsSync(signature)) {
            const imgWidth = 100;
            const imgX = rightSigX + (halfWidth - imgWidth) / 2;
            doc.image(signature, imgX, y + 2, { width: imgWidth, height: sigBoxHeight - 4, fit: [imgWidth, sigBoxHeight - 4] });
        }
        
        doc.rect(rightSigX, y + sigBoxHeight, halfWidth, labelBoxHeight).stroke();
        doc.font('Helvetica-Bold').fontSize(8).text("Unit Owner's/Tenant's Printed Name and Signature", rightSigX, y + sigBoxHeight + 6, { width: halfWidth, align: 'center' });

        doc.end();

    } catch (error) {
        console.error("PDF Error:", error);
        res.status(500).send('Error generating ticket');
    }
};