import { auth, db, storage } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-storage.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';


document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Elements ---
    const elements = {
        // Main Sections
        candidateProfileForm: document.getElementById('candidate-profile-form'),
        loggedOutSection: document.getElementById('logged-out-section'),

        // Form Inputs
        profileNameInput: document.getElementById('profile-name'),
        profileEmailInput: document.getElementById('profile-email'),
        profileDistrictInput: document.getElementById('profile-district'),
        profilePartyInput: document.getElementById('profile-party'),
        profilePositionSelect: document.getElementById('profile-position-select'), // CHANGED: Now a select element
        profileRunningMateInput: document.getElementById('profile-running-mate'),
        profilePlatformTextarea: document.getElementById('profile-platform'),
        profileIsActiveCheckbox: document.getElementById('profile-is-active'),

        // Photo Upload
        profilePhotoPreview: document.getElementById('profile-photo-preview'),
        profilePhotoUpload: document.getElementById('profile-photo-upload'),
        photoUploadStatus: document.getElementById('photo-upload-status'),

        // Buttons
        saveProfileButton: document.getElementById('save-profile-button'),
        logoutButton: document.getElementById('logout-button'),

        // Messages
        profileSuccessMessage: document.getElementById('profile-success-message'),
        profileErrorMessage: document.getElementById('profile-error-message'),
        profileLoadingMessage: document.getElementById('profile-loading-message'),
    };

    // Safely get spinner and text span for save button
    elements.saveButtonText = elements.saveProfileButton ? elements.saveProfileButton.querySelector('.button-text') : null;
    elements.saveButtonSpinner = elements.saveProfileButton ? elements.saveProfileButton.querySelector('.spinner') : null;

    // --- User Data from Session ---
    const userId = sessionStorage.getItem('userId');
    const userRole = sessionStorage.getItem('userRole');
    const userEmail = sessionStorage.getItem('userEmail');

    let currentPhotoURL = ''; // To store the existing photo URL

    // --- Constants ---
    const REDIRECT_DELAY = 1500; // milliseconds
    const MAX_PHOTO_SIZE_MB = 2; // 2MB
    const ELECTION_POSITIONS = ['Mayor', 'Vice-Mayor', 'Councillor']; // Define available positions (adjust as needed)


    // --- Helper Functions ---

    /**
     * Displays a message in a designated element.
     * @param {HTMLElement} element - The DOM element to display the message in.
     * @param {string} message - The message text.
     * @param {'success'|'error'|'info'|'loading'} type - Type of message for styling.
     * @param {number} [duration=5000] - Duration to display the message (ms). 0 for permanent.
     */
    function displayMessage(element, message, type, duration = 5000) {
        // Hide all main message boxes initially to prevent overlap
        [elements.profileSuccessMessage, elements.profileErrorMessage, elements.profileLoadingMessage, elements.photoUploadStatus]
            .forEach(msgBox => {
                if (msgBox) {
                    msgBox.style.display = 'none';
                    msgBox.textContent = '';
                }
            });

        if (!element) {
            console.warn(`Attempted to display message in a non-existent element for type: ${type}. Message: ${message}`);
            return;
        }

        element.textContent = message;
        element.classList.remove('loading-message', 'error-message', 'success-message', 'info-message');
        element.classList.add(`${type}-message`);
        element.style.display = 'block';

        if (duration > 0) {
            setTimeout(() => {
                element.style.display = 'none';
                element.textContent = '';
            }, duration);
        }
    }

    /**
     * Sets the loading state for the save profile button.
     * @param {boolean} isLoading - True to show loading, false otherwise.
     */
    function setSaveButtonLoading(isLoading) {
        if (!elements.saveProfileButton || !elements.saveButtonText || !elements.saveButtonSpinner) return;
        elements.saveProfileButton.disabled = isLoading;
        elements.saveButtonText.style.display = isLoading ? 'none' : 'inline';
        elements.saveButtonSpinner.style.display = isLoading ? 'inline-block' : 'none';
    }


    // --- Initial Access Control & Redirect ---
    async function enforceAccessControl() {
        if (!userId || userRole !== 'candidate') {
            elements.candidateProfileForm.style.display = 'none';
            elements.profileLoadingMessage.style.display = 'none';
            elements.loggedOutSection.style.display = 'block';

            const accessDeniedMessageElement = elements.loggedOutSection.querySelector('p') || elements.loggedOutSection;
            displayMessage(accessDeniedMessageElement,
                           'Access denied. Redirecting to login...', 'info', REDIRECT_DELAY);

            await new Promise(resolve => setTimeout(resolve, REDIRECT_DELAY));
            window.location.href = '/login';
            return false;
        }
        elements.loggedOutSection.style.display = 'none';
        elements.candidateProfileForm.style.display = 'block';
        return true;
    }

    // Immediately check access control
    if (!(await enforceAccessControl())) {
        return;
    }

    // --- Populate Position Dropdown ---
    function populatePositionSelect() {
        if (!elements.profilePositionSelect) return;

        // Clear existing options
        elements.profilePositionSelect.innerHTML = '<option value="">Select Position</option>';

        ELECTION_POSITIONS.forEach(position => {
            const option = document.createElement('option');
            option.value = position;
            option.textContent = position;
            elements.profilePositionSelect.appendChild(option);
        });
    }

    // ===========================================
    // --- LOAD CANDIDATE PROFILE ---
    // ===========================================
    async function loadCandidateProfile() {
        setSaveButtonLoading(true);
        displayMessage(elements.profileLoadingMessage, 'Loading profile...', 'loading', 0);
        elements.profileEmailInput.value = userEmail || '';

        // Populate the position select BEFORE loading data to ensure the option exists
        populatePositionSelect();

        try {
            const candidateDocRef = doc(db, 'candidates', userId);
            const docSnap = await getDoc(candidateDocRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                elements.profileNameInput.value = data.name || '';
                elements.profileDistrictInput.value = data.district || '';
                elements.profilePartyInput.value = data.party || '';
                elements.profilePositionSelect.value = data.position || ''; // Set selected value
                elements.profileRunningMateInput.value = data.runningMateName || '';
                elements.profilePlatformTextarea.value = data.platform || '';
                elements.profileIsActiveCheckbox.checked = data.isActive === true;

                currentPhotoURL = data.photoURL || 'https://via.placeholder.com/150?text=Upload+Photo';
                elements.profilePhotoPreview.src = currentPhotoURL;

                displayMessage(elements.profileSuccessMessage, 'Profile loaded successfully.', 'success');
            } else {
                displayMessage(elements.profileErrorMessage, 'No existing profile found. Please fill out your details.', 'info');
                elements.profileNameInput.value = sessionStorage.getItem('userName') || '';
                elements.profileIsActiveCheckbox.checked = false;
            }
        } catch (error) {
            console.error('Error loading candidate profile:', error);
            displayMessage(elements.profileErrorMessage, `Failed to load profile: ${error.message}`, 'error');
        } finally {
            elements.profileLoadingMessage.style.display = 'none';
            setSaveButtonLoading(false);
        }
    }

    // ===========================================
    // --- PHOTO UPLOAD HANDLING ---
    // ===========================================
    elements.profilePhotoUpload.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            elements.profilePhotoPreview.src = currentPhotoURL || 'https://via.placeholder.com/150?text=Upload+Photo';
            displayMessage(elements.photoUploadStatus, '', '');
            return;
        }

        if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
            displayMessage(elements.photoUploadStatus, `File size exceeds ${MAX_PHOTO_SIZE_MB}MB limit.`, 'error');
            elements.profilePhotoUpload.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            elements.profilePhotoPreview.src = e.target.result;
        };
        reader.readAsDataURL(file);

        displayMessage(elements.photoUploadStatus, 'Uploading photo...', 'loading', 0);
        setSaveButtonLoading(true);

        try {
            const storageRef = ref(storage, `candidate_photos/${userId}_${file.name}`);
            const uploadTask = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadTask.ref);

            currentPhotoURL = downloadURL;
            displayMessage(elements.photoUploadStatus, 'Photo uploaded successfully!', 'success');

            await updateDoc(doc(db, 'candidates', userId), { photoURL: downloadURL });

        } catch (error) {
            console.error('Error uploading photo:', error);
            displayMessage(elements.photoUploadStatus, `Photo upload failed: ${error.message}`, 'error');
            elements.profilePhotoPreview.src = currentPhotoURL || 'https://via.placeholder.com/150?text=Upload+Photo';
        } finally {
            setSaveButtonLoading(false);
            elements.photoUploadStatus.style.display = 'none';
        }
    });

    // ===========================================
    // --- SAVE CANDIDATE PROFILE ---
    // ===========================================
    elements.candidateProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        displayMessage(elements.profileSuccessMessage, '', 'success');
        displayMessage(elements.profileErrorMessage, '', 'error');

        const validationError = validateForm();
        if (validationError) {
            displayMessage(elements.profileErrorMessage, validationError, 'error');
            return;
        }

        setSaveButtonLoading(true);

        try {
            const candidateDocRef = doc(db, 'candidates', userId);
            const candidateData = {
                name: elements.profileNameInput.value.trim(),
                email: userEmail,
                district: elements.profileDistrictInput.value.trim(),
                party: elements.profilePartyInput.value.trim(),
                position: elements.profilePositionSelect.value.trim(), // CHANGED: Get value from select
                runningMateName: elements.profileRunningMateInput.value.trim() || null,
                platform: elements.profilePlatformTextarea.value.trim(),
                photoURL: currentPhotoURL,
                isActive: elements.profileIsActiveCheckbox.checked,
                lastUpdated: new Date().toISOString(),
                uid: userId
            };

            const docSnap = await getDoc(candidateDocRef);

            if (docSnap.exists()) {
                await updateDoc(candidateDocRef, candidateData);
            } else {
                await setDoc(candidateDocRef, { ...candidateData, votes: 0, registeredAt: new Date().toISOString() });
            }

            displayMessage(elements.profileSuccessMessage, 'Profile saved successfully!', 'success');

        } catch (error) {
            console.error('Error saving candidate profile:', error);
            let userFriendlyError = 'Failed to save profile. Please try again.';
            if (error.code === 'permission-denied') {
                userFriendlyError = 'Permission Denied: Check your security rules or ensure you are logged in correctly.';
            } else if (error.message) {
                userFriendlyError = error.message;
            }
            displayMessage(elements.profileErrorMessage, userFriendlyError, 'error');
        } finally {
            setSaveButtonLoading(false);
        }
    });


    // ===========================================
    // --- FORM VALIDATION ---
    // ===========================================
    function validateForm() {
        if (!elements.profileNameInput.value.trim()) return 'Candidate Name is required.';
        if (!elements.profileDistrictInput.value.trim()) return 'District is required.';
        if (!elements.profilePartyInput.value.trim()) return 'Party Affiliation is required.';
        if (!elements.profilePositionSelect.value.trim()) return 'Position Running For is required.'; // CHANGED: Validate select value
        if (!elements.profilePlatformTextarea.value.trim()) return 'Campaign Platform is required.';

        // Basic Regex validations (as defined in HTML patterns)
        if (!/^[A-Za-z\s.]{2,100}$/.test(elements.profileNameInput.value.trim())) return 'Name: 2-100 characters, letters, spaces, and periods only.';
        if (!/^[A-Za-z0-9\s-]{2,100}$/.test(elements.profileDistrictInput.value.trim())) return 'District: 2-100 characters, letters, numbers, spaces, and hyphens.';
        if (!/^[A-Za-z\s-]{2,100}$/.test(elements.profilePartyInput.value.trim())) return 'Party: 2-100 characters, letters, spaces, and hyphens.';
        // REMOVED: Regex for position input since it's now a select
        if (elements.profileRunningMateInput.value.trim() && !/^[A-Za-z\s.]{2,100}$/.test(elements.profileRunningMateInput.value.trim())) return 'Running Mate Name: 2-100 characters, letters, spaces, and periods only.';

        if (elements.profilePlatformTextarea.value.trim().length < 50 || elements.profilePlatformTextarea.value.trim().length > 1000) return 'Platform must be between 50 and 1000 characters.';

        return null;
    }


    // ===========================================
    // --- LOGOUT FUNCTIONALITY ---
    // ===========================================
    elements.logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            const response = await fetch('/sessionLogout', { method: 'POST' });
            if (!response.ok) {
                throw new Error('Server logout failed.');
            }
            sessionStorage.clear();
            alert('You have been logged out.');
            window.location.href = '/login';
        } catch (error) {
            console.error('Error during logout:', error);
            alert('Logout failed. Please try again.');
        }
    });

    // --- Initial Load ---
    loadCandidateProfile();
});