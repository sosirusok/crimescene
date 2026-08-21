const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");

const code=fs.readFileSync("_site/assets/customer-final.js","utf8");
const shell=fs.readFileSync("_site/index.html","utf8");
const mockBootstrap={
  settings:{storeName:"크라임씬플레이",branchName:"서면1호점",businessName:"(주)싱글",representativeName:"정지훈",businessRegistrationNumber:"744-88-01446",mailOrderRegistrationNumber:"",phone:"070-4304-4340",email:"jjhun65@hanmail.net",addressRoad:"부산광역시 부산진구 신천대로50번길 62",addressDetail:"부전동 우성빌딩 4층",mapQuery:"부산광역시 부산진구 신천대로50번길 62",bookingWindowDays:15,arrivalMinutes:10,cancellationCutoffHours:24,paymentMode:"ONSITE",paymentProvider:"NICEPAY",privacyOfficerName:"개인정보 보호 담당자",privacyOfficerContact:"문의 연락처",refundPolicyConfirmed:false,customerNotice:""},
  payment:{mode:"ONSITE",provider:"NICEPAY",label:"매장 결제",onlineEnabled:false,configured:false,legalReady:false},
  themes:[
    {id:"A",slug:"orientation",episode:7,title:"크라임씬 EP.7 신입생 오티 살인사건",shortTitle:"신입생 오티 살인사건",tagline:"서로 다른 진술",synopsis:"사건 소개",minPlayers:4,suspectCapacity:4,detectiveCapacity:4,totalCapacity:8,duration:90,price:23000,image:"/images/theme-orientation.webp",times:["10:00"]},
    {id:"B",slug:"youtuber",episode:8,title:"크라임씬 EP.8 유튜버 살인사건",shortTitle:"유튜버 살인사건",tagline:"사라진 장면",synopsis:"사건 소개",minPlayers:4,suspectCapacity:5,detectiveCapacity:4,totalCapacity:9,duration:90,price:23000,image:"/images/theme-youtuber.webp",times:["10:00"]},
  ],
};
const onlineBootstrap={...mockBootstrap,settings:{...mockBootstrap.settings,paymentMode:"ONLINE",paymentProvider:"NICEPAY"},payment:{mode:"ONLINE",provider:"NICEPAY",label:"카드 결제",onlineEnabled:true,configured:true,legalReady:true}};

function createStorage(seed={}) {
  const values=new Map(Object.entries(seed));
  return {getItem(key){return values.has(key)?values.get(key):null;},setItem(key,value){values.set(key,String(value));},removeItem(key){values.delete(key);}};
}

async function renderAt({hostname,pathname,route,search="",bootstrap=mockBootstrap,seed={},paymentResult=null}) {
  const app={innerHTML:""};
  const emptyClassList={add(){},remove(){},toggle(){return false;},contains(){return false;}};
  const storage=createStorage(seed);
  const document={
    documentElement:{classList:emptyClassList,style:{setProperty(){}}},
    body:{dataset:{route},classList:emptyClassList,append(){}},
    head:{append(){}},
    querySelector(selector){return selector==="#app"?app:null;},
    querySelectorAll(){return[];},
    createElement(){return{className:"",textContent:"",dataset:{},style:{},setAttribute(){},append(){},remove(){},click(){}};},
  };
  const origin=`https://${hostname}`;
  const context={
    document,
    location:{hostname,pathname,search,href:`${origin}${pathname}${search}`,origin},
    history:{replaceState(){}},
    localStorage:storage,sessionStorage:storage,
    addEventListener(){},removeEventListener(){},scrollY:0,
    console,Intl,Date,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,
    setTimeout(callback,delay,...args){return global.setTimeout(callback,delay===1200?0:delay,...args);},clearTimeout,confirm(){return false;},requestAnimationFrame(callback){callback();},crypto:webcrypto,
    fetch:async(input)=>{
      const url=new URL(String(input));
      let body=bootstrap;
      if(url.pathname.endsWith("/payments/nicepay/result"))body=paymentResult||{};
      return new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}});
    },
    Response,Request,Headers,Blob,
  };
  vm.createContext(context);
  vm.runInContext(code,context,{timeout:5000,filename:"customer-final.js"});
  await context.__CRIMESCENE_READY__;
  return app.innerHTML;
}

