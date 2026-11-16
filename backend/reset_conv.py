import sys
sys.path.insert(0, 'C:/Users/SINGARAVEL/Documents/Freshchat/OpenChat/backend')
from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
result = db.execute(text("SELECT id, status, assigned_agent_id FROM conversations WHERE id = 11"))
conv = result.fetchone()
print('Conversation 11:', conv)

db.execute(text("UPDATE conversations SET status = 'ai_handling', assigned_agent_id = NULL WHERE id = 11"))
db.commit()
print('Reset conversation')

result = db.execute(text("SELECT id, status, assigned_agent_id FROM conversations WHERE id = 11"))
conv = result.fetchone()
print('Conversation after reset:', conv)