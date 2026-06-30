"""Server-side PNG rendering for the flyer/canvas builder.

Elements are stored in display coordinates (0–540 px wide, 0–540 or
0–768 tall depending on format). The render function scales everything
by RENDER_SCALE=2 to produce a crisp 1080-wide output without the
browser canvas needing to be that large on screen.

Pillow is already a dependency (used by the existing Create Flyer
feature's text-compositing code); this generalises that pattern to
arbitrary, user-positioned elements instead of a fixed bottom band.
"""
import io
import os

from PIL import Image, ImageDraw, ImageFont

_FONTS_DIR = os.path.join(os.path.dirname(__file__), 'static', 'fonts')
_LOGO_PATH  = os.path.join(os.path.dirname(__file__), 'static', 'img', 'logo.png')

# Display canvas sizes in CSS/JS pixels; render at 2× for crisp PNGs.
DISPLAY_SIZES = {
    'square':   (540, 540),
    'portrait': (540, 768),
}
RENDER_SCALE = 2


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


def render_flyer_png(elements, fmt='square', bg_color='#ffffff', asset_loader=None):
    """Render a list of flyer elements to PNG bytes.

    elements  – ordered list of element dicts (array index = z-order)
    fmt       – 'square' or 'portrait'
    bg_color  – hex background fill
    asset_loader – callable(asset_id: int) -> bytes | None, used for
                   Image elements that reference a stored FlyerAsset
    """
    dw, dh = DISPLAY_SIZES.get(fmt, (540, 540))
    rw, rh = dw * RENDER_SCALE, dh * RENDER_SCALE
    s = RENDER_SCALE

    canvas = Image.new('RGBA', (rw, rh), _hex_to_rgba(bg_color))
    draw   = ImageDraw.Draw(canvas)

    for el in elements:
        x  = int(el.get('x',      0))  * s
        y  = int(el.get('y',      0))  * s
        w  = max(4, int(el.get('width',  100))) * s
        h  = max(4, int(el.get('height',  60))) * s
        el_type = el.get('type', '')

        if el_type == 'shape':
            color   = el.get('color',   '#AD0304')
            opacity = int(el.get('opacity', 100))
            alpha   = int(255 * opacity / 100)
            fill    = _hex_to_rgba(color, alpha)
            radius  = int(el.get('radius', 0)) * s
            if radius:
                draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill)
            else:
                draw.rectangle([x, y, x + w, y + h], fill=fill)

        elif el_type in ('text', 'heading'):
            text    = el.get('text', '')
            if not text:
                continue
            color = el.get('color',    '#000000')
            bold  = el.get('bold', el_type == 'heading')
            align = el.get('align', 'left')
            # Font size is stored in display px; scale up to match the
            # RENDER_SCALE canvas so text stays proportionally the same size.
            font  = _load_font(bold=bold, size=int(el.get('fontSize', 36) * RENDER_SCALE))
            fill     = _hex_to_rgba(color)
            lines    = _wrap_text(draw, text, font, w)
            bbox0    = draw.textbbox((0, 0), 'A', font=font)
            line_h   = (bbox0[3] - bbox0[1]) + int(4 * RENDER_SCALE)
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
