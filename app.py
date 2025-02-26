from flask import Flask, render_template, request, jsonify
import os
from google import genai
import os
import uuid
from flask import send_file
from elevenlabs import VoiceSettings
from elevenlabs.client import ElevenLabs

from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env file

# Then use it as already shown
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

app = Flask(__name__,
            static_folder = 'static',
            template_folder = 'templates')

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
        return jsonify({"response": response.text})
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

if __name__ == '__main__':
    app.run(debug=True)