"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[5293],{5293:(e,t,r)=>{r.d(t,{default:()=>_});var a=r(5155),s=r(2115),n=r(8500),i=r.n(n),o=r(4908),l=r(3321),c=r(8434),d=r(7661),m=r(2156),p=r(4629),u=r(2265);function x({successPath:e="/payment-success",checkoutCancelPath:t,checkoutSource:r="checkout_resume"}){let a=(0,l.useRouter)(),n=(0,l.usePathname)(),i=(0,l.useSearchParams)(),{member:h,ready:b}=(0,m.y)(),g=i.get("checkout"),f=d.A.memberstack.proCheckoutPriceId,y=d.A.memberstack.proCheckoutYearlyPriceId&&d.A.memberstack.proCheckoutYearlyPriceId.length>0?d.A.memberstack.proCheckoutYearlyPriceId:f;return(0,s.useEffect)(()=>{let s=function(e){if(!e)return null;let t=e.toLowerCase().trim();return"month"===t||"monthly"===t?"month":"year"===t||"yearly"===t||"annual"===t?"year":null}(g);if(!s||!b)return;if((0,u.p)(h))return void a.replace(n);if(!h)return;let i=`vt_checkout_resume:${n}:checkout=${s}`;i&&"1"===sessionStorage.getItem(i)||(i&&sessionStorage.setItem(i,"1"),(async()=>{let l;(0,p.L)();try{l=(0,p.v)()}catch{i&&sessionStorage.removeItem(i),c.Ay.error("Checkout is unavailable. Try refreshing the page."),a.replace(n);return}let m=window.location.origin,u="year"===s?y:f,x=e.startsWith("/")?e:`/${e}`,h=t??d.A.memberstack.pricingUrl,b=h.startsWith("/")?h:`/${h}`;try{await l.purchasePlansWithCheckout({priceId:u,successUrl:`${m}${x}`,cancelUrl:`${m}${b}`,metadataForCheckout:{source:r}})}catch(e){i&&sessionStorage.removeItem(i),c.Ay.error((0,o.iG)(e)),a.replace(n)}})())},[t,r,f,h,n,b,a,g,e,y]),null}function h({label:e,className:t="",checkoutPriceId:r,variant:n="primary",successPath:l="/payment-success",checkoutCancelPath:x,checkoutSource:b="pricing_page",signupNextPath:g,resumeCheckoutBilling:f,surface:y="pricing",hrefInsteadOfCheckout:v}){let[w,j]=(0,s.useState)(!1),{member:k,ready:N}=(0,m.y)(),_=N&&(0,u.p)(k),$=r&&r.length>0?r:d.A.memberstack.proCheckoutPriceId,C=async()=>{let e;(0,p.L)();try{e=(0,p.v)()}catch{c.Ay.error("Checkout is unavailable. Try refreshing the page.");return}let{data:t}=await e.getCurrentMember();if(!t){let e=encodeURIComponent(function(e,t){let r=e.startsWith("/")?e:`/${e}`;if(!t)return r;let a=r.includes("?")?"&":"?";return`${r}${a}checkout=${t}`}(g??d.A.memberstack.pricingUrl,f));window.location.href=`/signup?next=${e}`;return}j(!0);try{let t=window.location.origin,r=l.startsWith("/")?l:`/${l}`,a=x??d.A.memberstack.pricingUrl,s=a.startsWith("/")?a:`/${a}`;await e.purchasePlansWithCheckout({priceId:$,successUrl:`${t}${r}`,cancelUrl:`${t}${s}`,metadataForCheckout:{source:b}})}catch(e){c.Ay.error((0,o.iG)(e))}finally{j(!1)}},P="light"===n?"border-0 bg-white font-bold text-neutral-950 shadow-md hover:bg-neutral-100":"unlock"===y?"btn-primary btn-landing-cta border-0 font-semibold normal-case":"btn-primary",A="unlock"===y?"btn btn-block h-11 min-h-[2.75rem] w-full rounded-lg text-sm shadow-md shadow-primary/20 sm:h-12 sm:min-h-12 sm:rounded-xl sm:text-[0.9375rem]":"btn btn-block min-h-[3rem] rounded-full shadow-none";if(_)return(0,a.jsx)("button",{type:"button",className:`${"unlock"===y?"btn btn-success btn-block h-11 min-h-[2.75rem] w-full cursor-default rounded-lg border-0 opacity-95 normal-case sm:h-12 sm:min-h-12 sm:rounded-xl":"btn btn-success btn-block pointer-events-none min-h-[3rem] cursor-default rounded-full normal-case border-0 opacity-95"} ${t}`.trim(),disabled:!0,"aria-disabled":"true",children:"Unlocked"});let E=`${A} ${P} ${t}`.trim()+(v?" inline-flex items-center justify-center no-underline":"");if(v){let t=v.startsWith("/")?v:`/${v}`;return N?(0,a.jsx)(i(),{href:t,prefetch:!0,className:E,children:e}):(0,a.jsx)("button",{type:"button",className:E,disabled:!0,"aria-disabled":"true",children:(0,a.jsx)("span",{className:`loading loading-spinner loading-xs ${"light"===n?"text-neutral-950":""}`})})}return(0,a.jsx)("button",{type:"button",className:`${A} ${P} ${t}`.trim(),disabled:!N||w,onClick:()=>void C(),children:!N||w?(0,a.jsx)("span",{className:`loading loading-spinner loading-xs ${"light"===n?"text-neutral-950":""}`}):e})}var b=r(3338);let g=[{text:"Watermarked exports",included:!0},{text:"Access all mockups",included:!0},{text:"Access all animations",included:!0}],f=["No watermark","High-resolution image exports","High-resolution video exports","Access all mockups","Access all animations"];function y({inverted:e}){return(0,a.jsx)("span",{className:`inline-flex size-[1.35rem] shrink-0 items-center justify-center rounded-full ${e?"bg-white/18":"bg-base-content/80"}`,"aria-hidden":!0,children:(0,a.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 20 20",fill:"currentColor",className:`size-3 ${e?"text-white":"text-base-100"}`,children:(0,a.jsx)("path",{fillRule:"evenodd",d:"M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.077l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z",clipRule:"evenodd"})})})}function v(){return(0,a.jsx)("span",{className:"inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-white/18 bg-neutral-950/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]","aria-hidden":!0,children:(0,a.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 20 20",fill:"currentColor",className:"size-3 text-white",children:(0,a.jsx)("path",{fillRule:"evenodd",d:"M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.077l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z",clipRule:"evenodd"})})})}function w({tooltip:e,ariaLabel:t,tone:r}){let[n,i]=(0,s.useState)(!1),o=(0,s.useRef)(null),l=(0,s.useId)();return(0,s.useEffect)(()=>{if(!n)return;let e=e=>{o.current?.contains(e.target)||i(!1)};return document.addEventListener("pointerdown",e,!0),()=>document.removeEventListener("pointerdown",e,!0)},[n]),(0,a.jsxs)("span",{ref:o,className:"relative inline-flex shrink-0 align-middle",children:[(0,a.jsx)("button",{type:"button",className:`inline-flex size-11 touch-manipulation cursor-pointer items-center justify-center rounded-full text-current opacity-80 transition-[opacity,background-color] hover:opacity-100 active:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:size-8 ${"light"===r?"active:bg-base-content/10":"active:bg-white/10"}`,onClick:e=>{e.preventDefault(),e.stopPropagation(),i(e=>!e)},"aria-expanded":n,"aria-controls":n?l:void 0,"aria-label":t,children:(0,a.jsxs)("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",className:"pointer-events-none","aria-hidden":!0,children:[(0,a.jsx)("circle",{cx:"12",cy:"12",r:"9",stroke:"currentColor",strokeWidth:"1.6"}),(0,a.jsx)("path",{stroke:"currentColor",strokeWidth:"1.6",strokeLinecap:"round",d:"M12 10v5M12 8h.01"})]})}),n?(0,a.jsx)("span",{id:l,role:"tooltip",className:`absolute left-1/2 top-[calc(100%+0.35rem)] z-[70] w-[min(18rem,calc(100vw-2.5rem))] -translate-x-1/2 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${"light"===r?"border-base-content/12 bg-base-100 text-base-content/90 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.22)]":"border-white/12 bg-neutral-900 text-neutral-100 shadow-[0_8px_28px_-8px_rgba(0,0,0,0.45)]"}`,children:e}):null]})}function j({label:e,tooltip:t,tone:r,className:s=""}){let n="light"===r?"text-base-content/70":"text-neutral-400";return(0,a.jsxs)("div",{className:`flex items-center gap-0.5 text-sm leading-snug ${n} ${s}`,children:[(0,a.jsx)("span",{className:"light"===r?"font-medium text-base-content/90":"font-medium text-neutral-200",children:e}),(0,a.jsx)(w,{tooltip:t,ariaLabel:`More about ${e}`,tone:r})]})}function k(){return(0,a.jsx)("span",{className:"inline-flex size-[1.35rem] shrink-0 items-center justify-center rounded-full bg-base-content/10","aria-hidden":!0,children:(0,a.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 20 20",fill:"currentColor",className:"size-3 text-base-content/45",children:(0,a.jsx)("path",{d:"M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"})})})}function N({billing:e,proUnlocked:t,proMonthly:r,proYearly:s,shellClassName:n=""}){let i,o=r?.price??19,l=s?.price??99,c=(l/12).toFixed(2),m="year"===e,p=m&&(i=d.A.memberstack.proCheckoutYearlyPriceId)&&i.length>0?i:d.A.memberstack.proCheckoutPriceId;return(0,a.jsxs)("div",{className:`relative z-[1] overflow-visible rounded-[1.65rem] border border-neutral-600/55 bg-neutral-950 p-4 shadow-[0_6px_22px_-8px_rgba(0,0,0,0.28),0_2px_6px_rgba(0,0,0,0.12)] ring-1 ring-white/[0.035] lg:p-5 lg:pb-6 lg:shadow-[0_8px_28px_-10px_rgba(0,0,0,0.32)] ${n}`,children:[(0,a.jsxs)("div",{className:"pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]","aria-hidden":!0,children:[(0,a.jsx)("div",{className:"absolute inset-0 bg-[radial-gradient(ellipse_78%_64%_at_82%_-8%,rgba(66,88,216,0.42),transparent_58%)]"}),(0,a.jsx)("div",{className:"absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_12%_88%,rgba(66,88,216,0.24),transparent_55%)]"}),(0,a.jsx)("div",{className:"absolute inset-0 bg-[radial-gradient(ellipse_52%_48%_at_50%_42%,rgba(66,88,216,0.06),transparent_62%)]"}),(0,a.jsx)("div",{className:"absolute inset-0 bg-[linear-gradient(180deg,rgb(255_255_255/0.03)_0%,transparent_22%,transparent_72%,rgba(10,10,12,0.22)_100%)]"}),(0,a.jsx)("div",{className:"absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgb(107_138_239/0.52)] to-transparent"}),(0,a.jsx)(b.P,{variant:"pricing"}),(0,a.jsx)("div",{className:"vt-footer-grain-soft absolute inset-0 opacity-[0.38]"})]}),(0,a.jsxs)("div",{className:"relative z-[1] flex flex-col gap-4 lg:gap-5",children:[(0,a.jsxs)("div",{className:"isolate rounded-2xl border border-white/[0.09] bg-neutral-800/[0.82] p-6 shadow-[0_3px_14px_-6px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md backdrop-saturate-125 supports-[backdrop-filter]:bg-neutral-800/78 sm:p-7",children:[(0,a.jsxs)("div",{className:"flex min-h-[2.875rem] w-full items-center justify-between gap-3",children:[(0,a.jsx)("div",{className:"min-w-0",children:(0,a.jsx)("div",{className:"text-2xl font-bold tracking-tight text-white md:text-[1.6875rem] md:leading-tight",children:m?"Pro Yearly":"Pro Monthly"})}),m?(0,a.jsx)("span",{className:"inline-flex shrink-0 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-content shadow-md shadow-primary/25 md:text-[11px]",children:"Best value"}):(0,a.jsx)("span",{className:"inline-flex shrink-0 rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-content shadow-md shadow-primary/25 md:text-[11px]",children:"Popular"})]}),(0,a.jsx)("p",{className:"mt-4 text-[0.9375rem] leading-relaxed text-neutral-400 md:text-base",children:(m?s?.description:r?.description)??"Launch and scale your brand with premium 3D content."}),(0,a.jsxs)("div",{className:"mt-5 min-h-[8.5rem] sm:min-h-[8rem]",children:[(0,a.jsxs)("div",{className:"flex min-h-[3.25rem] flex-wrap items-end gap-x-2 gap-y-1",children:[(0,a.jsx)("span",{className:"text-5xl font-extrabold tabular-nums tracking-tighter text-white leading-none md:text-[3.375rem]",children:m?`$${c}`:`$${o}`}),(0,a.jsx)("span",{className:"pb-2 text-[0.9375rem] font-medium text-neutral-400 md:text-lg",children:"per month"})]}),(0,a.jsx)("p",{className:"mt-2 min-h-[2.25rem] text-[13px] leading-relaxed text-neutral-400",children:m?(0,a.jsxs)(a.Fragment,{children:["Billed annually at $",l,"."]}):(0,a.jsx)(a.Fragment,{children:"Cancel anytime, instant access."})})]}),t&&(0,a.jsx)("p",{className:"mt-1.5 text-sm font-semibold text-primary",children:"Unlocked — you're on Pro."}),(0,a.jsx)("div",{className:"mt-2 [&_button]:min-h-12 [&_button]:rounded-xl [&_button]:font-semibold [&_button]:normal-case [&_button]:shadow-md [&_button]:shadow-primary/20",children:(0,a.jsx)(h,{label:m?"Go Pro Yearly — Full Access":"Go Pro — Full Access",variant:"primary",checkoutPriceId:p,className:"btn-landing-cta btn-primary btn-block w-full border-0",checkoutSource:"pricing_page",resumeCheckoutBilling:e,signupNextPath:d.A.memberstack.pricingUrl,successPath:"/payment-success"})})]}),(0,a.jsx)(j,{label:"Commercial use license",tooltip:"Use mockups in client work, marketing, e-commerce, ads, and any project that promotes or sells a brand, product, or service.",tone:"dark",className:"px-3 md:px-4"}),(0,a.jsx)("ul",{className:"space-y-3 px-3 pb-6 pt-0 text-[0.9375rem] leading-relaxed text-neutral-100/92 md:px-4 md:pb-7",children:f.map(e=>(0,a.jsxs)("li",{className:"flex gap-3",children:[(0,a.jsx)("span",{className:"mt-0.5 shrink-0",children:(0,a.jsx)(v,{})}),(0,a.jsx)("span",{className:"min-w-0",children:e})]},e))})]})]})}function _(){let{member:e,ready:t}=(0,m.y)(),r=t&&!!e&&(0,u.p)(e),[n,o]=(0,s.useState)("year"),l=(0,s.useMemo)(()=>d.A.stripe.plans.find(e=>"month"===e.billingInterval),[]),c=(0,s.useMemo)(()=>d.A.stripe.plans.find(e=>"year"===e.billingInterval),[]);return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(s.Suspense,{fallback:null,children:(0,a.jsx)(x,{checkoutSource:"pricing_page_resume"})}),(0,a.jsx)("section",{id:"pricing",className:"border-b border-base-content/5 bg-base-100 py-20 md:py-28",children:(0,a.jsxs)("div",{className:"mx-auto max-w-6xl px-6 lg:px-8",children:[(0,a.jsx)("h2",{className:"mx-auto max-w-3xl text-center text-3xl font-extrabold tracking-tight text-base-content md:text-4xl",children:"Simple, Transparent Pricing"}),(0,a.jsx)("p",{className:"mx-auto mt-4 max-w-2xl text-center text-base text-base-content/65 md:text-lg",children:"We believe in transparent pricing. Start free, upgrade anytime for powerful 3D export features."}),(0,a.jsx)("div",{className:"mt-10 hidden justify-center pb-4 md:mt-12 md:flex md:pb-5",children:(0,a.jsxs)("div",{className:"relative inline-flex w-[min(100%,22rem)] min-w-[16rem] max-w-[22rem] rounded-lg border border-base-content/15 bg-base-100 p-1.5 shadow-sm ring-1 ring-base-content/[0.06] sm:min-w-[18.5rem] sm:max-w-[24rem]",role:"group","aria-label":"Billing period",children:[(0,a.jsx)("button",{type:"button",onClick:()=>o("month"),className:`min-w-0 flex-1 rounded-md px-7 py-2.5 text-sm font-semibold transition-colors sm:px-10 ${"month"===n?"bg-neutral-900 text-white shadow-sm":"text-base-content/60 hover:text-base-content"}`,children:"Monthly"}),(0,a.jsx)("button",{type:"button",onClick:()=>o("year"),className:`min-w-0 flex-1 rounded-md px-7 py-2.5 text-sm font-semibold transition-colors sm:px-10 ${"year"===n?"bg-neutral-900 text-white shadow-sm":"text-base-content/60 hover:text-base-content"}`,children:"Yearly"}),(0,a.jsx)("span",{className:"pointer-events-none absolute -right-1 -top-2 flex h-8 min-w-[3rem] items-center justify-center rounded-full border-2 border-white bg-primary px-2.5 text-[10px] font-bold text-primary-content shadow-sm md:h-9 md:min-w-[3.25rem] md:text-[11px]",children:"-57%"})]})}),(0,a.jsx)("div",{className:"relative mx-auto mt-8 max-w-5xl md:mt-10 lg:mt-12",children:(0,a.jsxs)("div",{className:"flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:gap-0",children:[(0,a.jsx)(N,{billing:"month",proUnlocked:r,proMonthly:l,proYearly:c,shellClassName:"order-1 md:hidden"}),(0,a.jsx)(N,{billing:"year",proUnlocked:r,proMonthly:l,proYearly:c,shellClassName:"order-2 md:hidden"}),(0,a.jsxs)("div",{className:"flex flex-col rounded-3xl p-7 sm:p-8 order-3 border border-base-content/12 bg-base-100 text-base-content shadow-[0_4px_18px_-6px_rgba(15,23,42,0.07),0_1px_2px_rgba(15,23,42,0.04)] md:order-1 lg:pr-6",children:[(0,a.jsxs)("div",{children:[(0,a.jsx)("div",{className:"text-lg font-bold text-base-content",children:"Free"}),(0,a.jsx)("h3",{className:"mt-2 text-lg font-semibold leading-snug text-base-content md:text-xl",children:"Start designing instantly with no commitment."}),(0,a.jsx)("div",{className:"mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-0",children:(0,a.jsx)("span",{className:"text-5xl font-extrabold tabular-nums tracking-tighter text-base-content md:text-6xl md:leading-none",children:"$0"})}),(0,a.jsx)("p",{className:"mt-2 text-[13px] leading-relaxed text-base-content/60",children:"No sign-up required"}),(0,a.jsx)("div",{className:"my-6 border-t border-base-content/[0.1]"}),(0,a.jsx)(j,{label:"Personal use only",tooltip:"For individual, non-commercial projects only—personal portfolios, learning, and hobbies. Not for client work, business marketing, or selling products.",tone:"light",className:"mb-4"}),(0,a.jsx)("ul",{className:"mb-5 space-y-3 text-[0.9375rem] leading-relaxed",children:g.map(e=>(0,a.jsxs)("li",{className:"flex gap-3",children:[(0,a.jsx)("span",{className:"mt-0.5 shrink-0",children:e.included?(0,a.jsx)(y,{}):(0,a.jsx)(k,{})}),(0,a.jsx)("span",{className:`min-w-0 ${e.included?"text-base-content/90":"text-base-content/40"}`,children:e.text})]},e.text))})]}),(0,a.jsx)("div",{className:"mt-auto pt-3",children:(0,a.jsx)(i(),{href:"/pro-configerator",className:"btn btn-outline btn-neutral h-12 w-full rounded-2xl border-base-content/[0.17] bg-transparent font-semibold normal-case text-base-content shadow-none hover:border-base-content/30 hover:bg-base-200",children:"Get Started"})})]}),(0,a.jsx)(N,{billing:n,proUnlocked:r,proMonthly:l,proYearly:c,shellClassName:"order-4 hidden md:order-2 md:block lg:-my-6 lg:self-stretch lg:pl-6"})]})}),(0,a.jsx)("p",{className:"mx-auto mt-12 max-w-sm border-t border-base-content/[0.08] pt-5 text-center text-[0.8125rem] leading-relaxed tracking-wide text-base-content/50 md:mt-16 md:max-w-md md:pt-6 md:text-sm",children:"Paid subscriptions are billed securely through Stripe—encrypted checkout and PCI-compliant processing."})]})})]})}},8434:(e,t,r)=>{let a,s;r.d(t,{l$:()=>X,Ay:()=>ee,oR:()=>I});var n,i=r(2115);let o={data:""},l=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,c=/\/\*[^]*?\*\/|  +/g,d=/\n+/g,m=(e,t)=>{let r="",a="",s="";for(let n in e){let i=e[n];"@"==n[0]?"i"==n[1]?r=n+" "+i+";":a+="f"==n[1]?m(i,n):n+"{"+m(i,"k"==n[1]?"":t)+"}":"object"==typeof i?a+=m(i,t?t.replace(/([^,])+/g,e=>n.replace(/(^:.*)|([^,])+/g,t=>/&/.test(t)?t.replace(/&/g,e):e?e+" "+t:t)):n):null!=i&&(n=/^--/.test(n)?n:n.replace(/[A-Z]/g,"-$&").toLowerCase(),s+=m.p?m.p(n,i):n+":"+i+";")}return r+(t&&s?t+"{"+s+"}":s)+a},p={},u=e=>{if("object"==typeof e){let t="";for(let r in e)t+=r+u(e[r]);return t}return e};function x(e){let t,r,a,s=this||{},n=e.call?e(s.p):e;return((e,t,r,a,s)=>{var n;let i=u(e),o=p[i]||(p[i]=(e=>{let t=0,r=11;for(;t<e.length;)r=101*r+e.charCodeAt(t++)>>>0;return"go"+r})(i));if(!p[o]){let t=i!==e?e:(e=>{let t,r,a=[{}];for(;t=l.exec(e.replace(c,""));)t[4]?a.shift():t[3]?(r=t[3].replace(d," ").trim(),a.unshift(a[0][r]=a[0][r]||{})):a[0][t[1]]=t[2].replace(d," ").trim();return a[0]})(e);p[o]=m(s?{["@keyframes "+o]:t}:t,r?"":"."+o)}let x=r&&p.g?p.g:null;return r&&(p.g=p[o]),n=p[o],x?t.data=t.data.replace(x,n):-1===t.data.indexOf(n)&&(t.data=a?n+t.data:t.data+n),o})(n.unshift?n.raw?(t=[].slice.call(arguments,1),r=s.p,n.reduce((e,a,s)=>{let n=t[s];if(n&&n.call){let e=n(r),t=e&&e.props&&e.props.className||/^go/.test(e)&&e;n=t?"."+t:e&&"object"==typeof e?e.props?"":m(e,""):!1===e?"":e}return e+a+(null==n?"":n)},"")):n.reduce((e,t)=>Object.assign(e,t&&t.call?t(s.p):t),{}):n,(a=s.target,"object"==typeof window?((a?a.querySelector("#_goober"):window._goober)||Object.assign((a||document.head).appendChild(document.createElement("style")),{innerHTML:" ",id:"_goober"})).firstChild:a||o),s.g,s.o,s.k)}x.bind({g:1});let h,b,g,f=x.bind({k:1});function y(e,t){let r=this||{};return function(){let a=arguments;function s(n,i){let o=Object.assign({},n),l=o.className||s.className;r.p=Object.assign({theme:b&&b()},o),r.o=/ *go\d+/.test(l),o.className=x.apply(r,a)+(l?" "+l:""),t&&(o.ref=i);let c=e;return e[0]&&(c=o.as||e,delete o.as),g&&c[0]&&g(o),h(c,o)}return t?t(s):s}}var v=(e,t)=>"function"==typeof e?e(t):e,w=(a=0,()=>(++a).toString()),j=()=>{if(void 0===s&&"u">typeof window){let e=matchMedia("(prefers-reduced-motion: reduce)");s=!e||e.matches}return s},k=new Map,N=e=>{if(k.has(e))return;let t=setTimeout(()=>{k.delete(e),P({type:4,toastId:e})},1e3);k.set(e,t)},_=(e,t)=>{switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,20)};case 1:var r;let a;return t.toast.id&&(r=t.toast.id,(a=k.get(r))&&clearTimeout(a)),{...e,toasts:e.toasts.map(e=>e.id===t.toast.id?{...e,...t.toast}:e)};case 2:let{toast:s}=t;return e.toasts.find(e=>e.id===s.id)?_(e,{type:1,toast:s}):_(e,{type:0,toast:s});case 3:let{toastId:n}=t;return n?N(n):e.toasts.forEach(e=>{N(e.id)}),{...e,toasts:e.toasts.map(e=>e.id===n||void 0===n?{...e,visible:!1}:e)};case 4:return void 0===t.toastId?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(e=>e.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let i=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(e=>({...e,pauseDuration:e.pauseDuration+i}))}}},$=[],C={toasts:[],pausedAt:void 0},P=e=>{C=_(C,e),$.forEach(e=>{e(C)})},A={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},E=e=>(t,r)=>{let a=((e,t="blank",r)=>({createdAt:Date.now(),visible:!0,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0,...r,id:(null==r?void 0:r.id)||w()}))(t,e,r);return P({type:2,toast:a}),a.id},I=(e,t)=>E("blank")(e,t);I.error=E("error"),I.success=E("success"),I.loading=E("loading"),I.custom=E("custom"),I.dismiss=e=>{P({type:3,toastId:e})},I.remove=e=>P({type:4,toastId:e}),I.promise=(e,t,r)=>{let a=I.loading(t.loading,{...r,...null==r?void 0:r.loading});return e.then(e=>(I.success(v(t.success,e),{id:a,...r,...null==r?void 0:r.success}),e)).catch(e=>{I.error(v(t.error,e),{id:a,...r,...null==r?void 0:r.error})}),e};var z=(e,t)=>{P({type:1,toast:{id:e,height:t}})},M=()=>{P({type:5,time:Date.now()})},S=f`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,U=f`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,L=f`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,F=y("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${S} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${U} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${e=>e.secondary||"#fff"};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${L} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,O=f`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,D=y("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${O} 1s linear infinite;
`,W=f`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,Y=f`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,B=y("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${W} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${Y} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${e=>e.secondary||"#fff"};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,R=y("div")`
  position: absolute;
`,T=y("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,H=f`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,G=y("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${H} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,Z=({toast:e})=>{let{icon:t,type:r,iconTheme:a}=e;return void 0!==t?"string"==typeof t?i.createElement(G,null,t):t:"blank"===r?null:i.createElement(T,null,i.createElement(D,{...a}),"loading"!==r&&i.createElement(R,null,"error"===r?i.createElement(F,{...a}):i.createElement(B,{...a})))},q=y("div")`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,J=y("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,K=i.memo(({toast:e,position:t,style:r,children:a})=>{let s=e.height?((e,t)=>{let r=e.includes("top")?1:-1,[a,s]=j()?["0%{opacity:0;} 100%{opacity:1;}","0%{opacity:1;} 100%{opacity:0;}"]:[`
0% {transform: translate3d(0,${-200*r}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${-150*r}%,-1px) scale(.6); opacity:0;}
`];return{animation:t?`${f(a)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${f(s)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}})(e.position||t||"top-center",e.visible):{opacity:0},n=i.createElement(Z,{toast:e}),o=i.createElement(J,{...e.ariaProps},v(e.message,e));return i.createElement(q,{className:e.className,style:{...s,...r,...e.style}},"function"==typeof a?a({icon:n,message:o}):i.createElement(i.Fragment,null,n,o))});n=i.createElement,m.p=void 0,h=n,b=void 0,g=void 0;var Q=({id:e,className:t,style:r,onHeightUpdate:a,children:s})=>{let n=i.useCallback(t=>{if(t){let r=()=>{a(e,t.getBoundingClientRect().height)};r(),new MutationObserver(r).observe(t,{subtree:!0,childList:!0,characterData:!0})}},[e,a]);return i.createElement("div",{ref:n,className:t,style:r},s)},V=x`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,X=({reverseOrder:e,position:t="top-center",toastOptions:r,gutter:a,children:s,containerStyle:n,containerClassName:o})=>{let{toasts:l,handlers:c}=(e=>{let{toasts:t,pausedAt:r}=((e={})=>{let[t,r]=(0,i.useState)(C);(0,i.useEffect)(()=>($.push(r),()=>{let e=$.indexOf(r);e>-1&&$.splice(e,1)}),[t]);let a=t.toasts.map(t=>{var r,a;return{...e,...e[t.type],...t,duration:t.duration||(null==(r=e[t.type])?void 0:r.duration)||(null==e?void 0:e.duration)||A[t.type],style:{...e.style,...null==(a=e[t.type])?void 0:a.style,...t.style}}});return{...t,toasts:a}})(e);(0,i.useEffect)(()=>{if(r)return;let e=Date.now(),a=t.map(t=>{if(t.duration===1/0)return;let r=(t.duration||0)+t.pauseDuration-(e-t.createdAt);if(r<0){t.visible&&I.dismiss(t.id);return}return setTimeout(()=>I.dismiss(t.id),r)});return()=>{a.forEach(e=>e&&clearTimeout(e))}},[t,r]);let a=(0,i.useCallback)(()=>{r&&P({type:6,time:Date.now()})},[r]),s=(0,i.useCallback)((e,r)=>{let{reverseOrder:a=!1,gutter:s=8,defaultPosition:n}=r||{},i=t.filter(t=>(t.position||n)===(e.position||n)&&t.height),o=i.findIndex(t=>t.id===e.id),l=i.filter((e,t)=>t<o&&e.visible).length;return i.filter(e=>e.visible).slice(...a?[l+1]:[0,l]).reduce((e,t)=>e+(t.height||0)+s,0)},[t]);return{toasts:t,handlers:{updateHeight:z,startPause:M,endPause:a,calculateOffset:s}}})(r);return i.createElement("div",{style:{position:"fixed",zIndex:9999,top:16,left:16,right:16,bottom:16,pointerEvents:"none",...n},className:o,onMouseEnter:c.startPause,onMouseLeave:c.endPause},l.map(r=>{let n,o,l=r.position||t,d=c.calculateOffset(r,{reverseOrder:e,gutter:a,defaultPosition:t}),m=(n=l.includes("top"),o=l.includes("center")?{justifyContent:"center"}:l.includes("right")?{justifyContent:"flex-end"}:{},{left:0,right:0,display:"flex",position:"absolute",transition:j()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${d*(n?1:-1)}px)`,...n?{top:0}:{bottom:0},...o});return i.createElement(Q,{id:r.id,key:r.id,onHeightUpdate:c.updateHeight,className:r.visible?V:"",style:m},"custom"===r.type?v(r.message,r):s?s(r):i.createElement(K,{toast:r,position:l}))}))},ee=I}}]);