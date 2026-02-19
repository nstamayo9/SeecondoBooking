const Booking = require('../models/Booking.model');
const moment = require('moment'); // Ensure you have: npm install moment
const { Parser } = require('json2csv'); // Ensure you have: npm install json2csv
const PDFDocument = require('pdfkit');

exports.generateReport = async (req, res) => {
    try {
        const { dateRange, format, filterBy } = req.query;
        
        // 1. DATE PARSING
        let startDate, endDate;
        if (dateRange && dateRange.includes(' to ')) {
            const [startStr, endStr] = dateRange.split(' to ');
            startDate = new Date(startStr);
            endDate = new Date(endStr);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Default to today if no range selected
            startDate = new Date();
            startDate.setHours(0,0,0,0);
            endDate = new Date();
            endDate.setHours(23,59,59,999);
        }

        // 2. QUERY CONSTRUCTION
        let query = {
            // Include Confirmed AND Completed. Exclude Cancelled.
            status: { $in: ['confirmed', 'completed'] } 
        };

        // Filter by "Date Booked" (createdAt) or "Check-In"
        if (filterBy === 'booking_date') {
            query.createdAt = { $gte: startDate, $lte: endDate };
        } else {
            query.checkInDate = { $gte: startDate, $lte: endDate };
        }

        // 3. FETCH DATA
        const bookings = await Booking.find(query)
            .populate('user', 'firstName lastName')
            .populate('room', 'name')
            .populate('promoApplied', 'code name') // Fetch Promo details
            .sort({ createdAt: -1 });

        // 4. CALCULATE TOTALS
        let totalRevenue = 0; // Total Contract Price
        let totalCollected = 0; // Cash on Hand
        let totalCollectibles = 0; // Balance Due

        const reportData = bookings.map(b => {
            const paid = b.amountPaid || 0;
            const balance = b.totalPrice - paid;

            totalRevenue += b.totalPrice;
            totalCollected += paid;
            totalCollectibles += balance;

            return {
                dateBooked: moment(b.createdAt).format('YYYY-MM-DD'),
                guest: b.user ? `${b.user.firstName} ${b.user.lastName}` : 'Unknown',
                schedule: `${moment(b.checkInDate).format('MM/DD')} - ${moment(b.checkOutDate).format('MM/DD')}`,
                promoCode: b.promoApplied ? b.promoApplied.code : '-',
                promoName: b.promoApplied ? b.promoApplied.name : '-',
                refNumber: b.paymentRef || '-',
                total: b.totalPrice,
                paid: paid,
                balance: balance
            };
        });

        // ==========================================
        // A. CSV EXPORT
        // ==========================================
        if (format === 'csv') {
            const fields = [
                { label: 'Date Booked', value: 'dateBooked' },
                { label: 'Guest Name', value: 'guest' },
                { label: 'Schedule', value: 'schedule' },
                { label: 'Promo Code', value: 'promoCode' },
                { label: 'Promo Details', value: 'promoName' },
                { label: 'Ref #', value: 'refNumber' },
                { label: 'Total Amount', value: 'total' },
                { label: 'Cash Collected', value: 'paid' },
                { label: 'Balance (Collectible)', value: 'balance' }
            ];

            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(reportData);
            
            // Append Totals Row to CSV
            const totalsRow = `\nTOTALS,,,,,,${totalRevenue},${totalCollected},${totalCollectibles}`;
            
            res.header('Content-Type', 'text/csv');
            res.attachment(`Financial_Report_${moment().format('YYYYMMDD')}.csv`);
            return res.send(csv + totalsRow);
        }

        // ==========================================
        // B. PDF EXPORT (LANDSCAPE)
        // ==========================================
        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' }); 
            
            res.setHeader('Content-disposition', `attachment; filename="Financial_Report_${moment().format('YYYYMMDD')}.pdf"`);
            res.setHeader('Content-type', 'application/pdf');
            doc.pipe(res);

            // --- HEADER ---
            doc.fontSize(18).text(`Financial Report`, { align: 'center' });
            doc.fontSize(10).text(`Generated: ${moment().format('MMM DD, YYYY HH:mm')}`, { align: 'center' });
            doc.text(`Period: ${moment(startDate).format('MMM DD')} - ${moment(endDate).format('MMM DD, YYYY')}`, { align: 'center' });
            doc.moveDown(2);

            // --- TABLE LAYOUT (X Coordinates) ---
            // Total Width available ~780px
            const xDate = 30;
            const xGuest = 90;
            const xSched = 190;
            const xPromo = 290; // Code + Name
            const xRef = 440;
            const xTotal = 530;
            const xPaid = 610;
            const xBal = 690;

            let y = 110;

            // --- TABLE HEADERS ---
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text('Booked', xDate, y);
            doc.text('Guest', xGuest, y);
            doc.text('Schedule', xSched, y);
            doc.text('Promo Details', xPromo, y);
            doc.text('Ref #', xRef, y);
            doc.text('Total', xTotal, y, { width: 70, align: 'right' });
            doc.text('Collected', xPaid, y, { width: 70, align: 'right' });
            doc.text('Balance', xBal, y, { width: 70, align: 'right' });

            doc.moveTo(30, y + 12).lineTo(770, y + 12).stroke();
            y += 20;

            // --- TABLE ROWS ---
            doc.font('Helvetica').fontSize(8);

            reportData.forEach((row, i) => {
                // Zebra Striping
                if (i % 2 === 0) { 
                    doc.rect(30, y - 2, 740, 14).fill('#f5f5f5'); 
                    doc.fillColor('black'); 
                }

                // Page Break
                if (y > 500) { 
                    doc.addPage({ layout: 'landscape', margin: 30 }); 
                    y = 30; 
                }

                doc.text(row.dateBooked, xDate, y);
                doc.text(row.guest, xGuest, y, { width: 90, ellipsis: true });
                doc.text(row.schedule, xSched, y, { width: 90 });
                
                // Promo (Code - Name)
                const promoText = row.promoCode !== '-' ? `${row.promoCode} (${row.promoName})` : '-';
                doc.text(promoText, xPromo, y, { width: 140, ellipsis: true });
                
                doc.text(row.refNumber, xRef, y, { width: 80, ellipsis: true });

                // Financials
                doc.text(row.total.toLocaleString(), xTotal, y, { width: 70, align: 'right' });
                
                doc.fillColor('#198754'); // Green for Collected
                doc.text(row.paid.toLocaleString(), xPaid, y, { width: 70, align: 'right' });
                
                if(row.balance > 0) doc.fillColor('#dc3545'); // Red for Balance
                else doc.fillColor('#6c757d'); // Grey if 0
                
                doc.text(row.balance.toLocaleString(), xBal, y, { width: 70, align: 'right' });
                
                doc.fillColor('black'); // Reset color
                y += 16;
            });

            // --- TOTALS SECTION ---
            doc.moveDown();
            doc.moveTo(30, y).lineTo(770, y).stroke();
            y += 10;

            doc.font('Helvetica-Bold').fontSize(10);
            doc.text('GRAND TOTALS:', xRef, y, { align: 'right', width: 80 });
            
            doc.text(totalRevenue.toLocaleString(), xTotal, y, { align: 'right', width: 70 });
            doc.fillColor('#198754').text(totalCollected.toLocaleString(), xPaid, y, { align: 'right', width: 70 });
            doc.fillColor('#dc3545').text(totalCollectibles.toLocaleString(), xBal, y, { align: 'right', width: 70 });

            doc.end();
        }

    } catch (error) {
        console.error("Report Error:", error);
        res.status(500).send('Error generating report');
    }
};