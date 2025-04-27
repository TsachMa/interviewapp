document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const transcriptionResult = document.getElementById('transcriptionResult');
    const chatHistoryElement = document.getElementById('chatHistory');
    const clearHistoryButton = document.getElementById('clearHistoryButton');
    const endInterviewButton = document.getElementById('endInterviewButton');
    
    // Syntax highlighting setup
    const pythonCode = document.getElementById('pythonCode');
    const highlightingContent = document.getElementById('highlighting-content');
   
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let chatHistory = [];
    let displayedChatHistory = []; // Array to store messages for display purposes

    let currentAudio = null;
    let stopButton = null;
    
    // Track interview phase
    let interviewPhase = "clarification"; // Start in clarification phase, will change to "coding" later
    let messagesCount = 0; // Track number of exchanges to help determine phase transition

    // Load chat history from localStorage if available
    loadChatHistory();

    // After DOMContentLoaded, add this code to create the stop button (but initially hidden)
    // Add this after the recordButton is defined
    stopButton = document.createElement('button');
    stopButton.id = 'stopSpeechButton';
    stopButton.className = 'btn btn-warning w-100 mb-3 d-none';
    stopButton.innerHTML = '<i class="bi bi-volume-mute-fill"></i> Stop Speech';
    recordButton.parentNode.insertBefore(stopButton, recordButton.nextSibling);
    
    // Add a "Saved Interviews" button to the sidebar
    const savedInterviewsButton = document.createElement('a');
    savedInterviewsButton.href = '/interviews';
    savedInterviewsButton.className = 'btn btn-outline-primary w-100 mt-3';
    savedInterviewsButton.innerHTML = '<i class="bi bi-folder"></i> Saved Interviews';
    
    // Find the clear history button and insert the new button after it
    clearHistoryButton.parentNode.insertBefore(savedInterviewsButton, clearHistoryButton.nextSibling);
    

    // Add event listener for the clear history button
    clearHistoryButton.addEventListener('click', function() {
        clearChatHistory();
        // Reset interview phase when clearing history
        interviewPhase = "clarification";
        messagesCount = 0;
    });

    // Add event listener for the stop button
    stopButton.addEventListener('click', function() {
        stopCurrentSpeech();
    });

    // Function to stop current speech
    function stopCurrentSpeech() {
        if (currentAudio && !currentAudio.paused) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            isSpeaking = false;
            stopButton.classList.add('d-none');
            
            // Only restart recording if in auto mode
            if (autoRestart) {
                setTimeout(startRecording, 500);
            }
        }
    }

    // Add this after other event listeners in the DOMContentLoaded function
    document.addEventListener('keydown', function(event) {
        // Escape key to stop speech
        if (event.key === 'Escape') {
            stopCurrentSpeech();
        }
    });

    // Updated initial prompt to include awareness of code editor and phased behavior
    chatHistory.push({
        "role": "user", 
        "parts": [`
            Pretend you are a interviewer conducting a programming interview. 
            The user is going to solve the problem 2Sum. 
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

    let pauseTimer = null;
    let autoRestart = true;

    const PAUSE_THRESHOLD = 500; // 5 seconds of silence

    // Create a new SpeechRecognition instance
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition(); 

    // Set the recognition parameters
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US'; // set the language to English 

    // variable to store the transcription result 
    let finalTranscript = '';

    // Add a click event listener to the recordButton
    recordButton.addEventListener('click', function() {
        if (!isRecording) {
            autoRestart = true;
            startRecording();
        } else {
            autoRestart = false; // Don't auto-restart on manual stop
            stopRecording();
        }
    });

    endInterviewButton.addEventListener('click', function() {
        endInterview();
    });
    
    function endInterview() {
        // Stop any ongoing recording or speech
        if (isRecording) {
            stopRecording();
        }
        stopCurrentSpeech();
        
        // Save the current code to localStorage as a backup
        localStorage.setItem('pythonCode', pythonCode.value);
        
        // Get all chat history
        const chatHistoryData = displayedChatHistory;
        
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
    

    async function startRecording() {
        // First stop any ongoing speech
        stopCurrentSpeech();
        
        transcriptionResult.innerHTML = '<p>Requesting access to your microphone...</p>';
        finalTranscript = ''; // reset the final transcript
        try {
            // request access to the user's microphone 
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            // create a new MediaRecorder instance
            mediaRecorder = new MediaRecorder(stream);

            // Set up event handlers for the MediaRecorder instance
            mediaRecorder.ondataavailable = function(event) {
                // when data is available, push it to the audioChunks array
                audioChunks.push(event.data);
            }

            
            mediaRecorder.onstop = function() {
                // when the recording is stopped, create a Blob from the audioChunks
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                // create a URL for the audio blob
                const audioUrl = URL.createObjectURL(audioBlob);

                // create an audio element to play back the recording 
                const audio = document.createElement('audio');
                audio.src = audioUrl
                audio.controls = true;

                // clear the previoous content and add the audio element 
                transcriptionResult.innerHTML = '';
                transcriptionResult.appendChild(audio);

                // stop all tracks to release the microphone
                stream.getTracks().forEach(track => track.stop());
            };

            // reset the audioChunks array
            audioChunks = [];
            
            // start recording 
            mediaRecorder.start();

            // start the speech recognition
            recognition.start();

            // update the button text and style
            isRecording = true;
            recordButton.innerHTML = '<i class="bi bi-mic-fill"></i> Stop Recording';
            recordButton.classList.replace('btn-primary', 'btn-danger');
            transcriptionResult.innerHTML = '<p>Recording...</p>';

        } catch (error) {
            console.error('Error accessing microphone:', error);
            transcriptionResult.innerHTML = '<p>Error accessing microphone. Please check your browser permissions.</p>';
        }
    }

    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            recognition.stop();
            isRecording = false;
            recordButton.innerHTML = '<i class="bi bi-mic-fill"></i> Record Audio';
            recordButton.classList.replace('btn-danger', 'btn-primary');
            
            if (finalTranscript) {
                transcriptionResult.innerHTML += '<p>Sending to Gemini...</p>';
                
                // Add user message to displayed chat history
                addMessageToDisplay('user', finalTranscript);
                
                // Check if we should transition phases based on the response
                callGemini(finalTranscript).then(response => {
                    // Check if the response signals a phase change
                    if (response.includes("You can start coding now. I'll only respond to direct questions from this point on.")) {
                        interviewPhase = "coding";
                    }
                    
                    // In coding phase, check if the response starts with the question/notquestion indicator
                    let displayResponse = response;
                    if (interviewPhase === "coding") {
                        if (response.startsWith("question")) {
                            // Remove the indicator before displaying
                        } else if (response.startsWith("notquestion")) {
                            // Only autorestart recording if not a question - don't actually show response
                            if (autoRestart && !isSpeaking) {
                                setTimeout(startRecording, 500);
                            }
                            return; // Skip displaying and speaking
                        }
                    }
                    
                    transcriptionResult.innerHTML += `<div class="mt-3 p-3 bg-light rounded"><h5>Gemini Response:</h5><p>${displayResponse}</p></div>`;
                    
                    // Add assistant message to displayed chat history
                    addMessageToDisplay('assistant', displayResponse);
                    
                    finalTranscript = '';
                    // Speaking will handle restarting recording when done
                    speakText(displayResponse);
                    
                    // Increment message count
                    messagesCount++;
                });
            } else if (autoRestart && !isSpeaking) {
                setTimeout(startRecording, 500);
            }
        }
    }
    
    // Function to add a message to the displayed chat history
    function addMessageToDisplay(role, text) {
        // Create a new message object
        const message = {
            role: role,
            text: text,
            timestamp: new Date().toISOString()
        };
        
        // Add to the displayed chat history array
        displayedChatHistory.push(message);
        
        // Update the chat history display
        updateChatHistoryDisplay();
        
        // Save to localStorage
        saveChatHistory();
    }
    
    // Function to update the chat history display
    function updateChatHistoryDisplay() {
        // Clear the current display
        chatHistoryElement.innerHTML = '';
        
        // Add each message to the display
        displayedChatHistory.forEach(message => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`;
            
            // Create header with role and timestamp
            const header = document.createElement('div');
            header.className = 'message-header small text-muted';
            
            // Format the timestamp
            const timestamp = new Date(message.timestamp);
            const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            header.textContent = `${message.role === 'user' ? 'You' : 'Interviewer'} - ${timeString}`;
            
            // Create content
            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = message.text;
            
            // Add header and content to message
            messageDiv.appendChild(header);
            messageDiv.appendChild(content);
            
            // Add message to chat history
            chatHistoryElement.appendChild(messageDiv);
        });
        
        // Scroll to the bottom
        chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight;
    }
    
    // Function to save chat history to localStorage
    function saveChatHistory() {
        localStorage.setItem('interviewChatHistory', JSON.stringify(displayedChatHistory));
    }
    
    // Function to load chat history from localStorage
    function loadChatHistory() {
        const savedHistory = localStorage.getItem('interviewChatHistory');
        if (savedHistory) {
            displayedChatHistory = JSON.parse(savedHistory);
            updateChatHistoryDisplay();
            
            // Check if we need to restore interview phase by looking for the phase change message
            const phaseChangeIndex = displayedChatHistory.findIndex(msg => 
                msg.role === 'assistant' && 
                msg.text.includes("You can start coding now. I'll only respond to direct questions from this point on.")
            );
            
            if (phaseChangeIndex !== -1) {
                interviewPhase = "coding";
                messagesCount = displayedChatHistory.length;
            }
        }
    }
    
    // Function to clear chat history
    function clearChatHistory() {
        // Clear the chat history array
        displayedChatHistory = [];
        
        // Update the display
        updateChatHistoryDisplay();
        
        // Clear from localStorage
        localStorage.removeItem('interviewChatHistory');
    }

    function speakText(text) {
        // const utterance = new SpeechSynthesisUtterance(text);
        // window.speechSynthesis.speak(utterance);
        speakWithElevenLabs(text);
    }

    // Add an event listener for when the recognition result is available


    // Modify the recognition.onresult function
    recognition.onresult = function(event) {
        let interimTranscript = '';
        
        // Reset pause timer on new speech
        clearTimeout(pauseTimer);
        
        // Loop through the results
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
                
                // Set timer to detect pause after speech ends - only trigger on pause in clarification phase
                // or if it's likely a question in coding phase
                pauseTimer = setTimeout(() => {
                    if (finalTranscript && isRecording) {
                        // In clarification phase, always respond
                        stopRecording();
                    }
                }, PAUSE_THRESHOLD);
            } else {
                interimTranscript += transcript;
            }
        }
        
        // Display results
        if (isRecording) {
            transcriptionResult.innerHTML = '<p>Recording...</p>';
            transcriptionResult.innerHTML += '<p><i>Current: ' + interimTranscript + '</i></p>';
            transcriptionResult.innerHTML += '<p><b>Transcript so far:</b> ' + finalTranscript + '</p>';
            
            // Display current interview phase
            transcriptionResult.innerHTML += `<p><small>Interview phase: ${interviewPhase}</small></p>`;
        }
    };
    // Handle errors 
    recognition.onerror = function(event) {
        console.error('Speech recognition error detected:', event.error);
        transcriptionResult.innerHTML = '<p>Error occurred while recognizing speech. Please try again.</p>';
    };
    recognition.onend = function() {
        // If recording is still supposed to be happening but recognition stopped
        if (isRecording && autoRestart) {
            // Try to restart recognition
            setTimeout(() => {
                try {
                    recognition.start();
                } catch (e) {
                    console.error('Could not restart recognition:', e);
                }
            }, 500);
        }
    };

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

    let isSpeaking = false;

    // Modify the speakWithElevenLabs function
    async function speakWithElevenLabs(text) {
        try {
            isSpeaking = true;
            const response = await fetch('/elevenlabs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: text })
            });
            
            if (!response.ok) throw new Error('API call failed');
            
            const data = await response.json();
            if (data.audio_url) {
                // Store the audio element globally
                currentAudio = new Audio(data.audio_url);
                
                // Show the stop button when speech starts
                stopButton.classList.remove('d-none');
                
                currentAudio.onended = function() {
                    isSpeaking = false;
                    stopButton.classList.add('d-none');
                    // Only restart recording after speech ends if in auto mode
                    if (autoRestart) {
                        setTimeout(startRecording, 500);
                    }
                };
                currentAudio.play();

                // delete the audio file from the server
                // Delete the audio file after it's played
                currentAudio.onended = function() {
                    isSpeaking = false;
                    stopButton.classList.add('d-none');
                    
                    // Extract filename from audio URL
                    const audioFile = data.audio_url.split('/').pop();
                    
                    // Send request to delete the file
                    fetch('/delete_audio', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ filename: audioFile })
                    }).catch(error => {
                        console.error('Error deleting audio file:', error);
                    });
                    
                    // Only restart recording after speech ends if in auto mode
                    if (autoRestart) {
                        setTimeout(startRecording, 500);
                    }
                };
            }
        } catch (error) {
            isSpeaking = false;
            stopButton.classList.add('d-none');
            console.error('Eleven Labs API error:', error);
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

    // Add these new variables and elements
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
            addMessageToDisplay('user', textMessage);
            
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
                addMessageToDisplay('assistant', displayResponse);
                
                // Speaking will handle restarting recording when done
                speakText(displayResponse);
                
                // Increment message count
                messagesCount++;
            });
        }
    }

    const problemStatement = document.getElementById('problemStatement');
    const editProblemButton = document.getElementById('editProblemButton');
    
    // Add event listener for the edit problem button
    editProblemButton.addEventListener('click', function() {
        const isEditable = problemStatement.contentEditable === 'true';
        if (isEditable) {
            // Save mode - disable editing
            problemStatement.contentEditable = 'false';
            editProblemButton.innerHTML = '<i class="bi bi-pencil"></i> Edit';
            editProblemButton.classList.replace('btn-success', 'btn-outline-primary');
            
            // Save to localStorage
            localStorage.setItem('problemStatement', problemStatement.innerText);
            
            // Update the initial prompt with new problem
            chatHistory[0].parts = [`
                Pretend you are a interviewer conducting a programming interview. 
                The user is going to solve the following problem:
                ${problemStatement.innerText}
                
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
            `];
        } else {
            // Edit mode - enable editing
            problemStatement.contentEditable = 'true';
            editProblemButton.innerHTML = '<i class="bi bi-check"></i> Save';
            editProblemButton.classList.replace('btn-outline-primary', 'btn-success');
            problemStatement.focus();
        }
    });

    // Load saved problem statement if exists
    const savedProblemStatement = localStorage.getItem('problemStatement');
    if (savedProblemStatement) {
        problemStatement.innerText = savedProblemStatement;
        // Update initial prompt with saved problem
        chatHistory[0].parts = [`
            Pretend you are a interviewer conducting a programming interview. 
            The user is going to solve the following problem:
            ${savedProblemStatement}
            
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
        `];
    }

});

