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
import sqlite3
from datetime import datetime
from database import init_db

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
        print(os.getenv("ELEVENLABS_API_KEY"))
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

        print(response)
        
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

@app.route('/delete_audio', methods=['POST'])
def delete_audio():
    data = request.json
    filename = data.get('filename', '')
    if filename:
        file_path = os.path.join('static/audio', filename)

        if os.path.exists(file_path):
            os.remove(file_path)
            return jsonify({"success": True})
        else:
            return jsonify({"success": False, "error": "File not found"})

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

# Update the existing analysis route to support an interview ID parameter
@app.route('/analysis')
@app.route('/analysis/<int:interview_id>')
def analysis_page(interview_id=None):
    # If an ID is provided, render the page with that specific interview
    # Otherwise, use the current localStorage data
    return render_template('analysis.html', interview_id=interview_id)

# Add a new route for the saved interviews list page
@app.route('/interviews')
def interviews_page():
    return render_template('interviews.html')

# Update the generate_analysis route to work with either localStorage or database
@app.route('/generate_analysis', methods=['POST'])
def generate_analysis():
    try:
        data = request.json
        transcript = data.get('transcript', '')
        code = data.get('code', '')
        interview_id = data.get('interview_id')
        
        # If an interview ID is provided, load from database
        if interview_id:
            conn = sqlite3.connect('interviews.db')
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get interview details
            cursor.execute('SELECT code FROM interviews WHERE id = ?', (interview_id,))
            interview_row = cursor.fetchone()
            if interview_row:
                code = interview_row['code']
            
            # Get messages for this interview
            cursor.execute('SELECT role, text FROM messages WHERE interview_id = ? ORDER BY timestamp', (interview_id,))
            messages = cursor.fetchall()
            
            # Format transcript
            if messages:
                transcript = '\n'.join([f"{msg['role']}: {msg['text']}" for msg in messages])
            
            conn.close()
        
        # Only generate analysis if we have a transcript
        if transcript:
            # Prompt Gemini for analysis
            analysis_prompt = f"""
            You are an expert coding interview reviewer. Analyze this interview transcript.
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
                "analysis": analysis_html,
                "code": code,
                "transcript": transcript
            })
        else:
            return jsonify({
                "analysis": "<p>No interview data available for analysis.</p>",
                "code": code
            })
    except Exception as e:
        return jsonify({
            "error": str(e),
            "analysis": f"<p>Error generating analysis: {str(e)}</p>"
        }), 500

with app.app_context():
    init_db()

# Save an interview to the database
@app.route('/save_interview', methods=['POST'])
def save_interview():
    data = request.json
    title = data.get('title', f'Interview {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    code = data.get('code', '')
    chat_history = data.get('chatHistory', [])
    status = data.get('status', 'completed')
    summary = data.get('summary', '')
    
    conn = sqlite3.connect('interviews.db')
    cursor = conn.cursor()
    
    try:
        # Insert interview record
        cursor.execute(
            'INSERT INTO interviews (title, date_time, code, status, summary) VALUES (?, ?, ?, ?, ?)',
            (title, datetime.now(), code, status, summary)
        )
        interview_id = cursor.lastrowid
        
        # Insert chat messages
        for message in chat_history:
            cursor.execute(
                'INSERT INTO messages (interview_id, role, text, timestamp) VALUES (?, ?, ?, ?)',
                (interview_id, message['role'], message['text'], message['timestamp'])
            )
        
        conn.commit()
        return jsonify({"success": True, "interview_id": interview_id})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()

# Get all interviews (for listing)
@app.route('/get_interviews', methods=['GET'])
def get_interviews():
    conn = sqlite3.connect('interviews.db')
    conn.row_factory = sqlite3.Row  # This enables column access by name
    cursor = conn.cursor()
    
    try:
        cursor.execute('SELECT id, title, date_time, status FROM interviews ORDER BY date_time DESC')
        interviews = [dict(row) for row in cursor.fetchall()]
        return jsonify({"success": True, "interviews": interviews})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()

# Get a specific interview by ID
@app.route('/get_interview/<int:interview_id>', methods=['GET'])
def get_interview(interview_id):
    conn = sqlite3.connect('interviews.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        # Get interview details
        cursor.execute('SELECT * FROM interviews WHERE id = ?', (interview_id,))
        interview = dict(cursor.fetchone())
        
        # Get messages for this interview
        cursor.execute('SELECT role, text, timestamp FROM messages WHERE interview_id = ? ORDER BY timestamp', (interview_id,))
        messages = [dict(row) for row in cursor.fetchall()]
        
        interview['messages'] = messages
        
        # If there's a summary, include it in the response
        if interview.get('summary'):
            interview['analysis'] = interview['summary']
        
        return jsonify({"success": True, "interview": interview})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()

# Delete an interview
@app.route('/delete_interview/<int:interview_id>', methods=['DELETE'])
def delete_interview(interview_id):
    conn = sqlite3.connect('interviews.db')
    cursor = conn.cursor()
    
    try:
        # Delete messages first (due to foreign key constraint)
        cursor.execute('DELETE FROM messages WHERE interview_id = ?', (interview_id,))
        
        # Delete the interview
        cursor.execute('DELETE FROM interviews WHERE id = ?', (interview_id,))
        
        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()

# Update an interview's summary
@app.route('/update_interview_summary/<int:interview_id>', methods=['POST'])
def update_interview_summary(interview_id):
    data = request.json
    summary = data.get('summary', '')
    
    conn = sqlite3.connect('interviews.db')
    cursor = conn.cursor()
    
    try:
        # Update the interview summary
        cursor.execute(
            'UPDATE interviews SET summary = ? WHERE id = ?',
            (summary, interview_id)
        )
        
        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(debug=True)