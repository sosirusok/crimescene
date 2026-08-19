export type Theme = {
  id: string; slug: string; episode: number; title: string; shortTitle: string;
  tagline: string; synopsis: string; players: string;
  duration: number; price: number; image: string; times: string[]; accent: string;
};

export const themes: Theme[] = [
  { id: "A", slug: "orientation", episode: 7, title: "크라임씬 EP.7 신입생 오티 살인사건", shortTitle: "신입생 오티 살인사건", tagline: "모두가 같은 밤을 기억하지만, 진술은 서로 다르다.", synopsis: "환영회가 끝난 새벽, 텅 빈 연수원에 남겨진 것은 흩어진 명찰과 끊긴 기억뿐입니다. 가장 가까이 있었던 사람들이 가장 중요한 사실을 숨기고 있습니다.", players: "4–5명", duration: 90, price: 23000, image: "/images/theme-orientation.webp", times: ["10:00", "11:30", "13:20", "15:10", "17:00", "18:50", "20:40", "22:30"], accent: "#c84b42" },
  { id: "B", slug: "youtuber", episode: 8, title: "크라임씬 EP.8 유튜버 살인사건", shortTitle: "유튜버 살인사건", tagline: "마지막 생방송에서 사라진 12초, 누군가는 편집했다.", synopsis: "생방송이 끊긴 스튜디오. 카메라는 여전히 돌아가고 있지만 결정적인 장면만 사라졌습니다. 구독자에게 공개된 얼굴과 실제 관계 사이에서 진실을 찾아야 합니다.", players: "4–5명", duration: 90, price: 23000, image: "/images/theme-youtuber.webp", times: ["10:00", "11:50", "13:40", "15:30", "17:20", "19:10", "21:00", "22:50"], accent: "#9e4bd3" },
  { id: "C", slug: "hotel", episode: 3, title: "크라임씬 EP.3 호텔 살인사건", shortTitle: "호텔 살인사건", tagline: "잠든 듯 발견된 톱 여배우, 객실 열쇠는 하나뿐이었다.", synopsis: "화려한 호텔의 가장 조용한 객실에서 국내 톱 여배우가 숨진 채 발견됩니다. 완벽하게 통제된 동선과 서로 맞지 않는 투숙 기록을 추적하세요.", players: "4–5명", duration: 90, price: 23000, image: "/images/theme-hotel.webp", times: ["10:00", "12:10", "14:00", "15:50", "17:40", "19:30", "21:20", "23:10"], accent: "#b58b4a" },
  { id: "D", slug: "cabin", episode: 4, title: "크라임씬 EP.4 산장 살인사건", shortTitle: "산장 살인사건", tagline: "폭설로 고립된 산장, 발자국은 들어왔지만 나가지 않았다.", synopsis: "한밤의 폭설이 모든 길을 지운 뒤 산장 안에서 사건이 발생합니다. 외부인의 흔적은 없고, 출입문은 안에서 잠겨 있었습니다.", players: "4–5명", duration: 90, price: 23000, image: "/images/theme-cabin.webp", times: ["11:00", "12:30", "14:20", "16:10", "18:00", "19:50", "21:40", "23:30"], accent: "#557b73" },
];

export const getTheme = (slug: string) => themes.find((theme) => theme.slug === slug);
