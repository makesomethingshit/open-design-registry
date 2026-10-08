"""Check the design comparison's hierarchy, action meaning and pressed-state contracts."""
from pathlib import Path
from html.parser import HTMLParser
import xml.etree.ElementTree as ET
import re

BASE = Path(__file__).resolve().parent
NS = '{http://www.w3.org/2000/svg}'

class Comparison(HTMLParser):
    def __init__(self):
        super().__init__()
        self.options = {}; self.option = None; self.button = None; self.selected = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article':
            self.option = attrs['id']; self.options[self.option] = []
        if tag == 'input' and 'checked' in attrs: self.selected.append(attrs['id'])
        if tag == 'button': self.button = {'attrs':attrs, 'text':''}
    def handle_data(self, text):
        if self.button is not None: self.button['text'] += text
    def handle_endtag(self, tag):
        if tag == 'button':
            self.button['text'] = self.button['text'].strip()
            self.options[self.option].append(self.button); self.button = None
        if tag == 'article': self.option = None

page = (BASE/'icon-set-options.html').read_text(encoding='utf-8')
parsed = Comparison(); parsed.feed(page)
assert parsed.selected == ['view-d']
assert len(parsed.options) == 4
selected = 0
for option, buttons in parsed.options.items():
    assert len(buttons) == 23, option
    for b in buttons:
        attrs = b['attrs']; classes = attrs.get('class','').split(); label = b['text']
        if label in ('Watch','Watching','Contribute'): assert 'primary' in classes, (option,label)
        if label in ('Star','Fork'): assert 'primary' not in classes, (option,label)
        if 'selected' in classes:
            assert attrs.get('aria-pressed') == 'true', (option,label)
            selected += 1
        if label in ('Star','Watch','Preview'): assert attrs.get('aria-pressed') == 'false', (option,label)
        if not label: assert attrs.get('aria-label'), option
assert selected == 8
assert '.dark .btn.primary{background:#f2f2f2' in page
octicons = page.split('id="option-d"',1)[1].split('</article>',1)[0]
all_icons = [ET.fromstring(s) for s in re.findall(r'<svg\b.*?</svg>',page,re.S)]
assert len(all_icons) == 132
assert all(e.get('aria-hidden') == 'true' and e.get('focusable') == 'false' for e in all_icons)
icons = [ET.fromstring(s) for s in re.findall(r'<svg\b.*?</svg>',octicons,re.S)]
watch = [ET.tostring(e.find('path') if e.find('path') is not None else e.find(NS+'path')) for e in icons if e.get('data-icon') == 'watch']
preview = [ET.tostring(e.find('path') if e.find('path') is not None else e.find(NS+'path')) for e in icons if e.get('data-icon') == 'preview']
assert len(watch) == 3 and len(preview) == 2
assert len(set(watch)) == 1 and set(watch).isdisjoint(preview)
assert len(icons)==33
assert all(e.get('width') == e.get('viewBox').split()[2] for e in icons)
for file in (BASE/'icon-sets').glob('*.svg'):
    board = ET.parse(file).getroot()
    glyphs = board.findall(NS+'svg'); assert len(glyphs)==26, file
    watch_rect = next(e for e in board.findall(NS+'rect') if (e.get('x'),e.get('y'))==('744','251'))
    assert watch_rect.get('fill') == '#202020', file
    assert glyphs[2].get('color') == '#FFFFFF', file
assert '<script' not in page and 'userToken' not in page
print('PASS: four families preserve primary Watch; bell/eye are distinct; 8 selected and 16 unselected examples expose pressed state; native sizes and SVG boards are valid.')
