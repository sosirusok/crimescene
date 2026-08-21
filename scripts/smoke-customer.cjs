const fs=require("node:fs");
const vm=require("node:vm");

const code=fs.readFileSync("_site/assets/customer-final.js","utf8");
const mockBootstrap={
  settings:{storeName:"크라임씬플레이",branchName:"서면1호점",businessName:"(주)싱글",representativeName:"정지훈",businessRegistrationNumber:"744-88-01446",mailOrderRegistrationNumber:"",phone:"070-4304-4340",email:"jjhun65@hanmail.net",addressRoad:"부산광역시 부산진구 신천대로50번길 62",addressDetail:"부전동 우성빌딩 4층",mapQuery:"부산광역시 부산진구 신천대로50번길 62",bookingWindowDays:30,arrivalMinutes:10,cancellationCutoffHours:24,paymentMode:"ONSITE",paymentProvider:"KISPG",privacyOfficerName:"개인정보 보호 담당자",privacyOfficerContact:"문의 연락처",refundPolicyConfirmed:false,customerNotice:""},
  payment:{mode:"ONSITE",label:"매장 결제",onlineEnabled:false,configured:false,legalReady:false},
  themes:[
    {id:"A",slug:"orientation",episode:7,title:"크라임씬 EP.7 신입생 오티 살인사건",shortTitle:"신입생 오티 살인사건",tagline:"서로 다른 진술",synopsis:"사건 소개",minPlayers:4,suspectCapacity:4,detectiveCapacity:4,totalCapacity:8,duration:90,price:23000,image:"/images/theme-orientation.webp",times:["10:00"]},
    {id:"B",slug:"youtuber",episode:8,title:"크라임씬 EP.8 유튜버 살인사건",shortTitle:"유튜버 살인사건",tagline:"사라진 장면",synopsis:"사건 소개",minPlayers:4,suspectCapacity:5,detectiveCapacity:4,totalCapacity:9,duration:90,price:23000,image:"/images/theme-youtuber.webp",times:["10:00"]},
  ],
};

async function renderAt({hostname,pathname,route}) {
  const app={innerHTML:""};
  const emptyClassList={add(){},remove(){},toggle(){return false;},contains(){return false;}};
  const storage={getItem(){return null;},setItem(){},removeItem(){}};
  const document={
    documentElement:{classList:emptyClassList,style:{setProperty(){}}},
    body:{dataset:{route},classList:emptyClassList,append(){}},
    querySelector(selector){return selector==="#app"?app:null;},
    querySelectorAll(){return[];},
    createElement(){return{className:"",textContent:"",setAttribute(){},append(){},remove(){},click(){}};},
  };
  const context={
    document,
    location:{hostname,pathname,search:"",href:""},
    localStorage:storage,sessionStorage:storage,
    addEventListener(){},removeEventListener(){},scrollY:0,
    console,Intl,Date,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,
    setTimeout,clearTimeout,confirm(){return false;},
    fetch:async()=>new Response(JSON.stringify(mockBootstrap),{status:200,headers:{"content-type":"application/json"}}),
    Response,Request,Headers,Blob,
  };
  vm.createContext(context);
  vm.runInContext(code,context,{timeout:5000,filename:"customer-final.js"});
  await context.__CRIMESCENE_READY__;
  return app.innerHTML;
}

(async()=>{
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
  console.log(`Customer renderer passed (${home.length} + ${location.length} bytes).`);
})().catch(error=>{console.error(error);process.exit(1);});
