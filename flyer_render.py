"""Server-side PNG rendering for the flyer/canvas builder.

Elements are stored in display coordinates (display width/height in
CANVAS_FORMATS below). render_flyer_png scales them to the render
resolution at export time using per-axis scale factors derived from
each format's render/display ratio.

Pillow is already a dependency (used by the existing Create Flyer
feature's text-compositing code); this generalises that pattern to
arbitrary, user-positioned elements instead of a fixed bottom band.
"""
import io
import os

from PIL import Image, ImageDraw, ImageFont

_FONTS_DIR = os.path.join(os.path.dirname(__file__), 'static', 'fonts')
_LOGO_PATH  = os.path.join(os.path.dirname(__file__), 'static', 'img', 'logo.png')

# Canvas format definitions.  dw/dh = display (editor) dimensions in CSS
# pixels; rw/rh = export/render resolution.  Both JS and Python use this
# same set of keys so a format saved by the browser renders correctly.
# Backwards-compat: 'square' and 'portrait' stay as they were.
CANVAS_FORMATS = {
    'square':      {'label': 'Instagram Post (Square)',    'group': 'Instagram',  'dw': 540, 'dh': 540,  'rw': 1080, 'rh': 1080},
    'in_portrait': {'label': 'Instagram Post (Portrait)',  'group': 'Instagram',  'dw': 540, 'dh': 675,  'rw': 1080, 'rh': 1350},
    'story':       {'label': 'Instagram / TikTok Story',   'group': 'Instagram',  'dw': 405, 'dh': 720,  'rw': 1080, 'rh': 1920},
    'fb_post':     {'label': 'Facebook Post',              'group': 'Facebook',   'dw': 540, 'dh': 284,  'rw': 1200, 'rh': 630 },
    'fb_cover':    {'label': 'Facebook Cover',             'group': 'Facebook',   'dw': 540, 'dh': 200,  'rw': 1640, 'rh': 607 },
    'twitter':     {'label': 'Twitter / X Post',           'group': 'Twitter / X','dw': 540, 'dh': 304,  'rw': 1200, 'rh': 675 },
    'linkedin':    {'label': 'LinkedIn Post',              'group': 'LinkedIn',   'dw': 540, 'dh': 283,  'rw': 1200, 'rh': 628 },
    'pinterest':   {'label': 'Pinterest Pin',              'group': 'Pinterest',  'dw': 480, 'dh': 720,  'rw': 1000, 'rh': 1500},
    'yt_thumb':    {'label': 'YouTube Thumbnail',          'group': 'YouTube',    'dw': 540, 'dh': 304,  'rw': 1280, 'rh': 720 },
    'tiktok':      {'label': 'TikTok Video Cover',         'group': 'TikTok',     'dw': 405, 'dh': 720,  'rw': 1080, 'rh': 1920},
    'flyer':       {'label': 'Letter Flyer (8.5 × 11 in)','group': 'Print',      'dw': 408, 'dh': 528,  'rw': 816,  'rh': 1056},
    'portrait':    {'label': 'Tall Flyer / Poster',        'group': 'Print',      'dw': 432, 'dh': 648,  'rw': 1080, 'rh': 1620},
    'a4':          {'label': 'A4 Poster',                  'group': 'Print',      'dw': 398, 'dh': 562,  'rw': 794,  'rh': 1123},
}

# Legacy helper kept for any existing callers.
DISPLAY_SIZES = {k: (v['dw'], v['dh']) for k, v in CANVAS_FORMATS.items()}


def _hex_to_rgba(hex_color, alpha=255):
    try:
        h = (hex_color or '#000000').lstrip('#')
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        if len(h) != 6:
            raise ValueError
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return (r, g, b, alpha)
    except (ValueError, AttributeError):
        return (0, 0, 0, alpha)


def _load_font(bold=False, size=36):
    font_file = 'ArchivoBlack-Regular.ttf' if bold else 'Inter-Variable.ttf'
    try:
        return ImageFont.truetype(os.path.join(_FONTS_DIR, font_file), size)
    except Exception:
        return ImageFont.load_default()


def _wrap_text(draw, text, font, max_width_px):
    words = text.split()
    lines, current = [], ''
    for word in words:
        candidate = (current + ' ' + word).strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width_px or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or ['']


