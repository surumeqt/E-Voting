// E-Vote/backend/middleware/isAuthenticated.js

import { auth, db } from '../configs/admin.js';

const isAuthenticated = (roles = []) => {
    return async (req, res, next) => {
        const sessionCookie = req.cookies?.__session || '';

        if (!sessionCookie) {
            // No session cookie, redirect to login
            // Clear any lingering express-session data for good measure
            if (req.session) {
                req.session.destroy((err) => {
                    if (err) console.error('Error destroying session:', err);
                });
            }
            return res.redirect('/login');
        }

        try {
            const decodedClaims = await auth.verifySessionCookie(sessionCookie, true /* checkRevoked */);

            // --- CRUCIAL ADDITION HERE ---
            // Populate req.session with user data from the Firebase session cookie
            // This makes req.session consistent with the Firebase authentication
            req.session.userId = decodedClaims.uid;
            req.session.userEmail = decodedClaims.email;
            // You might need to add other claims if they exist, like userName
            // req.session.userName = decodedClaims.name || null; // If Firebase Auth provides a 'name' claim

            const userDocRef = db.collection('users').doc(decodedClaims.uid);
            const userDoc = await userDocRef.get();

            if (!userDoc.exists || !userDoc.data()?.role) {
                console.warn(`User profile not found or role missing for UID: ${decodedClaims.uid}`);
                res.clearCookie('__session');
                if (req.session) {
                    req.session.destroy((err) => {
                        if (err) console.error('Error destroying session:', err);
                    });
                }
                return res.status(403).redirect('/login');
            }

            const userRole = userDoc.data().role;
            const userData = userDoc.data();

            // Populate req.session with Firestore data
            req.session.userRole = userRole;
            req.session.userName = userData.fullName || null; // Assuming 'fullName' is the user's name in Firestore
            req.session.userDistrict = userData.district || null; // Assuming 'district' is stored in Firestore

            req.user = { // Also attach to req.user for current request's use
                ...decodedClaims,
                role: userRole,
                userName: userData.fullName,
                userDistrict: userData.district
            };

            // Check if user's role is allowed for this route
            if (roles.length > 0 && !roles.includes(userRole)) {
                console.warn(`Access Denied: User ${decodedClaims.uid} (Role: ${userRole}) attempted to access a protected route for roles: ${roles.join(', ')}`);
                return res.status(403).send(`Access Denied: You are not authorized to view this page. Your role is ${userRole}.`);
            }

            next();
        } catch (error) {
            console.error('Session cookie verification failed or revoked:', error);
            res.clearCookie('__session');
            if (req.session) {
                req.session.destroy((err) => {
                    if (err) console.error('Error destroying session:', err);
                });
            }
            // If the error indicates a revoked token, Firebase automatically handles it.
            // For other errors, ensure a clean redirect.
            return res.redirect('/login');
        }
    };
};

export default isAuthenticated;