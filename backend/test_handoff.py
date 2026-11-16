from app.main import app
from fastapi.testclient import TestClient
from app.db.session import SessionLocal

client = TestClient(app)
db = SessionLocal()
try:
    r = client.post('/api/v1/widget/session', 
                   json={'page_url': 'http://localhost:3000/test', 'origin': 'http://localhost:3000', 'referrer': 'http://localhost:3000/test'},
                   headers={'Origin': 'http://localhost:3000'})
    session_token = r.json()['session_token']
    
    headers = {'Origin': 'http://localhost:3000', 'X-Widget-Session': session_token}
    
    # Create conversation with initial message asking for human
    r = client.post('/api/v1/widget/conversations', 
                   headers=headers,
                   json={'subject': 'Test Handoff', 'initial_message': 'I want to talk to a human agent please'})
    if r.status_code in (200, 201):
        conv = r.json()
        cid = conv['id']
        
        # Get conversation with messages
        r = client.get('/api/v1/widget/conversations/' + str(cid), headers=headers)
        data = r.json()
        
        lines = []
        lines.append('Initial conversation:')
        lines.append('Status: ' + conv.get('status', 'unknown'))
        lines.append('Messages count: ' + str(len(data.get('messages', []))))
        for m in data.get('messages', []):
            lines.append('  ' + m['sender_type'] + ': ' + m['content'][:150])
        
        # Request human handoff
        r = client.post('/api/v1/widget/conversations/' + str(cid) + '/request-human', headers=headers)
        lines.append('\nHandoff request:')
        lines.append('Status: ' + str(r.status_code))
        lines.append('Response: ' + str(r.json()))
        
        # Get conversation again
        r = client.get('/api/v1/widget/conversations/' + str(cid), headers=headers)
        data = r.json()
        lines.append('\nAfter handoff:')
        lines.append('Status: ' + data.get('status', 'unknown'))
        lines.append('Messages count: ' + str(len(data.get('messages', []))))
        for m in data.get('messages', []):
            lines.append('  ' + m['sender_type'] + ': ' + m['content'][:150])
            if m.get('ai_metadata'):
                lines.append('    ai_metadata: ' + str(m['ai_metadata']))
        
        with open('C:/temp/widget_test.txt', 'w') as f:
            f.write('\n'.join(lines))
    
finally:
    db.close()