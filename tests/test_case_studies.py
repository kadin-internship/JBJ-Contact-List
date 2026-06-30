import io

import docx


def _make_docx_bytes(text):
    buf = io.BytesIO()
    d = docx.Document()
    d.add_paragraph(text)
    d.save(buf)
    buf.seek(0)
    return buf


def test_case_studies_list_loads_for_standard_user(standard_client):
    res = standard_client.get('/case-studies')
    assert res.status_code == 200


def test_upload_requires_admin(standard_client):
    data = {'files': (_make_docx_bytes('Some case study text here.'), 'test.docx')}
    res = standard_client.post('/api/case-studies/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 403


def test_upload_requires_files(admin_client):
    res = admin_client.post('/api/case-studies/upload', data={}, content_type='multipart/form-data')
    assert res.status_code == 400


def test_upload_stores_unsupported_file_type_without_extracted_text(admin_client):
    # The goal is "just make it accessible" -- a file type we can't run
    # text extraction on still gets stored and is downloadable, just
    # without searchable text.
    data = {'files': (io.BytesIO(b'plain text'), 'notes.txt')}
    res = admin_client.post('/api/case-studies/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 200
    body = res.get_json()
    assert body['results'][0]['success'] is True
    assert body['results'][0]['text_extracted'] is False

    case_study_id = body['results'][0]['id']
    res = admin_client.get(f'/case-studies/{case_study_id}/file')
    assert res.status_code == 200


def test_upload_stores_file_and_extracts_text_no_ai(admin_client):
    data = {'files': (_make_docx_bytes('Challenges and results about DFW Airport go here.'), 'DFW_Airport_CaseStudy.docx')}
    res = admin_client.post('/api/case-studies/upload', data=data, content_type='multipart/form-data')
    assert res.status_code == 200
    result = res.get_json()['results'][0]
    assert result['success'] is True
    assert result['title'] == 'DFW Airport CaseStudy'  # derived from filename, not AI
    assert result['text_extracted'] is True
    case_study_id = result['id']

    res = admin_client.get(f'/case-studies/{case_study_id}')
    assert res.status_code == 200
    body = res.get_data(as_text=True)
    assert 'Document Text' in body
    assert 'DFW Airport go here' in body


def test_uploaded_file_is_downloadable(admin_client):
    data = {'files': (_make_docx_bytes('Downloadable content.'), 'Downloadable.docx')}
    res = admin_client.post('/api/case-studies/upload', data=data, content_type='multipart/form-data')
    case_study_id = res.get_json()['results'][0]['id']

    res = admin_client.get(f'/case-studies/{case_study_id}/file')
    assert res.status_code == 200
    assert res.data  # raw bytes returned


def test_upload_is_searchable_by_extracted_text(standard_client, admin_client):
    data = {'files': (_make_docx_bytes('A one of a kind phrase about turbines.'), 'Turbine Project.docx')}
    admin_client.post('/api/case-studies/upload', data=data, content_type='multipart/form-data')

    res = standard_client.get('/case-studies?q=one+of+a+kind+phrase')
    assert 'Turbine Project' in res.get_data(as_text=True)


def test_upload_form_requires_admin(standard_client):
    res = standard_client.get('/case-studies/upload')
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


def test_list_case_studies_json_for_picker(standard_client, admin_client):
    # Powers the Draft Email modal's "Reference a case study" dropdown --
    # open to standard (non-admin) users, like viewing case studies generally.
    admin_client.post('/api/case-studies', json={'title': 'Picker Project', 'sector': 'Aviation'})

    res = standard_client.get('/api/case-studies')
    assert res.status_code == 200
    titles = [cs['title'] for cs in res.get_json()['case_studies']]
    assert 'Picker Project' in titles


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
