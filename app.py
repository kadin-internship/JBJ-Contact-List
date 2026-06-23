import os
import io
import csv
from datetime import date
from flask import Flask, request, jsonify, send_file, render_template, render_template_string
from config import Config
from db import db
from models import Contact, OutreachOrg
from schemas import ContactSchema
from utils import read_uploaded_file, clean_dataframe
from sqlalchemy import or_, func


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    db.init_app(app)

    with app.app_context():
        db.create_all()

    contact_schema = ContactSchema()
    contacts_schema = ContactSchema(many=True)

    @app.route('/')
    def index():
        # Serve single-page frontend
        return render_template('index.html')

    @app.route('/profile/<int:contact_id>')
    def profile(contact_id):
        return render_template('profile.html', contact_id=contact_id)

    @app.route('/admin')
    def admin():
        return render_template('admin.html')

    @app.route('/api/contacts', methods=['GET'])
    def list_contacts():
        q = request.args.get('q', type=str)
        tag = request.args.get('tag', type=str)
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=25, type=int)

        query = Contact.query
        if q:
            like = f"%{q}%"
            full_name = func.coalesce(Contact.first_name, '') + ' ' + func.coalesce(Contact.last_name, '')
            query = query.filter(or_(
                full_name.ilike(like),
                Contact.organization.ilike(like),
                Contact.title.ilike(like),
                Contact.email.ilike(like),
                Contact.county.ilike(like),
            ))
        if tag:
            query = query.filter(Contact.tag == tag)

        total = query.count()
        results = query.order_by(Contact.added.desc()).offset((page - 1) * limit).limit(limit).all()
        return jsonify({
            'page': page,
            'limit': limit,
            'total': total,
            'contacts': contacts_schema.dump(results)
        })

    @app.route('/api/contacts/<int:contact_id>', methods=['GET'])
    def get_contact(contact_id):
        c = Contact.query.get_or_404(contact_id)
        return jsonify(contact_schema.dump(c))

    @app.route('/api/contacts/<int:contact_id>', methods=['PUT'])
    def update_contact(contact_id):
        c = Contact.query.get_or_404(contact_id)
        data = request.get_json() or {}
        new_email = data.get('email')
        if 'email' in data and new_email and new_email != c.email:
            conflict = Contact.query.filter(Contact.email == new_email, Contact.id != contact_id).first()
            if conflict:
                return jsonify({'error': 'email exists', 'id': conflict.id}), 409
        for field in ['first_name','last_name','organization','title','phone_office','phone_cell','email','active','county','notes','tag']:
            if field in data:
                setattr(c, field, data.get(field))
        if 'lists' in data:
            c.lists = data.get('lists') or []
        if 'data_complete' in data:
            c.data_complete = bool(data.get('data_complete'))
        db.session.add(c)
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'database error', 'details': str(e)}), 500
        return jsonify(contact_schema.dump(c))

    @app.route('/api/contacts', methods=['POST'])
    def create_contact():
        data = request.get_json() or {}
        email = data.get('email')
        if not email:
            return jsonify({'error':'email required'}), 400
        existing = Contact.query.filter_by(email=email).first()
        if existing:
            return jsonify({'error':'email exists', 'id': existing.id}), 409
        c = Contact(
            email=email,
            first_name=data.get('first_name') or None,
            last_name=data.get('last_name') or None,
            organization=data.get('organization') or None,
            title=data.get('title') or None,
            phone_office=data.get('phone_office') or None,
            phone_cell=data.get('phone_cell') or None,
            active=data.get('active') or None,
            lists=data.get('lists') or [],
            county=data.get('county') or None,
            notes=data.get('notes') or None,
            tag=data.get('tag') or None,
            data_complete=bool(data.get('data_complete')),
        )
        db.session.add(c)
        db.session.commit()
        return jsonify(contact_schema.dump(c)), 201

    @app.route('/api/stats', methods=['GET'])
    def stats():
        total = Contact.query.count()
        incomplete = Contact.query.filter(Contact.data_complete == False).count()
        per_tag = db.session.query(Contact.tag, func.count(Contact.id)).group_by(Contact.tag).all()
        per_county = db.session.query(Contact.county, func.count(Contact.id)).group_by(Contact.county).all()
        return jsonify({
            'total': total,
            'incomplete': incomplete,
            'by_tag': {k if k else '': v for k, v in per_tag},
            'by_county': {k if k else '': v for k, v in per_county}
        })

    @app.route('/api/tags', methods=['GET'])
    def tags():
        tags = [t[0] for t in db.session.query(Contact.tag).distinct().all()]
        return jsonify(sorted([t for t in tags if t]))

    @app.route('/api/categories', methods=['GET'])
    def categories():
        # Categories map to tags with counts
        rows = db.session.query(Contact.tag, func.count(Contact.id)).group_by(Contact.tag).all()
        return jsonify([{'tag': r[0], 'count': r[1]} for r in rows])

    @app.route('/api/section-categories', methods=['GET'])
    def section_categories():
        # Categories for the Sections/outreach-checklist page (its own tag set,
        # separate from Contact.tag since the two sheets label categories differently).
        rows = db.session.query(OutreachOrg.tag, func.count(OutreachOrg.id)).group_by(OutreachOrg.tag).all()
        return jsonify([{'tag': r[0], 'count': r[1]} for r in rows])

    @app.route('/api/section-stats', methods=['GET'])
    def section_stats():
        total = OutreachOrg.query.count()
        contact_orgs = set(
            (o[0] or '').lower() for o in db.session.query(Contact.organization).filter(Contact.organization != None).all()
        )
        org_names = db.session.query(OutreachOrg.organization).all()
        no_contact = sum(1 for o in org_names if o[0].lower() not in contact_orgs)
        return jsonify({'total': total, 'no_contact': no_contact})

    @app.route('/api/counties', methods=['GET'])
    def counties():
        rows = db.session.query(Contact.county, func.count(Contact.id)).group_by(Contact.county).all()
        return jsonify([{'county': r[0] or '', 'count': r[1]} for r in rows])

    @app.route('/api/sections', methods=['GET'])
    def sections():
        """Return sections grouped by tag -> organization, sourced from the
        outreach checklist (OutreachOrg: category, org, last-touched date, notes),
        cross-referenced against the live Contact table by organization name for
        contact_count / primary_contact.

        Supports optional filters: q (text), tag (category), county, page, limit.
        When `tag` is provided the response will include pagination meta for that tag.
        """
        q = request.args.get('q', type=str)
        tag_filter = request.args.get('tag', type=str)
        county = request.args.get('county', type=str)
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=50, type=int)

        org_query = OutreachOrg.query
        if tag_filter:
            org_query = org_query.filter(OutreachOrg.tag == tag_filter)
        if q:
            like = f"%{q}%"
            org_query = org_query.filter(or_(OutreachOrg.organization.ilike(like), OutreachOrg.tag.ilike(like), OutreachOrg.notes.ilike(like)))

        rows = org_query.order_by(OutreachOrg.tag, OutreachOrg.organization).all()

        # build flat list, cross-referencing contacts by organization name
        items = []
        for org_row in rows:
            tag = org_row.tag
            org = org_row.organization
            contacts_q = Contact.query.filter(func.lower(Contact.organization) == org.lower())
            if county:
                contacts_q = contacts_q.filter(Contact.county.ilike(f"%{county}%"))
            contact_count = contacts_q.count()
            if county and contact_count == 0:
                # no contacts in the requested county for this org; skip it
                continue
            primary = contacts_q.order_by(Contact.added.desc()).first()
            primary_info = None
            if primary:
                primary_info = {
                    'id': primary.id,
                    'name': f"{primary.first_name or ''} {primary.last_name or ''}".strip(),
                    'title': primary.title or '',
                    'email': primary.email or '',
                    'phone_cell': primary.phone_cell or '',
                    'phone_office': primary.phone_office or ''
                }

            items.append({
                'tag': tag or 'Other',
                'organization': org,
                'contact_count': int(contact_count),
                'latest_updated': org_row.updated,
                'primary_contact': primary_info,
                'notes': org_row.notes or ''
            })

        # sort by last-touched date desc (untouched orgs sort last)
        items.sort(key=lambda it: it['latest_updated'] or date(1970, 1, 1), reverse=True)

        # If a tag filter was provided, paginate within that tag
        if tag_filter:
            tag_items = [it for it in items if (it['tag'] == tag_filter or (it['tag'] is None and tag_filter == ''))]
            total = len(tag_items)
            start = (page - 1) * limit
            end = start + limit
            page_items = tag_items[start:end]
            out = {tag_filter: [{
                'organization': it['organization'],
                'contact_count': it['contact_count'],
                'latest_updated': it['latest_updated'].isoformat() if it['latest_updated'] else None,
                'primary_contact': it['primary_contact'],
                'notes': it['notes']
            } for it in page_items]}
            return jsonify({'meta': {'page': page, 'limit': limit, 'total': total}, 'sections': out})

        # No specific tag: apply an overall limit (for performance) and group by tag
        overall_limit = request.args.get('limit', default=305, type=int)
        limited = items[:overall_limit]
        out = {}
        for it in limited:
            key = it['tag']
            out.setdefault(key, []).append({
                'organization': it['organization'],
                'contact_count': it['contact_count'],
                'latest_updated': it['latest_updated'].isoformat() if it['latest_updated'] else None,
                'primary_contact': it['primary_contact'],
                'notes': it['notes']
            })
        return jsonify({'meta': {'page': 1, 'limit': overall_limit, 'total': len(items)}, 'sections': out})

    @app.route('/api/upload', methods=['POST'])
    def upload():
        if 'file' not in request.files:
            return jsonify({'error': 'file is required (form field `file`)'}), 400
        f = request.files['file']
        try:
            df = read_uploaded_file(f)
        except Exception as e:
            return jsonify({'error': str(e)}), 400

        cleaned = clean_dataframe(df)

        inserted = 0
        updated = 0
        skipped = 0
        for _, row in cleaned.iterrows():
            email = str(row['email']).strip()
            if not email:
                skipped += 1
                continue
            existing = Contact.query.filter_by(email=email).first()
            if existing:
                # Update non-empty fields
                changed = False
                for field in ['first_name', 'last_name', 'organization', 'title', 'phone_office', 'phone_cell', 'active', 'county', 'notes', 'tag']:
                    val = row.get(field)
                    if val and (getattr(existing, field) in (None, '', False)):
                        setattr(existing, field, val)
                        changed = True
                # merge lists
                existing_lists = existing.lists or []
                new_lists = row.get('lists') or []
                merged = list(dict.fromkeys(existing_lists + new_lists))
                if merged != existing_lists:
                    existing.lists = merged
                    changed = True
                # data_complete update
                if existing.data_complete != bool(row.get('data_complete')):
                    existing.data_complete = bool(row.get('data_complete'))
                    changed = True
                if changed:
                    db.session.add(existing)
                    updated += 1
                else:
                    skipped += 1
            else:
                c = Contact(
                    tag=row.get('tag') or None,
                    organization=row.get('organization') or None,
                    first_name=row.get('first_name') or None,
                    last_name=row.get('last_name') or None,
                    title=row.get('title') or None,
                    phone_office=row.get('phone_office') or None,
                    phone_cell=row.get('phone_cell') or None,
                    email=email,
                    active=row.get('active') or None,
                    lists=row.get('lists') or [],
                    county=row.get('county') or None,
                    notes=row.get('notes') or None,
                    data_complete=bool(row.get('data_complete')),
                )
                db.session.add(c)
                inserted += 1

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'database error', 'details': str(e)}), 500

        return jsonify({'inserted': inserted, 'updated': updated, 'skipped': skipped, 'processed': len(cleaned)})

    @app.route('/api/export', methods=['GET'])
    def export():
        # optional filters
        tag = request.args.get('tag', type=str)
        county = request.args.get('county', type=str)
        contact_id = request.args.get('id', type=int)
        query = Contact.query
        if contact_id:
            query = query.filter(Contact.id == contact_id)
        if tag:
            query = query.filter(Contact.tag == tag)
        if county:
            query = query.filter(Contact.county == county)
        rows = query.order_by(Contact.added.desc()).all()

        # stream CSV
        si = io.StringIO()
        writer = csv.writer(si)
        header = ['id','tag','organization','first_name','last_name','title','phone_office','phone_cell','email','added','active','lists','county','notes','data_complete']
        writer.writerow(header)
        for r in rows:
            writer.writerow([
                r.id, r.tag, r.organization, r.first_name, r.last_name, r.title,
                r.phone_office, r.phone_cell, r.email, r.added.isoformat() if r.added else '',
                r.active, (','.join(r.lists) if r.lists else ''), r.county, r.notes, int(bool(r.data_complete))
            ])
        si.seek(0)
        return send_file(io.BytesIO(si.getvalue().encode('utf-8')), mimetype='text/csv', as_attachment=True, download_name='contacts_export.csv')

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
