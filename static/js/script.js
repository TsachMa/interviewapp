document.addEventListener('DOMContentLoaded', function() {
    // Handle the "Create Interview" button
    const createBtn = document.querySelector('.btn-primary');
    if (createBtn) {
        createBtn.addEventListener('click', function() {
            window.location.href = '/interviews';
        });
    }
    
    // Handle the "Add New Interview" card
    const newInterviewCard = document.querySelector('.new-interview');
    if (newInterviewCard) {
        newInterviewCard.addEventListener('click', function() {
            alert('Create a new interview form would appear here');
        });
    }
});