document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const transcriptionResult = document.getElementById('transcriptionResult');

    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];

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
            startRecording();
        } else {
            stopRecording();
        }
    });

    async function startRecording() {
        transcriptionResult.innerHTML = '<p>Requesting access to your microphone...</p>';

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
            
        }
        }

    // Add an event listener for when the recognition result is available
    recognition.onresult = function(event) {
        let interimTranscript = '';

        // loop through the results
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;

            // check if the result is final or interim
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        // Display interim results as they come in
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
});