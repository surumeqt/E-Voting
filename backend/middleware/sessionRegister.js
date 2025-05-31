import { auth, db } from '../configs/admin.js';

const sessionRegister = async (req, res) => {
    const { idToken, fullName, district, contactNumber, userRole } = req.body;

    if (!idToken || !fullName || !district || !userRole) {
        return res.status(400).send('Bad Request: Missing required registration fields.');
    }

    try {
        // 1. Verify the ID token to get user UID and email
        const decodedIdToken = await auth.verifyIdToken(idToken);
        const uid = decodedIdToken.uid;
        const email = decodedIdToken.email;

        // 2. Save user data to Firestore
        // This is done AFTER client-side Firebase user creation
        await db.collection('users').doc(uid).set({
            uid: uid,
            email: email,
            fullName: fullName,
            district: district,
            contactNumber: contactNumber || null,
            role: userRole,
            isActive: true, // New users are active by default
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        }, { merge: true }); // Use merge to update if user already exists from auth

        console.log(`User ${uid} registered as ${userRole} and saved to Firestore.`);

        // 3. Create session cookie (same as login)
        const expiresIn = 60 * 60 * 24 * 7 * 1000; // 7 days
        const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

        const cookieOptions = {
            maxAge: expiresIn,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            path: '/'
        };
        res.cookie('__session', sessionCookie, cookieOptions);

        // 4. Populate Express Session
        req.session.userId = uid;
        req.session.userEmail = email;
        req.session.userRole = userRole;
        req.session.userName = fullName;
        req.session.userDistrict = district;

        console.log(`User ${uid} session created after registration.`);

        // 5. Send success response back to client
        return res.status(200).json({ success: true, role: userRole });

    } catch (error) {
        console.error('Error in sessionRegister middleware:', error);
        // Clear cookies/session on error
        res.clearCookie('__session');
        if (req.session) {
            req.session.destroy((err) => {
                if (err) console.error('Error destroying session on register fail:', err);
            });
        }
        return res.status(500).send('Server error during registration and session creation.');
    }
};

export default sessionRegister;