(async()=>{
  for(const marker of ["/payments/nicepay/prepare","/payments/nicepay/result","/payments/nicepay/abort","AUTHNICE","requestPay","customerReturnUrl","idempotencyKey"]){
    if(!code.includes(marker))throw new Error(`NICEPAY 고객 흐름 누락: ${marker}`);
  }
  if(/KISPG|KIS_MID|KIS_API_KEY/.test(code))throw new Error("빌드된 고객 코드에 KISPG 설정이 남아 있습니다.");
  for(const host of ["https://pay.nicepay.co.kr"]){
    if(!shell.includes(host))throw new Error(`NICEPAY CSP 허용 주소 누락: ${host}`);
  }
  if(!/form-action[^;]*https:\/\/jhjbiejqtbidloxcwryr\.supabase\.co/.test(shell))throw new Error("NICEPAY return POST 대상이 form-action CSP에 없습니다.");

  const home=await renderAt({hostname:"sosirusok.github.io",pathname:"/crimescene/",route:"home"});
  if(!home.includes("모두가 용의자인 밤"))throw new Error("홈 화면이 렌더링되지 않았습니다.");
  if(!home.includes("방탈출이 아닌 배역형 추리게임"))throw new Error("게임 방식 필수 안내가 없습니다.");
  if(!home.includes("이용 당일 고객 사유 취소와 무단 불참은 환불되지 않습니다"))throw new Error("당일 취소 환불 안내가 없습니다.");
  if(!home.includes("1~3명은 오픈룸"))throw new Error("오픈룸 핵심 안내가 없습니다.");
  if(!home.includes("실시간 예약"))throw new Error("예약 진입점이 없습니다.");
  if(!home.includes('class="brand" href="/crimescene/"'))throw new Error("GitHub Pages 홈 링크가 올바르지 않습니다.");
  if(!home.includes('src="/crimescene/favicon.svg"'))throw new Error("브랜드 심볼 경로가 올바르지 않습니다.");
  if(home.includes("난이도"))throw new Error("고객 화면에 난이도가 남아 있습니다.");
  if(!home.includes("(주)싱글")||!home.includes("744-88-01446")||!home.includes("jjhun65@hanmail.net"))throw new Error("사업자 정보가 반영되지 않았습니다.");
  if(/Supabase|OWNER|Reservation form|AES-GCM/.test(home))throw new Error("고객 화면에 개발자용 문구가 남아 있습니다.");
  if(home.includes("boot-screen"))throw new Error("첫 화면이 API 응답을 기다리고 있습니다.");

  const location=await renderAt({hostname:"www.크라임씬플레이.com",pathname:"/location/",route:"location"});
  if(!location.includes('class="brand" href="/"'))throw new Error("커스텀 도메인 홈 링크가 올바르지 않습니다.");
  if(!location.includes("https://www.google.com/maps?q="))throw new Error("실제 지도가 빠졌습니다.");
  if(!location.includes("네이버 지도 열기"))throw new Error("지도 앱 연결이 빠졌습니다.");
  if(location.includes("한 번 더 확인해 주세요"))throw new Error("임시 지도 문구가 남아 있습니다.");

  const onlineForm=await renderAt({hostname:"sosirusok.github.io",pathname:"/crimescene/reservations/new/",search:"?theme=A&date=2026-08-25&time=10%3A00",route:"reservation-new",bootstrap:onlineBootstrap});
  if(!onlineForm.includes("나이스페이먼츠 카드 결제")||!onlineForm.includes("카드로 결제하기"))throw new Error("온라인 결제 예약 화면이 NICEPAY로 표시되지 않습니다.");

  const reservation={id:"internal-reservation-id",themeTitle:"신입생 오티 살인사건",playDate:"2026-08-25",startTime:"10:00",partySize:4,totalAmount:92000,status:"CONFIRMED",paymentStatus:"PAID",bookingMode:"PRIVATE"};
  const paymentResult={reservation,payment:{provider:"NICEPAY",status:"PAID",receiptUrl:"https://receipt.nicepay.co.kr/example"}};
  const paymentSession=JSON.stringify({idempotencyKey:"idem-1",fingerprint:"hash",orderId:"internal-order-id",actionToken:"one-time-token"});
  const complete=await renderAt({hostname:"sosirusok.github.io",pathname:"/crimescene/reservations/complete/",search:"?payment=success",route:"reservation-complete",bootstrap:onlineBootstrap,seed:{"crimescene-nicepay-session-v1":paymentSession},paymentResult});
  if(!complete.includes("결제 완료")||!complete.includes("예약이 확정되었습니다"))throw new Error("NICEPAY 결제 완료 화면이 렌더링되지 않았습니다.");
  if(complete.includes("internal-reservation-id")||complete.includes("internal-order-id")||complete.includes("one-time-token"))throw new Error("고객 결제 완료 화면에 내부 식별자가 노출됩니다.");

  const failed=await renderAt({hostname:"sosirusok.github.io",pathname:"/crimescene/reservations/complete/",search:"?payment=failed",route:"reservation-complete",bootstrap:onlineBootstrap,seed:{"crimescene-nicepay-session-v1":paymentSession},paymentResult:{reservation:{...reservation,status:"PENDING_PAYMENT",paymentStatus:"FAILED"},payment:{provider:"NICEPAY",status:"FAILED",failureMessage:"카드 승인이 취소되었습니다."}}});
  if(!failed.includes("카드 결제를 완료하지 못했습니다")||failed.includes("예약이 확정되었습니다"))throw new Error("NICEPAY 실패 결과가 확정 예약처럼 표시됩니다.");

  const pending=await renderAt({hostname:"sosirusok.github.io",pathname:"/crimescene/reservations/complete/",search:"?payment=pending",route:"reservation-complete",bootstrap:onlineBootstrap,seed:{"crimescene-nicepay-session-v1":paymentSession},paymentResult:{reservation:{...reservation,status:"PENDING_PAYMENT",paymentStatus:"VERIFYING"},payment:{provider:"NICEPAY",status:"VERIFYING"}}});
  if(!pending.includes("결제 결과 확인이 지연되고 있습니다")||pending.includes("예약이 확정되었습니다"))throw new Error("NICEPAY 확인 중 상태가 확정 예약처럼 표시됩니다.");
  if(pending.includes('id="complete-abort"'))throw new Error("승인 확인 중인 NICEPAY 거래에 위험한 고객 중단 버튼이 표시됩니다.");
  if(pending.includes('id="complete-abort"'))throw new Error("NICEPAY 승인 확인 중에 안전하지 않은 중단 버튼이 노출됩니다.");

  const onsiteResult={reservation:{...reservation,paymentStatus:"READY"},payment:{provider:"ONSITE",status:"READY"}};
  const onsite=await renderAt({hostname:"sosirusok.github.io",pathname:"/crimescene/reservations/complete/",route:"reservation-complete",seed:{"crimescene-last-reservation":JSON.stringify(onsiteResult)}});
  if(!onsite.includes("방문하신 날 매장에서 결제"))throw new Error("NICEPAY 키가 없을 때 매장 결제 완료 안내가 없습니다.");

  console.log(`Customer renderer passed (${home.length} + ${location.length} + ${onlineForm.length} + ${complete.length} + ${failed.length} + ${pending.length} + ${onsite.length} bytes).`);
})().catch(error=>{console.error(error);process.exit(1);});
