#!/usr/bin/env python3
"""
Stakeout Census build: runs once a year (GitHub Actions workflow "Census build").

ACS 5-year estimates (median household income, owner-occupied and occupied housing units,
median home value, median year built, each with its margin of error) for every ZIP code
tabulation area, census tract and block group, joined to the Census Bureau's boundaries:

  out/census.pmtiles             map tiles with layers zcta, tract, bg, drawn under report maps.
                                 Made from the generalised 1:500,000 cartographic boundary files,
                                 which the Census Bureau intends for display only.
  out/lookup/{tract,bg}/SS.fgb   per-state point-lookup files (FlatGeobuf, spatially indexed)
  out/lookup/zcta.fgb            from full-precision TIGER/Line shapes simplified by about 5 m,
                                 so matching a grid point to its area never uses display shapes.
  out/manifest.json              data vintage, counts and file sizes

then uploads everything to R2 under census/acs<YEAR>/.

Environment:
  YEAR            ACS 5-year end year (default 2024, i.e. the 2020-2024 estimates)
  STATES          "" for the whole country, or state FIPS codes such as "47" or "47,12"
  CENSUS_API_KEY  free key from api.census.gov/data/key_signup.html (recommended)
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT (optional)
  UPLOAD          "0" to build without uploading
  WORK_DIR        working folder (default ./census-build); downloads are cached there
"""
from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import time
from datetime import datetime, timezone

import geopandas as gpd
import pandas as pd
import requests
import shapely

YEAR = int(os.environ.get('YEAR', '2024'))
WORK = pathlib.Path(os.environ.get('WORK_DIR', 'census-build')).resolve()
OUT = WORK / 'out'
KEY = os.environ.get('CENSUS_API_KEY', '').strip()
PREFIX = f'census/acs{YEAR}'
ALL_STATES = ['01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '15', '16', '17', '18', '19',
              '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35',
              '36', '37', '38', '39', '40', '41', '42', '44', '45', '46', '47', '48', '49', '50', '51', '53',
              '54', '55', '56', '72']
STATES = [s.strip().zfill(2) for s in os.environ.get('STATES', '').split(',') if s.strip()] or ALL_STATES
SUBSET = STATES != ALL_STATES

# ACS detailed-table variable -> short property name (kept short: they ride in every map tile)
VARS = {
    'B19013_001E': 'inc', 'B19013_001M': 'inc_m',   # median household income
    'B25003_001E': 'occ', 'B25003_001M': 'occ_m',   # occupied housing units
    'B25003_002E': 'own', 'B25003_002M': 'own_m',   # owner-occupied housing units
    'B25077_001E': 'val', 'B25077_001M': 'val_m',   # median home value
    'B25035_001E': 'yb', 'B25035_001M': 'yb_m',     # median year structure built
}
# Census API annotation codes: "not available", "too few samples", "not applicable" and so on.
SENTINELS = {-999999999, -888888888, -666666666, -555555555, -333333333, -222222222}

# Display boundaries (cartographic, 1:500,000) and lookup boundaries (TIGER/Line, full precision).
GENZ = f'https://www2.census.gov/geo/tiger/GENZ{YEAR}/shp'
TIGER = f'https://www2.census.gov/geo/tiger/TIGER{YEAR}'
SHAPES = {
    'zcta': {'display': ['https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip'],
             'lookup': [f'{TIGER}/ZCTA520/tl_{YEAR}_us_zcta520.zip']},
    'tract': {'display': [f'{GENZ}/cb_{YEAR}_us_tract_500k.zip'],
              'lookup': [f'{TIGER}/TRACT/tl_{YEAR}_{{st}}_tract.zip']},
    'bg': {'display': [f'{GENZ}/cb_{YEAR}_{{st}}_bg_500k.zip'],
           'lookup': [f'{TIGER}/BG/tl_{YEAR}_{{st}}_bg.zip']},
}
# Zoom ranges of each tile layer. All layers share the top zoom, so whichever level a client
# picks is there at report zooms (11-13); the map stretches zoom-13 tiles when zooming closer.
ZOOMS = {'zcta': (4, 13), 'tract': (7, 13), 'bg': (9, 13)}
LOOKUP_SIMPLIFY_DEG = 0.00005  # about 5 m


