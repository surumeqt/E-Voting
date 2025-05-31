import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { auth, db } from './configs/admin.js';

import isAuthenticated from './middleware/isAuthenticated.js';
import sessionLoginMiddleware from './middleware/sessionLogin.js';
import sessionRegisterMiddleware from './middleware/sessionRegister.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..');
const VIEWS_PATH = path.join(PROJECT_ROOT, 'views');
const PUBLIC_PATH = path.join(PROJECT_ROOT, 'public');


const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
    secret: process.env.SESSION_SECRET || 'your_super_secret_session_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/'
    },
}));

app.use(express.static(PUBLIC_PATH));


 
app.get('/api/candidates', isAuthenticated(['voter', 'admin']), async (req, res) => {
    try {
        const candidatesRef = db.collection('candidates');
        const snapshot = await candidatesRef.get();

        if (snapshot.empty) {
            return res.status(202).json([]);
        }

        const candidates = snapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
        }));

        res.status(200).json(candidates);

    } catch (error) {
        console.error('Error fetching candidates for API:', error);
        res.status(500).json({ message: 'Internal server error while fetching candidates.' });
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(VIEWS_PATH, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(VIEWS_PATH, 'register.html'));
});

app.post('/sessionLogin', sessionLoginMiddleware);
app.post('/sessionRegister', sessionRegisterMiddleware);
app.post('/sessionLogout', async (req, res) => {
    try {
        res.clearCookie('__session');
        if (req.session) {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Error destroying express session:', err);
                    return res.status(500).send('Server error during logout.');
                }
                console.log('User logged out. Session destroyed.');
                res.status(200).send('Logged out successfully.');
            });
        } else {
            res.status(200).send('Logged out successfully (no active session).');
        }
    } catch (error) {
        console.error('Error during session logout:', error);
        res.status(500).send('Server error during logout.');
    }
});

app.get('/verifySession', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            loggedIn: true,
            userId: req.session.userId,
            userRole: req.session.userRole,
            userEmail: req.session.userEmail,
            userName: req.session.userName,
            userDistrict: req.session.userDistrict
        });
    } else {
        res.json({ loggedIn: false });
    }
});


app.get('/api/admin/candidates', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('candidates').get();
        const candidates = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        res.status(200).json(candidates);
    } catch (error) {
        console.error('Error fetching admin candidates:', error);
        res.status(500).json({ message: 'Failed to fetch candidates.' });
    }
});

app.post('/api/admin/candidates', verifyAdmin, async (req, res) => {
    try {
        const newCandidate = req.body;
        if (!newCandidate.name || !newCandidate.position || !newCandidate.district) {
            return res.status(400).json({ message: 'Missing required candidate fields.' });
        }
        await db.collection('candidates').add(newCandidate);
        res.status(201).json({ message: 'Candidate added successfully.' });
    } catch (error) {
        console.error('Error adding candidate:', error);
        res.status(500).json({ message: 'Failed to add candidate.' });
    }
});

app.put('/api/admin/candidates/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        delete updatedData.votes;
        await db.collection('candidates').doc(id).update(updatedData);
        res.status(200).json({ message: 'Candidate updated successfully.' });
    } catch (error) {
        console.error('Error updating candidate:', error);
        res.status(500).json({ message: 'Failed to update candidate.' });
    }
});

app.delete('/api/admin/candidates/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('candidates').doc(id).delete();
        res.status(200).json({ message: 'Candidate deleted successfully.' });
    } catch (error) {
        console.error('Error deleting candidate:', error);
        res.status(500).json({ message: 'Failed to delete candidate.' });
    }
});


async function verifyAdmin(req, res, next) {
    if (req.session && req.session.userRole === 'admin') {
        next();
    } else {
        console.warn("Unauthorized admin API access attempt. User Role:", req.session ? req.session.userRole : 'Not logged in', "IP:", req.ip);
        res.status(403).json({ message: 'Access Denied: Admin privileges required.' });
    }
}

app.get('/api/admin/elections', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('elections').get();
        const elections = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        res.status(200).json(elections);
    } catch (error) {
        console.error('Error fetching elections:', error);
        res.status(500).json({ message: 'Failed to fetch elections.' });
    }
});

app.post('/api/admin/elections', verifyAdmin, async (req, res) => {
    try {
        const newElection = req.body;
        if (!newElection.name || !newElection.startDate || !newElection.endDate || !newElection.positions) {
            return res.status(400).json({ message: 'Missing required election fields.' });
        }
        await db.collection('elections').add(newElection);
        res.status(201).json({ message: 'Election added successfully.' });
    } catch (error) {
        console.error('Error adding election:', error);
        res.status(500).json({ message: 'Failed to add election.' });
    }
});

