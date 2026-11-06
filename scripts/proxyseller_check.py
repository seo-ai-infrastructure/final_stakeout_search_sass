#!/usr/bin/env python3
"""
Proxy-Seller residential check for Stakeout. No dependencies; Python 3.8+.

Never paste your API key into chats. Run with it in the environment:

  export PS_KEY=<your NEW Proxy-Seller API key>

Step 1. Explore a market (read-only: creates nothing, costs nothing):
  python3 proxyseller_check.py explore "Mt. Juliet" TN

  Prints how Proxy-Seller spells the city and state, the ISPs available there,
  and the exact JSON shape of one entry. Paste that output back to Claude.

Step 2. Create ONE test list with per-request rotation, then test it:
  python3 proxyseller_check.py create "<Region exactly as printed>" "<City exactly as printed>" "<ISP exactly as printed>"

  Prints the list id and its proxies in DuoPlus's IP:PORT:username:password format
  (password masked; full lines saved to duoplus_proxies.txt), then makes three
  requests through it so you can see whether the IP rotates and lands in the city.
  Delete the test list in the Proxy-Seller dashboard afterwards if you don't keep it.
"""
import json, os, re, subprocess, sys, urllib.parse, urllib.request

BASE = 'https://proxy-seller.com/personal/api/v2/'
KEY = os.environ.get('PS_KEY', '').strip()


def call(path, body=None):
    url = BASE + KEY + path
    req = urllib.request.Request(url, method='POST' if body is not None else 'GET',
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode('utf-8', 'replace')
    except Exception as e:  # never print the URL: it contains the key
        sys.exit(f'Request to {path.split("?")[0]} failed: {type(e).__name__}')
    try:
        data = json.loads(raw)
    except ValueError:
        return raw  # download endpoints return plain text
    if isinstance(data, dict) and data.get('errors'):
        sys.exit(f'Proxy-Seller error on {path.split("?")[0]}: {data["errors"]}')
    return data


def norm(s):
    s = s.lower().replace('mount ', 'mt ').replace('saint ', 'st ')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def walk(node, trail=()):
    """Yields (trail, value) for every value in a nested JSON structure."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, trail + (k,))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, trail + (i,))
    yield trail, node


def get_at(root, trail):
    for t in trail:
        root = root[t]
    return root


def explore(city, state):
    geo = call('resident/geo')
    with open('ps_geo.json', 'w') as f:
        json.dump(geo, f)
    print(f'Downloaded the GEO database ({os.path.getsize("ps_geo.json") / 1e6:.1f} MB) to ps_geo.json\n')
    want = norm(city)
    hits = [(t, v) for t, v in walk(geo) if isinstance(v, str) and (norm(v) == want or want in norm(v))]
    if not hits:
        print(f'No entry matched "{city}". Nearby spellings containing the first word:')
        first = want.split()[0]
        print(sorted({v for _, v in walk(geo) if isinstance(v, str) and first in norm(v)})[:30])
        return
    print(f'{len(hits)} value(s) match "{city}":')
    for trail, value in hits[:10]:
        print(f'  "{value}" at {"/".join(map(str, trail))}')
    trail = hits[0][0]
    for depth in (1, 2, 3):  # show the object that holds the city, to learn the structure
        parent = get_at(geo, trail[:-depth]) if len(trail) > depth else geo
        text = json.dumps(parent, ensure_ascii=False)
        if len(text) > 300 or depth == 3:
            print(f'\nThe JSON around the first match ({depth} level(s) up), truncated:')
            print(text[:2500])
            break
    state_hits = sorted({v for _, v in walk(geo) if isinstance(v, str) and norm(v) in (norm(state), norm(STATE_NAMES.get(state.upper(), state)))})
    print(f'\nState spellings found for {state}: {state_hits[:5]}')
    print('\nNext: paste everything above to Claude, then run step 2 with the exact names.')


def create(region, city, isp):
    body = {'title': f'stakeout-test|US|{region}|{city}|{isp}|r0', 'whitelist': '',
            'geo': {'country': 'US', 'region': region, 'city': city, 'isp': isp},
            'export': {'ports': 3, 'ext': 'txt'}, 'rotation': 0}
    res = call('resident/list/add', body)
    lst = res.get('data', {}) if isinstance(res, dict) else {}
    print('Created list id:', lst.get('id'), '| rotation:', lst.get('rotation'), '| geo:', lst.get('geo'))
    # Ask Proxy-Seller for DuoPlus's format directly: IP:PORT:username:password
    fmt = urllib.parse.quote('%ip%:%port%:%login%:%password%', safe='')
    lines = call(f'proxy/download/resident?ext={fmt}&listId={lst.get("id")}')
    entries = []
    for raw in str(lines).splitlines():
        raw = raw.strip().rstrip(';')
        if '@' in raw:  # fallback if the custom format is ignored: login:password@host:port
            cred, hostport = raw.rsplit('@', 1)
            login, password = cred.split(':', 1)
            host, port = hostport.rsplit(':', 1)
        elif raw.count(':') >= 3:
            host, port, login, password = raw.split(':', 3)
        else:
            continue
        entries.append((host, port, login, password))
    print('\nDuoPlus format, IP:PORT:username:password (password masked):')
    for host, port, login, _ in entries:
        print(f'  {host}:{port}:{login}:****')
    if not entries:
        print('  none returned; raw response:', str(lines)[:300])
        return
    if any(not re.fullmatch(r'[\d.]+', h) for h, *_ in entries):
        print('  Note: the host is a name, not an IP. Check that DuoPlus accepts a hostname here.')
    with open('duoplus_proxies.txt', 'w') as f:
        f.write('\n'.join(':'.join(e) for e in entries) + '\n')
    print('  Full lines (with passwords) saved to duoplus_proxies.txt for DuoPlus import. Keep that file private.')
    print('\nThree requests through the first line (rotation 0 should give different IPs):')
    for i in range(3):
        host, port, login, password = entries[0]
        proxy = 'socks5h://' + urllib.parse.quote(login, safe='') + ':' + urllib.parse.quote(password, safe='') + f'@{host}:{port}'
        out = subprocess.run(['curl', '-s', '--max-time', '20', '-x', proxy,
                              'https://ipinfo.io/json'], capture_output=True, text=True).stdout
        try:
            j = json.loads(out)
            print(f'  {i + 1}. {j.get("ip")} · {j.get("city")}, {j.get("region")} · {j.get("org")}')
        except ValueError:
            print(f'  {i + 1}. no answer ({out[:80]!r})')


STATE_NAMES = {'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado',
               'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
               'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
               'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
               'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
               'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina',
               'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania',
               'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas',
               'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
               'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'}

if __name__ == '__main__':
    if not KEY:
        sys.exit('Set PS_KEY first: export PS_KEY=<your new Proxy-Seller API key>')
    if len(sys.argv) >= 4 and sys.argv[1] == 'explore':
        explore(sys.argv[2], sys.argv[3])
    elif len(sys.argv) >= 5 and sys.argv[1] == 'create':
        create(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(__doc__)