def log(*parts):
    print(datetime.now().strftime('%H:%M:%S'), *parts, flush=True)


# ----------------------------------------------------------------------------- ACS values
def acs_rows(geo_for: str, geo_in: list[str] | None = None) -> list[dict]:
    url = f'https://api.census.gov/data/{YEAR}/acs/acs5'
    params = [('get', ','.join(['NAME', *VARS])), ('for', geo_for)] + [('in', i) for i in (geo_in or [])]
    if KEY:
        params.append(('key', KEY))
    for attempt in range(6):
        try:
            r = requests.get(url, params=params, timeout=180)
        except requests.RequestException as e:
            log('  Census API connection problem, retrying:', e)
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code == 200:
            rows = r.json()
            return [dict(zip(rows[0], row)) for row in rows[1:]]
        if r.status_code == 204:
            return []
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(5 * (attempt + 1))
            continue
        raise RuntimeError(f'Census API {r.status_code} for {geo_for} {geo_in}: {r.text[:300]}')
    raise RuntimeError(f'Census API kept failing for {geo_for} {geo_in}')


def clean(value) -> float | None:
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return None if x in SENTINELS or x < 0 else x


def short_name(level: str, name: str, geoid: str) -> str:
    if level == 'zcta':
        return f'ZIP {geoid}'
    parts = [p.strip() for p in name.replace(';', ',').split(',') if p.strip()]
    return ', '.join(parts[:2]) if parts else geoid


def derive(level: str, row: dict, geoid: str) -> dict:
    """One area's properties: whole-number estimates, the homeowner share, and how reliable the
    income estimate is (coefficient of variation from the 90% margin of error)."""
    out: dict = {'id': geoid, 'nm': short_name(level, row.get('NAME', ''), geoid)}
    for var, prop in VARS.items():
        v = clean(row.get(var))
        out[prop] = None if v is None else int(round(v))
    if out['occ'] and out['own'] is not None and out['occ'] > 0:
        out['own_pct'] = round(100 * out['own'] / out['occ'], 1)
    if out['inc'] and out['inc_m'] is not None and out['inc'] > 0:
        cv = out['inc_m'] / 1.645 / out['inc']
        out['inc_cv'] = round(cv, 3)
        out['rel'] = 2 if cv < 0.15 else 1 if cv < 0.30 else 0   # 2 good, 1 fair, 0 use with caution
    return {k: v for k, v in out.items() if v is not None}


def geoid_of(level: str, row: dict) -> str:
    if level == 'zcta':
        return row['zip code tabulation area']
    base = row['state'] + row['county'] + row['tract']
    return base + row['block group'] if level == 'bg' else base


def values(level: str) -> dict[str, dict]:
    rows: list[dict] = []
    if level == 'zcta':
        rows = acs_rows('zip code tabulation area:*')
    for st in (STATES if level != 'zcta' else []):
        if level == 'tract':
            rows += acs_rows('tract:*', [f'state:{st}'])
        else:
            try:
                rows += acs_rows('block group:*', [f'state:{st}', 'county:*', 'tract:*'])
            except RuntimeError:   # older API behaviour: one county at a time
                for c in sorted({r['county'] for r in acs_rows('county:*', [f'state:{st}'])}):
                    rows += acs_rows('block group:*', [f'state:{st}', f'county:{c}', 'tract:*'])
    log(f'  {level}: {len(rows):,} ACS rows')
    return {g: derive(level, r, g) for r in rows for g in [geoid_of(level, r)]}