app.put('/api/admin/elections/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        await db.collection('elections').doc(id).update(updatedData);
        res.status(200).json({ message: 'Election updated successfully.' });
    } catch (error) {
        console.error('Error updating election:', error);
        res.status(500).json({ message: 'Failed to update election.' });
    }
});

app.delete('/api/admin/elections/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('elections').doc(id).delete();
        res.status(200).json({ message: 'Election deleted successfully.' });
    } catch (error) {
        console.error('Error deleting election:', error);
        res.status(500).json({ message: 'Failed to delete election.' });
    }
});


app.get('/api/admin/voters', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('users').where('role', '==', 'voter').get();
        const voters = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        res.status(200).json(voters);
    } catch (error) {
        console.error('Error fetching voters:', error);
        res.status(500).json({ message: 'Failed to fetch voters.' });
    }
});

app.put('/api/admin/voters/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        delete updatedData.role;
        delete updatedData.email;
        delete updatedData.password;
        await db.collection('users').doc(id).update(updatedData);
        res.status(200).json({ message: 'Voter updated successfully.' });
    } catch (error) {
        console.error('Error updating voter:', error);
        res.status(500).json({ message: 'Failed to update voter.' });
    }
});

app.delete('/api/admin/voters/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('users').doc(id).delete();
        res.status(200).json({ message: 'Voter deleted successfully.' });
    } catch (error) {
        console.error('Error deleting voter:', error);
        res.status(500).json({ message: 'Failed to delete voter.' });
    }
});

app.post('/api/admin/voters/:id/reset-vote', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { electionId } = req.body;

        if (!electionId) {
            return res.status(400).json({ message: 'Election ID is required to reset votes.' });
        }

        await runTransaction(db, async (transaction) => {
            const voterRef = db.collection('users').doc(id);
            const voterDoc = await transaction.get(voterRef);

            if (!voterDoc.exists()) {
                throw new Error('Voter not found.');
            }

            const voterData = voterDoc.data();
            const currentElectionVotes = voterData.votes?.[electionId];

            if (currentElectionVotes) {
                for (const key in currentElectionVotes) {
                    if (key.startsWith('votedCandidateId_')) {
                        const votedCandidateId = currentElectionVotes[key];
                        if (votedCandidateId) {
                            const candidateRef = db.collection('candidates').doc(votedCandidateId);
                            const candidateDoc = await transaction.get(candidateRef);
                            if (candidateDoc.exists()) {
                                const candidateData = candidateDoc.data();
                                const newVotes = Math.max(0, (candidateData.votes || 0) - 1);
                                transaction.update(candidateRef, { votes: newVotes });
                            }
                        }
                    }
                }
                const updatedVotes = { ...voterData.votes };
                delete updatedVotes[electionId];
                transaction.update(voterRef, { votes: updatedVotes });
            }
        });

        res.status(200).json({ message: `Voter ${id} votes for election ${electionId} reset successfully.` });
    } catch (error) {
        console.error('Error resetting voter vote:', error);
        res.status(500).json({ message: `Failed to reset voter vote: ${error.message}` });
    }
});

app.get('/api/admin/dashboard-stats', verifyAdmin, async (req, res) => {
    try {
        const totalVotersSnapshot = await db.collection('users').where('role', '==', 'voter').get();
        const totalCandidatesSnapshot = await db.collection('candidates').get();
        const activeElectionsSnapshot = await db.collection('elections').where('isActive', '==', true).get();

        let totalVotesCast = 0;
        totalCandidatesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            totalVotesCast += (data.votes || 0);
        });

        res.status(200).json({
            totalVoters: totalVotersSnapshot.size,
            totalCandidates: totalCandidatesSnapshot.size,
            activeElections: activeElectionsSnapshot.size,
            totalVotesCast: totalVotesCast
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Failed to fetch dashboard statistics.' });
    }
});

app.get('/voter', isAuthenticated(['voter']), (req, res) => {
    res.sendFile(path.join(VIEWS_PATH, 'voter.html'));
});

app.get('/candidate-profile', isAuthenticated(['candidate']), (req, res) => {
    res.sendFile(path.join(VIEWS_PATH, 'candidate.html'));
});

app.get('/admin', isAuthenticated(['admin']), (req, res) => {
    res.sendFile(path.join(VIEWS_PATH, 'admin.html'));
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(VIEWS_PATH, '404.html'));
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});