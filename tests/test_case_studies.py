import io
import json
from unittest.mock import patch, MagicMock

import docx


def _make_docx_bytes(text):
    buf = io.BytesIO()
    d = docx.Document()
    d.add_paragraph(text)
    d.save(buf)
    buf.seek(0)
    return buf


def _fake_claude_response(payload):
    block = MagicMock()
    block.type = 'text'
    block.text = json.dumps(payload)
    response = MagicMock()
    response.content = [block]
    return response


def test_case_studies_list_loads_for_standard_user(standard_client):
    res = standard_client.get('/case-studies')
    assert res.status_code == 200


def test_parse_requires_admin(standard_client):
    data = {'files': (_make_docx_bytes('Some case study text here.'), 'test.docx')}
    res = standard_client.post('/api/case-studies/parse', data=data, content_type='multipart/form-data')
    assert res.status_code == 403


def test_parse_requires_files(admin_client, monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'fake-key-for-tests')
    res = admin_client.post('/api/case-studies/parse', data={}, content_type='multipart/form-data')
    assert res.status_code == 400


def test_parse_requires_api_key(admin_client, monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    data = {'files': (_make_docx_bytes('Some case study text here.'), 'test.docx')}
    res = admin_client.post('/api/case-studies/parse', data=data, content_type='multipart/form-data')
    assert res.status_code == 500


def test_parse_rejects_unsupported_file_type(admin_client, monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'fake-key-for-tests')
    data = {'files': (io.BytesIO(b'plain text'), 'notes.txt')}
    res = admin_client.post('/api/case-studies/parse', data=data, content_type='multipart/form-data')
    assert res.status_code == 200
    body = res.get_json()
    assert body['results'][0]['success'] is False
    assert '.txt' in body['results'][0]['error']


def test_parse_extracts_and_returns_drafts(admin_client, monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'fake-key-for-tests')
    fake_payload = {
        'title': 'DFW Airport Contractor Support',
        'client': 'DFW Airport',
        'sector': 'Aviation',
        'challenges': 'Coordinating contractors at scale.',
        'solution': 'Managed compliance through B2GNow.',
        'results': 'Improved transparency.',
    }
    with patch('anthropic.Anthropic') as MockAnthropic:
        MockAnthropic.return_value.messages.create.return_value = _fake_claude_response(fake_payload)
        data = {'files': (_make_docx_bytes('A real case study about DFW Airport.'), 'dfw.docx')}
        res = admin_client.post('/api/case-studies/parse', data=data, content_type='multipart/form-data')

    assert res.status_code == 200
    result = res.get_json()['results'][0]
    assert result['success'] is True
    assert result['title'] == 'DFW Airport Contractor Support'
    assert result['sector'] == 'Aviation'


def test_import_form_requires_admin(standard_client):
    res = standard_client.get('/case-studies/import')
    assert res.status_code == 302


def test_create_case_study_requires_admin(standard_client):
    res = standard_client.post('/api/case-studies', json={'title': 'Should fail'})
    assert res.status_code == 403


def test_create_case_study_requires_title(admin_client):
    res = admin_client.post('/api/case-studies', json={'client': 'No Title Co'})
    assert res.status_code == 400


def test_admin_can_create_and_view_case_study(admin_client):
    res = admin_client.post('/api/case-studies', json={
        'title': 'DFW Airport Contractor Support',
        'client': 'Dallas/Fort Worth International Airport',
        'sector': 'Aviation',
        'challenges': 'Coordinating contractors across a $760 million expansion.',
        'solution': 'Managed compliance and reporting through B2GNow.',
        'results': 'Improved transparency and a more resilient contractor pipeline.',
    })
    assert res.status_code == 201
    case_study_id = res.get_json()['id']

    res = admin_client.get(f'/case-studies/{case_study_id}')
    assert res.status_code == 200
    body = res.get_data(as_text=True)
    assert 'DFW Airport Contractor Support' in body
    assert 'B2GNow' in body


def test_case_study_search_matches_text_fields(standard_client, admin_client):
    admin_client.post('/api/case-studies', json={
        'title': 'Findable Project', 'sector': 'Aviation', 'challenges': 'A unique searchable phrase',
    })
    admin_client.post('/api/case-studies', json={'title': 'Unrelated Project', 'sector': 'Construction'})

    res = standard_client.get('/case-studies?q=unique+searchable+phrase')
    body = res.get_data(as_text=True)
    assert 'Findable Project' in body
    assert 'Unrelated Project' not in body


def test_case_study_sector_filter(standard_client, admin_client):
    admin_client.post('/api/case-studies', json={'title': 'Aviation One', 'sector': 'Aviation'})
    admin_client.post('/api/case-studies', json={'title': 'Construction One', 'sector': 'Construction'})

    res = standard_client.get('/case-studies?sector=Aviation')
    body = res.get_data(as_text=True)
    assert 'Aviation One' in body
    assert 'Construction One' not in body


def test_update_case_study_requires_admin(admin_client, standard_client):
    res = admin_client.post('/api/case-studies', json={'title': 'Original Title'})
    case_study_id = res.get_json()['id']

    res = standard_client.put(f'/api/case-studies/{case_study_id}', json={'title': 'Hijacked'})
    assert res.status_code == 403


def test_admin_can_update_case_study(admin_client):
    res = admin_client.post('/api/case-studies', json={'title': 'Original Title'})
    case_study_id = res.get_json()['id']

    res = admin_client.put(f'/api/case-studies/{case_study_id}', json={'title': 'Updated Title'})
    assert res.status_code == 200
    assert res.get_json()['title'] == 'Updated Title'


def test_delete_case_study_requires_admin(admin_client, standard_client):
    res = admin_client.post('/api/case-studies', json={'title': 'To Delete'})
    case_study_id = res.get_json()['id']

    res = standard_client.delete(f'/api/case-studies/{case_study_id}')
    assert res.status_code == 403


def test_admin_can_delete_case_study(admin_client):
    res = admin_client.post('/api/case-studies', json={'title': 'To Delete'})
    case_study_id = res.get_json()['id']

    res = admin_client.delete(f'/api/case-studies/{case_study_id}')
    assert res.status_code == 200

    res = admin_client.get(f'/case-studies/{case_study_id}')
    assert res.status_code == 404


def test_new_and_edit_forms_load_for_admin(admin_client):
    res = admin_client.get('/case-studies/new')
    assert res.status_code == 200

    res = admin_client.post('/api/case-studies', json={'title': 'Edit Form Target'})
    case_study_id = res.get_json()['id']
    res = admin_client.get(f'/case-studies/{case_study_id}/edit')
    assert res.status_code == 200
    assert 'Edit Form Target' in res.get_data(as_text=True)


def test_new_and_edit_forms_redirect_for_standard_user(standard_client, admin_client):
    res = admin_client.post('/api/case-studies', json={'title': 'Edit Target'})
    case_study_id = res.get_json()['id']

    res = standard_client.get('/case-studies/new')
    assert res.status_code == 302

    res = standard_client.get(f'/case-studies/{case_study_id}/edit')
    assert res.status_code == 302
