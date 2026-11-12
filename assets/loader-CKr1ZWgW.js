import{g as u}from"./auth-SaEg1NsO.js";const p="https://graphql.anilist.co",y=10*60*1e3,A="data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="#1a1a2e"/><text x="150" y="225" font-family="sans-serif" font-size="20" fill="#4a4a6a" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>'),v="data:image/svg+xml;utf8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="#1a1a2e"/><text x="150" y="150" font-family="sans-serif" font-size="20" fill="#4a4a6a" text-anchor="middle" dominant-baseline="middle">No Image</text></svg>');function b(e){return e==null?"":String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function M(e){return e?String(e).replace(/<br\s*\/?>/gi,`
`).replace(/<[^>]*>/g,"").replace(/\n{3,}/g,`

`).trim():""}function w(e){try{const t=sessionStorage.getItem(e);if(!t)return null;const n=JSON.parse(t);return Date.now()-n.t>y?(sessionStorage.removeItem(e),null):n.data}catch{return null}}function x(e,t){try{sessionStorage.setItem(e,JSON.stringify({t:Date.now(),data:t}))}catch{}}function I(e,t){return"ali:"+JSON.stringify({q:e,v:t})}async function T(e,t={},n=null){const r=I(e,t),a=w(r);if(a)return a;const c=JSON.stringify({query:e,variables:t});let d;for(let l=0;l<3;l++){if(n!=null&&n.aborted)throw new DOMException("AbortError","AbortError");try{const s=await fetch(p,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:c,signal:n});if(s.status===429){const m=parseFloat(s.headers.get("Retry-After")||"1");await f(Math.max(m,.5)*1e3);continue}if(!s.ok)throw new Error(`AniList HTTP ${s.status}`);const i=await s.json();if(i.errors&&i.errors.length)throw new Error(i.errors.map(m=>m.message).join("; "));return x(r,i.data),i.data}catch(s){d=s,l<2&&await f(500*Math.pow(2,l))}}throw console.error("[ArcVerse AniList API Error]",d),d||new Error("AniList request failed")}function f(e){return new Promise(t=>setTimeout(t,e))}const D=`
  fragment CardFields on Media {
    id
    title { romaji english }
    coverImage { extraLarge large medium }
    bannerImage
    averageScore
    episodes
    format
    isAdult
  }
`,k=`
  fragment DetailFields on Media {
    id
    idMal
    title { romaji english native }
    description(asHtml: false)
    coverImage { extraLarge large medium }
    bannerImage
    averageScore
    meanScore
    status
    episodes
    season
    seasonYear
    format
    duration
    source
    genres
    studios(isMain: true) { nodes { name } }
  }
`;function C(e){return e&&(e.extraLarge||e.large||e.medium)||null}let h=0,o=null;function P(){S(),L()}function S(){const e=document.getElementById("lsBg");if(!e)return;const t=u("assets/loading-bg.webp"),n=u("assets/loading-bg.jpg"),r=new Image;r.onload=()=>{e.style.backgroundImage=`url("${t}")`,e.classList.add("loaded")},r.onerror=()=>{const a=new Image;a.onload=()=>{e.style.backgroundImage=`url("${n}")`,e.classList.add("loaded")},a.src=n},r.src=t,r.complete&&e.classList.add("loaded")}function L(){const e=document.getElementById("lsSparks");if(!e||e.children.length>0)return;const t=35,n=document.createDocumentFragment();for(let r=0;r<t;r++){const a=document.createElement("div");a.className="spark";const c=Math.floor(2+Math.random()*3.5),d=(Math.random()*100).toFixed(1),l=(3.5+Math.random()*4.5).toFixed(2),s=(Math.random()*5).toFixed(2),i=(.45+Math.random()*.45).toFixed(2),g=Math.random()>.55?"#fcedc7":"#ffffff";a.style.width=`${c}px`,a.style.height=`${c}px`,a.style.left=`${d}%`,a.style.background=g,a.style.boxShadow=`0 0 ${c*2}px ${g}`,a.style.setProperty("--dur",`${l}s`),a.style.setProperty("--delay",`${s}s`),a.style.setProperty("--peak",i),n.appendChild(a)}e.appendChild(n)}function $(e="fullscreen"){const t=document.getElementById("loadingScreen");t&&(o&&(clearTimeout(o),o=null),h=Date.now(),t.classList.remove("variant-fullscreen","variant-section","search-overlay"),t.classList.add(`variant-${e}`),t.style.display="flex",t.offsetHeight,t.classList.remove("hidden"))}function F(e=null){const t=document.getElementById("loadingScreen");if(!t)return;let n=0;if(e!==null)n=Math.max(0,e);else{const r=Date.now()-h;n=Math.max(0,600-r)}o&&clearTimeout(o),o=setTimeout(()=>{t.classList.add("hidden"),o=setTimeout(()=>{t.style.display="none",o=null},450)},n)}export{k as M,A as P,T as a,M as b,v as c,D as d,b as e,F as h,P as i,C as p,$ as s};
