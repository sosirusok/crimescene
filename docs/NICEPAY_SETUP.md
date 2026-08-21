# NICEPAY 운영 연결 체크리스트

고객 사이트는 NICEPAY 가맹점 키가 없을 때 매장 결제로 운영되고, 서버가 온라인 결제 사용 가능 상태를 내려줄 때만 카드 결제 버튼을 표시합니다. 카드번호와 카드 인증정보는 NICEPAY 결제창에서 처리하며 사이트 데이터베이스에 저장하지 않습니다.

## 등록할 서버 비밀값

```text
NICEPAY_CLIENT_ID=가맹점 클라이언트 ID
NICEPAY_SECRET_KEY=가맹점 시크릿 키
NICEPAY_ENVIRONMENT=sandbox
```

`NICEPAY_ENVIRONMENT`는 테스트 중에는 `sandbox`, 가맹점 심사와 실결제 검수가 끝난 뒤에만 `production`으로 변경합니다. `NICEPAY_SECRET_KEY`는 GitHub 저장소나 고객 JavaScript에 넣지 않고 Supabase Edge Function Secret으로만 등록합니다.

별도의 return URL 환경변수는 사용하지 않습니다. 서버가 `SUPABASE_URL`을 기준으로 아래 주소를 계산합니다.

```text
결제 결과 반환: ${SUPABASE_URL}/functions/v1/api/payments/nicepay/return
웹훅:          ${SUPABASE_URL}/functions/v1/api/payments/nicepay/webhook
```

## 구현된 고객 결제 흐름

1. 고객이 예약 정보를 최종 확인합니다.
2. 고객 사이트가 멱등키와 고객 복귀 주소를 포함해 `POST /payments/nicepay/prepare`를 호출합니다.
3. 서버가 예약·결제 대기를 만든 뒤 NICEPAY SDK용 공개 결제 정보를 반환합니다.
4. 고객 사이트가 공식 NICEPAY SDK의 `AUTHNICE.requestPay`로 카드 결제창을 엽니다.
5. NICEPAY가 서버 return URL로 결과를 전달하고, 서버가 결제 승인·검증 후 고객 완료 화면으로 돌려보냅니다.
6. 완료 화면은 브라우저 세션에 저장한 `orderId`와 일회성 `actionToken`으로 `POST /payments/nicepay/result`를 호출해 최종 상태를 다시 확인합니다.

예약 식별자와 NICEPAY 주문번호는 고객 화면에 표시하지 않습니다. 결제창 이탈·명확한 실패 시에는 `POST /payments/nicepay/abort`로 대기 예약을 정리합니다.

## 실결제 전 필수 확인

- NICEPAY 관리자에서 가맹점 도메인, return URL, 웹훅 URL 등록
- 샌드박스 성공, 사용자 취소, 인증 실패, 한도 부족, 네트워크 타임아웃 확인
- 동일 멱등키·동일 주문의 중복 승인 및 중복 좌석 차감 방지 확인
- 승인 성공 후 예약 확정, 실패·만료 후 좌석 복원 확인
- 결제 완료 예약의 전체 취소와 중복 취소 방지 확인
- 모바일 Safari, Android Chrome, 카드사 앱 복귀 확인
- 실제 개인정보처리방침·취소 및 환불 고지와 NICEPAY 가맹점 정보 대조

운영 전환은 위 검수를 마친 뒤 `NICEPAY_ENVIRONMENT=production`과 운영 키를 같은 배포에 등록하고, 소액 실카드 승인·취소까지 확인한 뒤 진행합니다.
