"""Check database indexes and constraints."""
from app.db.session import get_db
from sqlalchemy import text

db = next(get_db())

# Get all tables
result = db.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"))
tables = [row[0] for row in result]
print("Tables:", tables)

# Get indexes for each table
for table in tables:
    result = db.execute(text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = :t ORDER BY indexname"), {"t": table})
    indexes = result.fetchall()
    if indexes:
        print(f"\n{table} indexes:")
        for idx in indexes:
            print(f"  {idx[0]}: {idx[1][:120]}")

# Check foreign key constraints
print("\n\nForeign Key Constraints:")
result = db.execute(text("""
    SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name
"""))
for row in result:
    print(f"  {row[0]}.{row[1]} -> {row[2]}.{row[3]}")

db.close()
print("\nDone.")