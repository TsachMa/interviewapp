/**
 * Audio Manager - Handles all audio recording and speech-related functionality
 */
class AudioManager {
    constructor(options) {
        // DOM elements
        this.recordButton = options.recordButton;
        this.stopButton = options.stopButton || null;
        this.transcriptionResult = options.transcriptionResult;
        
        // Callback functions
        this.onTranscriptionComplete = options.onTranscriptionComplete || function() {};
        this.onSpeechEnd = options.onSpeechEnd || function() {};
        
        // State
        this.isRecording = false;
        this.isSpeaking = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.finalTranscript = '';
        this.currentAudio = null;
        this.autoRestart = true;
        this.pauseTimer = null;
        this.PAUSE_THRESHOLD = 500; // Pause detection threshold in ms
        
        // Initialize SpeechRecognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        
        // Bind event handlers
        this._bindEventHandlers();
        
        // Create stop button if not provided
        if (!this.stopButton) {
            this._createStopButton();
        }
    }
    
    /**
     * Binds all event handlers for the audio manager
     * @private
     */
    _bindEventHandlers() {
        // Bind record button click event
        if (this.recordButton) {
            this.recordButton.addEventListener('click', () => {
                if (!this.isRecording) {
                    this.autoRestart = true;
                    this.startRecording();
                } else {
                    this.autoRestart = false; // Don't auto-restart on manual stop
                    this.stopRecording();
                }
            });
        }
        
        // Bind stop button click event
        if (this.stopButton) {
            this.stopButton.addEventListener('click', () => {
                this.stopCurrentSpeech();
            });
        }
        
        // Bind escape key to stop speech
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.stopCurrentSpeech();
            }
        });
        
        // Bind recognition events
        this.recognition.onresult = this._handleRecognitionResult.bind(this);
        this.recognition.onerror = this._handleRecognitionError.bind(this);
        this.recognition.onend = this._handleRecognitionEnd.bind(this);
    }
    
    /**
     * Creates a stop button if one wasn't provided in the options
     * @private
     */
    _createStopButton() {
        this.stopButton = document.createElement('button');
        this.stopButton.id = 'stopSpeechButton';
        this.stopButton.className = 'btn btn-warning w-100 mb-3 d-none';
        this.stopButton.innerHTML = '<i class="bi bi-volume-mute-fill"></i> Stop Speech';
        
        // Insert the stop button after the record button
        if (this.recordButton) {
            this.recordButton.parentNode.insertBefore(this.stopButton, this.recordButton.nextSibling);
        }
        
        // Add event listener for the stop button
        this.stopButton.addEventListener('click', () => {
            this.stopCurrentSpeech();
        });
    }
    
    /**
     * Handles speech recognition results
     * @private
     * @param {SpeechRecognitionEvent} event - The recognition event
     */
    _handleRecognitionResult(event) {
        let interimTranscript = '';
        
        // Reset pause timer on new speech
        clearTimeout(this.pauseTimer);
        
        // Loop through the results
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                this.finalTranscript += transcript;
                
                // Set timer to detect pause after speech ends
                this.pauseTimer = setTimeout(() => {
                    if (this.finalTranscript && this.isRecording) {
                        this.stopRecording();
                    }
                }, this.PAUSE_THRESHOLD);
            } else {
                interimTranscript += transcript;
            }
        }
        
        // Display results
        if (this.isRecording && this.transcriptionResult) {
            this.transcriptionResult.innerHTML = '<p>Recording...</p>';
            this.transcriptionResult.innerHTML += '<p><i>Current: ' + interimTranscript + '</i></p>';
            this.transcriptionResult.innerHTML += '<p><b>Transcript so far:</b> ' + this.finalTranscript + '</p>';
        }
    }
    
    /**
     * Handles speech recognition errors
     * @private
     * @param {SpeechRecognitionError} event - The error event
     */
    _handleRecognitionError(event) {
        console.error('Speech recognition error detected:', event.error);
        if (this.transcriptionResult) {
            this.transcriptionResult.innerHTML = '<p>Error occurred while recognizing speech. Please try again.</p>';
        }
    }
    
    /**
     * Handles speech recognition end
     * @private
     */
    _handleRecognitionEnd() {
        // If recording is still supposed to be happening but recognition stopped
        if (this.isRecording && this.autoRestart) {
            // Try to restart recognition
            setTimeout(() => {
                try {
                    this.recognition.start();
                } catch (e) {
                    console.error('Could not restart recognition:', e);
                }
            }, 500);
        }
    }
    
    /**
     * Starts audio recording and speech recognition
     */
    async startRecording() {
        // First stop any ongoing speech
        this.stopCurrentSpeech();
        
        if (this.transcriptionResult) {
            this.transcriptionResult.innerHTML = '<p>Requesting access to your microphone...</p>';
        }
        
        this.finalTranscript = ''; // reset the final transcript
        
        try {
            // Request access to the user's microphone
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            // Create a new MediaRecorder instance
            this.mediaRecorder = new MediaRecorder(stream);

            // Set up event handlers for the MediaRecorder instance
            this.mediaRecorder.ondataavailable = (event) => {
                // When data is available, push it to the audioChunks array
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.onstop = () => {
                // When the recording is stopped, create a Blob from the audioChunks
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

                // Create a URL for the audio blob
                const audioUrl = URL.createObjectURL(audioBlob);

                // Create an audio element to play back the recording
                const audio = document.createElement('audio');
                audio.src = audioUrl;
                audio.controls = true;

                // Clear the previous content and add the audio element
                if (this.transcriptionResult) {
                    this.transcriptionResult.innerHTML = '';
                    this.transcriptionResult.appendChild(audio);
                }

                // Stop all tracks to release the microphone
                stream.getTracks().forEach(track => track.stop());
            };

            // Reset the audioChunks array
            this.audioChunks = [];
            
            // Start recording
            this.mediaRecorder.start();

            // Start the speech recognition
            this.recognition.start();

            // Update the button text and style
            this.isRecording = true;
            if (this.recordButton) {
                this.recordButton.innerHTML = '<i class="bi bi-mic-fill"></i> Stop Recording';
                this.recordButton.classList.replace('btn-primary', 'btn-danger');
            }
            
            if (this.transcriptionResult) {
                this.transcriptionResult.innerHTML = '<p>Recording...</p>';
            }
        } catch (error) {
            console.error('Error accessing microphone:', error);
            if (this.transcriptionResult) {
                this.transcriptionResult.innerHTML = '<p>Error accessing microphone. Please check your browser permissions.</p>';
            }
        }
    }
    
    /**
     * Stops audio recording and speech recognition
     */
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.recognition.stop();
            this.isRecording = false;
            
            if (this.recordButton) {
                this.recordButton.innerHTML = '<i class="bi bi-mic-fill"></i> Record Audio';
                this.recordButton.classList.replace('btn-danger', 'btn-primary');
            }
            
            if (this.finalTranscript) {
                if (this.transcriptionResult) {
                    this.transcriptionResult.innerHTML += '<p>Processing transcription...</p>';
                }
                
                // Call the callback with the transcription result
                this.onTranscriptionComplete(this.finalTranscript);
                
                this.finalTranscript = '';
            } else if (this.autoRestart && !this.isSpeaking) {
                setTimeout(() => this.startRecording(), 500);
            }
        }
    }
    
    /**
     * Stops current speech playback
     */
    stopCurrentSpeech() {
        if (this.currentAudio && !this.currentAudio.paused) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.isSpeaking = false;
            
            if (this.stopButton) {
                this.stopButton.classList.add('d-none');
            }
            
            // Call the callback function
            this.onSpeechEnd();
            
            // Only restart recording if in auto mode
            if (this.autoRestart) {
                setTimeout(() => this.startRecording(), 500);
            }
        }
    }
    
    /**
     * Speaks text using the ElevenLabs API
     * @param {string} text - The text to speak
     */
    async speakWithElevenLabs(text) {
        try {
            this.isSpeaking = true;
            
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
                this.currentAudio = new Audio(data.audio_url);
                
                // Show the stop button when speech starts
                if (this.stopButton) {
                    this.stopButton.classList.remove('d-none');
                }
                
                this.currentAudio.onended = () => {
                    this.isSpeaking = false;
                    
                    if (this.stopButton) {
                        this.stopButton.classList.add('d-none');
                    }
                    
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
                    
                    // Call the callback function
                    this.onSpeechEnd();
                    
                    // Only restart recording after speech ends if in auto mode
                    if (this.autoRestart) {
                        setTimeout(() => this.startRecording(), 500);
                    }
                };
                
                this.currentAudio.play();
            }
        } catch (error) {
            this.isSpeaking = false;
            
            if (this.stopButton) {
                this.stopButton.classList.add('d-none');
            }
            
            console.error('Eleven Labs API error:', error);
            
            // Call the callback function
            this.onSpeechEnd();
        }
    }
    
    /**
     * Sets whether recording should automatically restart
     * @param {boolean} value - True to auto restart, false otherwise
     */
    setAutoRestart(value) {
        this.autoRestart = value;
    }
    
    /**
     * Gets the current recording state
     * @returns {boolean} True if recording, false otherwise
     */
    isCurrentlyRecording() {
        return this.isRecording;
    }
    
    /**
     * Gets the current speaking state
     * @returns {boolean} True if speaking, false otherwise
     */
    isCurrentlySpeaking() {
        return this.isSpeaking;
    }
    
    /**
     * Creates a new AudioManager instance
     * @param {Object} options - Configuration options
     * @returns {AudioManager} A new AudioManager instance
     */
    static init(options) {
        return new AudioManager(options);
    }
}

// Export as a global if in browser environment
if (typeof window !== 'undefined') {
    window.AudioManager = { init: AudioManager.init };
}