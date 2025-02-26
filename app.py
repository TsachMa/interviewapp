from flask import Flask, render_template, request, jsonify, send_file
import os
import tempfile
from google import genai
import pyttsx3

from dotenv import load_dotenv
load_dotenv()

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
app = Flask(__name__, static_folder='static', template_folder='templates')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/gemini', methods=['POST'])
def call_gemini():
    data = request.json
    prompt = data.get('prompt', '')
    
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )
        text_response = response.text
        
        # Generate audio file using pyttsx3
        temp_file = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
        temp_file.close()
        
        engine = pyttsx3.init()
        engine.save_to_file(text_response, temp_file.name)
        engine.runAndWait()
        
        return jsonify({
            "response": text_response, 
            "audio_path": f"/audio/{os.path.basename(temp_file.name)}"
        })
    except Exception as e:
        return jsonify({"response": f"Error: {str(e)}"}), 500

@app.route('/audio/<filename>')
def get_audio(filename):
    temp_dir = tempfile.gettempdir()
    return send_file(os.path.join(temp_dir, filename), mimetype='audio/mp3')

if __name__ == '__main__':
    app.run(debug=True)