"""Validate local links and SEO without network access or third-party packages."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ERRORS = []

class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.tags, self.jsonld, self.duplicates = [], [], []
        self.in_json = False
        self.buffer = ''
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        if len(attrs) != len(dict(attrs)):
            self.duplicates.append(tag)
        self.tags.append((tag, dict(attrs)))
        if tag == 'script' and dict(attrs).get('type') == 'application/ld+json':
            self.in_json = True
            self.buffer = ''

    def handle_data(self, data):
        if self.in_json:
            self.buffer += data

    def handle_endtag(self, tag):
        if tag == 'script' and self.in_json:
            self.jsonld.append(json.loads(self.buffer))
            self.in_json = False

def check(condition, message):
    if not condition:
        ERRORS.append(message)

def check_url(name, url):
    parts = urlsplit(url)
    if parts.scheme or url.startswith('//'):
        check(parts.scheme != 'http', f'{name}: insecure URL {url}')
        if parts.netloc != 'demidovs.ru':
            return
    path = unquote(parts.path)
    p = ROOT / name
    dest = (ROOT / path.lstrip('/')) if path.startswith('/') else (p.parent / path if path else p)
    if dest.is_dir():
        dest = dest / 'index.html'
    check(dest.is_file(), f'{name}: missing target {url}')
    if not dest.is_file():
        return
    check(dest.stat().st_size > 0, f'{name}: empty target {url}')
    if dest.suffix == '.html' and parts.fragment:
        target = Document(dest.read_text())
        check(any(a.get('id') == unquote(parts.fragment) for _, a in target.tags), f'{name}: missing anchor {url}')

pages = ['index.html', 'duet/index.html', 'petr/index.html', 'natalia/index.html', 'privacy/index.html', '404.html']
docs = {name: Document((ROOT / name).read_text()) for name in pages}
for name, doc in docs.items():
    p = ROOT / name
    check(not doc.duplicates, f'{name}: duplicate attributes {doc.duplicates}')
    ids = [a['id'] for _, a in doc.tags if 'id' in a]
    check(len(ids) == len(set(ids)), f'{name}: duplicate IDs')
    check(sum(t == 'h1' for t, _ in doc.tags) == 1, f'{name}: exactly one h1 required')
    check('peterdemidov.github.io' not in p.read_text(), f'{name}: stale domain')
    for tag, attrs in doc.tags:
        if tag == 'img':
            check('alt' in attrs, f'{name}: image missing alt')
        if tag == 'a' and attrs.get('target') == '_blank':
            check('noopener' in attrs.get('rel', '').split(), f'{name}: missing noopener')
        for attr in ['href', 'src', 'poster']:
            url = attrs.get(attr)
            if not url:
                continue
            check_url(name, url)
        if tag == 'meta' and attrs.get('property', attrs.get('name')) in ['og:url', 'og:image', 'twitter:image']:
            check_url(name, attrs.get('content', ''))
    for match in re.finditer(r'url\(\s*[\"\']?([^\)\"\']+)', p.read_text()):
        check_url(name, match.group(1).strip())
    if name in pages[:4]:
        canonical = 'https://demidovs.ru/' + (name.split('/')[0] + '/' if name.startswith(('petr/', 'natalia/')) else '')
        links = [a.get('href') for t, a in doc.tags if t == 'link' and a.get('rel') == 'canonical']
        check(links == [canonical], f'{name}: wrong canonical')
        meta = {a.get('property', a.get('name')): a.get('content') for t, a in doc.tags if t == 'meta'}
        check(meta.get('og:url') == canonical, f'{name}: wrong og:url')
        check(len(doc.jsonld) == 1, f'{name}: expected one JSON-LD block')
        data = doc.jsonld[0]
        check(data.get('url') == canonical, f'{name}: wrong JSON-LD url')
        image = data.get('image', '')
        check_url(name, image)
        check(image.startswith('https://demidovs.ru/'), f'{name}: wrong JSON-LD image origin')
        check((ROOT / urlsplit(image).path.lstrip('/')).is_file(), f'{name}: missing JSON-LD image')
        check(meta.get('og:image') == image and meta.get('twitter:image') == image, f'{name}: image metadata mismatch')
        check(any(t == 'script' and a.get('src') and 'defer' in a for t, a in doc.tags), f'{name}: shared script missing')
        form = next(a for t, a in doc.tags if t == 'form')
        check(form.get('method') == 'post', f'{name}: form must not leak data in GET URL')

check((ROOT / 'CNAME').read_text().strip() == 'demidovs.ru', 'Wrong CNAME')
check((ROOT / '.nojekyll').exists(), 'Missing .nojekyll')
check('Sitemap: https://demidovs.ru/sitemap.xml' in (ROOT / 'robots.txt').read_text(), 'Wrong sitemap in robots.txt')
sitemap = ET.parse(ROOT / 'sitemap.xml')
locations = [x.text for x in sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
check(locations == ['https://demidovs.ru/', 'https://demidovs.ru/petr/', 'https://demidovs.ru/natalia/'], 'Unexpected sitemap URLs')
for location in locations:
    check_url('sitemap.xml', location)
    page = urlsplit(location).path.lstrip('/') + 'index.html'
    target = docs.get(page)
    check(target is not None and any(t == 'link' and a.get('rel') == 'canonical' and a.get('href') == location for t, a in target.tags), f'sitemap.xml: noncanonical URL {location}')
for directory in ['images', 'media']:
    for resource in (ROOT / directory).rglob('*'):
        if resource.is_file():
            check(resource.stat().st_size > 0, f'Empty media file: {resource.relative_to(ROOT)}')
check(any(t == 'meta' and a.get('name') == 'robots' and 'noindex' in a.get('content', '').split(',') for t, a in docs['404.html'].tags), '404.html: missing noindex')
check([a.get('href') for t, a in docs['404.html'].tags if t == 'a'] == ['/', '/petr/', '/natalia/'], '404.html: navigation must use root-relative routes')
# The duplicate duo page must keep exactly the same content and layout.
normalize = lambda s: s.replace('../', '')
check(normalize((ROOT / 'index.html').read_text()) == normalize((ROOT / 'duet/index.html').read_text()), 'Duo pages diverged')
if ERRORS:
    raise SystemExit('\n'.join(ERRORS))
print('OK: six HTML pages, local links, anchors, IDs, JSON-LD, SEO metadata, sitemap and CNAME')
