// E-Vote/backend/configs/admin.js
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to service-account.json assuming it's in the E-Vote/ root
const serviceAccountPath = path.resolve(__dirname, '../../service-account.json');

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://voting-system-d7349.firebaseio.com'
});

const db = admin.firestore();
const auth = admin.auth();

export { db, auth };