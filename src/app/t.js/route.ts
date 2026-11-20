/** Codul de urmărire Echo (1 KB). Rulează pe site-ul magazinului. */
export const dynamic = "force-static";

const JS = `(function(){try{
var s=document.currentScript||document.querySelector('script[data-key][src*="/t.js"]');if(!s)return;
var key=s.getAttribute('data-key'),api=new URL(s.src).origin+'/api/t',K='echo_src',D=30*864e5;
function get(){try{var v=JSON.parse(localStorage.getItem(K)||'null');return v&&Date.now()-v.t<D?v:null}catch(e){return null}}
function set(v){try{localStorage.setItem(K,JSON.stringify(v))}catch(e){}}
function send(b){b.key=key;b.url=location.href;var d=JSON.stringify(b);if(navigator.sendBeacon){navigator.sendBeacon(api,d)}else{fetch(api,{method:'POST',body:d,keepalive:true,mode:'no-cors'})}}
var q=new URLSearchParams(location.search),st=get();
var ref=document.referrer,utm=q.get('utm_source'),click=q.get('echo_click');
var external=ref&&new URL(ref).hostname!==location.hostname;
if(external||utm||click){var sid=(st&&st.s)||Math.random().toString(36).slice(2);
 st={t:Date.now(),s:sid,ref:external?ref:(st&&st.ref)||'',utm:utm||(st&&st.utm)||'',click:click||(st&&st.click)||''};set(st);
 send({kind:'visit',ref:st.ref,utm:st.utm,click:st.click,session:sid});}
function order(o){if(!st)return;send({kind:'order',ref:st.ref,utm:st.utm,click:st.click,session:st.s,order:String(o.id||''),value:Number(o.value)||0,currency:o.currency||''})}
var q2=window.echoq||[];for(var i=0;i<q2.length;i++){if(q2[i][0]==='order')order(q2[i][1])}
window.echoq={push:function(a){if(a[0]==='order')order(a[1])}};
}catch(e){}})();`;

export function GET() {
  return new Response(JS, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } });
}
