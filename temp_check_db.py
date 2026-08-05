import sqlite3, os

db = r'C:\Projects\AI women security\backend\backend_dev.db'
print('DB path:', db)
print('DB exists:', os.path.exists(db))
if os.path.exists(db):
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    try:
        cur.execute('SELECT id, name, email, phone FROM users ORDER BY id DESC LIMIT 5')
        rows = cur.fetchall()
        print('recent_users:', rows)
    except Exception as e:
        print('query error:', e)
    conn.close()
else:
    print('DB not found')
