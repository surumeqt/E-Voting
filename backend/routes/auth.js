import express from 'express';
import { auth, db } from '../configs/admin.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, fullName, role } = req.body;

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: fullName
    });

    await db.collection('users').doc(userRecord.uid).set({
      email,
      fullName,
      role,
      isActive: true,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({ message: 'User registered successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

export default router;
