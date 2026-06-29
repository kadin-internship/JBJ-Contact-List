def test_create_contact_requires_login(client):
    # /api/ routes return 401 JSON (not a redirect) when unauthenticated --
    # see require_login() in app.py.
    res = client.post('/api/contacts', json={'first_name': 'Jane', 'last_name': 'Doe'})
    assert res.status_code == 401


def test_create_and_fetch_contact(standard_client):
    res = standard_client.post('/api/contacts', json={
        'first_name': 'Jane', 'last_name': 'Doe', 'organization': 'Acme',
        'email': 'jane.doe@example.com',
    })
    assert res.status_code == 201
    contact_id = res.get_json()['id']

    res = standard_client.get(f'/api/contacts/{contact_id}')
    assert res.status_code == 200
    assert res.get_json()['email'] == 'jane.doe@example.com'


def test_exact_email_duplicate_is_blocked_case_insensitively(standard_client):
    standard_client.post('/api/contacts', json={
        'first_name': 'Jane', 'last_name': 'Doe', 'organization': 'Acme',
        'email': 'jane.doe@example.com',
    })
    res = standard_client.post('/api/contacts', json={
        'first_name': 'Someone', 'last_name': 'Else', 'organization': 'Other Org',
        'email': 'JANE.DOE@EXAMPLE.COM',
    })
    assert res.status_code == 409
    assert res.get_json()['error'] == 'email exists'


def test_likely_duplicate_name_and_org_warns_without_force(standard_client):
    standard_client.post('/api/contacts', json={
        'first_name': 'Jordan', 'last_name': 'Smith', 'organization': 'Acme Test Co',
        'email': 'jordan@example.com',
    })
    res = standard_client.post('/api/contacts', json={
        'first_name': 'jordan', 'last_name': 'SMITH', 'organization': 'acme test co',
        'email': 'different@example.com',
    })
    assert res.status_code == 409
    body = res.get_json()
    assert body['warning'] == 'possible_duplicate'


def test_likely_duplicate_can_be_force_created(standard_client):
    standard_client.post('/api/contacts', json={
        'first_name': 'Jordan', 'last_name': 'Smith', 'organization': 'Acme Test Co',
        'email': 'jordan@example.com',
    })
    res = standard_client.post('/api/contacts', json={
        'first_name': 'jordan', 'last_name': 'SMITH', 'organization': 'acme test co',
        'email': 'different@example.com', 'force_create': True,
    })
    assert res.status_code == 201


def test_update_contact_tracks_changes_in_audit_log(admin_client):
    res = admin_client.post('/api/contacts', json={'first_name': 'Jane', 'last_name': 'Doe', 'title': 'Old Title'})
    contact_id = res.get_json()['id']

    res = admin_client.put(f'/api/contacts/{contact_id}', json={'title': 'New Title'})
    assert res.status_code == 200

    res = admin_client.get('/admin/audit')
    assert res.status_code == 200
    body = res.get_data(as_text=True)
    assert 'Old Title' in body and 'New Title' in body


def test_update_contact_email_conflict_is_case_insensitive(standard_client):
    standard_client.post('/api/contacts', json={'first_name': 'A', 'last_name': 'B', 'email': 'taken@example.com'})
    res = standard_client.post('/api/contacts', json={'first_name': 'C', 'last_name': 'D', 'email': 'other@example.com'})
    other_id = res.get_json()['id']

    res = standard_client.put(f'/api/contacts/{other_id}', json={'email': 'TAKEN@EXAMPLE.COM'})
    assert res.status_code == 409
    assert res.get_json()['error'] == 'email exists'


def test_needs_followup_filter_never_contacted(standard_client):
    standard_client.post('/api/contacts', json={'first_name': 'Never', 'last_name': 'Contacted'})
    res = standard_client.get('/api/contacts?followup=never')
    assert res.status_code == 200
    names = [c['first_name'] for c in res.get_json()['contacts']]
    assert 'Never' in names


def test_needs_followup_filter_excludes_recently_contacted(standard_client):
    res = standard_client.post('/api/contacts', json={'first_name': 'Recently', 'last_name': 'Contacted'})
    contact_id = res.get_json()['id']
    standard_client.post(f'/api/contacts/{contact_id}/activity', json={'summary': 'Talked today'})

    res = standard_client.get('/api/contacts?followup=30')
    names = [c['first_name'] for c in res.get_json()['contacts']]
    assert 'Recently' not in names
