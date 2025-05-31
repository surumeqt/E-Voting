
import { auth, db, storage } from './firebase-config.js';
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, runTransaction, orderBy  } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';
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

// Make sure 'allCandidates' is declared appropriately, e.g., at the top of your module if it's global
let allCandidates = [];

async function loadCandidates(filterPosition = '', searchTerm = '') {
    elements.candidatesListContainer.innerHTML = '<p class="loading-placeholder">Loading candidates...</p>';
    try {
        // ALWAYS START WITH A FRESH COLLECTION REFERENCE
        const candidatesCollectionRef = collection(db, 'candidates');

        // If you were applying Firestore-side filters:
        let firestoreQuery = candidatesCollectionRef;
        // Example: if you wanted to filter by position BEFORE fetching all
        // if (filterPosition) {
        //     firestoreQuery = query(firestoreQuery, where('position', '==', filterPosition));
        // }
        // Note: Firestore doesn't support 'includes' for search terms, so 'searchTerm' must be client-side filtered.

        const querySnapshot = await getDocs(firestoreQuery); // Execute getDocs on the query/collection reference

        // Now populate the array with the fetched data
        allCandidates = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

        // Perform client-side filtering and sorting on 'allCandidates' array
        let filtered = allCandidates;

        if (filterPosition) {
            filtered = filtered.filter(c => c.position === filterPosition);
        }
        if (searchTerm) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(c =>
                c.name.toLowerCase().includes(lowerSearchTerm) ||
                (c.district && c.district.toLowerCase().includes(lowerSearchTerm)) ||
                (c.party && c.party.toLowerCase().includes(lowerSearchTerm))
            );
        }

        elements.candidatesListContainer.innerHTML = '';
        if (filtered.length === 0) {
            elements.candidatesListContainer.innerHTML = '<p class="no-data-message">No candidates found matching your criteria.</p>';
            return;
        }

        filtered.sort((a, b) => {
            if (a.position === b.position) {
                return (a.ballotOrder || 999) - (b.ballotOrder || 999);
            }
            return a.position.localeCompare(b.position);
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
                    <h3>${candidate.name} (${candidate.party || 'Independent'})</h3>
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
        if (!elements.candidateFilterPosition.options.length > 1) {
            const positions = new Set();
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
                <label for="candidate-name">Full Name:</label>
                <input type="text" id="candidate-name" required>
            </div>
            <div class="form-group">
                <label for="candidate-party">Party:</label>
                <input type="text" id="candidate-party" placeholder="e.g., Liberal Party">
            </div>
            <div class="form-group">
                <label for="candidate-position">Position:</label>
                <select id="candidate-position" required>
                    <option value="">Select Position</option>
                    </select>
            </div>
            <div class="form-group">
                <label for="candidate-district">District:</label>
                <input type="text" id="candidate-district" required>
            </div>
            <div class="form-group">
                <label for="candidate-ballot-order">Ballot Order:</label>
                <input type="number" id="candidate-ballot-order" min="1" placeholder="e.g., 1, 2">
            </div>
            <div class="form-group">
                <label for="candidate-running-mate">Running Mate (Optional):</label>
                <input type="text" id="candidate-running-mate">
            </div>
            <div class="form-group">
                <label for="candidate-platform">Platform/Manifesto:</label>
                <textarea id="candidate-platform" rows="4"></textarea>
            </div>
            <div class="form-group">
                <label for="candidate-photo">Photo:</label>
                <input type="file" id="candidate-photo" accept="image/*">
                <img id="photo-preview" class="image-preview" src="#" alt="Photo Preview" style="display: none;">
            </div>
            <div class="form-group">
                <input type="checkbox" id="candidate-is-active" checked>
                <label for="candidate-is-active">Is Active</label>
            </div>
            `,
            async (e) => {
                const name = document.getElementById('candidate-name').value.trim();
                const party = document.getElementById('candidate-party').value.trim() || 'Independent';
                const position = document.getElementById('candidate-position').value;
                const district = document.getElementById('candidate-district').value.trim();
                const ballotOrder = parseInt(document.getElementById('candidate-ballot-order').value) || 0;
                const runningMateName = document.getElementById('candidate-running-mate').value.trim();
                const platform = document.getElementById('candidate-platform').value.trim();
                const isActive = document.getElementById('candidate-is-active').checked;
                const photoFile = document.getElementById('candidate-photo').files[0];

                if (!name || !position || !district) {
                    throw new Error('Please fill all required fields: Full Name, Position, District.');
                }

                let photoURL = '';
                if (photoFile) {
                    displayMessage(elements.adminLoadingMessage, 'Uploading photo...', 'loading', 0);
                    const photoRef = ref(storage, `candidate_photos/${Date.now()}_${photoFile.name}`);
                    await uploadBytes(photoRef, photoFile);
                    photoURL = await getDownloadURL(photoRef);
                    displayMessage(elements.adminLoadingMessage, '', 'loading', 0);
                }

                await addDoc(collection(db, 'candidates'), {
                    name,
                    party,
                    position,
                    district,
                    ballotOrder,
                    runningMateName: runningMateName || null,
                    platform: platform || null,
                    isActive,
                    photoURL: photoURL || null,
                    votes: 0,
                    createdAt: new Date().toISOString()
                });
                loadCandidates();
            },
            (modal) => {
                const positionSelect = modal.querySelector('#candidate-position');
                const positions = new Set();
                allElections.forEach(election => {
                    if (election.positions) election.positions.forEach(p => positions.add(p));
                });
                Array.from(positions).sort().forEach(position => {
                    const option = document.createElement('option');
                    option.value = position;
                    option.textContent = position;
                    positionSelect.appendChild(option);
                });

                const photoInput = modal.querySelector('#candidate-photo');
                const photoPreview = modal.querySelector('#photo-preview');
                photoInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            photoPreview.src = e.target.result;
                            photoPreview.style.display = 'block';
                        };
                        reader.readAsDataURL(file);
                    } else {
                        photoPreview.style.display = 'none';
                    }
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
                <label for="edit-candidate-name">Full Name:</label>
                <input type="text" id="edit-candidate-name" value="${candidate.name}" required>
            </div>
            <div class="form-group">
                <label for="edit-candidate-party">Party:</label>
                <input type="text" id="edit-candidate-party" value="${candidate.party || ''}" placeholder="e.g., Liberal Party">
            </div>
            <div class="form-group">
                <label for="edit-candidate-position">Position:</label>
                <select id="edit-candidate-position" required>
                    <option value="">Select Position</option>
                    </select>
            </div>
            <div class="form-group">
                <label for="edit-candidate-district">District:</label>
                <input type="text" id="edit-candidate-district" value="${candidate.district || ''}" required>
            </div>
            <div class="form-group">
                <label for="edit-candidate-ballot-order">Ballot Order:</label>
                <input type="number" id="edit-candidate-ballot-order" min="1" value="${candidate.ballotOrder || ''}" placeholder="e.g., 1, 2">
            </div>
            <div class="form-group">
                <label for="edit-candidate-running-mate">Running Mate (Optional):</label>
                <input type="text" id="edit-candidate-running-mate" value="${candidate.runningMateName || ''}">
            </div>
            <div class="form-group">
                <label for="edit-candidate-platform">Platform/Manifesto:</label>
                <textarea id="edit-candidate-platform" rows="4">${candidate.platform || ''}</textarea>
            </div>
            <div class="form-group">
                <label for="edit-candidate-photo">Photo:</label>
                <input type="file" id="edit-candidate-photo" accept="image/*">
                <img id="edit-photo-preview" class="image-preview" src="${candidate.photoURL || '#'}" alt="Photo Preview" style="${candidate.photoURL ? 'display: block;' : 'display: none;'}">
                ${candidate.photoURL ? `<small>Current photo. Upload new to change.</small>` : `<small>No current photo.</small>`}
            </div>
            <div class="form-group">
                <input type="checkbox" id="edit-candidate-is-active" ${candidate.isActive ? 'checked' : ''}>
                <label for="edit-candidate-is-active">Is Active</label>
            </div>
            `,
            async (e) => {
                const name = document.getElementById('edit-candidate-name').value.trim();
                const party = document.getElementById('edit-candidate-party').value.trim() || 'Independent';
                const position = document.getElementById('edit-candidate-position').value;
                const district = document.getElementById('edit-candidate-district').value.trim();
                const ballotOrder = parseInt(document.getElementById('edit-candidate-ballot-order').value) || 0;
                const runningMateName = document.getElementById('edit-candidate-running-mate').value.trim();
                const platform = document.getElementById('edit-candidate-platform').value.trim();
                const isActive = document.getElementById('edit-candidate-is-active').checked;
                const photoFile = document.getElementById('edit-candidate-photo').files[0];

                if (!name || !position || !district) {
                    throw new Error('Please fill all required fields: Full Name, Position, District.');
                }

                let photoURL = candidate.photoURL || null;
                if (photoFile) {
                    displayMessage(elements.adminLoadingMessage, 'Uploading new photo...', 'loading', 0);
                    const photoRef = ref(storage, `candidate_photos/${Date.now()}_${photoFile.name}`);
                    await uploadBytes(photoRef, photoFile);
                    photoURL = await getDownloadURL(photoRef);
                    displayMessage(elements.adminLoadingMessage, '', 'loading', 0);
                }

                await updateDoc(doc(db, 'candidates', uid), {
                    name,
                    party,
                    position,
                    district,
                    ballotOrder,
                    runningMateName: runningMateName || null,
                    platform: platform || null,
                    isActive,
                    photoURL: photoURL,
                    lastUpdated: new Date().toISOString()
                });
                loadCandidates();
            },
            (modal) => {
                const positionSelect = modal.querySelector('#edit-candidate-position');
                const positions = new Set();
                allElections.forEach(election => {
                    if (election.positions) election.positions.forEach(p => positions.add(p));
                });
                Array.from(positions).sort().forEach(pos => {
                    const option = document.createElement('option');
                    option.value = pos;
                    option.textContent = pos;
                    positionSelect.appendChild(option);
                });
                if (candidate.position) {
                    positionSelect.value = candidate.position;
                }

                const photoInput = modal.querySelector('#edit-candidate-photo');
                const photoPreview = modal.querySelector('#edit-photo-preview');
                photoInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            photoPreview.src = e.target.result;
                            photoPreview.style.display = 'block';
                        };
                        reader.readAsDataURL(file);
                    } else {
                        photoPreview.src = candidate.photoURL || '#';
                        photoPreview.style.display = candidate.photoURL ? 'block' : 'none';
                    }
                });
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
            const candidate = allCandidates.find(c => c.uid === uid);
            if (candidate && candidate.photoURL) {
                const photoRef = ref(storage, candidate.photoURL);
                try {
                } catch (storageError) {
                    console.warn("Could not delete candidate photo from storage (might not exist or permission issue):", storageError.message);
                }
            }

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



    async function loadVoters(searchTerm = '') {
        elements.votersListContainer.innerHTML = '<p class="loading-placeholder">Loading voters...</p>';
        try {
            const votersSnapshot = await getDocs(collection(db, 'users'));
            allVoters = votersSnapshot.docs
                .filter(doc => doc.data().role === 'voter')
                .map(doc => ({ uid: doc.id, ...doc.data() }));

            let filteredVoters = allVoters;

            if (searchTerm) {
                const lowerSearchTerm = searchTerm.toLowerCase();
                filteredVoters = filteredVoters.filter(voter =>
                    (voter.fullName && voter.fullName.toLowerCase().includes(lowerSearchTerm)) ||
                    (voter.email && voter.email.toLowerCase().includes(lowerSearchTerm)) ||
                    (voter.district && voter.district.toLowerCase().includes(lowerSearchTerm)) ||
                    (voter.contactNumber && voter.contactNumber.toLowerCase().includes(lowerSearchTerm))
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
                        <h3>${voter.fullName || 'N/A'}</h3>
                        <p><strong>Email:</strong> ${voter.email || 'N/A'}</p>
                        <p><strong>District:</strong> ${voter.district || 'N/A'}</p>
                        <p><strong>Contact:</strong> ${voter.contactNumber || 'N/A'}</p>
                        <p><strong>Registered:</strong> ${voter.createdAt ? new Date(voter.createdAt).toLocaleDateString() : 'N/A'}</p>
                        <p><strong>Voted Positions:</strong> ${Object.keys(voter.votes?.[CURRENT_ELECTION_ID] || {}).filter(key => key.startsWith('votedCandidateId_')).map(key => key.replace('votedCandidateId_', '')).join(', ') || 'None'}</p>
                    </div>
                    <div class="actions">
                        <button class="edit-button" data-uid="${voter.uid}">Edit</button>
                        <button class="reset-vote-button" data-uid="${voter.uid}">Reset Vote</button>
                        <button class="delete-button" data-uid="${voter.uid}">Delete</button>
                    </div>
                `;
                elements.votersListContainer.appendChild(voterCard);
            });

            elements.votersListContainer.querySelectorAll('.edit-button').forEach(button => {
                button.addEventListener('click', (e) => editVoter(e.target.dataset.uid));
            });
            elements.votersListContainer.querySelectorAll('.reset-vote-button').forEach(button => {
                button.addEventListener('click', (e) => resetVoterVote(e.target.dataset.uid, e.target));
            });
            elements.votersListContainer.querySelectorAll('.delete-button').forEach(button => {
                button.addEventListener('click', (e) => deleteVoter(e.target.dataset.uid, e.target));
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

    async function editVoter(uid) {
        const voter = allVoters.find(v => v.uid === uid);
        if (!voter) {
            displayMessage(elements.adminErrorMessage, 'Voter not found!', 'error');
            return;
        }

        createFormModal(
            `Edit Voter: ${voter.fullName || voter.email}`,
            `
            <div class="form-group">
                <label for="edit-voter-full-name">Full Name:</label>
                <input type="text" id="edit-voter-full-name" value="${voter.fullName || ''}" required>
            </div>
            <div class="form-group">
                <label for="edit-voter-email">Email:</label>
                <input type="email" id="edit-voter-email" value="${voter.email || ''}" disabled> </div>
            <div class="form-group">
                <label for="edit-voter-district">District:</label>
                <input type="text" id="edit-voter-district" value="${voter.district || ''}" required>
            </div>
            <div class="form-group">
                <label for="edit-voter-contact-number">Contact Number:</label>
                <input type="text" id="edit-voter-contact-number" value="${voter.contactNumber || ''}">
            </div>
            `,
            async (e) => {
                const fullName = document.getElementById('edit-voter-full-name').value.trim();
                const district = document.getElementById('edit-voter-district').value.trim();
                const contactNumber = document.getElementById('edit-voter-contact-number').value.trim() || null;

                if (!fullName || !district) {
                    throw new Error('Full Name and District are required.');
                }

                await updateDoc(doc(db, 'users', uid), {
                    fullName,
                    district,
                    contactNumber,
                    lastUpdated: new Date().toISOString()
                });
                loadVoters();
            }
        );
    }

    async function resetVoterVote(uid, buttonElement) {
        if (!confirm('Are you sure you want to RESET this voter\'s votes for the CURRENT ELECTION? This action should be used with extreme caution and has audit implications.')) {
            return;
        }

        const originalText = buttonElement.textContent;
        buttonElement.disabled = true;
        buttonElement.innerHTML = 'Resetting... <i class="fas fa-spinner fa-spin"></i>';

        try {
            await runTransaction(db, async (transaction) => {
                const voterRef = doc(db, 'users', uid);
                const voterDoc = await transaction.get(voterRef);

                if (!voterDoc.exists()) {
                    throw new Error('Voter not found.');
                }

                const voterData = voterDoc.data();
                const currentElectionVotes = voterData.votes?.[CURRENT_ELECTION_ID];

                if (currentElectionVotes) {
                    for (const key in currentElectionVotes) {
                        if (key.startsWith('votedCandidateId_')) {
                            const position = key.replace('votedCandidateId_', '');
                            const votedCandidateId = currentElectionVotes[key];

                            if (votedCandidateId) {
                                const candidateRef = doc(db, 'candidates', votedCandidateId);
                                const candidateDoc = await transaction.get(candidateRef);
                                if (candidateDoc.exists()) {
                                    const candidateData = candidateDoc.data();
                                    const newVotes = Math.max(0, (candidateData.votes || 0) - 1);
                                    transaction.update(candidateRef, { votes: newVotes });
                                    console.log(`Decremented vote for candidate ${votedCandidateId} (position ${position})`);
                                }
                            }
                        }
                    }

                    const updatedVotes = { ...voterData.votes };
                    delete updatedVotes[CURRENT_ELECTION_ID];
                    transaction.update(voterRef, { votes: updatedVotes });
                    console.log(`Voter ${uid} votes for ${CURRENT_ELECTION_ID} reset.`);
                } else {
                    console.log(`Voter ${uid} had no votes for ${CURRENT_ELECTION_ID} to reset.`);
                }
            });

            displayMessage(elements.adminSuccessMessage, 'Voter votes reset successfully!', 'success');
            loadVoters();
        } catch (error) {
            console.error('Error resetting voter vote:', error);
            displayMessage(elements.adminErrorMessage, `Failed to reset vote: ${error.message}`, 'error');
        } finally {
            buttonElement.disabled = false;
            buttonElement.textContent = originalText;
        }
    }


    async function deleteVoter(uid, buttonElement) {
        if (!confirm('Are you sure you want to delete this voter? This action cannot be undone.')) {
            return;
        }

        const originalText = buttonElement.textContent;
        buttonElement.disabled = true;
        buttonElement.innerHTML = 'Deleting... <i class="fas fa-spinner fa-spin"></i>';

        try {
            await deleteDoc(doc(db, 'users', uid));
            displayMessage(elements.adminSuccessMessage, 'Voter deleted successfully!', 'success');
            loadVoters();
        } catch (error) {
            console.error('Error deleting voter:', error);
            displayMessage(elements.adminErrorMessage, `Failed to delete voter: ${error.message}`, 'error');
        } finally {
            buttonElement.disabled = false;
            buttonElement.textContent = originalText;
        }
    }



    async function populateResultsElectionSelect() {
        if (allElections.length === 0) {
            const electionsSnapshot = await getDocs(collection(db, 'elections'));
            allElections = electionsSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        }

        elements.resultsElectionSelect.innerHTML = '<option value="">Select Election</option>';
        allElections.sort((a,b) => a.name.localeCompare(b.name)).forEach(election => {
            const option = document.createElement('option');
            option.value = election.uid;
            option.textContent = election.name;
            elements.resultsElectionSelect.appendChild(option);
        });
        elements.resultsPositionSelect.innerHTML = '<option value="">Select Position</option>';
    }

    elements.resultsElectionSelect.addEventListener('change', () => {
        const selectedElectionId = elements.resultsElectionSelect.value;
        elements.resultsPositionSelect.innerHTML = '<option value="">Select Position</option>';
        elements.resultsDisplayContainer.innerHTML = '<p class="info-message">Select a position to view results.</p>';

        if (selectedElectionId) {
            const selectedElection = allElections.find(e => e.uid === selectedElectionId);
            if (selectedElection && selectedElection.positions) {
                selectedElection.positions.sort().forEach(position => {
                    const option = document.createElement('option');
                    option.value = position;
                    option.textContent = position;
                    elements.resultsPositionSelect.appendChild(option);
                });
            }
        }
    });

    elements.resultsPositionSelect.addEventListener('change', () => {
        const selectedElectionId = elements.resultsElectionSelect.value;
        const selectedPosition = elements.resultsPositionSelect.value;
        if (selectedElectionId && selectedPosition) {
            displayResults(selectedElectionId, selectedPosition);
        } else {
            elements.resultsDisplayContainer.innerHTML = '<p class="info-message">Select an election and position to view results.</p>';
        }
    });

    async function displayResults(electionId, position) {
        elements.resultsDisplayContainer.innerHTML = '<p class="loading-placeholder">Loading results...</p>';
        try {
            const candidatesQuery = query(
                collection(db, 'candidates'),
                where('position', '==', position)
            );
            const candidatesSnapshot = await getDocs(candidatesQuery);
            const candidatesForPosition = candidatesSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));


            candidatesForPosition.sort((a, b) => (b.votes || 0) - (a.votes || 0));

            let resultsHtml = '<h3>Results for: ' + position + '</h3>';
            if (candidatesForPosition.length === 0) {
                resultsHtml += '<p class="no-data-message">No candidates found for this position or no votes cast yet.</p>';
            } else {
                resultsHtml += '<table class="results-table">';
                resultsHtml += `
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Candidate</th>
                            <th>Party</th>
                            <th>District</th>
                            <th>Votes</th>
                        </tr>
                    </thead>
                    <tbody>
                `;
                candidatesForPosition.forEach((candidate, index) => {
                    resultsHtml += `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${candidate.name}</td>
                            <td>${candidate.party || 'Independent'}</td>
                            <td>${candidate.district || 'N/A'}</td>
                            <td>${candidate.votes || 0}</td>
                        </tr>
                    `;
                });
                resultsHtml += '</tbody></table>';
            }
            elements.resultsDisplayContainer.innerHTML = resultsHtml;

        } catch (error) {
            console.error('Error displaying results:', error);
            elements.resultsDisplayContainer.innerHTML = '<p class="error-message">Failed to load results.</p>';
            displayMessage(elements.adminErrorMessage, 'Failed to load results.', 'error');
        }
    }


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
            console.error('Error during admin logout:', error);
            displayMessage(elements.adminErrorMessage, 'Logout failed. Please try again.', 'error');
        }
    });

    document.querySelector('.tab-button[data-tab="dashboard-section"]').click();
});