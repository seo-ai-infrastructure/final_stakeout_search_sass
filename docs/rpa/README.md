# Chrome RPA template (reference)

`Stakeout_chrome_final.json` is the DuoPlus RPA template that was tested end to end on a
DuoPlus phone. The production capture script (`packages/core/runner.ts`, run_pin v5)
follows it step for step over ADB, so no DuoPlus task is scheduled and no API call is used:

| Template step | Capture script |
| --- | --- |
| First-run screens (Accept & continue, Use without an account, No thanks, Got it) | `dismiss_fre` |
| Search for the keyword | Opens google.com/search for the exact keyword (no address-bar autocomplete) |
| Wait up to 30 s for the "Use precise location" **Button**, tap, wait 5–7 s | `wait_for` + `tap_button` |
| Accept "www.google.com wants to use your device's location" via `positive_button` | `wait_for` + `tap_rid` |
| Scroll until "More businesses" is on screen, dump `serp.xml`, tap it | step 2 (`serp.xml`) |
| Wait 4–7 s, scroll about halfway down the 20-result list (6–9 random swipes) | step 3 (`hswipe`, `rsleep`) |
| Dump `finder.xml` | `final.xml` |

The local finder lists 20 businesses at once; scrolling about halfway loads the rest of the page.

If Google changes the page, update the template first, test it on one phone, then mirror
the change in run_pin.

# Google Maps app template (reference)

`Stakeout_google_maps_app.json` is the Maps template with working ADB commands.
`Stakeout_google_maps_app_original.json` is the version as first tested. run_pin v7 follows it:

| Template step | Capture script |
| --- | --- |
| `am force-stop` Maps (no data wipe, so no first-run pop-ups) | Same; Chrome is still fully cleared |
| Start screen recording in the background | `screenrecord … &`, stopped with SIGINT so the MP4 is playable |
| Cold-launch Maps, wait up to 9 s for "Search here", tap it | `wait_for` + `find_node` (TextView only) |
| Type the keyword, press Enter, wait 4–7 s | `input text`, `input keyevent 66`, `rsleep` |
| Dump the first screen of results | `dump_0.xml` |
| Three rounds of 5–7 swipes on the list (x 28%, y 57%), each followed by a dump | `mswipe` rounds, `dump_1–3.xml`; `final.xml` = `dump_3.xml` |

Why several dumps: the Maps results list is a native Android list, which can drop rows
that have scrolled off screen. The parser merges every dump in order, and
`parse_capture.py` reports whether the final dump still held the first screen's results.
