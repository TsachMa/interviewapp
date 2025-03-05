document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const transcriptionResult = document.getElementById('transcriptionResult');

    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let chatHistory = [];
    // init ChatHistory with 
    // "You are a technical interviewer. Ask challenging questions about programming, data structures, and algorithms. Be concise. Follow up on the candidate's answers."
    chatHistory.push({
        "role": "user", 
        "parts": [`
            Pretend you are a interviewer conducting a programming interview. 
            The user is going to solve the problem 2Sum. 
            Guide the user through the process of solving the problem
        `]
    });
    let pauseTimer = null;
    let autoRestart = true;

    const PAUSE_THRESHOLD = 2000; // 2 seconds of silence

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
    

    async function startRecording() {
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
                callGemini(finalTranscript).then(response => {
                    transcriptionResult.innerHTML += `<div class="mt-3 p-3 bg-light rounded"><h5>Gemini Response:</h5><p>${response}</p></div>`;
                    finalTranscript = '';
                    // Speaking will handle restarting recording when done
                    speakText(response);
                });
            } else if (autoRestart && !isSpeaking) {
                setTimeout(startRecording, 500);
            }
        }
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
                
                // Set timer to detect pause after speech ends
                pauseTimer = setTimeout(() => {
                    if (finalTranscript && isRecording) {
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
            chatHistory.push({"role": "user", "parts": [text]});
            const response = await fetch('/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    prompt: text,
                    history: chatHistory 
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
                const audio = new Audio(data.audio_url);
                audio.onended = function() {
                    isSpeaking = false;
                    // Only restart recording after speech ends if in auto mode
                    if (autoRestart) {
                        setTimeout(startRecording, 500);
                    }
                };
                audio.play();
            }
        } catch (error) {
            isSpeaking = false;
            console.error('Eleven Labs API error:', error);
        }
    }

    // Syntax highlighting setup
    const pythonCode = document.getElementById('pythonCode');
    const highlightingContent = document.getElementById('highlighting-content');
    
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
});