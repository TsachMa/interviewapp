from flask import Flask, render_template, request, jsonify
import os
import google.generativeai as genai
import uuid
from flask import send_file
from elevenlabs import VoiceSettings
from elevenlabs.client import ElevenLabs

import io
import sys
from contextlib import redirect_stdout
import urllib.parse
from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env file

# Then use it as already shown
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
model = genai.GenerativeModel(
    model_name="gemini-1.5-flash"
)
question_classifier = genai.GenerativeModel(model_name="gemini-1.5-flash")

app = Flask(__name__,
            static_folder = 'static',
            template_folder = 'templates')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/gemini', methods=['POST'])
def call_gemini():
    data = request.json
    msg = data.get('prompt', '')
    chat_history = data.get('history', [])
    code = data.get('code', '')  # Get the code from the request
    interview_phase = data.get('interviewPhase', 'clarification')
    
    try:
        # If in coding phase, first check if the message is a question
        if interview_phase == "coding":
            # Create a separate model instance for classification to avoid affecting chat history

            # Simple prompt to check if the message is a question
            classification_prompt = f"""
            Determine if the following text contains a direct question that expects an answer.
            Text: "{msg}"
            Respond with only "YES" if it contains a direct question, or "NO" if it does not.
            """
            
            classification_response = question_classifier.generate_content(classification_prompt)
            is_question = "YES" in classification_response.text.strip().upper()
            
            # If not a question in coding phase, return early with a notquestion prefix
            if not is_question:
                return jsonify({"response": f"notquestion"})
            
        # Start a chat session with the model
        chat_session = model.start_chat(history=chat_history)
        
        # If there's code in the editor, include it in the message
        if code:
            # Format the message to include the current code
            msg_with_code = f"""
                            {msg}

                            Current code in the editor:
                            ```python
                            {code}
                            ```
                            """
            # Send the enhanced message with code
            response = chat_session.send_message(msg_with_code)
        else:
            # Just send the original message if no code
            response = chat_session.send_message(msg)
            
        responseText = response.text
        
        # Add the appropriate prefix in coding phase
        if interview_phase == "coding" and is_question:
            responseText = responseText

        return jsonify({"response": responseText})
    except Exception as e:
        return jsonify({"response": f"Error: {str(e)}"}), 500
    
@app.route('/elevenlabs', methods=['POST'])
def call_elevenlabs():
    data = request.json
    text = data.get('text', '')
    
    try:
        client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
        
        # Convert text to speech and save to file
        response = client.text_to_speech.convert(
            voice_id="21m00Tcm4TlvDq8ikWAM",  # Adam pre-made voice
            output_format="mp3_22050_32",
            text=text,
            model_id="eleven_turbo_v2_5",  # use the turbo model for low latency
            voice_settings=VoiceSettings(
                stability=0.0,
                similarity_boost=1.0,
                style=0.0,
                use_speaker_boost=True,
            ),
        )
        
        # Generate unique filename
        save_file_path = f"static/audio/{uuid.uuid4()}.mp3"
        os.makedirs(os.path.dirname(save_file_path), exist_ok=True)
        
        # Write audio to file
        with open(save_file_path, "wb") as f:
            for chunk in response:
                if chunk:
                    f.write(chunk)
        
        # Return the file path
        return jsonify({"audio_url": "/" + save_file_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/execute_python', methods=['POST'])
def execute_python():
    code = request.json.get('code', '')
    output = ""
    
    try:
        # Execute the code with captured stdout
        temp_stdout = io.StringIO()
        with redirect_stdout(temp_stdout):
            exec(code)
        output = temp_stdout.getvalue()
        
        return jsonify({"result": output, "error": None})
    except Exception as e:
        return jsonify({"result": None, "error": str(e)})


@app.route('/analysis')
def analysis_page():
    return render_template('analysis.html')

@app.route('/generate_analysis', methods=['POST'])
def generate_analysis():
    try:
        data = request.json
        transcript = data.get('transcript', '')
        code = data.get('code', '')
        
        # Only generate analysis if we have a transcript
        if transcript:
            # Prompt Gemini for analysis
            analysis_prompt = f"""
            You are an expert coding interview reviewer. Analyze this interview transcript about the 2Sum problem.
            Provide a comprehensive but concise analysis of the candidate's performance, including:
            1. Technical proficiency (how well did they handle the problem)
            2. Communication skills (how well did they explain their approach)
            3. Problem-solving approach (how structured was their thinking)
            4. Areas of strength
            5. Areas for improvement
            
            Here is the candidate's final code:
            ```python
            {code}
            ```
            
            Here is the interview transcript:
            {transcript}
            
            Provide your analysis in HTML format with appropriate formatting for readability.
            """
            
            analysis_response = model.generate_content(analysis_prompt)
            analysis_html = analysis_response.text
            
            return jsonify({
                "analysis": analysis_html
            })
        else:
            return jsonify({
                "analysis": "<p>No interview data available for analysis.</p>"
            })
    except Exception as e:
        return jsonify({
            "error": str(e),
            "analysis": f"<p>Error generating analysis: {str(e)}</p>"
        }), 500

if __name__ == '__main__':
    app.run(debug=True)