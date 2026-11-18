import urllib.request
import urllib.parse
import json

def test():
    # 1. Login as super admin
    data = urllib.parse.urlencode({'username': 'singaravel@vananam.com', 'password': 'SuperAdminPassword2026!'}).encode()
    req = urllib.request.Request('http://localhost:8000/api/v1/auth/login', data=data)
    with urllib.request.urlopen(req) as resp:
        token = json.loads(resp.read().decode())['access_token']

    # 2. Call admin listConversations
    req2 = urllib.request.Request('http://localhost:8000/api/v1/admin/conversations', headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req2) as resp:
        items = json.loads(resp.read().decode())
        print(f"Admin listConversations count: {len(items)}")
        for it in items:
            print(f"  Conv #{it['id']}: Subject='{it['subject']}', Status={it['status']}, Channel={it['channel']}, Customer={it['customer_email']}, Agent={it['assigned_agent_name']}")

    # 3. Login as agent
    data_agent = urllib.parse.urlencode({'username': 'support.agent1@openchat.io', 'password': 'password123'}).encode()
    req_ag = urllib.request.Request('http://localhost:8000/api/v1/auth/login', data=data_agent)
    with urllib.request.urlopen(req_ag) as resp:
        ag_token = json.loads(resp.read().decode())['access_token']

    # 4. Call agent listConversations (inbox)
    req3 = urllib.request.Request('http://localhost:8000/api/v1/agent/conversations?queue=inbox', headers={'Authorization': 'Bearer ' + ag_token})
    with urllib.request.urlopen(req3) as resp:
        ag_items = json.loads(resp.read().decode())
        print(f"Agent listConversations (queue=inbox) count: {len(ag_items)}")
        for it in ag_items:
            print(f"  Conv #{it['id']}: Subject='{it['subject']}', Status={it['status']}, Agent={it['assigned_agent_name']}")

if __name__ == '__main__':
    test()