# ----------------------------------------------------------------------------- boundaries
def download(url: str) -> pathlib.Path:
    dest = WORK / 'downloads' / url.rsplit('/', 1)[1]
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(5):
        try:
            with requests.get(url, stream=True, timeout=600) as r:
                if r.status_code == 404:
                    raise FileNotFoundError(f'Census file not found: {url}')
                r.raise_for_status()
                tmp = dest.with_suffix('.part')
                with open(tmp, 'wb') as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                tmp.rename(dest)
                return dest
        except (requests.RequestException, OSError) as e:
            if isinstance(e, FileNotFoundError):
                raise
            log('  download problem, retrying:', url, e)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f'could not download {url}')


def read_shapes(url: str) -> gpd.GeoDataFrame:
    g = gpd.read_file(f'zip://{download(url)}')
    g = g.to_crs(4326)
    col = next(c for c in ('GEOID', 'GEOID20', 'ZCTA5CE20') if c in g.columns)
    return g[[col, 'geometry']].rename(columns={col: 'id'})


def shapes(level: str, kind: str) -> list[tuple[str, gpd.GeoDataFrame]]:
    """(part name, shapes) pairs: one per state for state-based files, one national part otherwise."""
    parts = []
    for template in SHAPES[level][kind]:
        if '{st}' in template:
            parts += [(st, read_shapes(template.format(st=st))) for st in STATES]
        else:
            g = read_shapes(template)
            if level != 'zcta':
                g = g[g['id'].str[:2].isin(STATES)]
            parts.append(('us', g))
    return parts


def with_values(g: gpd.GeoDataFrame, vals: dict[str, dict]) -> gpd.GeoDataFrame:
    props = pd.DataFrame([vals[i] if i in vals else {'id': i} for i in g['id']])
    return gpd.GeoDataFrame(props, geometry=g.geometry.values, crs=4326)


# ----------------------------------------------------------------------------- outputs
def write_features(g: gpd.GeoDataFrame, path: pathlib.Path):
    """Newline-delimited GeoJSON for tippecanoe; empty values are left out of each feature."""
    with open(path, 'a', encoding='utf-8') as f:
        cols = [c for c in g.columns if c != 'geometry']
        for geom, *vals in zip(g.geometry.values, *(g[c].values for c in cols)):
            if geom is None or geom.is_empty:
                continue
            props = {}
            for c, v in zip(cols, vals):
                if v is None or (isinstance(v, float) and v != v):
                    continue
                props[c] = v.item() if hasattr(v, 'item') else v
                if c not in ('id', 'nm', 'own_pct', 'inc_cv') and isinstance(props[c], float):
                    props[c] = int(props[c])
            f.write('{"type":"Feature","properties":' + json.dumps(props, separators=(',', ':')) +
                    ',"geometry":' + shapely.to_geojson(geom) + '}\n')


def run(cmd: list[str]):
    log('  $', ' '.join(cmd))
    subprocess.run(cmd, check=True)


def build_level(level: str, zcta_area=None) -> dict:
    log(f'{level}: values')
    vals = values(level)
    feat = WORK / f'{level}.geojsonl'
    feat.unlink(missing_ok=True)
    log(f'{level}: display shapes')
    shown = 0
    for _, g in shapes(level, 'display'):
        if level == 'zcta' and zcta_area is not None:
            g = g[g.intersects(zcta_area)]
        g = with_values(g, vals)
        shown += len(g)
        write_features(g, feat)
    tiles = WORK / f'{level}.pmtiles'
    lo, hi = ZOOMS[level]
    run(['tippecanoe', '-o', str(tiles), '-l', level, f'-Z{lo}', f'-z{hi}', '-P', '--force',
         '--detect-shared-borders', '--no-feature-limit', '--no-tile-size-limit', '--simplification=4',
         '--quiet', str(feat)])
    log(f'{level}: lookup shapes')
    looked = 0
    for part, g in shapes(level, 'lookup'):
        if level == 'zcta' and zcta_area is not None:
            g = g[g.intersects(zcta_area)]
        g = with_values(g, vals)
        g['geometry'] = g.geometry.simplify(LOOKUP_SIMPLIFY_DEG, preserve_topology=True)
        name = 'zcta.fgb' if level == 'zcta' else f'{level}/{part}.fgb'
        dest = OUT / 'lookup' / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.unlink(missing_ok=True)
        g.to_file(dest, driver='FlatGeobuf')
        looked += len(g)
    with_income = sum(1 for v in vals.values() if 'inc' in v)
    return {'areas': shown, 'lookup_areas': looked, 'with_income': with_income}


