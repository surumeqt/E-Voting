// E-Vote/public/js/auth-redirect.js

document.addEventListener('DOMContentLoaded', async () => {
    const REDIRECT_DELAY = 500; // Time before redirection happens

    // Optional: DOM elements for messages/hiding forms
    const mainContent = document.getElementById('main-content'); // e.g., the div wrapping your login form
    const messageArea = document.getElementById('redirect-message'); // A small div to show redirect message

    // Helper for displaying messages (can be simplified if you only need the redirect)
    function displayMessage(element, message, type) {
        if (!element) return; // Exit if element doesn't exist
        element.textContent = message;
        element.className = `message-box ${type}-message`; // Requires basic CSS for .message-box, .info-message etc.
        element.style.display = 'block';
    }

    try {
        const response = await fetch('/verifySession'); // Call the server-side endpoint
        if (!response.ok) {
            // Treat server error as not logged in, but log for debugging
            console.error('Failed to verify session with server, assuming not logged in:', response.statusText);
            return; // Don't redirect, let login/register form display
        }
        const data = await response.json();

        if (data.loggedIn) {
            // User is logged in according to the server!
            if (mainContent) mainContent.style.display = 'none'; // Hide the login/register form
            displayMessage(messageArea || document.body, `You are already logged in as ${data.userRole}. Redirecting...`, 'info');

            let redirectPath = '/login'; // Default fallback, though should be caught by userRole
            if (data.userRole === 'voter') {
                redirectPath = '/voter';
            } else if (data.userRole === 'candidate') {
                redirectPath = '/candidate-profile';
            } else if (data.userRole === 'admin') {
                redirectPath = '/admin';
            }

            // Perform the redirection
            await new Promise(resolve => setTimeout(resolve, REDIRECT_DELAY));
            window.location.href = redirectPath;
        } else {
            // User is NOT logged in (or session expired on server), show login/register form
            if (mainContent) mainContent.style.display = 'block'; // Ensure form is visible
            if (messageArea) messageArea.style.display = 'none'; // Hide any messages from previous runs
        }
    } catch (error) {
        console.error('Error during session verification:', error);
        // If there's an error reaching the server, assume not logged in and show form
        if (mainContent) mainContent.style.display = 'block';
        displayMessage(messageArea || document.body, 'Could not verify session. Please proceed with login/registration.', 'error');
    }
});