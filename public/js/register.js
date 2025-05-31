import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('register-form');
    const fullNameInput = document.getElementById('full-name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const districtInput = document.getElementById('district');
    const contactNumberInput = document.getElementById('contact-number');
    const registerButton = document.getElementById('register-button');
    const errorMessageElement = document.getElementById('error-message');
    const successMessageElement = document.getElementById('success-message');

    const buttonText = registerButton ? (registerButton.querySelector('.button-text') || registerButton) : null;
    const spinner = registerButton ? registerButton.querySelector('.spinner') : null;

    const lengthRequirement = document.getElementById('length');
    const uppercaseRequirement = document.getElementById('uppercase');
    const lowercaseRequirement = document.getElementById('lowercase');
    const numberRequirement = document.getElementById('number');

    const togglePasswordButton = document.getElementById('toggle-password');

    function checkPasswordRequirements() {
        const password = passwordInput.value;

        // At least 8 characters
        if (password.length >= 8) {
            lengthRequirement.classList.add('valid');
            lengthRequirement.classList.remove('invalid');
        } else {
            lengthRequirement.classList.add('invalid');
            lengthRequirement.classList.remove('valid');
        }

        // One uppercase letter
        if (/[A-Z]/.test(password)) {
            uppercaseRequirement.classList.add('valid');
            uppercaseRequirement.classList.remove('invalid');
        } else {
            uppercaseRequirement.classList.add('invalid');
            uppercaseRequirement.classList.remove('valid');
        }

        // One lowercase letter
        if (/[a-z]/.test(password)) {
            lowercaseRequirement.classList.add('valid');
            lowercaseRequirement.classList.remove('invalid');
        } else {
            lowercaseRequirement.classList.add('invalid');
            lowercaseRequirement.classList.remove('valid');
        }

        // One number
        if (/[0-9]/.test(password)) {
            numberRequirement.classList.add('valid');
            numberRequirement.classList.remove('invalid');
        } else {
            numberRequirement.classList.add('invalid');
            numberRequirement.classList.remove('valid');
        }
    }

    // --- NEW: Toggle Password Visibility Function ---
    function togglePasswordVisibility() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        confirmPasswordInput.setAttribute('type', type); // Apply to confirm password as well for consistency
        this.textContent = (type === 'password') ? '👁️' : '🔒'; // Change icon
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', checkPasswordRequirements);
    } else {
        console.warn("Password input element not found for live validation.");
    }

    // New: Add event listener for toggle password button
    if (togglePasswordButton) {
        togglePasswordButton.addEventListener('click', togglePasswordVisibility);
    } else {
        console.warn("Toggle password button element not found.");
    }

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
        if (!registerButton) return;
        registerButton.disabled = isLoading;
        if (spinner) {
            buttonText.style.display = isLoading ? 'none' : 'inline';
            spinner.style.display = isLoading ? 'inline-block' : 'none';
        } else {
            registerButton.textContent = isLoading ? 'Registering...' : 'Register';
        }
    }

    function getFirebaseErrorMessage(errorCode) {
        switch (errorCode) {
            case 'auth/email-already-in-use': return 'This email is already registered. Please log in.';
            case 'auth/invalid-email': return 'Invalid email address format.';
            case 'auth/operation-not-allowed': return 'Email/password accounts are not enabled. Please contact support.';
            case 'auth/weak-password': return 'Password is too weak. It should be at least 8 characters.';
            case 'auth/network-request-failed': return 'Network error. Please check your internet connection.';
            default: return 'An unexpected error occurred during registration. Please try again.';
        }
    }

    function validateInputs(fullName, email, password, confirmPassword, district) {
        if (!fullName || !email || !password || !confirmPassword || !district) {
            return 'Please fill in all required fields.';
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return 'Please enter a valid email address.';
        }
        if (password.length < 8) {
            return 'Password must be at least 8 characters long.';
        }
        if (password !== confirmPassword) {
            return 'Passwords do not match.';
        }
        if (!/^[A-Za-z\s]{2,}$/.test(fullName)) {
            return 'Full Name: Only letters and spaces are allowed.';
        }
        if (!/^[A-Za-z0-9\s-]{2,}$/.test(district)) {
            return 'District: Only letters, numbers, spaces, and hyphens are allowed.';
        }
        return null;
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fullName = fullNameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            const district = districtInput.value.trim();
            const contactNumber = contactNumberInput.value.trim();

            const validationError = validateInputs(fullName, email, password, confirmPassword, district);
            if (validationError) {
                showMessage(errorMessageElement, validationError, 'error');
                return;
            }

            setLoading(true);

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                const idToken = await user.getIdToken();

                const response = await fetch('/sessionRegister', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        idToken: idToken,
                        fullName: fullName,
                        district: district,
                        contactNumber: contactNumber,
                        userRole: 'voter'
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    await user.delete().catch(err => console.error("Error deleting Firebase user:", err));
                    throw new Error(`Server registration failed: ${errorText}`);
                }

                const responseData = await response.json();

                sessionStorage.setItem('userId', user.uid);
                sessionStorage.setItem('userEmail', user.email);
                sessionStorage.setItem('userRole', responseData.role);
                sessionStorage.setItem('userName', fullName);
                sessionStorage.setItem('userDistrict', district);
                sessionStorage.setItem('hasVoted', 'false');

                showMessage(successMessageElement, 'Registration successful! Redirecting to voter profile...', 'success', 1500);

                setTimeout(() => window.location.href = '/voter', 1500);

            } catch (error) {
                console.error('Registration process error:', error);
                const userFacingMessage = error.code ? getFirebaseErrorMessage(error.code) : error.message || 'An unexpected error occurred during registration.';
                showMessage(errorMessageElement, userFacingMessage, 'error');
                auth.signOut().catch(e => console.error("Error signing out Firebase client-side:", e));
            } finally {
                setLoading(false);
            }
        });
    }
});