def upload():
    import boto3
    from botocore.config import Config
    endpoint = (os.environ.get('R2_ENDPOINT') or '').strip().rstrip('/') or \
        f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    s3 = boto3.client('s3', endpoint_url=endpoint, region_name='auto',
                      aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
                      aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
                      config=Config(request_checksum_calculation='when_required',
                                    response_checksum_validation='when_required'))
    bucket = os.environ['R2_BUCKET_NAME']
    if endpoint.endswith('/' + bucket):   # the dashboard shows the S3 API URL with the bucket on the end
        endpoint = endpoint[: -len(bucket) - 1]
        s3 = boto3.client('s3', endpoint_url=endpoint, region_name='auto',
                          aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
                          aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
                          config=Config(request_checksum_calculation='when_required',
                                        response_checksum_validation='when_required'))
    files = sorted(p for p in OUT.rglob('*') if p.is_file() and p.name != 'manifest.json')
    for p in files + [OUT / 'manifest.json']:   # manifest last: it marks the build as complete
        key = f'{PREFIX}/{p.relative_to(OUT).as_posix()}'
        kind = 'application/json' if p.suffix == '.json' else 'application/octet-stream'
        s3.upload_file(str(p), bucket, key, ExtraArgs={'ContentType': kind, 'CacheControl': 'public, max-age=86400'})
        log(f'  uploaded {key} ({p.stat().st_size / 1e6:.1f} MB)')


def main():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    log(f'Census build: ACS {YEAR - 4}-{YEAR} 5-year, {"states " + ",".join(STATES) if SUBSET else "all states"}')
    counts = {'tract': build_level('tract'), 'bg': build_level('bg')}
    area = None
    if SUBSET:   # a test build keeps only the ZIPs that touch the chosen states
        area = shapely.union_all([g.geometry.union_all() for _, g in shapes('tract', 'display')])
    counts['zcta'] = build_level('zcta', area)
    run(['tile-join', '-o', str(OUT / 'census.pmtiles'), '--force', '--no-tile-size-limit', '--quiet',
         *(str(WORK / f'{lvl}.pmtiles') for lvl in ('zcta', 'tract', 'bg'))])
    sizes = {p.relative_to(OUT).as_posix(): p.stat().st_size for p in OUT.rglob('*') if p.is_file()}
    manifest = {
        'vintage': f'ACS {YEAR - 4}-{YEAR} 5-year estimates', 'year': YEAR,
        'built_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'states': 'all' if not SUBSET else STATES,
        'tables': sorted({v.split('_')[0] for v in VARS}),
        'boundaries': {lvl: SHAPES[lvl] for lvl in SHAPES},
        'zooms': ZOOMS, 'counts': counts,
        'tiles_bytes': sizes.get('census.pmtiles', 0),
        'lookup_bytes': sum(v for k, v in sizes.items() if k.startswith('lookup/')),
        'seconds': round(time.time() - t0),
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    log(f"tiles {manifest['tiles_bytes'] / 1e6:.1f} MB, lookups {manifest['lookup_bytes'] / 1e6:.1f} MB, "
        f"{json.dumps(counts)}")
    if os.environ.get('UPLOAD', '1') != '0':
        upload()
    log(f'done in {manifest["seconds"] / 60:.1f} min')


if __name__ == '__main__':
    sys.exit(main())
