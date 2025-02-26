from flask import Flask, render_template, request, jsonify
import os
from google import genai

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

if __name__ == '__main__':
    app.run(debug=True)