/**
 * Initializes the problem statement functionality.
 * @param {Object} options - Configuration options
 * @param {HTMLElement} options.problemStatementElement - The problem statement DOM element
 * @param {HTMLElement} options.editProblemButton - The edit button DOM element  
 * @param {Function} options.onProblemChange - Callback when problem statement changes
 */

function initProblemStatement(options) {
    const { 
        problemStatementElement, 
        editProblemButton,
        onProblemChange
    } = options;
    
    // Default problem statement if nothing is saved
    const DEFAULT_PROBLEM = `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.You may assume that each input would have exactly one solution, and you may not use the same element twice. You can return the answer in any order.

    Examples:
    Input: nums = [2,7,11,15], target = 9 => Output: [0,1]
    Input: nums = [3,2,4], target = 6 =>  Output: [1,2]
    Input: nums = [3,3], target = 6 =>  Output: [0,1]`;
    
    // Add event listener for the edit problem button
    editProblemButton.addEventListener('click', function() {
        const isEditable = problemStatementElement.contentEditable === 'true';
        if (isEditable) {
            // Save mode - disable editing
            problemStatementElement.contentEditable = 'false';
            editProblemButton.innerHTML = '<i class="bi bi-pencil"></i> Edit';
            editProblemButton.classList.replace('btn-success', 'btn-outline-primary');
            
            // Save to localStorage
            const newProblemText = problemStatementElement.innerText;
            localStorage.setItem('problemStatement', newProblemText);
            
            // Call the callback for problem change
            if (typeof onProblemChange === 'function') {
                onProblemChange(newProblemText);
            }
        } else {
            // Edit mode - enable editing
            problemStatementElement.contentEditable = 'true';
            editProblemButton.innerHTML = '<i class="bi bi-check"></i> Save';
            editProblemButton.classList.replace('btn-outline-primary', 'btn-success');
            problemStatementElement.focus();
        }
    });
    
    /**
     * Loads the problem statement from localStorage or sets default
     * @returns {string} The loaded problem statement
     */
    function loadProblemStatement() {
        const savedProblemStatement = localStorage.getItem('problemStatement');
        
        if (savedProblemStatement) {
            problemStatementElement.innerText = savedProblemStatement;
            
            // Call the callback for problem change
            if (typeof onProblemChange === 'function') {
                onProblemChange(savedProblemStatement);
            }
            
            return savedProblemStatement;
        } else {
            // If no saved problem, use the default
            problemStatementElement.innerText = DEFAULT_PROBLEM;
            
            // Call the callback for problem change
            if (typeof onProblemChange === 'function') {
                onProblemChange(DEFAULT_PROBLEM);
            }
            
            return DEFAULT_PROBLEM;
        }
    }
    
    /**
     * Updates the problem statement programmatically
     * @param {string} newProblemText - The new problem statement text
     */
    function setProblemStatement(newProblemText) {
        problemStatementElement.innerText = newProblemText;
        localStorage.setItem('problemStatement', newProblemText);
        
        // Call the callback for problem change
        if (typeof onProblemChange === 'function') {
            onProblemChange(newProblemText);
        }
    }
    
    // Initialize by loading the problem statement
    const currentProblem = loadProblemStatement();
    
    // Return public API
    return {
        loadProblemStatement,
        setProblemStatement,
        getCurrentProblem: () => problemStatementElement.innerText
    };
}

// Export as a global if in browser environment
if (typeof window !== 'undefined') {
    window.ProblemStatementManager = { init: initProblemStatement };
}