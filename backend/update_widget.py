from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    db.execute(text("UPDATE widget_configs SET allowed_domains = '[\n  \"https://external.example.com\",\n  \"http://localhost:3000\",\n  \"http://127.0.0.1:3000\"\n]'::jsonb, widget_visibility = true, widget_availability = true WHERE id = 1"))
    db.commit()
    print('Updated')
finally:
    db.close()