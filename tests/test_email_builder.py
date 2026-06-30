def test_email_builder_list_loads_for_standard_user(standard_client):
    res = standard_client.get('/email-builder')
    assert res.status_code == 200


def test_create_email_template_defaults_to_untitled(standard_client):
    res = standard_client.post('/api/email-templates', json={})
    assert res.status_code == 201
    body = res.get_json()
    assert body['name'] == 'Untitled email'
    assert body['blocks'] == []


def test_create_email_template_with_blocks(standard_client):
    blocks = [{'id': 'b1', 'type': 'heading', 'text': 'Hello', 'fontSize': 28, 'align': 'left', 'color': '#000000'}]
    res = standard_client.post('/api/email-templates', json={
        'name': 'June Newsletter', 'subject': 'See what is new', 'blocks': blocks,
    })
    assert res.status_code == 201
    body = res.get_json()
    assert body['name'] == 'June Newsletter'
    assert body['subject'] == 'See what is new'
    assert body['blocks'] == blocks

    template_id = body['id']
    res = standard_client.get(f'/email-builder/{template_id}')
    assert res.status_code == 200
    assert b'June Newsletter' in res.data


def test_list_email_templates_json(standard_client):
    standard_client.post('/api/email-templates', json={'name': 'Listed Template'})
    res = standard_client.get('/api/email-templates')
    assert res.status_code == 200
    names = [t['name'] for t in res.get_json()['email_templates']]
    assert 'Listed Template' in names


def test_update_email_template_replaces_blocks(standard_client):
    res = standard_client.post('/api/email-templates', json={'name': 'Draft'})
    template_id = res.get_json()['id']

    new_blocks = [{'id': 'b1', 'type': 'paragraph', 'html': '<p>Updated</p>', 'align': 'left'}]
    res = standard_client.put(f'/api/email-templates/{template_id}', json={
        'name': 'Final Version', 'subject': 'Updated subject', 'blocks': new_blocks,
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body['name'] == 'Final Version'
    assert body['blocks'] == new_blocks


def test_delete_email_template(standard_client):
    res = standard_client.post('/api/email-templates', json={'name': 'To Delete'})
    template_id = res.get_json()['id']

    res = standard_client.delete(f'/api/email-templates/{template_id}')
    assert res.status_code == 200

    res = standard_client.get(f'/email-builder/{template_id}')
    assert res.status_code == 404


def test_email_template_actions_are_audit_logged(admin_client):
    res = admin_client.post('/api/email-templates', json={'name': 'Audited Email'})
    template_id = res.get_json()['id']
    admin_client.put(f'/api/email-templates/{template_id}', json={'name': 'Audited Email Edited'})
    admin_client.delete(f'/api/email-templates/{template_id}')

    res = admin_client.get('/admin/audit')
    assert res.status_code == 200
    body = res.get_data(as_text=True)
    assert 'Created email template' in body
    assert 'Edited email template' in body
    assert 'Deleted email template' in body
