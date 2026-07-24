import sqlite3
import json

c = sqlite3.connect('d:/A研二/A秋招2/offerflow.db')
try:
    c.execute("ALTER TABLE job_cases ADD COLUMN workflow_data JSON DEFAULT '{}'")
    c.commit()
    print("Column added successfully.")
except sqlite3.OperationalError as e:
    print(f"Error: {e}")
finally:
    c.close()
