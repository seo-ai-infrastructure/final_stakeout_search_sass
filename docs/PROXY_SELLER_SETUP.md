# Proxy-Seller setup for Stakeout

Updated 2026-11-05 from the supplied residential API documentation and the provider's endpoint references. This update needs no database migration. Neon table setup remains a separate step.

## What each credential does

| Value | Purpose | Where it belongs |
| --- | --- | --- |
| Proxy-Seller management API key | Read package/list information; separate provider APIs can manage lists | Optional Codespaces secret `PROXY_SELLER_API_KEY` for `npm run proxy:check` |
| API Tools base login | Worker appends country, ZIP/city, ISP and session targeting | Railway `PROXY_SELLER_BASE_LOGIN` |
| API Tools password | Authenticates the actual SOCKS5 connection | Railway `PROXY_SELLER_PASSWORD` |
| DuoPlus proxy ID | Identifies the saved proxy record that the worker updates | Fleet manager, paired with a phone image ID |

A package holds traffic and expiration. Lists hold credentials and filters. Sessions select a temporary exit using a login suffix. Separate ordinary lists share package traffic; they do not create per-client traffic caps. Subpackages are a provider feature for hard allocations and are not managed by this app.

## 1. Obtain credentials that support login targeting

Use the provider's **API Tools** connection credentials for this worker. The detailed login-targeting reference points to `PUT /resident/list/tools` (or `/residentsubuser/list/tools` for a subuser) to issue them. This is a provider-side write; perform it once through the provider's supported flow and save the returned login/password privately. Creating ordinary GEO-filtered lists with `/resident/list/add` is a different flow. Do not assume an arbitrary fixed list supports the worker's dynamic suffixes.

The worker does not call list creation, deletion, rotation or renewal endpoints on each pin. An existing valid API Tools login/password is sufficient for scans; the management API key is optional.

## 2. Set the worker variables

```dotenv
PROXY_SELLER_BASE_LOGIN=YOUR_API_TOOLS_BASE_LOGIN
PROXY_SELLER_PASSWORD=YOUR_API_TOOLS_PASSWORD
PROXY_SELLER_HOST=us.res.proxy-seller.com
PROXY_PORT=10000
PROXY_USE_SLOT_PORT=true
PROXY_ISP_IDS_JSON={}
PROXY_STATE_IDS_JSON={}
UNBIND_PROXY_BEFORE_UPLOAD=false
```

Enter values in Railway's variables interface without adding shell quotes. Set `PROXY_USE_SLOT_PORT=true` on Vercel too, so its fleet table displays the ports the worker uses. Redeploy both hosts after changing these settings.

The gateway supports HTTP and SOCKS5; the worker explicitly uses SOCKS5. TLS to destination websites still works through the proxy. Do not configure the gateway itself as an HTTPS proxy.

### Parallel ports

The provider documents ports **10000–10999** for independent parallel exits. This does not require a separate provider-issued port for every phone.

| Repo setting | Port calculation |
| --- | --- |
| `PROXY_USE_SLOT_PORT=false` | Uses `PROXY_PORT`, default 10000 |
| `PROXY_USE_SLOT_PORT=true` | Uses `10000 + slotIndex`: first phone 10001, second 10002 |

Slot mode supports database slots 1–999 and rejects out-of-range values. Slots are persistent and auto-increment; deleting rows does not reset the sequence. Ports are never wrapped or silently reused. The sample env preserves the original false default; enable slot mode on both hosts when setting up the parallel fleet.

## 3. Pair each cloud phone with its own saved DuoPlus proxy record

Create one SOCKS5 proxy record in DuoPlus per phone. The initial record uses your provider host, a valid gateway port and the API Tools login/password. Record the actual DuoPlus `proxy_id` and pair it with the phone's `image_id` in `/admin/devices`. Bootstrap the phone and select its reported hardware model in the wizard.

One API Tools credential set can serve these saved DuoPlus records. A DuoPlus proxy record is not a Proxy-Seller list. The worker changes the saved record's username and port for each attempt.

## 4. Add numeric ISP and state mappings

For the first connection test choose **Any ISP** and leave both JSON maps empty. For named ISP targeting use numeric provider codes from `GET /resident/geo/isp`, keyed by the wizard's exact labels:

```json
{"Charter Communications":"PROVIDER_NUMERIC_CODE"}
```

Supported label keys include `Charter Communications`, `Comcast Cable Communications`, `ATT Services` and `Verizon Communications`. Replace placeholders before saving. State fallback uses provider subdivision codes from `GET /resident/geo`, for example `{"FL":"PROVIDER_NUMERIC_CODE"}`. Do not substitute ZIP codes or ASN values for subdivision IDs.

For every pin the worker rewrites the phone's saved DuoPlus proxy record (`POST /api/v1/proxy/update`: host, slot port, targeted login, password, SOCKS5) and walks this ladder, narrowest first:

| Rung | Login suffix | Used when |
| --- | --- | --- |
| `ZIP_ISP` | `_c_US_isp_<id>_zip_<zip>` | ISP mapped |
| `CITY_ISP` | `_c_US_city_<City>_isp_<id>` | ISP mapped |
| `STATE_ISP` | `_c_US_sd_<id>_isp_<id>` | ISP and state mapped |
| `ZIP` | `_c_US_zip_<zip>` | always |
| `CITY` | `_c_US_city_<City>` | always |
| `STATE` | `_c_US_sd_<id>` | state mapped |

Each rung gets a fresh session (`_s_<16 hex>_ttl_30m`) so the exit stays fixed for the whole pin. After each update the worker runs DuoPlus's proxy check and accepts the first exit in the US **and in the pin's state** (`PROXY_REQUIRE_STATE_MATCH=true`, the default). If no rung passes, the pin fails with `PROXY_LADDER_EXHAUSTED` plus the reason for each rung, and is refunded after its retries.

