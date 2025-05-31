import { auth, db, storage } from './firebase-config.js';
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, runTransaction, orderBy } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-storage.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';

let allElections = [];
let allCandidates = [];
let allVoters = [];

document.addEventListener('DOMContentLoaded', async () => {
    const elements = {
        mainContainer: document.querySelector('.admin-container'),
        loggedOutSection: document.getElementById('logged-out-section'),

        adminGreeting: document.getElementById('admin-greeting'),

        adminLoadingMessage: document.getElementById('admin-loading-message'),
        adminErrorMessage: document.getElementById('admin-error-message'),
        adminSuccessMessage: document.getElementById('admin-success-message'),

        tabButtons: document.querySelectorAll('.tab-button[data-tab]'),
        contentSections: document.querySelectorAll('.content-section'),

        dashboardSection: document.getElementById('dashboard-section'),
        totalVotersStat: document.getElementById('total-voters'),
        totalCandidatesStat: document.getElementById('total-candidates'),
        activeElectionsStat: document.getElementById('active-elections'),
        totalVotesCastStat: document.getElementById('total-votes-cast'),
        quickActionButtons: document.querySelectorAll('.action-button[data-tab-goto]'),


        electionsSection: document.getElementById('elections-section'),
        electionsListContainer: document.getElementById('elections-list-container'),
        addElectionButton: document.getElementById('add-election-button'),

        candidatesSection: document.getElementById('candidates-section'),
        candidatesListContainer: document.getElementById('candidates-list-container'),
        addCandidateButton: document.getElementById('add-candidate-button'),
        candidateFilterPosition: document.getElementById('candidate-filter-position'),
        candidateSearchInput: document.getElementById('candidate-search-input'),
        candidateSearchButton: document.getElementById('candidate-search-button'),

        votersSection: document.getElementById('voters-section'),
        votersListContainer: document.getElementById('voters-list-container'),
        voterSearchInput: document.getElementById('voter-search-input'),
        voterSearchButton: document.getElementById('voter-search-button'),

        resultsSection: document.getElementById('results-section'),
        resultsElectionSelect: document.getElementById('results-election-select'),
        resultsPositionSelect: document.getElementById('results-position-select'),
        resultsDisplayContainer: document.getElementById('results-display-container'),

        logoutButton: document.getElementById('admin-logout-button'),
    };

    const REDIRECT_DELAY = 1500;

    function displayMessage(element, message, type, duration = 5000) {
        [elements.adminLoadingMessage, elements.adminErrorMessage, elements.adminSuccessMessage]
            .forEach(msgBox => {
                if (msgBox) {
                    msgBox.style.display = 'none';
                    msgBox.textContent = '';
                    msgBox.classList.remove('loading-message', 'error-message', 'success-message');
                }
            });

        if (!element) {
            console.warn(`Attempted to display message in a non-existent element for type: ${type}. Message: ${message}`);
            return;
        }

        element.textContent = message;
        element.classList.add(`${type}-message`);
        element.style.display = 'block';

        if (duration > 0) {
            setTimeout(() => {
                element.style.display = 'none';
                element.textContent = '';
                element.classList.remove(`${type}-message`);
            }, duration);
        }
    }

    function showSpinner(element) {
        if (element) {
            element.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        }
    }

    function hideSpinner(element) {
        if (element) {
            element.innerHTML = '';
        }
    }

    /**
     * Creates and displays a generic modal for forms.
     * @param {string} title - The modal title.
     * @param {string} formHtml - HTML string for the form content.
     * @param {function} onSubmit - Callback function when the form is submitted.
     * @param {function} [onOpen=null] - Callback function after modal is opened, good for populating initial data.
     * @returns {HTMLElement} The modal element.
     */
    function createFormModal(title, formHtml, onSubmit, onOpen = null) {
        const existingModal = document.getElementById('generic-admin-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'generic-admin-modal';
        modal.classList.add('modal');
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-button">&times;</span>
                <h3>${title}</h3>
                <form id="modal-form">${formHtml}</form>
                <div class="button-group">
                    <button type="submit" form="modal-form" class="submit-button">Save</button>
                    <button type="button" class="cancel-button">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        };

        modal.querySelector('.close-button').onclick = closeModal;
        modal.querySelector('.cancel-button').onclick = closeModal;
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');

        modal.querySelector('#modal-form').onsubmit = async (e) => {
            e.preventDefault();
            const submitButton = modal.querySelector('.submit-button');
            const originalButtonText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.innerHTML = 'Saving... <i class="fas fa-spinner fa-spin"></i>';

            try {
                await onSubmit(e);
                closeModal();
                displayMessage(elements.adminSuccessMessage, `${title} saved successfully!`, 'success');
            } catch (error) {
                console.error(`Error saving ${title}:`, error);
                displayMessage(elements.adminErrorMessage, `Error saving ${title}: ${error.message}`, 'error', 7000);
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
        };

        if (onOpen) onOpen(modal);

        return modal;
    }


    async function enforceAccessControl() {
        try {
            const sessionCheck = await fetch('/verifySession');
            const sessionData = await sessionCheck.json();

            if (!sessionData.loggedIn || sessionData.userRole !== 'admin') {
                console.warn("Session invalid or not admin. Redirecting to login.");
                elements.mainContainer.style.display = 'none';
                elements.loggedOutSection.style.display = 'block';
                displayMessage(elements.loggedOutSection.querySelector('p') || elements.loggedOutSection,
                    'Access denied. Redirecting to login...', 'info', REDIRECT_DELAY);
                await new Promise(resolve => setTimeout(resolve, REDIRECT_DELAY));
                window.location.href = '/login';
                return false;
            }
            elements.adminGreeting.textContent = `Welcome, ${sessionData.userName || 'Admin'}!`;
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
        return;
    }

    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            elements.tabButtons.forEach(btn => btn.classList.remove('active'));
            elements.contentSections.forEach(section => section.classList.add('hidden'));

            button.classList.add('active');
            document.getElementById(targetTab).classList.remove('hidden');

            switch (targetTab) {
                case 'dashboard-section':
                    loadDashboardStats();
                    break;
                case 'elections-section':
                    loadElections();
                    break;
                case 'candidates-section':
                    loadCandidates(elements.candidateFilterPosition.value, elements.candidateSearchInput.value.trim());
                    populateCandidateFilterPositions();
                    break;
                case 'voters-section':
                    loadVoters(elements.voterSearchInput.value.trim());
                    break;
                case 'results-section':
                    populateResultsElectionSelect();
                    elements.resultsDisplayContainer.innerHTML = '<p class="info-message">Select an election and position to view results.</p>';
                    break;
            }
            displayMessage(elements.adminErrorMessage, '', 'error');
            displayMessage(elements.adminSuccessMessage, '', 'success');
        });
    });

    elements.quickActionButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tabGoto;
            const tabBtn = document.querySelector(`.tab-button[data-tab="${targetTab}"]`);
            if (tabBtn) tabBtn.click();
        });
    });


    async function loadDashboardStats() {
        showSpinner(elements.totalVotersStat);
        showSpinner(elements.totalCandidatesStat);
        showSpinner(elements.activeElectionsStat);
        showSpinner(elements.totalVotesCastStat);

        try {
            const votersSnapshot = await getDocs(collection(db, 'users'));
            elements.totalVotersStat.textContent = votersSnapshot.size;

            const candidatesSnapshot = await getDocs(collection(db, 'candidates'));
            allCandidates = candidatesSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
            elements.totalCandidatesStat.textContent = allCandidates.length;

            const activeElectionsQuery = query(collection(db, 'elections'), where('isActive', '==', true));
            const activeElectionsSnapshot = await getDocs(activeElectionsQuery);
            allElections = activeElectionsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
            elements.activeElectionsStat.textContent = allElections.length;

            let totalVotes = 0;
            allCandidates.forEach(candidate => {
                totalVotes += (candidate.votes || 0);
            });
            elements.totalVotesCastStat.textContent = totalVotes;

        } catch (error) {
            console.error('Error loading dashboard stats:', error);
            displayMessage(elements.adminErrorMessage, 'Failed to load dashboard stats.', 'error');
            elements.totalVotersStat.textContent = 'N/A';
            elements.totalCandidatesStat.textContent = 'N/A';
            elements.activeElectionsStat.textContent = 'N/A';
            elements.totalVotesCastStat.textContent = 'N/A';
        }
    }



    async function loadElections() {
        elements.electionsListContainer.innerHTML = '<p class="loading-placeholder">Loading elections...</p>';
        try {
            const electionsSnapshot = await getDocs(collection(db, 'elections'));
            allElections = electionsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

            elements.electionsListContainer.innerHTML = '';
            if (allElections.length === 0) {
                elements.electionsListContainer.innerHTML = '<p class="no-data-message">No elections found. Click "Add New Election" to create one.</p>';
                return;
            }

            allElections.forEach(election => {
                const electionCard = document.createElement('div');
                electionCard.classList.add('data-card');
                electionCard.innerHTML = `
                    <div class="info">
                        <h3>${election.name}</h3>
                        <p><strong>ID:</strong> ${election.uid}</p>
                        <p><strong>Status:</strong> ${election.isActive ? 'Active' : 'Inactive'}</p>
                        <p><strong>Start:</strong> ${election.startDate ? new Date(election.startDate).toLocaleDateString() : 'N/A'}</p>
                        <p><strong>End:</strong> ${election.endDate ? new Date(election.endDate).toLocaleDateString() : 'N/A'}</p>
                        <p><strong>Positions:</strong> ${election.positions ? election.positions.join(', ') : 'N/A'}</p>
                    </div>
                    <div class="actions">
                        <button class="edit-button" data-uid="${election.uid}">Edit</button>
                        <button class="delete-button" data-uid="${election.uid}">Delete</button>
                    </div>
                `;
                elements.electionsListContainer.appendChild(electionCard);
            });

            elements.electionsListContainer.querySelectorAll('.edit-button').forEach(button => {
                button.addEventListener('click', (e) => editElection(e.target.dataset.uid));
            });
            elements.electionsListContainer.querySelectorAll('.delete-button').forEach(button => {
                button.addEventListener('click', (e) => deleteElection(e.target.dataset.uid, e.target));
            });

        } catch (error) {
            console.error('Error loading elections:', error);
            elements.electionsListContainer.innerHTML = '<p class="error-message">Failed to load elections.</p>';
            displayMessage(elements.adminErrorMessage, 'Failed to load elections.', 'error');
        }
    }

    elements.addElectionButton.addEventListener('click', () => {
        createFormModal(
            'Add New Election',
            `
            <div class="form-group">
                <label for="election-name">Election Name:</label>
                <input type="text" id="election-name" required>
            </div>
            <div class="form-group">
                <label for="election-start-date">Start Date:</label>
                <input type="date" id="election-start-date" required>
            </div>
            <div class="form-group">
                <label for="election-end-date">End Date:</label>
                <input type="date" id="election-end-date" required>
            </div>
            <div class="form-group">
                <label>Positions (comma-separated):</label>
                <input type="text" id="election-positions" placeholder="e.g., Mayor, Vice-Mayor, Councillor" required>
            </div>
            <div class="form-group">
                <input type="checkbox" id="election-is-active">
                <label for="election-is-active">Is Active</label>
            </div>
            `,
            async (e) => {
                const name = document.getElementById('election-name').value.trim();
                const startDate = document.getElementById('election-start-date').value;
                const endDate = document.getElementById('election-end-date').value;
                const positions = document.getElementById('election-positions').value.split(',').map(p => p.trim()).filter(p => p);
                const isActive = document.getElementById('election-is-active').checked;

                if (!name || !startDate || !endDate || positions.length === 0) {
                    throw new Error('Please fill all required fields.');
                }
                if (new Date(startDate) > new Date(endDate)) {
                    throw new Error('End date cannot be before start date.');
                }

                await addDoc(collection(db, 'elections'), {
                    name,
                    startDate: new Date(startDate).toISOString(),
                    endDate: new Date(endDate).toISOString(),
                    positions,
                    isActive,
                    createdAt: new Date().toISOString()
                });
                loadElections();
            }
        );
    });

    async function editElection(uid) {
        const election = allElections.find(e => e.uid === uid);
        if (!election) {
            displayMessage(elements.adminErrorMessage, 'Election not found!', 'error');
            return;
        }

        createFormModal(
            `Edit Election: ${election.name}`,
            `
            <div class="form-group">
                <label for="edit-election-name">Election Name:</label>
                <input type="text" id="edit-election-name" value="${election.name}" required>
            </div>
            <div class="form-group">
                <label for="edit-election-start-date">Start Date:</label>
                <input type="date" id="edit-election-start-date" value="${election.startDate ? election.startDate.substring(0, 10) : ''}" required>
            </div>
            <div class="form-group">
                <label for="edit-election-end-date">End Date:</label>
                <input type="date" id="edit-election-end-date" value="${election.endDate ? election.endDate.substring(0, 10) : ''}" required>
            </div>
            <div class="form-group">
                <label>Positions (comma-separated):</label>
                <input type="text" id="edit-election-positions" value="${election.positions ? election.positions.join(', ') : ''}" placeholder="e.g., Mayor, Vice-Mayor" required>
            </div>
            <div class="form-group">
                <input type="checkbox" id="edit-election-is-active" ${election.isActive ? 'checked' : ''}>
                <label for="edit-election-is-active">Is Active</label>
            </div>
            `,
            async (e) => {
                const name = document.getElementById('edit-election-name').value.trim();
                const startDate = document.getElementById('edit-election-start-date').value;
                const endDate = document.getElementById('edit-election-end-date').value;
                const positions = document.getElementById('edit-election-positions').value.split(',').map(p => p.trim()).filter(p => p);
                const isActive = document.getElementById('edit-election-is-active').checked;

                if (!name || !startDate || !endDate || positions.length === 0) {
                    throw new Error('Please fill all required fields.');
                }
                if (new Date(startDate) > new Date(endDate)) {
                    throw new Error('End date cannot be before start date.');
                }

                await updateDoc(doc(db, 'elections', uid), {
                    name,
                    startDate: new Date(startDate).toISOString(),
                    endDate: new Date(endDate).toISOString(),
                    positions,
                    isActive,
                    lastUpdated: new Date().toISOString()
                });
                loadElections();
            }
        );
    }

    async function deleteElection(uid, buttonElement) {
        if (!confirm('Are you sure you want to delete this election? This action cannot be undone.')) {
            return;
        }

        const originalText = buttonElement.textContent;
        buttonElement.disabled = true;
        buttonElement.innerHTML = 'Deleting... <i class="fas fa-spinner fa-spin"></i>';

        try {
            await deleteDoc(doc(db, 'elections', uid));
            displayMessage(elements.adminSuccessMessage, 'Election deleted successfully!', 'success');
            loadElections();
        } catch (error) {
            console.error('Error deleting election:', error);
            displayMessage(elements.adminErrorMessage, `Failed to delete election: ${error.message}`, 'error');
        } finally {
            buttonElement.disabled = false;
            buttonElement.textContent = originalText;
        }
    }

    async function loadCandidates(filterPosition = '', searchTerm = '') {
        elements.candidatesListContainer.innerHTML = '<p class="loading-placeholder">Loading candidates...</p>';
        try {
            const candidatesCollectionRef = collection(db, 'candidates');
            const querySnapshot = await getDocs(candidatesCollectionRef);

            // Populate the array with the fetched data, ensuring fallbacks for potentially missing fields
            allCandidates = querySnapshot.docs.map(doc => ({
                uid: doc.id,
                ...doc.data(),
                position: doc.data().position || '', // Ensure position exists
                ballotOrder: doc.data().ballotOrder || 999 // Default to high number if not set
            }));

            // Perform client-side filtering
            let filtered = allCandidates;

            if (filterPosition) {
                filtered = filtered.filter(c => c.position === filterPosition);
            }
            if (searchTerm) {
                const lowerSearchTerm = searchTerm.toLowerCase();
                filtered = filtered.filter(c =>
                    (c.name && c.name.toLowerCase().includes(lowerSearchTerm)) ||
                    (c.district && c.district.toLowerCase().includes(lowerSearchTerm)) ||
                    (c.party && c.party.toLowerCase().includes(lowerSearchTerm))
                );
            }

            elements.candidatesListContainer.innerHTML = '';
            if (filtered.length === 0) {
                elements.candidatesListContainer.innerHTML = '<p class="no-data-message">No candidates found matching your criteria.</p>';
                return;
            }

            // Safe sorting with fallbacks
            filtered.sort((a, b) => {
                // Ensure positions exist before comparing
                const posA = a.position || '';
                const posB = b.position || '';

                if (posA === posB) {
                    return (a.ballotOrder || 999) - (b.ballotOrder || 999);
                }
                return posA.localeCompare(posB);
            });

            filtered.forEach(candidate => {
                const photoSrc = candidate.photoURL && candidate.photoURL.startsWith('http')
                    ? candidate.photoURL
                    : 'https://via.placeholder.com/100?text=No+Photo';

                const candidateCard = document.createElement('div');
                candidateCard.classList.add('data-card');
                candidateCard.innerHTML = `
                    <img src="${photoSrc}" alt="${candidate.name}'s photo" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%;">
                    <div class="info">
                        <h3>${candidate.name || 'Unknown'} (${candidate.party || 'Independent'})</h3>
                        <p><strong>Position:</strong> ${candidate.position || 'N/A'}</p>
                        <p><strong>District:</strong> ${candidate.district || 'N/A'}</p>
                        <p><strong>Active:</strong> ${candidate.isActive ? 'Yes' : 'No'}</p>
                        <p><strong>Votes:</strong> ${candidate.votes || 0}</p>
                    </div>
                    <div class="actions">
                        <button class="edit-button" data-uid="${candidate.uid}">Edit</button>
                        <button class="delete-button" data-uid="${candidate.uid}">Delete</button>
                    </div>
                `;
                elements.candidatesListContainer.appendChild(candidateCard);
            });

            elements.candidatesListContainer.querySelectorAll('.edit-button').forEach(button => {
                button.addEventListener('click', (e) => editCandidate(e.target.dataset.uid));
            });
            elements.candidatesListContainer.querySelectorAll('.delete-button').forEach(button => {
                button.addEventListener('click', (e) => deleteCandidate(e.target.dataset.uid, e.target));
            });

        } catch (error) {
            console.error('Error loading candidates:', error);
            elements.candidatesListContainer.innerHTML = '<p class="error-message">Failed to load candidates.</p>';
            displayMessage(elements.adminErrorMessage, 'Failed to load candidates.', 'error');
        }
    }

    async function populateCandidateFilterPositions() {
        // Only repopulate if there's only the default option, or if elections have changed
        if (elements.candidateFilterPosition.options.length <= 1) {
            const positions = new Set();
            // If allElections is not loaded, fetch them to get positions
            if (allElections.length === 0) {
                const electionsSnapshot = await getDocs(collection(db, 'elections'));
                electionsSnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.positions) data.positions.forEach(p => positions.add(p));
                });
            } else {
                allElections.forEach(election => {
                    if (election.positions) election.positions.forEach(p => positions.add(p));
                });
            }

            elements.candidateFilterPosition.innerHTML = '<option value="">Filter by Position</option>';
            Array.from(positions).sort().forEach(position => {
                const option = document.createElement('option');
                option.value = position;
                option.textContent = position;
                elements.candidateFilterPosition.appendChild(option);
            });
        }
    }

    elements.candidateFilterPosition.addEventListener('change', () => {
        loadCandidates(elements.candidateFilterPosition.value, elements.candidateSearchInput.value.trim());
    });
    elements.candidateSearchButton.addEventListener('click', () => {
        loadCandidates(elements.candidateFilterPosition.value, elements.candidateSearchInput.value.trim());
    });
    elements.candidateSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadCandidates(elements.candidateFilterPosition.value, elements.candidateSearchInput.value.trim());
        }
    });


    elements.addCandidateButton.addEventListener('click', () => {
        createFormModal(
            'Add New Candidate',
            `
            <div class="form-group">
                <label for="candidate-name">Name:</label>
                <input type="text" id="candidate-name" required>
            </div>
            <div class="form-group">
                <label for="candidate-position">Position:</label>
                <select id="candidate-position" required>
                    <option value="">Select a Position</option>
                    </select>
            </div>
            <div class="form-group">
                <label for="candidate-district">District (Optional):</label>
                <input type="text" id="candidate-district">
            </div>
            <div class="form-group">
                <label for="candidate-party">Party (Optional):</label>
                <input type="text" id="candidate-party">
            </div>
            <div class="form-group">
                <label for="candidate-ballot-order">Ballot Order (Optional):</label>
                <input type="number" id="candidate-ballot-order" min="1">
            </div>
            <div class="form-group">
                <label for="candidate-photo">Photo:</label>
                <input type="file" id="candidate-photo" accept="image/*">
            </div>
            <div class="form-group">
                <input type="checkbox" id="candidate-is-active" checked>
                <label for="candidate-is-active">Is Active</label>
            </div>
            `,
            async (e) => {
                const name = document.getElementById('candidate-name').value.trim();
                const position = document.getElementById('candidate-position').value;
                const district = document.getElementById('candidate-district').value.trim();
                const party = document.getElementById('candidate-party').value.trim();
                const ballotOrder = parseInt(document.getElementById('candidate-ballot-order').value) || null;
                const photoFile = document.getElementById('candidate-photo').files[0];
                const isActive = document.getElementById('candidate-is-active').checked;

                if (!name || !position) {
                    throw new Error('Please fill all required fields: Name and Position.');
                }

                let photoURL = '';
                if (photoFile) {
                    displayMessage(elements.adminLoadingMessage, 'Uploading photo...', 'loading', 0);
                    const storageRef = ref(storage, `candidate_photos/${Date.now()}_${photoFile.name}`);
                    const snapshot = await uploadBytes(storageRef, photoFile);
                    photoURL = await getDownloadURL(snapshot.ref);
                    displayMessage(elements.adminLoadingMessage, '', 'loading'); // Clear loading message
                }

                await addDoc(collection(db, 'candidates'), {
                    name,
                    position,
                    district: district || null,
                    party: party || null,
                    ballotOrder,
                    photoURL,
                    isActive,
                    votes: 0, // Initialize votes to 0
                    createdAt: new Date().toISOString()
                });
                loadCandidates();
            },
            async (modal) => {
                // Populate positions dropdown when modal opens
                const positionSelect = modal.querySelector('#candidate-position');
                positionSelect.innerHTML = '<option value="">Select a Position</option>';
                const positions = new Set();
                if (allElections.length === 0) { // If elections not loaded, fetch them
                    const electionsSnapshot = await getDocs(collection(db, 'elections'));
                    electionsSnapshot.docs.forEach(doc => {
                        const data = doc.data();
                        if (data.positions) data.positions.forEach(p => positions.add(p));
                    });
                } else {
                    allElections.forEach(election => {
                        if (election.positions) election.positions.forEach(p => positions.add(p));
                    });
                }
                Array.from(positions).sort().forEach(position => {
                    const option = document.createElement('option');
                    option.value = position;
                    option.textContent = position;
                    positionSelect.appendChild(option);
                });
            }
        );
    });

    async function editCandidate(uid) {
        const candidate = allCandidates.find(c => c.uid === uid);
        if (!candidate) {
            displayMessage(elements.adminErrorMessage, 'Candidate not found!', 'error');
            return;
        }

        createFormModal(
            `Edit Candidate: ${candidate.name}`,
            `
            <div class="form-group">
                <label for="edit-candidate-name">Name:</label>
                <input type="text" id="edit-candidate-name" value="${candidate.name}" required>
            </div>
            <div class="form-group">
                <label for="edit-candidate-position">Position:</label>
                <select id="edit-candidate-position" required>
                    <option value="">Select a Position</option>
                    </select>
            </div>
            <div class="form-group">
                <label for="edit-candidate-district">District (Optional):</label>
                <input type="text" id="edit-candidate-district" value="${candidate.district || ''}">
            </div>
            <div class="form-group">
                <label for="edit-candidate-party">Party (Optional):</label>
                <input type="text" id="edit-candidate-party" value="${candidate.party || ''}">
            </div>
            <div class="form-group">
                <label for="edit-candidate-ballot-order">Ballot Order (Optional):</label>
                <input type="number" id="edit-candidate-ballot-order" min="1" value="${candidate.ballotOrder || ''}">
            </div>
            <div class="form-group">
                <label for="edit-candidate-photo">Photo (leave blank to keep current):</label>
                <input type="file" id="edit-candidate-photo" accept="image/*">
                ${candidate.photoURL ? `<img src="${candidate.photoURL}" alt="Current Photo" style="width: 50px; height: 50px; object-fit: cover; border-radius: 50%; margin-top: 5px;">` : ''}
            </div>
            <div class="form-group">
                <input type="checkbox" id="edit-candidate-is-active" ${candidate.isActive ? 'checked' : ''}>
                <label for="edit-candidate-is-active">Is Active</label>
            </div>
            `,
            async (e) => {
                const name = document.getElementById('edit-candidate-name').value.trim();
                const position = document.getElementById('edit-candidate-position').value;
                const district = document.getElementById('edit-candidate-district').value.trim();
                const party = document.getElementById('edit-candidate-party').value.trim();
                const ballotOrder = parseInt(document.getElementById('edit-candidate-ballot-order').value) || null;
                const photoFile = document.getElementById('edit-candidate-photo').files[0];
                const isActive = document.getElementById('edit-candidate-is-active').checked;

                if (!name || !position) {
                    throw new Error('Please fill all required fields: Name and Position.');
                }

                let newPhotoURL = candidate.photoURL;
                if (photoFile) {
                    displayMessage(elements.adminLoadingMessage, 'Uploading new photo...', 'loading', 0);
                    const storageRef = ref(storage, `candidate_photos/${Date.now()}_${photoFile.name}`);
                    const snapshot = await uploadBytes(storageRef, photoFile);
                    newPhotoURL = await getDownloadURL(snapshot.ref);
                    displayMessage(elements.adminLoadingMessage, '', 'loading'); // Clear loading message
                }

                await updateDoc(doc(db, 'candidates', uid), {
                    name,
                    position,
                    district: district || null,
                    party: party || null,
                    ballotOrder,
                    photoURL: newPhotoURL,
                    isActive,
                    lastUpdated: new Date().toISOString()
                });
                loadCandidates();
            },
            async (modal) => {
                // Populate positions dropdown when modal opens, and set current value
                const positionSelect = modal.querySelector('#edit-candidate-position');
                positionSelect.innerHTML = '<option value="">Select a Position</option>';
                const positions = new Set();
                if (allElections.length === 0) { // If elections not loaded, fetch them
                    const electionsSnapshot = await getDocs(collection(db, 'elections'));
                    electionsSnapshot.docs.forEach(doc => {
                        const data = doc.data();
                        if (data.positions) data.positions.forEach(p => positions.add(p));
                    });
                } else {
                    allElections.forEach(election => {
                        if (election.positions) election.positions.forEach(p => positions.add(p));
                    });
                }
                Array.from(positions).sort().forEach(p => {
                    const option = document.createElement('option');
                    option.value = p;
                    option.textContent = p;
                    positionSelect.appendChild(option);
                });
                positionSelect.value = candidate.position || '';
            }
        );
    }

    async function deleteCandidate(uid, buttonElement) {
        if (!confirm('Are you sure you want to delete this candidate? This action cannot be undone.')) {
            return;
        }

        const originalText = buttonElement.textContent;
        buttonElement.disabled = true;
        buttonElement.innerHTML = 'Deleting... <i class="fas fa-spinner fa-spin"></i>';

        try {
            await deleteDoc(doc(db, 'candidates', uid));
            displayMessage(elements.adminSuccessMessage, 'Candidate deleted successfully!', 'success');
            loadCandidates();
        } catch (error) {
            console.error('Error deleting candidate:', error);
            displayMessage(elements.adminErrorMessage, `Failed to delete candidate: ${error.message}`, 'error');
        } finally {
            buttonElement.disabled = false;
            buttonElement.textContent = originalText;
        }
    }

    // Initial load of dashboard stats and the first tab when the page loads
    // This assumes 'dashboard-section' is the default active tab.
    document.querySelector('.tab-button[data-tab="dashboard-section"]').click();


    // Event listener for logout button
    elements.logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            // Optionally, clear local session data or redirect to login page
            window.location.href = '/login'; // Redirect to login page after logout
        } catch (error) {
            console.error('Error signing out:', error);
            displayMessage(elements.adminErrorMessage, `Logout failed: ${error.message}`, 'error');
        }
    });

    // Placeholder functions for sections not fully implemented in the snippet
    async function loadVoters(searchTerm = '') {
        elements.votersListContainer.innerHTML = '<p class="loading-placeholder">Loading voters...</p>';
        try {
            let votersQuery = collection(db, 'users');
            if (searchTerm) {
                // Firestore doesn't support substring search directly on queries.
                // For robust search, you'd typically use a dedicated search service (like Algolia or a server-side index).
                // For simple cases, you might fetch all and filter client-side, but be mindful of data size.
                // For this example, let's assume we fetch all and filter by display name/email.
                votersQuery = query(votersQuery, orderBy('displayName')); // Order by something if you filter client-side
            }
            const votersSnapshot = await getDocs(votersQuery);
            allVoters = votersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

            let filteredVoters = allVoters;
            if (searchTerm) {
                const lowerSearchTerm = searchTerm.toLowerCase();
                filteredVoters = allVoters.filter(voter =>
                    (voter.displayName && voter.displayName.toLowerCase().includes(lowerSearchTerm)) ||
                    (voter.email && voter.email.toLowerCase().includes(lowerSearchTerm))
                );
            }

            elements.votersListContainer.innerHTML = '';
            if (filteredVoters.length === 0) {
                elements.votersListContainer.innerHTML = '<p class="no-data-message">No voters found matching your criteria.</p>';
                return;
            }

            filteredVoters.forEach(voter => {
                const voterCard = document.createElement('div');
                voterCard.classList.add('data-card');
                voterCard.innerHTML = `
                    <div class="info">
                        <h3>${voter.displayName || 'N/A'}</h3>
                        <p><strong>Email:</strong> ${voter.email || 'N/A'}</p>
                        <p><strong>Registered:</strong> ${voter.createdAt ? new Date(voter.createdAt).toLocaleDateString() : 'N/A'}</p>
                        <p><strong>Role:</strong> ${voter.role || 'user'}</p>
                        <p><strong>Has Voted:</strong> ${voter.hasVoted ? 'Yes' : 'No'}</p>
                    </div>
                    <div class="actions">
                        </div>
                `;
                elements.votersListContainer.appendChild(voterCard);
            });

        } catch (error) {
            console.error('Error loading voters:', error);
            elements.votersListContainer.innerHTML = '<p class="error-message">Failed to load voters.</p>';
            displayMessage(elements.adminErrorMessage, 'Failed to load voters.', 'error');
        }
    }

    elements.voterSearchButton.addEventListener('click', () => {
        loadVoters(elements.voterSearchInput.value.trim());
    });
    elements.voterSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadVoters(elements.voterSearchInput.value.trim());
        }
    });

    async function populateResultsElectionSelect() {
        elements.resultsElectionSelect.innerHTML = '<option value="">Select an Election</option>';
        if (allElections.length === 0) {
            const electionsSnapshot = await getDocs(collection(db, 'elections'));
            allElections = electionsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        }
        allElections.sort((a, b) => (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0))); // Sort by creation date
        allElections.forEach(election => {
            const option = document.createElement('option');
            option.value = election.uid;
            option.textContent = election.name;
            elements.resultsElectionSelect.appendChild(option);
        });
    }

    elements.resultsElectionSelect.addEventListener('change', () => {
        const selectedElectionUid = elements.resultsElectionSelect.value;
        populateResultsPositionSelect(selectedElectionUid);
        elements.resultsDisplayContainer.innerHTML = '<p class="info-message">Select a position to view results.</p>';
    });

    async function populateResultsPositionSelect(electionUid) {
        elements.resultsPositionSelect.innerHTML = '<option value="">Select a Position</option>';
        elements.resultsPositionSelect.disabled = true;

        if (!electionUid) {
            return;
        }

        const election = allElections.find(e => e.uid === electionUid);
        if (election && election.positions && election.positions.length > 0) {
            election.positions.sort().forEach(position => {
                const option = document.createElement('option');
                option.value = position;
                option.textContent = position;
                elements.resultsPositionSelect.appendChild(option);
            });
            elements.resultsPositionSelect.disabled = false;
        } else {
            displayMessage(elements.adminErrorMessage, 'No positions found for this election.', 'error');
        }
    }

    elements.resultsPositionSelect.addEventListener('change', () => {
        const selectedElectionUid = elements.resultsElectionSelect.value;
        const selectedPosition = elements.resultsPositionSelect.value;
        if (selectedElectionUid && selectedPosition) {
            displayElectionResults(selectedElectionUid, selectedPosition);
        } else {
            elements.resultsDisplayContainer.innerHTML = '<p class="info-message">Select an election and position to view results.</p>';
        }
    });

    async function displayElectionResults(electionUid, position) {
        elements.resultsDisplayContainer.innerHTML = '<p class="loading-placeholder">Loading results...</p>';
        try {
            const candidatesQuery = query(
                collection(db, 'candidates'),
                where('position', '==', position),
                where('isActive', '==', true), // Only consider active candidates for results
                orderBy('votes', 'desc') // Order by votes in descending order
            );
            const candidatesSnapshot = await getDocs(candidatesQuery);

            let resultsHtml = `<h4>Results for ${position}</h4>`;
            if (candidatesSnapshot.empty) {
                resultsHtml += '<p class="no-data-message">No active candidates or votes for this position.</p>';
            } else {
                resultsHtml += '<table class="results-table"><thead><tr><th>Candidate</th><th>Party</th><th>Votes</th><th>Percentage</th></tr></thead><tbody>';
                let totalVotesForPosition = 0;
                const candidatesForPosition = candidatesSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

                candidatesForPosition.forEach(candidate => {
                    totalVotesForPosition += (candidate.votes || 0);
                });

                candidatesForPosition.forEach(candidate => {
                    const percentage = totalVotesForPosition > 0 ? ((candidate.votes / totalVotesForPosition) * 100).toFixed(2) : '0.00';
                    resultsHtml += `
                        <tr>
                            <td>${candidate.name}</td>
                            <td>${candidate.party || 'Independent'}</td>
                            <td>${candidate.votes || 0}</td>
                            <td>${percentage}%</td>
                        </tr>
                    `;
                });
                resultsHtml += '</tbody></table>';
                resultsHtml += `<p><strong>Total Votes for ${position}:</strong> ${totalVotesForPosition}</p>`;
            }
            elements.resultsDisplayContainer.innerHTML = resultsHtml;

        } catch (error) {
            console.error('Error displaying election results:', error);
            elements.resultsDisplayContainer.innerHTML = '<p class="error-message">Failed to load results.</p>';
            displayMessage(elements.adminErrorMessage, 'Failed to load election results.', 'error');
        }
    }
});