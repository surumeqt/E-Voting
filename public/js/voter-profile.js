// E-Vote/public/js/voter-profile.js

import { auth, db } from './firebase-config.js';
import { doc, getDoc, runTransaction, updateDoc } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- DOM Elements ---
    const elements = {
        // Main Sections
        mainContainer: document.querySelector('.main-container'),
        loggedOutSection: document.getElementById('logged-out-section'),

        // Tab Navigation
        tabButtons: document.querySelectorAll('.tab-button[data-tab]'),
        contentSections: document.querySelectorAll('.content-section'),

        // Vote Section
        voteSection: document.getElementById('vote-section'),
        electionTypeSelect: document.getElementById('election-type-select'),
        candidateListContainer: document.getElementById('candidate-list'),
        voterDistrictDisplay: document.getElementById('voter-district-display'),
        electionInfoDisplay: document.getElementById('election-info'),
        voteLoadingMessage: document.getElementById('vote-loading-section'),
        voteErrorMessage: document.getElementById('vote-error-section'),
        noCandidatesMessage: document.getElementById('no-candidates-section'),
        alreadyVotedMessage: document.getElementById('already-voted-section'),

        // Profile Section
        profileSection: document.getElementById('profile-section'),
        voterProfileForm: document.getElementById('voter-profile-form'),
        profileFullNameInput: document.getElementById('profile-full-name'),
        profileEmailInput: document.getElementById('profile-email'),
        profileDistrictInput: document.getElementById('profile-district'),
        profileContactNumberInput: document.getElementById('profile-contact-number'),
        saveVoterProfileButton: document.getElementById('save-voter-profile-button'),
        profileSuccessMessage: document.getElementById('profile-success-message'),
        profileErrorMessage: document.getElementById('profile-error-message'),

        // Common Buttons
        logoutButton: document.getElementById('logout-button'),
    };

    // Safely get spinner and text span for profile save button
    elements.saveButtonText = elements.saveVoterProfileButton ? elements.saveVoterProfileButton.querySelector('.button-text') : null;
    elements.saveButtonSpinner = elements.saveVoterProfileButton ? elements.saveVoterProfileButton.querySelector('.spinner') : null;

    // --- User Data from Session (Set by server-side sessionLogin) ---
    const userId = sessionStorage.getItem('userId');
    const userRole = sessionStorage.getItem('userRole');
    let voterDistrict = sessionStorage.getItem('userDistrict'); // Will be updated if profile is edited

    // --- Constants ---
    const CURRENT_ELECTION_ID = 'municipal_election_2025'; // Make sure this matches backend/admin configuration
    const REDIRECT_DELAY = 1500; // milliseconds
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
        // Hide all main message boxes first to prevent overlap
        [elements.voteLoadingMessage, elements.voteErrorMessage, elements.noCandidatesMessage,
         elements.alreadyVotedMessage, elements.profileSuccessMessage, elements.profileErrorMessage]
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
        element.className = `message-box ${type}-message`;
        element.style.display = 'block';

        if (duration > 0) {
            setTimeout(() => {
                element.style.display = 'none';
                element.textContent = '';
            }, duration);
        }
    }

    /**
     * Sets the loading state for a button with text and spinner.
     * @param {HTMLElement} button - The button element.
     * @param {HTMLElement} textSpan - The span holding the button text.
     * @param {HTMLElement} spinner - The spinner element.
     * @param {boolean} isLoading - True to show loading, false otherwise.
     */
    function setButtonLoading(button, textSpan, spinner, isLoading) {
        if (!button || !textSpan || !spinner) return;
        button.disabled = isLoading;
        textSpan.style.display = isLoading ? 'none' : 'inline';
        spinner.style.display = isLoading ? 'inline-block' : 'none';
    }


    // --- Initial Access Control & Redirect ---
    async function enforceAccessControl() {
        try {
            const sessionCheck = await fetch('/verifySession');
            const sessionData = await sessionCheck.json();

            if (!sessionData.loggedIn || sessionData.userRole !== 'voter') {
                console.warn("Session invalid or not voter. Redirecting to login.");
                elements.mainContainer.style.display = 'none';
                elements.loggedOutSection.style.display = 'block';
                displayMessage(elements.loggedOutSection.querySelector('p') || elements.loggedOutSection,
                               'Access denied. Redirecting to login...', 'info', REDIRECT_DELAY);
                await new Promise(resolve => setTimeout(resolve, REDIRECT_DELAY));
                window.location.href = '/login';
                return false;
            }
            // Update local session data with server-verified data
            sessionStorage.setItem('userId', sessionData.userId);
            sessionStorage.setItem('userRole', sessionData.userRole);
            sessionStorage.setItem('userEmail', sessionData.userEmail);
            sessionStorage.setItem('userName', sessionData.userName);
            sessionStorage.setItem('userDistrict', sessionData.userDistrict);
            voterDistrict = sessionData.userDistrict; // Update local variable

            elements.loggedOutSection.style.display = 'none';
            elements.mainContainer.style.display = 'flex';
            return true;

        } catch (error) {
            console.error("Error during session enforcement:", error);
            elements.mainContainer.style.display = 'none';
            elements.loggedOutSection.style.display = 'block';
            displayMessage(elements.loggedOutSection.querySelector('p') || elements.loggedOutSection,
                           'Error verifying session. Redirecting to login...', 'error', REDIRECT_DELAY);
            await new Promise(resolve => setTimeout(resolve, REDIRECT_DELAY));
            window.location.href = '/login';
            return false;
        }
    }

    if (!(await enforceAccessControl())) {
        return; // Stop execution if access is denied
    }

    // --- Populate Election Type Dropdown ---
    // Moved outside to be called only once
    function populateElectionTypeSelect() {
        if (!elements.electionTypeSelect) return;

        // Clear existing options, but ONLY if they are not the initial "Select Position"
        // This is safe to do every time, as the event listener will be attached once.
        elements.electionTypeSelect.innerHTML = '<option value="">Select Position</option>';

        ELECTION_POSITIONS.forEach(position => {
            const option = document.createElement('option');
            option.value = position;
            option.textContent = position;
            elements.electionTypeSelect.appendChild(option);
        });
        // The event listener for 'change' will be attached ONCE below
    }

    // Attach the change event listener for the election type dropdown ONCE
    if (elements.electionTypeSelect) {
        elements.electionTypeSelect.addEventListener('change', () => {
            const selectedPosition = elements.electionTypeSelect.value;
            if (selectedPosition) {
                loadCandidates(selectedPosition);
            } else {
                elements.candidateListContainer.innerHTML = ''; // Clear candidates if nothing is selected
                displayMessage(elements.noCandidatesMessage, 'Please select an election position to view candidates.', 'info', 0);
            }
        });
    }


    // --- Tab Switching Logic ---
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            elements.tabButtons.forEach(btn => btn.classList.remove('active'));
            elements.contentSections.forEach(section => section.classList.add('hidden'));

            button.classList.add('active');
            document.getElementById(targetTab).classList.remove('hidden');

            if (targetTab === 'vote-section') {
                populateElectionTypeSelect(); // Repopulate dropdown to ensure it's fresh
                // IMPORTANT: Do NOT call loadCandidates directly here based on a *default* value
                // because the user might have already selected something and it's already displayed.
                // The `change` event listener on `electionTypeSelect` will handle subsequent selections.
                // If you want to load candidates for the *previously selected* value when returning
                // to the tab, you'd do it here:
                if (elements.electionTypeSelect.value) {
                    loadCandidates(elements.electionTypeSelect.value);
                } else {
                    elements.candidateListContainer.innerHTML = '';
                    displayMessage(elements.noCandidatesMessage, 'Please select an election position to view candidates.', 'info', 0);
                }
            } else if (targetTab === 'profile-section') {
                loadVoterProfile();
            }
        });
    });

    // ===========================================
    // --- VOTE SECTION FUNCTIONS ---
    // ===========================================

    /**
     * Checks if the voter has already voted for a specific position in the current election.
     * @param {string} position - The election position (e.g., 'Mayor', 'President').
     * @returns {boolean} - True if voter has voted for this position, false otherwise.
     */
    async function hasVotedForPosition(position) {
        try {
            const voterDocRef = doc(db, 'users', userId);
            const voterSnap = await getDoc(voterDocRef);
            if (voterSnap.exists()) {
                const data = voterSnap.data();
                // Check if voted for THIS election ID and THIS position
                return data.votes &&
                       data.votes[CURRENT_ELECTION_ID] &&
                       data.votes[CURRENT_ELECTION_ID][position] === true;
            }
            return false;
        } catch (error) {
            console.error('Error checking voter status for position:', position, error);
            displayMessage(elements.voteErrorMessage, `Failed to verify voting status for ${position}: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Fetches and displays candidates for the voter's district and selected position.
     * @param {string} selectedPosition - The election position (e.g., 'Mayor').
     */
    async function loadCandidates(selectedPosition) {
        if (!selectedPosition) {
            elements.candidateListContainer.innerHTML = '';
            displayMessage(elements.noCandidatesMessage, 'Please select an election position to view candidates.', 'info', 0);
            return;
        }

        displayMessage(elements.voteLoadingMessage, `Loading candidates for ${selectedPosition}...`, 'loading', 0);
        elements.candidateListContainer.innerHTML = ''; // Clear previous candidates - THIS IS CRUCIAL AND ALREADY IN PLACE

        try {
            const hasVoted = await hasVotedForPosition(selectedPosition);
            console.log(`Voter has voted for ${selectedPosition}: ${hasVoted}`);

            elements.candidateListContainer.style.pointerEvents = hasVoted ? 'none' : 'auto';
            elements.candidateListContainer.style.opacity = hasVoted ? '0.6' : '1';

            if (hasVoted) {
                displayMessage(elements.alreadyVotedMessage, `Thank you for voting! You have already cast your vote for ${selectedPosition} in this election.`, 'info', 0);
            } else {
                elements.alreadyVotedMessage.style.display = 'none'; // Hide if not voted
            }

            elements.voterDistrictDisplay.textContent = voterDistrict || 'Not set. Please update your profile.';
            elements.electionInfoDisplay.textContent = `Current Election: ${CURRENT_ELECTION_ID}`;

            const response = await fetch('/api/candidates');

            const contentType = response.headers.get('content-type');

            if (response.redirected || (contentType && !contentType.includes('application/json'))) {
                console.error("Received non-JSON response (likely HTML redirect/error page). Redirecting to login.");
                displayMessage(elements.voteErrorMessage, 'Your session expired. Redirecting to login...', 'error', REDIRECT_DELAY);
                await new Promise(resolve => setTimeout(resolve, REDIRECT_DELAY));
                window.location.href = '/login';
                return;
            }

            if (!response.ok) {
                let errorData = {};
                try {
                    errorData = await response.json();
                } catch (jsonError) {
                    errorData.message = await response.text();
                    console.error("Non-JSON error response from /api/candidates:", errorData.message);
                }
                throw new Error(errorData.message || `Server error: ${response.status} ${response.statusText}`);
            }

            const candidates = await response.json();
            const filteredCandidates = candidates.filter(c =>
                c.district === voterDistrict &&
                c.isActive === true &&
                c.position === selectedPosition
            );

            if (filteredCandidates.length === 0) {
                displayMessage(elements.noCandidatesMessage, `No eligible candidates found for ${selectedPosition} in your district at this time.`, 'info', 0);
                return;
            }

            filteredCandidates.sort((a, b) => {
                if (a.ballotOrder !== undefined && b.ballotOrder !== undefined) {
                    return a.ballotOrder - b.ballotOrder;
                }
                return (a.name || '').localeCompare(b.name || '');
            });

            filteredCandidates.forEach(candidate => {
                const photoSrc = candidate.photoURL && candidate.photoURL.startsWith('http')
                    ? candidate.photoURL
                    : 'https://via.placeholder.com/200?text=No+Photo';

                const candidateCard = document.createElement('div');
                candidateCard.classList.add('candidate-card');
                candidateCard.innerHTML = `
                    <img src="${photoSrc}" alt="${candidate.name}'s photo">
                    <div class="candidate-info">
                        <h3>${candidate.name}</h3>
                        <p><strong>Party:</strong> ${candidate.party || 'Independent'}</p>
                        <p><strong>District:</strong> ${candidate.district || 'N/A'}</p>
                        <p><strong>Position:</strong> ${candidate.position || 'N/A'}</p>
                        ${candidate.runningMateName ? `<p><strong>Running Mate:</strong> ${candidate.runningMateName}</p>` : ''}
                        <p class="platform-excerpt">
                            ${candidate.platform ? candidate.platform : 'No platform statement provided.'}
                        </p>
                        <button class="vote-button" data-candidate-uid="${candidate.uid}" data-candidate-position="${candidate.position}" ${hasVoted ? 'disabled' : ''}>
                            <span class="button-text">Vote for ${candidate.name}</span>
                            <div class="spinner" style="display: none;"></div>
                        </button>
                    </div>
                `;
                elements.candidateListContainer.appendChild(candidateCard);
            });

            if (!hasVoted) {
                document.querySelectorAll('.vote-button').forEach(button => {
                    const textSpan = button.querySelector('.button-text');
                    const spinner = button.querySelector('.spinner');
                    // Ensure previous listeners are removed to prevent multiple firings
                    // (though this is more for vote buttons, the main culprit is the dropdown listener)
                    // For vote buttons, it's safer to ensure they are added only once per card.
                    // This is handled by clearing innerHTML above.
                    button.addEventListener('click', (event) => handleVote(event, button, textSpan, spinner));
                });
            }

        } catch (error) {
            console.error('Error loading candidates:', error);
            if (error.message.includes("Unexpected token '<'") || error.message.includes("is not valid JSON")) {
                   displayMessage(elements.voteErrorMessage, `Failed to load candidates due to a session issue. Please log in again.`, 'error');
                   console.warn("Possible session expiry/redirect detected. Consider a full page reload or login redirect.");
            } else {
                displayMessage(elements.voteErrorMessage, `Failed to load candidates: ${error.message}`, 'error');
            }
        } finally {
            elements.voteLoadingMessage.style.display = 'none';
        }
    }


    /**
     * Handles vote submission using a Firestore transaction.
     * @param {Event} event - The click event.
     * @param {HTMLElement} button - The clicked vote button.
     * @param {HTMLElement} textSpan - The text span within the button.
     * @param {HTMLElement} spinner - The spinner within the button.
     */
    async function handleVote(event, button, textSpan, spinner) {
        event.preventDefault();
        displayMessage(elements.voteErrorMessage, '', 'error');

        const candidateUid = button.dataset.candidateUid;
        const candidatePosition = button.dataset.candidatePosition;
        if (!candidateUid || !candidatePosition) {
            displayMessage(elements.voteErrorMessage, 'Invalid candidate or position selected.', 'error');
            return;
        }

        const allVoteButtons = document.querySelectorAll('.vote-button');
        allVoteButtons.forEach(btn => btn.disabled = true);
        setButtonLoading(button, textSpan, spinner, true);

        try {
            await runTransaction(db, async (transaction) => {
                const candidateRef = doc(db, 'candidates', candidateUid);
                const voterRef = doc(db, 'users', userId);

                const [candidateDoc, voterDoc] = await Promise.all([
                    transaction.get(candidateRef),
                    transaction.get(voterRef)
                ]);

                if (!candidateDoc.exists()) throw new Error('Candidate not found.');
                if (!voterDoc.exists()) throw new Error('Voter profile not found.');

                const voterData = voterDoc.data();
                const candidateData = candidateDoc.data();

                if (voterData.votes && voterData.votes[CURRENT_ELECTION_ID] && voterData.votes[CURRENT_ELECTION_ID][candidatePosition] === true) {
                    throw new Error(`You have already cast your vote for ${candidatePosition} in this election.`);
                }
                if (candidateData.district !== voterData.district) {
                    throw new Error('Candidate is not from your registered district.');
                }
                if (!candidateData.isActive) {
                    throw new Error('Candidate is not active and cannot receive votes.');
                }
                if (candidateData.position !== candidatePosition) {
                    throw new Error(`Candidate position mismatch. Expected ${candidatePosition}, found ${candidateData.position}.`);
                }

                const newVotes = (candidateData.votes || 0) + 1;
                transaction.update(candidateRef, { votes: newVotes });

                const updatedVotes = {
                    ...voterData.votes,
                    [CURRENT_ELECTION_ID]: {
                        ...(voterData.votes ? voterData.votes[CURRENT_ELECTION_ID] : {}),
                        [candidatePosition]: true,
                        [`votedCandidateId_${candidatePosition}`]: candidateUid,
                        [`voteTimestamp_${candidatePosition}`]: new Date().toISOString()
                    }
                };
                transaction.update(voterRef, { votes: updatedVotes });
            });

            displayMessage(elements.alreadyVotedMessage, `Your vote for ${candidatePosition} has been cast successfully! Thank you for participating.`, 'success');

            document.querySelectorAll(`.vote-button[data-candidate-position="${candidatePosition}"]`).forEach(btn => {
                btn.disabled = true;
                const btnTextSpan = btn.querySelector('.button-text');
                const btnSpinner = btn.querySelector('.spinner');
                setButtonLoading(btn, btnTextSpan, btnSpinner, false);
                if (btn.dataset.candidateUid === candidateUid) {
                    btn.textContent = 'VOTED!';
                    btn.style.backgroundColor = '#6c757d';
                }
            });

        } catch (error) {
            console.error('Error casting vote:', error);
            const userFriendlyError = typeof error.message === 'string' && error.message.includes('already cast your vote')
                ? error.message
                : error.message || 'An unexpected error occurred while casting your vote. Please try again.';

            displayMessage(elements.voteErrorMessage, userFriendlyError, 'error');

            if (!userFriendlyError.includes('already cast your vote')) {
                document.querySelectorAll(`.vote-button[data-candidate-position="${candidatePosition}"]`).forEach(btn => btn.disabled = false);
            }
            setButtonLoading(button, textSpan, spinner, false);
        }
    }


    // ===========================================
    // --- PROFILE SECTION FUNCTIONS ---
    // ===========================================

    async function loadVoterProfile() {
        setButtonLoading(elements.saveVoterProfileButton, elements.saveButtonText, elements.saveButtonSpinner, true);
        displayMessage(elements.profileSuccessMessage, '', 'success');
        displayMessage(elements.profileErrorMessage, '', 'error');

        elements.profileEmailInput.value = sessionStorage.getItem('userEmail') || 'N/A';

        try {
            const userDocRef = doc(db, 'users', userId);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                elements.profileFullNameInput.value = data.fullName || '';
                elements.profileDistrictInput.value = data.district || '';
                elements.profileContactNumberInput.value = data.contactNumber || '';
                displayMessage(elements.profileSuccessMessage, 'Profile loaded successfully.', 'success');
            } else {
                displayMessage(elements.profileErrorMessage, 'No existing profile data found. Please fill out the form.', 'info');
                elements.profileFullNameInput.value = sessionStorage.getItem('userName') || '';
            }
        } catch (error) {
            console.error('Error loading voter profile:', error);
            displayMessage(elements.profileErrorMessage, `Failed to load profile: ${error.message}`, 'error');
        } finally {
            setButtonLoading(elements.saveVoterProfileButton, elements.saveButtonText, elements.saveButtonSpinner, false);
        }
    }

    elements.voterProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        displayMessage(elements.profileSuccessMessage, '', 'success');
        displayMessage(elements.profileErrorMessage, '', 'error');

        const validationError = validateVoterProfileForm();
        if (validationError) {
            displayMessage(elements.profileErrorMessage, validationError, 'error');
            return;
        }

        setButtonLoading(elements.saveVoterProfileButton, elements.saveButtonText, elements.saveButtonSpinner, true);

        try {
            const userDocRef = doc(db, 'users', userId);
            const profileData = {
                fullName: elements.profileFullNameInput.value.trim(),
                district: elements.profileDistrictInput.value.trim(),
                contactNumber: elements.profileContactNumberInput.value.trim() || null,
                lastUpdated: new Date().toISOString()
            };

            await updateDoc(userDocRef, profileData);

            sessionStorage.setItem('userName', profileData.fullName);
            sessionStorage.setItem('userDistrict', profileData.district);
            voterDistrict = profileData.district;

            displayMessage(elements.profileSuccessMessage, 'Profile saved successfully!', 'success');

        } catch (error) {
            console.error('Error saving voter profile:', error);
            let userFriendlyError = 'Failed to save profile. Please try again.';
            if (error.code === 'permission-denied') {
                userFriendlyError = 'Permission Denied: You do not have the rights to update your profile or your session expired.';
            } else if (error.message) {
                userFriendlyError = error.message;
            }
            displayMessage(elements.profileErrorMessage, userFriendlyError, 'error');
        } finally {
            setButtonLoading(elements.saveVoterProfileButton, elements.saveButtonText, elements.saveButtonSpinner, false);
        }
    });

    function validateVoterProfileForm() {
        if (!elements.profileFullNameInput.value.trim() || !elements.profileDistrictInput.value.trim()) {
            return 'Full Name and District are required.';
        }
        if (!/^[A-Za-z\s]{2,50}$/.test(elements.profileFullNameInput.value.trim())) {
            return 'Full Name: 2-50 characters, letters and spaces only.';
        }
        if (!/^[A-Za-z0-9\s-]{2,100}$/.test(elements.profileDistrictInput.value.trim())) {
            return 'District: 2-100 characters, letters, numbers, spaces, and hyphens only.';
        }
        if (elements.profileContactNumberInput.value.trim() && !/^[0-9+\s-]{7,20}$/.test(elements.profileContactNumberInput.value.trim())) {
            return 'Contact Number: Please enter a valid phone number (7-20 digits, spaces, hyphens, and + allowed).';
        }
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

    // --- Initial Load: Activate default tab and load initial data ---
    // Programmatically click the 'Vote Now' tab button to activate it and trigger loadCandidates
    document.querySelector('.tab-button[data-tab="vote-section"]').click();
});