The receipt (`proxyMeta`) records the rung used, `ispRequested`, `ispRuleApplied` (true only for an `_ISP` rung), `stateMatched`, `cityMatched`, the port and the rungs that failed. A requested ISP can still fall back to a non-ISP rung; the receipt then says `ispRuleApplied: false`.

The wizard only offers ISPs present in `PROXY_ISP_IDS_JSON`, so set it on Vercel as well as Railway. Without `PROXY_SELLER_BASE_LOGIN`/`PROXY_SELLER_PASSWORD` the worker uses each phone's saved proxy unchanged, records `STATIC_DEVICE_PROXY`, and refuses ISP-targeted scans.

## 5. Optional read-only account check

Add these as Codespaces secrets and restart the Codespace:

```dotenv
PROXY_SELLER_API_KEY=YOUR_MANAGEMENT_API_KEY
PROXY_SELLER_BASE_LOGIN=YOUR_API_TOOLS_BASE_LOGIN
PROXY_SELLER_PASSWORD=YOUR_API_TOOLS_PASSWORD
PROXY_SELLER_LISTS_PATH=resident/lists
PROXY_USE_SLOT_PORT=true
```

From the repo root:

```sh
npm ci --include=dev
npm run proxy:check
```

The check only makes GET requests. It reports package activity, byte counters, the expiry string as reported, list count, whether the configured login appears, and the first fleet port. It does not print credentials, package keys, full management URLs, whitelist contents or raw provider response bodies. It rejects business errors even when the HTTP status is 200. Network errors discard underlying exception text because it may contain an API-key-bearing URL. Redirects are disabled.

An inactive package, zero traffic or an unmatched login returns exit code 2. Other errors return 1. A successful management check does not prove the phone's live exit, exact GEO, Google capture or R2 upload. These require a small live scan.

### Conflicting list endpoints in the provider docs

| Source | Documented path |
| --- | --- |
| Residential overview supplied by the user | `GET /proxy/lists` |
| Detailed Get existing IP list reference | `GET /resident/lists` |

The check defaults to the detailed reference. If your account/provider confirms the overview path, explicitly set `PROXY_SELLER_LISTS_PATH=proxy/lists`. The script does not silently switch endpoints. If an alternate response does not contain `data.items`, it reports an unrecognized shape instead of claiming there are zero lists. API authentication, allowlist or package errors are not evidence that the path is wrong.

## 6. Verify one real pin before expanding

Start one 3×3 scan with a compatible bootstrapped phone. Inspect the actual recording and receipt. Confirm the observed IP is US, the port matches its fleet slot, and any named ISP requirement is supported by evidence rather than the dropdown label alone. With AI tracking enabled the grid costs 18 credits.

Video/XML uploads use phone traffic while the proxy is attached. Measure actual bandwidth before setting prices. Keep `UNBIND_PROXY_BEFORE_UPLOAD=false` until the optional detach/rebind path is verified in your own fleet.

Renew packages through the provider dashboard. The public API does not document residential renewal; do not send `resident` to IP-based renewal endpoints. Expiration timestamps without an offset have no confirmed timezone in this integration. Raw/video/meta files currently share attempt prefixes in R2; a whole-prefix expiry rule deletes all evidence under that prefix.

## Scope of this update

- Implemented: strict gateway-port bounds shared by web and worker, early missing-credential errors, optional read-only package/list check, safe HTTP-200 error handling and redacted summaries.
- Implemented: login-suffix targeting ladder, per-rung sessions, shared slot ports, DuoPlus proxy record updates, state-checked exits and truthful receipts.
- Not implemented: automatic list/subpackage management, per-client provider bandwidth caps, usage dashboards or residential renewal.
- No live Proxy-Seller account or DuoPlus exit was exercised while preparing this update.

## Provider references

- https://docs.proxy-seller.com/api-v2/residential-proxy
- https://docs.proxy-seller.com/api-v2/residential-proxy/connect-target-via-login
- https://docs.proxy-seller.com/api-v2/residential-proxy/connect-target-via-login/create-a-special-list
- https://docs.proxy-seller.com/api-v2/residential-proxy/get-existing-ip-list
- https://docs.proxy-seller.com/api-v2/residential-proxy/get-package-information
- https://docs.proxy-seller.com/api-v2/residential-proxy/change-rotation-settings

## Residential lists (recommended)

Set `PROXY_SELLER_API_KEY` on the web app and the worker (Railway), and allow-list the worker's static Railway IPs and Vercel's egress if your Proxy-Seller API key is IP-restricted.

1. **The customer chooses ISPs** in the new-scan wizard: **Any ISP**, **One ISP**, or a **Mix** of 2–6. The list shows only ISPs that have residential IPs in that market, read from Proxy-Seller's GEO data (cached 7 days per market).
2. **Before the grid is queued**, the scan's center city is matched to Proxy-Seller's spelling (Mt./Mount, St./Saint handled) and a list is created for each chosen ISP, plus an any-ISP list for the city. Lists are stored and reused, so a market's second scan creates nothing. A city Proxy-Seller doesn't list falls back to the whole state.
3. **Each grid point has a fixed ISP**, so repeated runs compare like for like.
4. **The worker** prefers a phone already on the pin's list, rewrites the phone's DuoPlus proxy record only when it must change lists, checks the exit on the phone, and falls back to the any-ISP list if the ISP's exit is missing or out of state.
5. **Receipts** record the list, rotation, ISP requested, the exit's own network name (`ispObserved`) and whether it matched, plus the exit IP, city and state.

Without `PROXY_SELLER_API_KEY`, the older login-suffix targeting described above is used.

