module.exports = {
    ensureAuth: (req, res, next) => {
        if (req.isAuthenticated()) return next();
        res.redirect('/auth/login');
    },

    // STAFF+: Can Manage Bookings, View Calendar, Manual Book
    ensureStaff: (req, res, next) => {
        if (req.isAuthenticated() && ['staff', 'manager', 'admin', 'superadmin'].includes(req.user.role)) {
            return next();
        }
        res.status(403).render('error', { title: '403 Forbidden', message: 'Access Denied: Staff permission required.' });
    },

    // MANAGER+: Can Add Rooms, Create Promos, Generate Reports
    ensureManager: (req, res, next) => {
        if (req.isAuthenticated() && ['manager', 'admin', 'superadmin'].includes(req.user.role)) {
            return next();
        }
        res.status(403).render('error', { title: '403 Forbidden', message: 'Access Denied: Manager permission required.' });
    },

    // ADMIN+: Can Manage Users, Site Config
    ensureAdmin: (req, res, next) => {
        if (req.isAuthenticated() && ['admin', 'superadmin'].includes(req.user.role)) {
            return next();
        }
        res.status(403).render('error', { title: '403 Forbidden', message: 'Access Denied: Admin permission required.' });
    },

    // SUPERADMIN: Can create other Admins/Superadmins
    ensureSuperAdmin: (req, res, next) => {
        if (req.isAuthenticated() && req.user.role === 'superadmin') {
            return next();
        }
        res.status(403).render('error', { title: '403 Forbidden', message: 'Access Denied: Super Admin permission required.' });
    }
};