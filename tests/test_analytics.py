def test_analytics_page_requires_admin(standard_client):
    res = standard_client.get('/admin/analytics')
    assert res.status_code == 302


def test_analytics_page_loads_for_admin(admin_client):
    res = admin_client.get('/admin/analytics')
    assert res.status_code == 200
    assert b'Total Contacts' in res.data


def test_analytics_activities_requires_admin(standard_client):
    res = standard_client.get('/api/analytics/activities?employee=Someone')
    assert res.status_code == 403


def test_analytics_drilldown_returns_matching_activity(admin_client):
    res = admin_client.post('/api/contacts', json={'first_name': 'Jane', 'last_name': 'Doe', 'email': 'jane@example.com'})
    contact_id = res.get_json()['id']
    admin_client.post(f'/api/contacts/{contact_id}/activity', json={
        'summary': 'Discussed the gala', 'channel': 'Phone',
    })

    res = admin_client.get('/api/analytics/activities?channel=Phone')
    assert res.status_code == 200
    body = res.get_json()
    assert body['count'] == 1
    assert body['activities'][0]['contact_name'] == 'Jane Doe'
    assert body['activities'][0]['contact_email'] == 'jane@example.com'


def test_audit_log_requires_admin(standard_client):
    res = standard_client.get('/admin/audit')
    assert res.status_code == 302
