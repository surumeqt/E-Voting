// E-Vote/backend/middleware/sessionLogin.js

import { auth, db } from '../configs/admin.js'; // Adjust path if your admin.js is elsewhere

const sessionLogin = async (req, res) => {
    const idToken = req.body.idToken; // idToken should be a string, no need for .toString()
    // Define a longer expiration for the Firebase session cookie if desired
    // Firebase session cookies can be max 2 weeks (14 days)
    const expiresIn = 60 * 60 * 24 * 7 * 1000; // 7 days, for example (adjust as needed)

    if (!idToken) {
        console.error('sessionLogin error: No ID Token provided.');
        return res.status(400).send('Bad Request: ID Token is missing.');
    }

    try {
        // 1. Create the Firebase session cookie
        const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

        // 2. Verify the ID token to get user UID and claims
        const decodedIdToken = await auth.verifyIdToken(idToken);
        const uid = decodedIdToken.uid;
        const email = decodedIdToken.email;

        // 3. Fetch user data from Firestore to get role, name, district, isActive
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            console.error(`sessionLogin error: User profile not found in Firestore for UID: ${uid}`);
            // Clear any potential bad cookie and session before redirecting
            res.clearCookie('__session');
            if (req.session) {
                req.session.destroy((err) => {
                    if (err) console.error('Error destroying session on login fail:', err);
                });
            }
            return res.status(401).send('Unauthorized: User profile not found. Please register.');
        }

        const userData = userDoc.data();
        const userRole = userData.role;

        if (!userRole) {
            console.error(`sessionLogin error: User role missing for UID: ${uid}`);
            res.clearCookie('__session');
            if (req.session) {
                req.session.destroy((err) => {
                    if (err) console.error('Error destroying session on login fail:', err);
                });
            }
            return res.status(401).send('Unauthorized: User role is not defined. Please contact support.');
        }

        if (!userData.isActive) {
            console.warn(`sessionLogin warning: Deactivated account login attempt for UID: ${uid}`);
            res.clearCookie('__session');
            if (req.session) {
                req.session.destroy((err) => {
                    if (err) console.error('Error destroying session on login fail:', err);
                });
            }
            // You might want to sign out the user client-side here too if possible
            return res.status(403).send('Forbidden: Your account has been deactivated. Please contact administrator.');
        }

        // 4. Set the Firebase session cookie in the browser
        const cookieOptions = {
            maxAge: expiresIn,
            httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
            secure: process.env.NODE_ENV === 'production', // Use true for HTTPS in production
            sameSite: 'Lax', // 'Strict' or 'Lax' are good choices for security
            path: '/' // Cookie is valid for all paths on the domain
        };
        res.cookie('__session', sessionCookie, cookieOptions);

        // 5. Populate Express Session (req.session) for use by other middleware/routes
        // This is crucial for your /verifySession endpoint and isAuthenticated middleware
        req.session.userId = uid;
        req.session.userEmail = email; // Use email from decoded token
        req.session.userRole = userRole;
        req.session.userName = userData.fullName || decodedIdToken.name || 'User'; // Get from Firestore or token
        req.session.userDistrict = userData.district || null;

        console.log(`User ${uid} logged in as ${userRole}. Server-side session and cookie created.`);

        // 6. Send success response back to the client, including the role
        // The client-side login.js will then use this 'role' to decide where to redirect
        return res.status(200).json({ success: true, role: userRole });

    } catch (error) {
        console.error('Error in sessionLogin middleware:', error);
        // If session cookie verification fails or any other error, clear cookie and destroy session
        res.clearCookie('__session');
        if (req.session) {
            req.session.destroy((err) => {
                if (err) console.error('Error destroying session on login fail:', err);
            });
        }

        let errorMessage = 'Login failed due to server error. Please try again.';
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/session-cookie-revoked') {
            errorMessage = 'Session expired or revoked. Please log in again.';
        } else if (error.message.includes('User profile not found')) {
            errorMessage = error.message; // Propagate custom messages
        } else if (error.message.includes('Account has been deactivated')) {
            errorMessage = error.message;
        }

        return res.status(401).send(errorMessage); // Send a descriptive error
    }
};

export default sessionLogin;