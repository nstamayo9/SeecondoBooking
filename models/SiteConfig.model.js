const mongoose = require('mongoose');

const SiteConfigSchema = new mongoose.Schema({
    heroTitle: { type: String, default: 'SEE CONDOMINIUMS' },
    heroSubtitle: { type: String, default: '@ PICO DE LORO' },
    heroDescription: { type: String, default: 'Luxury condos and rooms at affordable prices.' },
    contactNumber: { type: String, default: '0917-123-4567' },
    feeSmallRoom: { type: Number, default: 500 },
    feeLargeRoom: { type: Number, default: 1000 },
    heroImages: { type: [String], default: [] },

    aboutTitle: { type: String, default: 'About Us' },
    aboutDescription: { type: String, default: 'We provide the best staycation experience.' },
    aboutImage: { type: String, default: '' },

    // TICKET / FORM FIELDS
    ownerName: { type: String, default: 'JOANN SEE' },
    ownerEmail: { type: String, default: 'seecondorentals@gmail.com' },
    membershipNo: { type: String, default: '' },
    ownerAddress: { type: String, default: 'NASUGBU, BATANGAS' },
    ownerTel: { type: String, default: '+63 966 177 6818' },
    
    // HEADER INFO
    propertyAddress: { type: String, default: 'Pico de Loro Cove, Hamilo Coast, Nasugbu, Batangas' },
    propertyTel: { type: String, default: 'Tel No. (02) 8236-5959 local 3960' },

    // NEW: SOCIAL MEDIA LINKS
    socialFacebook: { type: String, default: '' },
    socialViber: { type: String, default: '' },
    socialInstagram: { type: String, default: '' },
    socialTiktok: { type: String, default: '' },
    
    // LEGAL & COMPLIANCE
    legalTerms: { type: String, default: 'Standard Terms and Conditions apply.' },
    legalPrivacy: { type: String, default: 'We value your privacy and protect your data.' },
    
    videoUrl: { type: String, default: '' } 
    
    
}, { timestamps: true });

module.exports = mongoose.model('SiteConfig', SiteConfigSchema);