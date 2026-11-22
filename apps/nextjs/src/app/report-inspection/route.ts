import { db } from '@stakeout/db';
import { signedRead } from '@stakeout/core/r2';
import { getAuthenticatedUser, SESSION_COOKIE_NAME } from '@/lib/auth';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ownerEmail = 'brock1321misner@gmail.com';
const path = '/report-inspection';
const cookieName = '__Secure-stakeout-report-inspection';
const lifetime = 2 * 60 * 60;
const businesses: Record<string, readonly string[]> = {
  huntington: ['cmwp476p10002yeryw6ddvy17','cmwo6mwo50007130bog9vrm20','cmwokrrh7000gyxjndrwqcxea','cmwojqqmk0002yxjnzup40ugl','cmwoimx6c0002fvohbhbchmkf'],
  'top-dollar': ['cmwrg0ahw0005113hn499e5c4','cmwqy0i9a000a8lhfk5lyydl9'],
  gisela: ['cmwqm0ex30004juuuc6rmlcse'],
};
const headers = { 'Cache-Control':'private, no-store, max-age=0', 'X-Robots-Tag':'noindex, nofollow', 'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY', 'X-Content-Type-Options':'nosniff', Vary:'Cookie' };
const unavailable = () => new Response('Page unavailable', { status:404, headers });
const html = (body:string) => new Response(body,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
async function owner() {
  const user = await getAuthenticatedUser().catch(() => null);
  return user?.role === 'ADMIN' && user.email.toLowerCase() === ownerEmail;
}
function signature(expires:string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('Missing signing key');
  return createHmac('sha256', secret).update('report-inspection/gisela/v1/'+expires).digest('hex');
}
async function signedOutAccess() {
  const jar=await cookies();
  if(jar.has(SESSION_COOKIE_NAME)) return false;
  const m=/^(\d{10})\.([0-9a-f]{64})$/.exec(jar.get(cookieName)?.value ?? '');
  const now=Math.floor(Date.now()/1000);
  if(!m || Number(m[1])<=now || Number(m[1])>now+lifetime) return false;
  if(!timingSafeEqual(Buffer.from(signature(m[1]),'hex'),Buffer.from(m[2],'hex'))) return false;
  return !!await db.user.findFirst({where:{email:ownerEmail,role:'ADMIN'},select:{id:true}});
}
export async function POST(req:Request) {
  if(req.headers.get('origin')!==new URL(req.url).origin || !await owner()) return unavailable();
  const expires=String(Math.floor(Date.now()/1000)+lifetime);
  (await cookies()).set(cookieName,expires+'.'+signature(expires),{secure:true,httpOnly:true,sameSite:'strict',path,maxAge:lifetime});
  return new Response(null,{status:303,headers:{...headers,Location:path+'?business=gisela'}});
}
export async function GET(req:Request) {
  const params=new URL(req.url).searchParams;
  const business=params.get('business');
  const admin=await owner();
  if(!admin && !(business==='gisela' && await signedOutAccess())) return unavailable();
  if(!business && admin) return html(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporting inspection · Stakeout Search</title><style>body{margin:0;background:#101820;color:#edf2f5;font:16px/1.55 system-ui}main{max-width:650px;margin:8vh auto;padding:24px}a,button{font:inherit;color:#ffae78}section{border-top:1px solid #42505c;padding:14px 0}button{background:#24313c;border:1px solid #768591;border-radius:7px;padding:8px 14px;cursor:pointer}</style><main><small>STAKEOUT SEARCH</small><h1>Reporting inspection</h1><section><a href="?business=huntington">Huntington · Connected Google data</a><p>Review keyword tabs, Google metrics and the four point receipts.</p></section><section><a href="?business=top-dollar">Top Dollar Home Offer · Scan only</a><p>Switch keywords, inspect pins and download the point data.</p></section><section><h2>Gisela N Sanchez · Mobile playback</h2><p>On your phone, authorize this browser, bookmark the report, then sign out of Stakeout and reopen the bookmark in the same browser. Select a pin and play its recording. Access expires in two hours.</p><form method="post"><button>Authorize this browser and open report</button></form></section></main></html>`);
  if(!business || !Object.hasOwn(businesses,business)) return unavailable();
  const video=params.get('video');
  if(video){
    const pin=await db.gridPin.findFirst({where:{id:video,scanId:{in:[...businesses[business]]}},select:{scanId:true,videoUrl:true}});
    if(!pin?.videoUrl) return unavailable();
    const key=pin.videoUrl.startsWith('https://')?decodeURIComponent(new URL(pin.videoUrl).pathname.slice(1)):pin.videoUrl;
    if(!key.startsWith('scans/'+pin.scanId+'/')) return unavailable();
    return new Response(null,{status:307,headers:{...headers,Location:await signedRead(key)}});
  }
  const rows=await db.$queryRaw<{document:string}[]>`SELECT document FROM stakeout_inspection.report_previews WHERE business = ${business}`;
  if(!rows.length) return unavailable();
  return html(gunzipSync(Buffer.from(rows[0].document,'base64')).toString('utf8'));
}
