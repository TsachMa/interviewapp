document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const transcriptionResult = document.getElementById('transcriptionResult');
    const chatHistoryElement = document.getElementById('chatHistory');
    const clearHistoryButton = document.getElementById('clearHistoryButton');
    const endInterviewButton = document.getElementById('endInterviewButton');
    
    // Syntax highlighting setup
    const pythonCode = document.getElementById('pythonCode');
    const highlightingContent = document.getElementById('highlighting-content');
    
    let chatHistory = [];

    // Load chat history from localStorage if available
    const chatHistoryManager = ChatHistoryManager.init({
        chatHistoryElement: chatHistoryElement,
        clearHistoryButton: clearHistoryButton,
        onPhaseChange: function(newPhase) {
            interviewPhase = newPhase;
            if (newPhase === 'clarification') {
                messagesCount = 0;
            } else {
                messagesCount = chatHistoryManager.getMessageCount();
            }
        }
    });
    
    // Track interview phase
    let interviewPhase = "clarification"; // Start in clarification phase, will change to "coding" later
    let messagesCount = 0; // Track number of exchanges to help determine phase transition

    // Initialize AudioManager
    const audioManager = AudioManager.init({
        recordButton: recordButton,
        transcriptionResult: transcriptionResult,
        onTranscriptionComplete: function(transcript) {
            // Handle completed transcription
            if (transcript) {
                transcriptionResult.innerHTML += '<p>Sending to Gemini...</p>';
                
                // Add user message to displayed chat history
                chatHistoryManager.addMessage('user', transcript);
                
                // Check if we should transition phases based on the response
                callGemini(transcript).then(response => {
                    // Check if the response signals a phase change
                    if (response.includes("You can start coding now. I'll only respond to direct questions from this point on.")) {
                        interviewPhase = "coding";
                    }
                    
                    // In coding phase, check if the response starts with the question/notquestion indicator
                    let displayResponse = response;
                    if (interviewPhase === "coding") {
                        if (response.startsWith("notquestion")) {
                            // Only autorestart recording if not a question - don't actually show response
                            return; // Skip displaying and speaking
                        }
                    }
                    
                    transcriptionResult.innerHTML += `<div class="mt-3 p-3 bg-light rounded"><h5>Gemini Response:</h5><p>${displayResponse}</p></div>`;
                    
                    // Add assistant message to displayed chat history
                    chatHistoryManager.addMessage('assistant', displayResponse);
                    
                    // Speaking will handle restarting recording when done
                    audioManager.speakWithElevenLabs(displayResponse);
                    
                    // Increment message count
                    messagesCount++;
                });
            }
        },
        onSpeechEnd: function() {
            // Called when speech ends
            if (audioManager.autoRestart) {
                setTimeout(() => audioManager.startRecording(), 500);
            }
        }
    });

    // problem statement
    const problemStatement = document.getElementById('problemStatement');
    const editProblemButton = document.getElementById('editProblemButton');

    const problemStatementManager = ProblemStatementManager.init({
        problemStatementElement: problemStatement,
        editProblemButton: editProblemButton,
        onProblemChange: updateChatHistoryWithProblem
    });

    // Function to update chat history with new problem statement
    function updateChatHistoryWithProblem(problemText) {
        // Update the initial prompt with new problem
        chatHistory[0] = {
            "role": "user", 
            "parts": [`
                Pretend you are a interviewer conducting a programming interview. 
                The user is going to solve the following problem:
                ${problemText}
                
                Guide the user through the process of solving the problem.
                
                The user will be writing code in a Python editor. I will share the current state 
                of their code with you in each message. Please reference their code 
                when giving feedback, suggestions, or asking questions.

                IMPORTANT: You will operate in two phases:
                1. In the "clarification" phase, respond eagerly to everything the user says.
                2. In the "coding" phase, only respond to direct questions. 
                
                When you think the user is ready to start coding, include the phrase "You can start coding now. I'll only 
                respond to direct questions from this point on." in your response to signal the phase change.

                DO NOT INCLUDE ANY SPECIAL CHARACTERS LIKE * OR # OR ' IN YOUR RESPONSES. 
                DO NOT RESPOND WITH MORE THAN TWO SENTENCES.
            `]
        };
    }
    
    // Add a "Saved Interviews" button to the sidebar
    const savedInterviewsButton = document.createElement('a');
    savedInterviewsButton.href = '/interviews';
    savedInterviewsButton.className = 'btn btn-outline-primary w-100 mt-3';
    savedInterviewsButton.innerHTML = '<i class="bi bi-folder"></i> Saved Interviews';
    
    // Find the clear history button and insert the new button after it
    clearHistoryButton.parentNode.insertBefore(savedInterviewsButton, clearHistoryButton.nextSibling);

    // End interview handler
    endInterviewButton.addEventListener('click', function() {
        endInterview();
    });
    
    function endInterview() {
        // Stop any ongoing recording or speech
        if (audioManager.isCurrentlyRecording()) {
            audioManager.stopRecording();
        }
        audioManager.stopCurrentSpeech();
        
        // Save the current code to localStorage as a backup
        localStorage.setItem('pythonCode', pythonCode.value);
        
        // Get all chat history
        const chatHistoryData = chatHistoryManager.getAllMessages();
        
        // Save the interview to the database
        saveInterviewToDatabase(
            'Interview ' + new Date().toLocaleString(), 
            pythonCode.value,
            chatHistoryData, 
            'completed'
        ).then(result => {
            if (result.success) {
                // Redirect to the analysis page for this interview
                window.location.href = `/analysis/${result.interview_id}`;
            } else {
                // If there's an error saving to database, fall back to localStorage
                window.location.href = '/analysis';
            }
        }).catch(error => {
            console.error('Error saving interview:', error);
            // Fall back to localStorage if database save fails
            window.location.href = '/analysis';
        });
    }
    
    // Function to save interview to the database
    async function saveInterviewToDatabase(title, code, chatHistory, status = 'completed') {
        try {
            const response = await fetch('/save_interview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: title,
                    code: code,
                    chatHistory: chatHistory,
                    status: status
                })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Error saving to database:', error);
            return { success: false, error: error.message };
        }
    }    
    
    // Updated initial prompt to include awareness of code editor and phased behavior
    chatHistory.push({
        "role": "user", 
        "parts": [`
            Pretend you are a interviewer conducting a programming interview. 
            The user is going to solve the following problem:
            ${problemStatementManager.getCurrentProblem()}
            
            Guide the user through the process of solving the problem.
            
            The user will be writing code in a Python editor. I will share the current state 
            of their code with you in each message. Please reference their code 
            when giving feedback, suggestions, or asking questions.

            IMPORTANT: You will operate in two phases:
            1. In the "clarification" phase, respond eagerly to everything the user says.
            2. In the "coding" phase, only respond to direct questions. 
            
            When you think the user is ready to start coding, include the phrase "You can start coding now. I'll only 
            respond to direct questions from this point on." in your response to signal the phase change.

            DO NOT INCLUDE ANY SPECIAL CHARACTERS LIKE * OR # OR ' IN YOUR RESPONSES. 
            DO NOT RESPOND WITH MORE THAN TWO SENTENCES.
        `]
    });
    
    // Update the pythonCode event listener to save to localStorage
    pythonCode.addEventListener('input', function() {
        updateHighlighting();
        // Save the code to localStorage whenever it changes
        localStorage.setItem('pythonCode', pythonCode.value);
    });
    
    // Function to load the code from localStorage when the page loads
    function loadCodeFromStorage() {
        const savedCode = localStorage.getItem('pythonCode');
        if (savedCode) {
            pythonCode.value = savedCode;
            updateHighlighting();
        }
    }
    
    // Call this function when the page loads
    loadCodeFromStorage();

    async function callGemini(text) {
        try {
            // Get the current code from the editor
            const currentCode = pythonCode.value;
            
            // Include the interview phase in the prompt
            const promptWithPhase = `[Current interview phase: ${interviewPhase}] ${text}`;
            
            chatHistory.push({"role": "user", "parts": [promptWithPhase]});
            const response = await fetch('/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    prompt: promptWithPhase,
                    history: chatHistory,
                    code: currentCode,  // Add the current code from the editor
                    interviewPhase: interviewPhase // Pass the current phase
                })
            });
            const data = await response.json();
            chatHistory.push({"role": "model", "parts": [data.response]});
            return data.response;
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            return 'Error getting response from Gemini';
        }
    }

    // Update the highlighting when the code changes
    function updateHighlighting() {
        // Get the code from the textarea
        const code = pythonCode.value;
        
        // Update the content of the highlighting element
        highlightingContent.textContent = code;
        
        // Apply highlight.js
        hljs.highlightElement(highlightingContent);
        
        // Sync scroll positions
        highlightingContent.scrollTop = pythonCode.scrollTop;
        highlightingContent.scrollLeft = pythonCode.scrollLeft;
    }
    
    // Add event listeners for the code editor
    pythonCode.addEventListener('input', updateHighlighting);
    pythonCode.addEventListener('scroll', function() {
        highlightingContent.scrollTop = pythonCode.scrollTop;
        highlightingContent.scrollLeft = pythonCode.scrollLeft;
    });
    
    // Handle tab key in the editor
    pythonCode.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;
            
            // Insert 4 spaces (Python standard) at cursor position
            this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
            
            // Move cursor after the inserted spaces
            this.selectionStart = this.selectionEnd = start + 4;
            
            // Update syntax highlighting
            updateHighlighting();
        }
    });
    
    // Initialize highlighting
    updateHighlighting();

    // Execute button functionality
    const executeButton = document.getElementById('executeButton');
    const executionResult = document.getElementById('executionResult');

    executeButton.addEventListener('click', async function() {
        const code = pythonCode.value;
        executionResult.innerHTML = '<p>Executing...</p>';
        
        try {
            const response = await fetch('/execute_python', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code: code })
            });
            
            const data = await response.json();
            
            if (data.error) {
                executionResult.innerHTML = `<p class="text-danger">Error: ${data.error}</p>`;
            } else {
                executionResult.innerHTML = `<pre class="bg-dark text-light p-2">${data.result}</pre>`;
            }
        } catch (error) {
            executionResult.innerHTML = `<p class="text-danger">Request failed: ${error.message}</p>`;
        }
    });

    // Add text message functionality
    const textMessageInput = document.getElementById('textMessageInput');
    const sendTextButton = document.getElementById('sendTextButton');
    
    // Add event listener for the send button
    sendTextButton.addEventListener('click', function() {
        sendTextMessage();
    });
    
    // Add event listener for Enter key in the text input
    textMessageInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            sendTextMessage();
        }
    });
    
    // Function to send text message
    function sendTextMessage() {
        const textMessage = textMessageInput.value.trim();
        
        if (textMessage) {
            // Clear the input field
            textMessageInput.value = '';
            
            // Add user message to displayed chat history
            chatHistoryManager.addMessage('user', textMessage);
            
            // Show processing state
            transcriptionResult.innerHTML = '<p>Sending to interviewer...</p>';
            
            // Call Gemini with the text message
            callGemini(textMessage).then(response => {
                // Check if the response signals a phase change
                if (response.includes("You can start coding now. I'll only respond to direct questions from this point on.")) {
                    interviewPhase = "coding";
                }
                
                // In coding phase, check if the response starts with the question/notquestion indicator
                let displayResponse = response;
                if (interviewPhase === "coding") {
                    if (response.startsWith("question")) {
                        // Remove the indicator before displaying
                        displayResponse = response.substring("question".length).trim();
                    } else if (response.startsWith("notquestion")) {
                        // Only autorestart recording if not a question - don't actually show response
                        displayResponse = response.substring("notquestion".length).trim();
                    }
                }
                
                transcriptionResult.innerHTML = `<div class="mt-3 p-3 bg-light rounded"><h5>Interviewer Response:</h5><p>${displayResponse}</p></div>`;
                
                // Add assistant message to displayed chat history
                chatHistoryManager.addMessage('assistant', displayResponse);
                
                // Speaking will handle restarting recording when done
                audioManager.speakWithElevenLabs(displayResponse);
                
                // Increment message count
                messagesCount++;
            });
        }
    }
});