import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-storage.js';

const firebaseConfig = {
    apiKey: "AIzaSyClbIt-R3Vywa6E4NCz2jaESqpsOKnykD4",
    authDomain: "voting-system-d7349.firebaseapp.com",
    projectId: "voting-system-d7349",
    storageBucket: "voting-system-d7349.appspot.com",
    messagingSenderId: "224286551928",
    appId: "1:224286551928:web:c3023fe77d7dca6646a28d",
    measurementId: "G-HPET614SEY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };