// E-Vote/public/js/login.js

import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('remember-me');
    const loginButton = document.getElementById('login-button');
    const errorMessageElement = document.getElementById('error-message');
    const successMessageElement = document.getElementById('success-message');

    const buttonText = loginButton ? (loginButton.querySelector('.button-text') || loginButton) : null;
    const spinner = loginButton ? loginButton.querySelector('.spinner') : null;


    // --- Helper Functions ---
    function showMessage(element, message, type, duration = 5000) {
        if (!errorMessageElement || !successMessageElement) {
             console.warn("Message elements not found. Cannot display message:", message);
             return;
        }
        errorMessageElement.style.display = 'none';
        successMessageElement.style.display = 'none';
        errorMessageElement.textContent = '';
        successMessageElement.textContent = '';

        element.textContent = message;
        element.className = `message ${type}`;
        element.style.display = 'block';

        if (duration > 0) {
            setTimeout(() => {
                element.style.display = 'none';
                element.textContent = '';
            }, duration);
        }
    }

    function setLoading(isLoading) {
        if (!loginButton) return;
        loginButton.disabled = isLoading;
        if (spinner) {
            buttonText.style.display = isLoading ? 'none' : 'inline';
            spinner.style.display = isLoading ? 'inline-block' : 'none';
        } else {
            loginButton.textContent = isLoading ? 'Logging in...' : 'Login';
        }
    }

    function getFirebaseErrorMessage(errorCode) {
        switch (errorCode) {
            case 'auth/invalid-email': return 'Invalid email address format.';
            case 'auth/user-disabled': return 'This account has been disabled. Please contact administrator.';
            case 'auth/user-not-found': return 'No account found with this email. Please check your email or register.';
            case 'auth/wrong-password': return 'Incorrect password. Please try again.';
            case 'auth/invalid-credential': return 'Incorrect email or password. Please try again.';
            case 'auth/too-many-requests': return 'Too many failed login attempts. Please try again later.';
            case 'auth/network-request-failed': return 'Network error. Please check your internet connection.';
            default: return 'An unexpected error occurred during login. Please try again.';
        }
    }

    function validateInputs(email, password) {
        if (!email || !password) {
            return 'Please fill in all fields.';
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return 'Please enter a valid email address.';
        }
        if (password.length < 8) {
            return 'Password must be at least 8 characters long.';
        }
        return null;
    }

    // --- Initialization on DOM Load ---
    sessionStorage.clear(); // Clear any existing session storage on login page load

    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail && emailInput) { // Check if emailInput exists
        emailInput.value = rememberedEmail;
        if (rememberMeCheckbox) rememberMeCheckbox.checked = true; // Check if rememberMeCheckbox exists
    }

    // --- Event Listener for Login Form Submission ---
    if (loginForm) { // Ensure loginForm exists before adding event listener
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

            const validationError = validateInputs(email, password);
            if (validationError) {
                showMessage(errorMessageElement, validationError, 'error');
                return;
            }

            setLoading(true);

            try {
                // 1. Sign in user with Firebase Authentication
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // 2. Fetch user's profile from Firestore (to get isActive status primarily)
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                const userData = userDoc.data();

                if (!userData) {
                    throw new Error('User profile data not found in Firestore. Please contact support.');
                }
                // The server-side sessionLogin middleware now handles isActive check.
                // However, you could add a quick client-side check here for immediate feedback,
                // but the server will be the authoritative gatekeeper.
                // if (!userData.isActive) {
                //     throw new Error('This account has been deactivated. Please contact administrator.');
                // }


                // 3. Get Firebase ID Token for server-side session creation
                const idToken = await user.getIdToken();

                // 4. Send ID Token to your Express backend for session cookie creation
                const response = await fetch('/sessionLogin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken: idToken })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    // Firebase client-side sign-out if server-side session fails
                    await auth.signOut();
                    throw new Error(`Server session creation failed: ${errorText}`);
                }

                const responseData = await response.json(); // Expected: { success: true, role: 'voter' }

                // --- IMPORTANT CHANGE HERE ---
                // Now, the server response directly gives us the role.
                // Use this role to determine the redirect path.
                const userRole = responseData.role; // Get role from server response, not userData directly

                // 5. Store essential user info in sessionStorage for client-side use
                sessionStorage.setItem('userId', user.uid);
                sessionStorage.setItem('userEmail', user.email);
                sessionStorage.setItem('userRole', userRole); // Use role from server response
                sessionStorage.setItem('userName', userData.fullName || userData.name || '');
                sessionStorage.setItem('userDistrict', userData.district || '');
                // You might need to refetch hasVoted or assume default, or pass it from server if needed
                // sessionStorage.setItem('hasVoted', userData.hasVoted ? 'true' : 'false');

                // 6. Manage "Remember Me"
                if (rememberMe) {
                    localStorage.setItem('rememberedEmail', email);
                } else {
                    localStorage.removeItem('rememberedEmail');
                }

                // 7. Redirect based on user role
                let redirectPath = '';
                switch (userRole) { // Use userRole from server response
                    case 'admin':
                        redirectPath = '/admin'; // Use the protected Express route
                        break;
                    case 'candidate':
                        redirectPath = '/candidate-profile'; // Use the protected Express route
                        break;
                    case 'voter':
                        redirectPath = '/voter'; // Use the protected Express route
                        break;
                    default:
                        // If an unknown role, show error and log out
                        showMessage(errorMessageElement, 'Invalid user role. Please contact administrator.', 'error');
                        await fetch('/sessionLogout', { method: 'POST' }); // Force server-side logout
                        setLoading(false);
                        return;
                }

                showMessage(successMessageElement, `Login successful! Redirecting to ${userRole} dashboard...`, 'success', 1500);
                setTimeout(() => window.location.href = redirectPath, 1500);

            } catch (error) {
                console.error('Login process error:', error);
                // Handle specific Firebase Auth errors or general errors
                const userFacingMessage = error.code ? getFirebaseErrorMessage(error.code) : error.message || 'An unexpected error occurred during login.';
                showMessage(errorMessageElement, userFacingMessage, 'error');
                // Consider signing out of Firebase client-side if a server error occurred
                auth.signOut().catch(e => console.error("Error signing out Firebase client-side:", e));
            } finally {
                setLoading(false);
            }
        });
    }
});