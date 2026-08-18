const fs=require("node:fs");
const vm=require("node:vm");

const code=fs.readFileSync("_site/assets/customer-final.js","utf8");
const app={innerHTML:""};
const emptyClassList={add(){},remove(){},toggle(){return false;}};
const document={
  documentElement:{classList:emptyClassList},
  body:{dataset:{route:"home"},classList:emptyClassList,append(){}},
  querySelector(selector){return selector==="#app"?app:null;},
  querySelectorAll(){return[];},
  createElement(){return{className:"",textContent:"",setAttribute(){},append(){},remove(){},click(){}};},
};
const storage={getItem(){return null;},setItem(){},removeItem(){}};
const mockBootstrap={
  settings:{storeName:"크라임씬플레이",branchName:"서면1호점",representativeName:"윤호권",businessRegistrationNumber:"839-87-00850",mailOrderRegistrationNumber:"",phone:"070-4304-4340",email:"dbsehrud93@naver.com",addressRoad:"부산광역시 부산진구 신천대로50번길 62",addressDetail:"부전동 우성빌딩 4층",mapQuery:"부산광역시 부산진구 신천대로50번길 62",bookingWindowDays:15,arrivalMinutes:10,cancellationCutoffHours:24,paymentMode:"ONSITE",paymentProvider:"KISPG",privacyOfficerName:"개인정보 보호 담당자",privacyOfficerContact:"문의 연락처",refundPolicyConfirmed:false,customerNotice:""},
  payment:{mode:"ONSITE",label:"매장 결제",onlineEnabled:false,configured:false,legalReady:false},
  themes:[
    {id:"A",slug:"orientation",episode:7,title:"크라임씬 EP.7 신입생 오티 살인사건",shortTitle:"신입생 오티 살인사건",tagline:"서로 다른 진술",synopsis:"사건 소개",difficulty:"★★★★☆",minPlayers:4,suspectCapacity:4,detectiveCapacity:4,totalCapacity:8,duration:90,price:23000,image:"/images/theme-orientation.webp",times:["10:00"]},
    {id:"B",slug:"youtuber",episode:8,title:"크라임씬 EP.8 유튜버 살인사건",shortTitle:"유튜버 살인사건",tagline:"사라진 장면",synopsis:"사건 소개",difficulty:"★★★★☆",minPlayers:4,suspectCapacity:5,detectiveCapacity:4,totalCapacity:9,duration:90,price:23000,image:"/images/theme-youtuber.webp",times:["10:00"]},
  ],
};
const context={
  document,
  location:{hostname:"sosirusok.github.io",pathname:"/crimescene/",search:"",href:""},
  localStorage:storage,sessionStorage:storage,
  addEventListener(){},removeEventListener(){},scrollY:0,
  console,Intl,Date,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,
  setTimeout,clearTimeout,confirm(){return false;},
  fetch:async()=>new Response(JSON.stringify(mockBootstrap),{status:200,headers:{"content-type":"application/json"}}),
  Response,Request,Headers,Blob,
};
vm.createContext(context);
vm.runInContext(code,context,{timeout:5000,filename:"customer-final.js"});
(async()=>{
  await context.__CRIMESCENE_READY__;
  if(!app.innerHTML.includes("사건 속 인물이 되어"))throw new Error("홈 화면이 렌더링되지 않았습니다.");
  if(!app.innerHTML.includes("방탈출카페가 아닙니다"))throw new Error("게임 방식 필수 안내가 없습니다.");
  if(!app.innerHTML.includes("이용 당일 고객 사유 취소는 환불되지 않습니다"))throw new Error("당일 취소 환불 안내가 없습니다.");
  if((app.innerHTML.match(/방탈출카페/g)||[]).length!==1)throw new Error("방탈출카페 표현이 한 번을 초과합니다.");
  if(!app.innerHTML.includes("1~3명은 오픈룸"))throw new Error("오픈룸 핵심 안내가 없습니다.");
  if(!app.innerHTML.includes("실시간 예약"))throw new Error("예약 진입점이 없습니다.");
  if(/Supabase|OWNER|Reservation form|AES-GCM/.test(app.innerHTML))throw new Error("고객 화면에 개발자용 문구가 남아 있습니다.");
  if(app.innerHTML.includes("boot-screen"))throw new Error("로딩 화면이 남았습니다.");
  console.log(`Customer renderer passed (${app.innerHTML.length} bytes).`);
})().catch(error=>{console.error(error);process.exit(1);});
