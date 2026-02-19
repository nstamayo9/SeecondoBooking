const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit'); // Reuse your PDF logic
const SiteConfig = require('../models/SiteConfig.model');
const logger = require('../config/logger');

// 1. Setup Transporter
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper: Generate PDF Buffer (Modified version of your download controller)
const generatePdfBuffer = async (booking, config) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 45, size: 'A4' });
            let buffers = [];
            
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            // --- PDF GENERATION LOGIC (Simplified from your existing code) ---
            // You can copy-paste the exact drawing logic from booking.controller.js here
            // For brevity, I'm putting a simplified header
            
            doc.fontSize(18).text('GUEST REGISTRATION FORM', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Guest: ${booking.user.firstName} ${booking.user.lastName}`);
            doc.text(`Room: ${booking.room.name}`);
            doc.text(`Check-in: ${new Date(booking.checkInDate).toLocaleDateString()}`);
            doc.text(`Reference: ${booking._id}`);
            
            // Add more details here to match your download PDF...
            
            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

// 2. Send Pending + Admin Alert
exports.sendNewBookingEmails = async (booking) => {
    try {
        // A. Email to Guest
        const guestHtml = await ejs.renderFile(path.join(__dirname, '../views/emails/guest-pending.ejs'), {
            name: booking.user.firstName,
            roomName: booking.room.name,
            checkIn: new Date(booking.checkInDate).toLocaleDateString(),
            checkOut: new Date(booking.checkOutDate).toLocaleDateString(),
            totalPrice: booking.totalPrice.toLocaleString()
        });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: booking.user.email,
            subject: 'Booking Received - See Condo',
            html: guestHtml
        });

        // B. Email to Admin
        const adminHtml = await ejs.renderFile(path.join(__dirname, '../views/emails/admin-alert.ejs'), {
            name: `${booking.user.firstName} ${booking.user.lastName}`,
            phone: booking.guestPhone,
            roomName: booking.room.name,
            checkIn: new Date(booking.checkInDate).toLocaleDateString(),
            checkOut: new Date(booking.checkOutDate).toLocaleDateString(),
            totalPrice: booking.totalPrice.toLocaleString(),
            appUrl: process.env.APP_URL || 'http://localhost:3000'
        });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: process.env.ADMIN_EMAIL,
            subject: '🔔 New Booking Alert!',
            html: adminHtml
        });

        logger.info(`[Email] Sent Pending emails for Booking #${booking._id}`);

    } catch (error) {
        logger.error(`[Email Error] ${error.message}`);
    }
};

// 3. Send Confirmation + PDF Attachment
exports.sendConfirmationEmail = async (booking) => {
    try {
        const config = await SiteConfig.findOne();
        
        // Generate PDF in memory
        const pdfBuffer = await generatePdfBuffer(booking, config);

        const html = await ejs.renderFile(path.join(__dirname, '../views/emails/guest-confirmed.ejs'), {
            name: booking.user.firstName,
            roomName: booking.room.name
        });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: booking.user.email,
            subject: 'Booking Confirmed - Your Ticket Inside',
            html: html,
            attachments: [
                {
                    filename: `Ticket-${booking._id}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        });

        logger.info(`[Email] Sent Confirmation PDF to ${booking.user.email}`);

    } catch (error) {
        logger.error(`[Email Error] ${error.message}`);
    }
};