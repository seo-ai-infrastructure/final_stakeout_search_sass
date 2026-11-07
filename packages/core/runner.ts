export const RUN_PIN_SH_V2 = `#!/system/bin/sh
# run_pin v7. Args: app lat lng query query_urlencoded scan pin track_ai
# Follows the tested Stakeout Chrome RPA template (Stakeout_chrome_final.json): search, precise location, scroll until
# "More businesses" is on screen, dump the results page (serp.xml), open the list,
# scroll about halfway down the 20-result list with human-like swipes, final dump.
# Maps follows the tested Maps RPA template: force-stop (no data wipe, so no
# pop-ups), cold launch, type the keyword into "Search here", scroll the list.
APP=$1; LAT=$2; LNG=$3; Q=$4; QE=$5; SCAN=$6; PIN=$7; TRACK_AI=\${8:-0}
RT=/data/local/tmp/rt
D=$RT/\${SCAN}_\${PIN}
REC_SECS=120
MAX_STOPS=8
MAX_SWIPES=14
WANT=20
case $APP in
 maps)   PKG=com.google.android.apps.maps ;;
 google) PKG=com.google.android.googlequicksearchbox ;;
 chrome) PKG=com.android.chrome ;;
 *) echo "unknown app $APP"; exit 2 ;;
esac
mkdir -p "$D"; rm -f "$D"/*
S=$(wm size | tail -n1 | sed 's/.*: //'); W=\${S%x*}; H=\${S#*x}; X=$((W/2))
SW=720; SH=$((H*720/W)); SH=$((SH/2*2))
T0=$(date +%s)
{
 echo "runner=v7"; echo "app=$APP"; echo "lat=$LAT"; echo "lng=$LNG"; echo "query=$Q"
 echo "scan=$SCAN"; echo "pin=$PIN"; echo "track_ai=$TRACK_AI"
 echo "screen=\${W}x\${H}"; echo "video=\${SW}x\${SH}"; echo "t_start=$T0"
} > "$D/meta.txt"
dump() {
 DuoPlusDumpUI "$1" >/dev/null 2>&1 && [ -s "$1" ] && return 0
 uiautomator dump "$1" >/dev/null 2>&1 && [ -s "$1" ] && return 0
 sleep 1; uiautomator dump "$1" >/dev/null 2>&1
}
h() {
 [ -s "$1" ] || { echo "empty_$RANDOM"; return; }
 sed 's/><node/>\\n<node/g' "$1" \\
   | grep -v 'package="com.android.systemui"' \\
   | grep -oE '(text|content-desc)="[^"]+"' \\
   | md5sum | cut -d' ' -f1
}
# Taps the first ON-SCREEN node whose label contains $1. Chrome reports off-screen
# nodes with bounds [0,0][0,0]; those are skipped so we never tap the corner.
tap_in_file() {
 B=$(sed 's/><node/>\\n<node/g' "$2" \\
     | grep -iE "(text|content-desc)=\\"[^\\"]*$1[^\\"]*\\"" \\
     | grep -v 'bounds="\\[0,0\\]\\[0,0\\]"' \\
     | head -n1 \\
     | sed -n 's/.*bounds="\\[\\([0-9]*\\),\\([0-9]*\\)\\]\\[\\([0-9]*\\),\\([0-9]*\\)\\]".*/\\1 \\2 \\3 \\4/p')
 [ -z "$B" ] && return 1
 set -- $B
 input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 ))
}
# Random integer in [lo, hi], and a random pause in milliseconds (template timings).
rnd() { echo $(( $1 + RANDOM % ($2 - $1 + 1) )); }
rsleep() { ms=$(rnd $1 $2); sleep "$((ms / 1000)).$(printf '%03d' $((ms % 1000)))"; }
# Human-like upward swipe: random start height, distance and speed, as in the template.
hswipe() {
 y1=$(( H * $(rnd 62 72) / 100 )); y2=$(( y1 - H * $(rnd 20 28) / 100 ))
 x1=$(( X + $(rnd 0 60) - 30 ))
 input swipe $x1 $y1 $x1 $y2 $(rnd 500 750)
}
# Bounds of the first ON-SCREEN node matching both grep filters, as "x1 y1 x2 y2".
find_node() {
 sed 's/><node/>\\n<node/g' "$3" \\
   | grep -E "$1" | grep -iE "$2" \\
   | grep -v 'bounds="\\[0,0\\]\\[0,0\\]"' \\
   | head -n1 \\
   | sed -n 's/.*bounds="\\[\\([0-9]*\\),\\([0-9]*\\)\\]\\[\\([0-9]*\\),\\([0-9]*\\)\\]".*/\\1 \\2 \\3 \\4/p'
}
tap_bounds() { set -- $1; input tap $(( ($1+$3)/2 )) $(( ($2+$4)/2 )); }
# A Button (not just any text) labelled $1: the footer's location text must never match.
tap_button() {
 B=$(find_node 'class="android.widget.Button"' "(text|content-desc)=\\"[^\\"]*$1[^\\"]*\\"" "$2")
 [ -z "$B" ] && return 1; tap_bounds "$B"
}
tap_rid() {
 B=$(find_node "resource-id=\\"$1\\"" '.' "$2")
 [ -z "$B" ] && return 1; tap_bounds "$B"
}
# Dumps the screen until grep pattern $1 is visible, for up to $2 seconds.
wait_for() {
 end=$(( $(date +%s) + $2 ))
 while [ $(date +%s) -lt $end ]; do
   dump "$D/probe.xml"
   sed 's/><node/>\\n<node/g' "$D/probe.xml" | grep -v 'bounds="\\[0,0\\]\\[0,0\\]"' | grep -qiE "$1" && return 0
   sleep 1
 done
 return 1
}
# Upward swipe on the Maps results list, from the template: start x=300, y=1100
# on a 1080x1920 screen (28%, 57%), 350-500 px, 500-750 ms, randomised.
mswipe() {
 y1=$(( H * $(rnd 55 59) / 100 )); y2=$(( y1 - H * $(rnd 18 26) / 100 ))
 x1=$(( W * 28 / 100 + $(rnd 0 60) - 30 ))
 input swipe $x1 $y1 $x1 $y2 $(rnd 500 750)
}
# Seconds since the recording started, so each dump can be found in the video.
mark() { echo "\${1}_t=$(( $(date +%s) - TR ))" >> "$D/meta.txt"; }
organic_count() { grep -o '="About this result"' "$1" 2>/dev/null | wc -l | tr -d ' '; }
dismiss_fre() {
 r=0
 while [ $r -lt 5 ]; do
   dump "$RT/fre.xml"; hit=0
   for t in "Accept & continue" "Use without an account" "No thanks" "Not now" "Got it" "Skip" "Accept" "Continue"; do
     if tap_in_file "$t" "$RT/fre.xml"; then hit=1; sleep 1.5; break; fi
   done
   [ $hit -eq 0 ] && return 0
   r=$((r+1))
 done
}
wait_stable() {
 prev=""; n=0
 while [ $n -lt 7 ]; do
   sleep 2; dump "$D/probe.xml"; cur=$(h "$D/probe.xml")
   [ -n "$cur" ] && [ "$cur" = "$prev" ] && break
   prev=$cur; n=$((n+1))
 done
}
am force-stop $PKG
# Maps: force-stop only, as in the tested template (a data wipe brings back first-run pop-ups).
[ "$APP" = maps ] || pm clear $PKG >/dev/null 2>&1
pm grant $PKG android.permission.ACCESS_FINE_LOCATION 2>/dev/null
pm grant $PKG android.permission.ACCESS_COARSE_LOCATION 2>/dev/null
if [ "$APP" = google ]; then
 monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
 sleep 4
 dismiss_fre
fi
screenrecord --size \${SW}x\${SH} --bit-rate 1200000 --time-limit $REC_SECS "$D/video.mp4" >/dev/null 2>&1 &
REC_PID=$!
TR=$(date +%s); echo "rec_start=$TR" >> "$D/meta.txt"
sleep 1
case $APP in
 maps)   rsleep 800 1600; monkey -p $PKG -c android.intent.category.LAUNCHER 1 ;;
 google) am start -a android.intent.action.WEB_SEARCH --es query "$Q" $PKG ;;
 chrome) am start -a android.intent.action.VIEW -d "https://www.google.com/search?q=$QE" $PKG ;;
esac >/dev/null 2>&1
if [ "$APP" = maps ]; then
 # Template: wait for "Search here", tap it, type the keyword, press Enter. The keyword must
 # be confirmed in the search box before Enter; never scroll a map that was not searched.
 mark launch
 ui_has() { uiautomator dump "$D/check.xml" >/dev/null 2>&1; grep -q -i -F "$1" "$D/check.xml"; }
 MS=none
 # A fresh phone may open on a first-run screen ("Make it your map": Skip); clear it and look again.
 if wait_for '(text|content-desc)="Search here"' 9 || { dismiss_fre; wait_for '(text|content-desc)="Search here"' 9; }; then
   sleep 0.8
   B=$(find_node 'class="android.widget.TextView"' '(text|content-desc)="Search here"' "$D/probe.xml")
   if [ -n "$B" ]; then tap_bounds "$B"; else tap_in_file "Search here" "$D/probe.xml"; fi
   sleep 1.5
   input text "$(printf '%s' "$Q" | sed 's/ /%s/g')"
   sleep 1.5
   # The keyword has to be in the box before Enter.
   P=$(printf 'text="%s"' "$Q")
   if ui_has "$P"; then input keyevent 66; MS=typed; fi
 fi
 if [ "$MS" = none ]; then
   # Typing did not land: open Maps' own search for the keyword at the phone's (GPS) location.
   input keyevent 4 2>/dev/null; sleep 0.8
   am start -a android.intent.action.VIEW -d "geo:0,0?q=$QE" $PKG >/dev/null 2>&1
   sleep 4
   ui_has "$Q" && MS=intent
 fi
 echo "maps_search=$MS" >> "$D/meta.txt"
 if [ "$MS" = none ]; then
   echo "MAPS_SEARCH_FAILED: could not enter the keyword in Google Maps"
   kill -INT $REC_PID 2>/dev/null; wait "$REC_PID" 2>/dev/null
   exit 1
 fi
 mark search
 rsleep 4000 7000
else
 mark search
 wait_stable
 if [ "$APP" = chrome ]; then dismiss_fre; wait_stable; fi
 rsleep 3000 5000
fi

if [ "$APP" = chrome ] || [ "$APP" = google ]; then
 # 1. Precise location, exactly as the tested template does it: wait for the
 #    "Use precise location" BUTTON (up to 30 s), tap it, wait 5-7 s, then accept
 #    Chrome's "www.google.com wants to use your device's location" dialog.
 if wait_for 'class="android.widget.Button"[^>]*(text|content-desc)="[^"]*Use precise location|(text|content-desc)="[^"]*Use precise location[^"]*"[^>]*class="android.widget.Button"' 30; then
   sleep 3
   tap_button "Use precise location" "$D/probe.xml" && mark precise_location
   rsleep 5000 7000
   if wait_for 'wants to use your device' 10; then
     tap_rid "com.android.chrome:id/positive_button" "$D/probe.xml" || tap_in_file "Allow" "$D/probe.xml"
     sleep 0.7; mark location_allowed
   fi
   # Android's own permission prompt, on phones that show one.
   dump "$D/probe.xml"
   tap_in_file "While using the app" "$D/probe.xml" && sleep 1.5
   wait_stable
 fi
fi

if [ "$TRACK_AI" = "1" ]; then
 dump "$D/aio_initial.xml"
 if [ "$APP" = "chrome" ] || [ "$APP" = "google" ]; then
   if grep -qiE "AI Overview|Generative AI" "$D/aio_initial.xml" 2>/dev/null; then
     if tap_in_file "Show more" "$D/aio_initial.xml"; then
       sleep 2.2
       dump "$D/aio_expanded.xml"
     fi
   fi
 elif [ "$APP" = "maps" ]; then
   if grep -qiE "Ask Maps|Know before you go|AI-organized" "$D/aio_initial.xml" 2>/dev/null; then
     cp "$D/aio_initial.xml" "$D/aio_expanded.xml"
   fi
 fi
fi

if [ "$APP" = chrome ] || [ "$APP" = google ]; then
 # 2. Open the full business list from the local pack.
 s=0; opened=0
 while [ $s -lt 20 ]; do
   dump "$D/probe.xml"
   # Dump 1 (template): the full results page, just before opening the list.
   cp "$D/probe.xml" "$D/serp.xml"
   if tap_in_file "More businesses" "$D/probe.xml" || tap_in_file "More places" "$D/probe.xml"; then
     opened=1; mark serp; mark list_open; rsleep 4000 7000; break
   fi
   hswipe; rsleep 900 1500
   s=$((s+1))
 done
 echo "list_opened=$opened" >> "$D/meta.txt"
 # 3. The local finder already lists 20 businesses. As in the tested template,
 #    scroll about halfway (6-9 random swipes) so the rest of the page loads; stop
 #    early once 20 organic results are in the dump. Up to 4 dumps on the way
 #    record what was on screen, for the screen inspector.
 i=0; n=0; swipes=$(rnd 6 9)
 while [ $i -lt $swipes ]; do
   if [ $((i % 2)) -eq 0 ] && [ $n -lt 4 ]; then
     f="$D/dump_$n.xml"; dump "$f"; mark dump_$n; n=$((n+1))
     c=$(organic_count "$f"); [ -z "$c" ] && c=0
     [ "$c" -ge $WANT ] && break
   fi
   hswipe; rsleep 900 1500
   i=$((i+1))
 done
 echo "list_swipes=$i" >> "$D/meta.txt"
 # 4. Dump 2 (template): the whole loaded business list. Ranks are read from it.
 dump "$D/final.xml"; mark final
 echo "organic_in_final=$(organic_count "$D/final.xml")" >> "$D/meta.txt"
 L=$(sed 's/><node/>\\n<node/g' "$D/final.xml" \\
     | grep -oE '(text|content-desc)="[^"]*(From your|Based on your)[^"]*"' \\
     | head -n1 | sed 's/^[a-z-]*="//; s/"$//')
 echo "location_source=$L" >> "$D/meta.txt"
else
 # Template: scroll the results list 15-22 times. Done as three rounds of 5-7
 # swipes with a dump of the first screen and after each round: a native list
 # can drop rows that scrolled away, so the parser merges every dump in order.
 dump "$D/dump_0.xml"; mark dump_0
 r=1
 while [ $r -le 3 ]; do
   k=0; n=$(rnd 5 7)
   while [ $k -lt $n ]; do mswipe; rsleep 700 1400; k=$((k+1)); done
   dump "$D/dump_$r.xml"; mark dump_$r
   r=$((r+1))
 done
 cp "$D/dump_3.xml" "$D/final.xml" 2>/dev/null
 echo "stops=4" >> "$D/meta.txt"
fi

grep -l -i -E "unusual traffic|not a robot" "$D"/dump_*.xml "$D/final.xml" > "$D/flags.txt" 2>/dev/null
# Recorded, not failed: the tested template scrolls the list, not the map.
if [ "$APP" = maps ]; then
 echo "search_this_area_dumps=$(grep -l -i "Search this area" "$D"/dump_*.xml 2>/dev/null | wc -l | tr -d ' ')" >> "$D/meta.txt"
fi
rm -f "$D/probe.xml" "$RT/fre.xml"
# Stop recording as soon as the capture is done, instead of always running 90 s.
kill -INT $REC_PID 2>/dev/null
wait "$REC_PID" 2>/dev/null
[ -s "$D/video.mp4" ] || exit 1
echo "t_end=$(date +%s)" >> "$D/meta.txt"
tar -czf "$RT/\${SCAN}_\${PIN}.tar.gz" -C "$RT" "\${SCAN}_\${PIN}"
if [ -n "$UPLOAD_URL" ]; then
 if curl --max-time 90 --retry 2 -H "Content-Type: application/gzip" -sS -f -T "$RT/\${SCAN}_\${PIN}.tar.gz" "$UPLOAD_URL"; then
   rm -f "$RT/\${SCAN}_\${PIN}.tar.gz"; rm -rf "$D"; exit 0
 fi
 echo upload_failed > "$D/status"; exit 1
fi
echo done > "$D/status"
`;

export function shellQuote(value: string) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
