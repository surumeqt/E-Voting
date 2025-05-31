import express from 'express';
import { db } from '../configs/admin.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const candidatesSnapshot = await db.collection('candidates').where('isActive', '==', true).get();
    const candidates = [];
    candidatesSnapshot.forEach(doc => {
      candidates.push({ id: doc.id, ...doc.data() });
    });
    res.status(200).json(candidates);
  } catch (error) {
    console.error('Error fetching candidates:', error);
    res.status(500).json({ message: 'Error fetching candidates.', error: error.message });
  }
});

// You can add more routes here, e.g., to create, update, delete candidates (admin only)

export default router;