def render_flyer_png(elements, fmt='square', bg_color='#ffffff', asset_loader=None, bg_image_bytes=None):
    """Render a list of flyer elements to PNG bytes.

    elements       – ordered list of element dicts (array index = z-order)
    fmt            – canvas format key
    bg_color       – hex background fill (used even when bg_image_bytes is set)
    asset_loader   – callable(asset_id: int) -> bytes | None
    bg_image_bytes – raw image bytes to use as background (cover-scaled)
    """
    import io as _io
    fmt_info = CANVAS_FORMATS.get(fmt, CANVAS_FORMATS['square'])
    dw, dh   = fmt_info['dw'], fmt_info['dh']
    rw, rh   = fmt_info['rw'], fmt_info['rh']
    sx       = rw / dw   # x-axis scale: display → render
    sy       = rh / dh   # y-axis scale: display → render

    canvas = Image.new('RGBA', (rw, rh), _hex_to_rgba(bg_color))
    if bg_image_bytes:
        try:
            bg_img = Image.open(_io.BytesIO(bg_image_bytes)).convert('RGBA')
            # cover-scale: fill canvas, crop if needed
            img_w, img_h = bg_img.size
            scale = max(rw / img_w, rh / img_h)
            new_w, new_h = round(img_w * scale), round(img_h * scale)
            bg_img = bg_img.resize((new_w, new_h), Image.LANCZOS)
            off_x = (new_w - rw) // 2
            off_y = (new_h - rh) // 2
            bg_img = bg_img.crop((off_x, off_y, off_x + rw, off_y + rh))
            canvas.paste(bg_img, (0, 0))
        except Exception:
            pass
    draw   = ImageDraw.Draw(canvas)

    for el in elements:
        x  = round(el.get('x',      0)    * sx)
        y  = round(el.get('y',      0)    * sy)
        w  = max(4, round(el.get('width',  100) * sx))
        h  = max(4, round(el.get('height',  60) * sy))
        el_type = el.get('type', '')

        def _shape_fill():
            color   = el.get('color', '#AD0304')
            opacity = int(el.get('opacity', 100))
            alpha   = int(255 * opacity / 100)
            return _hex_to_rgba(color, alpha)

        if el_type == 'shape':
            fill   = _shape_fill()
            radius = int(el.get('radius', 0)) * s
            if radius:
                draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill)
            else:
                draw.rectangle([x, y, x + w, y + h], fill=fill)

        elif el_type == 'ellipse':
            draw.ellipse([x, y, x + w, y + h], fill=_shape_fill())

        elif el_type == 'line':
            draw.rectangle([x, y, x + w, y + h], fill=_shape_fill())

        elif el_type == 'badge':
            fill    = _hex_to_rgba(el.get('color', '#AD0304'))
            radius  = (h // 2)
            draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill)
            text    = el.get('text', 'BADGE')
            bold    = bool(el.get('bold', True))
            font    = _load_font(bold=bold, size=int(el.get('fontSize', 16) * sx))
            tc      = _hex_to_rgba(el.get('textColor', '#ffffff'))
            bbox    = draw.textbbox((0, 0), text, font=font)
            tw, th  = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text((x + (w - tw) // 2, y + (h - th) // 2), text, font=font, fill=tc)

        elif el_type in ('text', 'heading', 'subheading', 'caption'):
            text    = el.get('text', '')
            if not text:
                continue
            color = el.get('color',    '#000000')
            bold  = el.get('bold', el_type in ('heading', 'subheading'))
            align = el.get('align', 'left')
            font  = _load_font(bold=bold, size=int(el.get('fontSize', 16) * sx))
            fill     = _hex_to_rgba(color)
            lines    = _wrap_text(draw, text, font, w)
            bbox0    = draw.textbbox((0, 0), 'A', font=font)
            line_h   = (bbox0[3] - bbox0[1]) + round(4 * sy)
            for i, line in enumerate(lines):
                lbbox = draw.textbbox((0, 0), line, font=font)
                lw    = lbbox[2] - lbbox[0]
                if align == 'center':
                    tx = x + (w - lw) // 2
                elif align == 'right':
                    tx = x + w - lw
                else:
                    tx = x
                draw.text((tx, y + i * line_h), line, font=font, fill=fill)

        elif el_type in ('image', 'logo'):
            img_bytes = None
            if el_type == 'logo':
                if os.path.exists(_LOGO_PATH):
                    with open(_LOGO_PATH, 'rb') as f:
                        img_bytes = f.read()
            else:
                asset_id = el.get('assetId')
                if asset_id and asset_loader:
                    img_bytes = asset_loader(asset_id)
            if img_bytes:
                try:
                    overlay = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
                    overlay = overlay.resize((w, h), Image.LANCZOS)
                    canvas.paste(overlay, (x, y), overlay)
                except Exception:
                    pass

    buf = io.BytesIO()
    canvas.convert('RGB').save(buf, format='PNG')
    buf.seek(0)
    return buf.read()
