import io

from app import absolutize_static_urls


def test_absolutize_static_urls_rewrites_relative_logo_src():
    html = '<img src="/static/img/logo.png" alt="JBJ Management">'
    result = absolutize_static_urls(html, 'https://jbj-contact-hub.onrender.com/')
    assert result == '<img src="https://jbj-contact-hub.onrender.com/static/img/logo.png" alt="JBJ Management">'


def test_absolutize_static_urls_leaves_absolute_urls_alone():
    html = '<img src="https://example.com/photo.jpg">'
    assert absolutize_static_urls(html, 'https://jbj-contact-hub.onrender.com/') == html


def _create_template(client, name='Send Test'):
    res = client.post('/api/email-templates', json={'name': name})
    return res.get_json()['id']


def test_send_requires_recipient(standard_client):
    template_id = _create_template(standard_client)
    res = standard_client.post(f'/api/email-templates/{template_id}/send', data={'html': '<p>Hi</p>'})
    assert res.status_code == 400


def test_send_requires_content(standard_client):
    template_id = _create_template(standard_client)
    res = standard_client.post(f'/api/email-templates/{template_id}/send', data={'to': 'someone@example.com'})
    assert res.status_code == 400


def test_send_without_smtp_configured_returns_clear_error(standard_client, monkeypatch):
    monkeypatch.delenv('SMTP_HOST', raising=False)
    template_id = _create_template(standard_client)
    res = standard_client.post(f'/api/email-templates/{template_id}/send', data={
        'to': 'someone@example.com', 'html': '<p>Hi</p>',
    })
    assert res.status_code == 500
    assert 'not configured' in res.get_json()['error']


def test_send_success_calls_smtp_and_logs_audit(admin_client, monkeypatch):
    calls = {}

    def fake_send(to_email, subject, html_body, attachments=None):
        calls['to_email'] = to_email
        calls['subject'] = subject
        calls['html_body'] = html_body
        calls['attachments'] = attachments or []

    import app as app_module
    monkeypatch.setattr(app_module, 'send_email_smtp', fake_send)

    template_id = _create_template(admin_client, name='Real Send')
    res = admin_client.post(f'/api/email-templates/{template_id}/send', data={
        'to': 'recipient@example.com',
        'subject': 'Hello there',
        'html': '<p>Hi</p>',
        'attachments': [(io.BytesIO(b'file contents'), 'notes.txt')],
    }, content_type='multipart/form-data')

    assert res.status_code == 200
    assert res.get_json()['sent'] is True
    assert calls['to_email'] == 'recipient@example.com'
    assert calls['subject'] == 'Hello there'
    assert len(calls['attachments']) == 1
    assert calls['attachments'][0][0] == 'notes.txt'

    audit_res = admin_client.get('/admin/audit')
    body = audit_res.get_data(as_text=True)
    assert 'Sent email' in body
    assert 'recipient@example.com' in body


def test_send_rewrites_relative_logo_src_to_absolute(admin_client, monkeypatch):
    calls = {}

    def fake_send(to_email, subject, html_body, attachments=None):
        calls['html_body'] = html_body

    import app as app_module
    monkeypatch.setattr(app_module, 'send_email_smtp', fake_send)

    template_id = _create_template(admin_client)
    res = admin_client.post(f'/api/email-templates/{template_id}/send', data={
        'to': 'recipient@example.com',
        'html': '<img src="/static/img/logo.png" alt="JBJ Management">',
    })
    assert res.status_code == 200
    assert 'src="/static/img/logo.png"' not in calls['html_body']
    assert 'src="http://localhost/static/img/logo.png"' in calls['html_body']


def test_send_rejects_too_many_attachments(admin_client, monkeypatch):
    import app as app_module
    monkeypatch.setattr(app_module, 'send_email_smtp', lambda *a, **k: None)
    template_id = _create_template(admin_client)
    files = [(io.BytesIO(b'x'), f'file{i}.txt') for i in range(6)]
    res = admin_client.post(f'/api/email-templates/{template_id}/send', data={
        'to': 'someone@example.com', 'html': '<p>Hi</p>', 'attachments': files,
    }, content_type='multipart/form-data')
    assert res.status_code == 400
