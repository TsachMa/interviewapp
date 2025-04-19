import sqlite3
from datetime import datetime 


def init_db():
    conn = sqlite3.connect('interviews.db')
    cursor = conn.cursor()
    
    # Create interviews table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS interviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date_time TIMESTAMP NOT NULL,
        code TEXT,
        status TEXT,
        summary TEXT
    )
    ''')
    
    # Create messages table (for chat history)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        interview_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        FOREIGN KEY (interview_id) REFERENCES interviews (id)
    )
    ''')
    
    conn.commit()
    conn.close()
