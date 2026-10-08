"""Lori, la mascotte d'Aloria : un axolotl turquoise (couleurs du logo), branchies roses, ventre sable.
Génère une tête par expression (emojis) en SVG."""
import os

OUT = os.path.dirname(os.path.abspath(__file__))

DEFS = '''
<defs>
  <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8FE3F2"/><stop offset="1" stop-color="#2BA9CC"/>
  </linearGradient>
  <linearGradient id="gill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFB8D6"/><stop offset="1" stop-color="#F06FA8"/>
  </linearGradient>
  <radialGradient id="shine" cx="0.35" cy="0.25" r="0.6">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
</defs>'''

INK = '#0B3A52'


def gills():
    # Trois branchies de chaque côté, en éventail vers le haut (0° = vers le haut)
    parts = []
    for side in (-1, 1):
        for angle, length in ((105, 92), (72, 112), (40, 98)):
            parts.append(
                f'<g transform="translate({256 + side * 118} 238) rotate({side * angle})">'
                f'<rect x="-22" y="{-length}" width="44" height="{length + 10}" rx="22" fill="url(#gill)" stroke="{INK}" stroke-width="10"/>'
                f'<circle cx="-5" cy="{-length + 24}" r="7" fill="#FFFFFF" opacity="0.55"/></g>')
    return ''.join(parts)


def head():
    return (f'<ellipse cx="256" cy="295" rx="168" ry="145" fill="url(#skin)" stroke="{INK}" stroke-width="12"/>'
            '<ellipse cx="256" cy="295" rx="168" ry="145" fill="url(#shine)"/>')


def cheeks():
    return ''.join(f'<ellipse cx="{x}" cy="335" rx="30" ry="18" fill="#FF8FBF" opacity="0.7"/>' for x in (160, 352))


def eyes_open(look=(0, 0)):
    dx, dy = look
    s = ''
    for x in (180, 332):
        s += (f'<circle cx="{x}" cy="275" r="34" fill="{INK}"/>'
              f'<circle cx="{x - 11 + dx}" cy="{262 + dy}" r="12" fill="#FFFFFF"/>'
              f'<circle cx="{x + 12 + dx}" cy="{288 + dy}" r="5" fill="#FFFFFF"/>')
    return s


def eyes_happy():
    return ''.join(f'<path d="M{x - 30} 285 Q{x} 245 {x + 30} 285" fill="none" stroke="{INK}" stroke-width="14" stroke-linecap="round"/>'
                   for x in (180, 332))


def eyes_heart():
    s = ''
    for x in (180, 332):
        s += (f'<path transform="translate({x} 278) scale(1.25)" d="M0 22 C-34 0 -30 -26 -14 -28 C-6 -29 0 -22 0 -16 '
              f'C0 -22 6 -29 14 -28 C30 -26 34 0 0 22 Z" fill="#F0457F" stroke="{INK}" stroke-width="6"/>')
    return s


def mouth_smile():
    return f'<path d="M226 330 Q256 360 286 330" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>'


def mouth_open():
    return (f'<path d="M218 326 Q256 392 294 326 Z" fill="#7A1F3D" stroke="{INK}" stroke-width="10" stroke-linejoin="round"/>'
            '<path d="M236 352 Q256 372 276 352 Q256 344 236 352 Z" fill="#FF7FA8"/>')


def mouth_o():
    return f'<ellipse cx="256" cy="345" rx="20" ry="24" fill="#7A1F3D" stroke="{INK}" stroke-width="10"/>'


def mouth_sad():
    return f'<path d="M228 350 Q256 322 284 350" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>'


def tears():
    return ''.join(f'<path d="M{x} 305 Q{x - 16} 340 {x} 352 Q{x + 16} 340 {x} 305 Z" fill="#9FE6FF" stroke="{INK}" stroke-width="6"/>'
                   for x in (160, 352))


def sparkles():
    star = 'M0 -26 Q5 -5 26 0 Q5 5 0 26 Q-5 5 -26 0 Q-5 -5 0 -26 Z'
    return ''.join(f'<path transform="translate({x} {y}) scale({k})" d="{star}" fill="#FFD866" stroke="{INK}" stroke-width="5"/>'
                   for x, y, k in ((70, 120, 1.1), (450, 140, 0.9), (440, 430, 0.8)))


def hand_chin():
    # Bulle « ? » au-dessus de la tête (« je réfléchis »)
    return (f'<circle cx="420" cy="110" r="58" fill="#FFFFFF" stroke="{INK}" stroke-width="10"/>'
            f'<circle cx="372" cy="182" r="14" fill="#FFFFFF" stroke="{INK}" stroke-width="8"/>'
            f'<text x="420" y="138" font-family="Arial Black, Arial" font-weight="900" font-size="84" text-anchor="middle" fill="{INK}">?</text>')


def sword():
    # Épée de diamant (PvP), tenue en travers devant la tête, en bas à droite
    return (f'<g transform="translate(440 462) rotate(-28) scale(0.72)">'
            f'<path d="M-20 -150 L0 -186 L20 -150 L20 10 L-20 10 Z" fill="#6FF2E3" stroke="{INK}" stroke-width="10" stroke-linejoin="round"/>'
            f'<path d="M-4 -150 L-4 0" stroke="#FFFFFF" stroke-width="8" opacity="0.7"/>'
            f'<rect x="-56" y="8" width="112" height="26" rx="10" fill="#4B3621" stroke="{INK}" stroke-width="9"/>'
            f'<rect x="-13" y="32" width="26" height="62" rx="8" fill="#7A5230" stroke="{INK}" stroke-width="9"/></g>')


FACES = {
    'lori': eyes_open() + mouth_smile(),
    'lori_gg': eyes_happy() + mouth_open(),
    'lori_love': eyes_heart() + mouth_smile(),
    'lori_wow': eyes_open((0, -4)) + mouth_o(),
    'lori_cry': eyes_happy().replace('Q', 'Q').replace(' 245 ', ' 245 ') + tears() + mouth_sad(),
    'lori_think': eyes_open((10, -10)) + f'<path d="M234 340 Q256 330 278 338" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>',
    'lori_pvp': eyes_open() + mouth_open(),
}
EXTRAS = {'lori_gg': sparkles(), 'lori_love': '', 'lori_think': '', 'lori_pvp': ''}
FRONT = {'lori_think': hand_chin()}
BACK = {}
FRONT['lori_pvp'] = sword()


def svg(name):
    face = FACES[name]
    if name == 'lori_cry':
        # Yeux plissés vers le bas (tristes)
        face = ''.join(f'<path d="M{x - 30} 270 Q{x} 300 {x + 30} 270" fill="none" stroke="{INK}" stroke-width="14" stroke-linecap="round"/>'
                       for x in (180, 332)) + tears() + mouth_sad()
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">{DEFS}'
            f'{BACK.get(name, "")}{gills()}{head()}{cheeks()}{face}{FRONT.get(name, "")}{EXTRAS.get(name, "")}</svg>')


for name in FACES:
    with open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8') as f:
        f.write(svg(name))
print('ok', list(FACES))
