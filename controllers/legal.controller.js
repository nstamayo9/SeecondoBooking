const SiteConfig = require('../models/SiteConfig.model');

exports.getTerms = async (req, res) => {
    try {
        const config = await SiteConfig.findOne();
        res.render('Legal/page', { 
            title: 'Terms & Conditions', 
            content: config ? config.legalTerms : 'No content available.',
            user: req.user,
            config: config || {}
        });
    } catch (error) {
        res.status(500).send('Server Error');
    }
};

exports.getPrivacy = async (req, res) => {
    try {
        const config = await SiteConfig.findOne();
        res.render('Legal/page', { 
            title: 'Privacy Policy', 
            content: config ? config.legalPrivacy : 'No content available.',
            user: req.user,
            config: config || {}
        });
    } catch (error) {
        res.status(500).send('Server Error');
    }
};