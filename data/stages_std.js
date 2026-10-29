/* 스테이지 목록 — tools/make_stages.js 로 생성 */
window.KM = window.KM || {};
(KM.stages = KM.stages || {})["std"] = [
 {
  "id": "t1",
  "tutorial": true,
  "name": "튜토리얼 1",
  "sub": "한방 단어",
  "start": "척척박사",
  "n": 3,
  "correct": 1,
  "seed": "km-t1",
  "fixed": {
   "사": [
    "사기",
    "사이",
    "사기꾼"
   ]
  },
  "coach": {
   "start": "말도깨비가 ‘척척박사’라고 했어요. 이제 ‘사’로 시작하는 단어를 이어야 해요. 상대가 이어 말할 수 없는 글자로 끝나는 단어를 ‘한방 단어’라고 해요. 어떤 단어가 한방 단어일까요?"
  },
  "depth": 1
 },
 {
  "id": "t2",
  "tutorial": true,
  "name": "튜토리얼 2",
  "sub": "몰아넣기",
  "start": "덮밥",
  "n": 3,
  "correct": 1,
  "loseSlack": 1,
  "extraWin": 0,
  "seed": "km-t2",
  "fixed": {
   "밥": [
    "밥그릇",
    "밥상",
    "밥알"
   ],
   "치": [
    "치읓",
    "치마",
    "치약"
   ]
  },
  "prefer": [
   "늣치"
  ],
  "coach": {
   "start": "이번엔 한 번에 끝낼 수 없어요. 대신 말도깨비가 낼 수 있는 단어가 딱 하나뿐인 글자를 넘겨 보세요. 예를 들어 ‘-그릇’으로 끝나는 단어를 받으면 ‘늣치’(두음 법칙으로 릇→늣)밖에 낼 수 없고, ‘-슘’으로 끝나는 단어를 받으면 ‘슘페터’밖에 낼 수 없어요.",
   "win": "좋아요! 말도깨비가 버텼지만 형세는 여전히 당신 편이에요. 계속 몰아붙이세요.",
   "finish": "보셨죠? 말도깨비는 그 단어 하나밖에 낼 수 없었어요. 이제 끝낼 차례예요. 이을 단어가 없는 글자로 끝나는 단어를 고르세요.",
   "lose": "앗, 말도깨비에게 이기는 글자를 넘겨줬어요. 이제는 어떤 단어를 골라도 결국 지게 돼요. 끝까지 버텨 본 뒤, 복기에서 어디서 길을 잃었는지 확인해 보세요."
  },
  "depth": 3
 },
 {
  "id": "std-1",
  "no": 1,
  "name": "1단계",
  "sub": "3수",
  "start": "널찍널찍",
  "n": 3,
  "correct": 1,
  "seed": "km-std-널찍널찍",
  "loseSlack": 1,
  "extraWin": 0.6,
  "depth": 3
 },
 {
  "id": "std-2",
  "no": 2,
  "name": "2단계",
  "sub": "3수",
  "start": "숙질간",
  "n": 3,
  "correct": 1,
  "seed": "km-std-숙질간",
  "loseSlack": 1,
  "extraWin": 0.6,
  "depth": 3
 },
 {
  "id": "std-3",
  "no": 3,
  "name": "3단계",
  "sub": "5수",
  "start": "돼지꿈",
  "n": 3,
  "correct": 1,
  "seed": "km-std-돼지꿈",
  "loseSlack": 1,
  "extraWin": 0.5,
  "depth": 5
 },
 {
  "id": "std-4",
  "no": 4,
  "name": "4단계",
  "sub": "5수",
  "start": "즉답",
  "n": 3,
  "correct": 1,
  "seed": "km-std-즉답",
  "loseSlack": 1,
  "extraWin": 0.5,
  "depth": 5
 },
 {
  "id": "std-5",
  "no": 5,
  "name": "5단계",
  "sub": "7수",
  "start": "넷째",
  "n": 4,
  "correct": 1,
  "seed": "km-std-넷째",
  "loseSlack": 3,
  "extraWin": 0.4,
  "depth": 7
 },
 {
  "id": "std-6",
  "no": 6,
  "name": "6단계",
  "sub": "7수",
  "start": "묶음",
  "n": 4,
  "correct": 1,
  "seed": "km-std-묶음",
  "loseSlack": 3,
  "extraWin": 0.4,
  "depth": 7
 },
 {
  "id": "std-7",
  "no": 7,
  "name": "7단계",
  "sub": "9수",
  "start": "닁큼",
  "n": 4,
  "correct": 1,
  "seed": "km-std-닁큼",
  "loseSlack": 3,
  "extraWin": 0.3,
  "depth": 9
 },
 {
  "id": "std-8",
  "no": 8,
  "name": "8단계",
  "sub": "11수",
  "start": "흑설탕",
  "n": 3,
  "correct": 1,
  "seed": "km-std-흑설탕",
  "loseSlack": null,
  "extraWin": 0,
  "fixed": {
   "탕": [
    "탕솥",
    "탕탕",
    "탕수육"
   ],
   "솥": [
    "솥단지",
    "솥뚜껑"
   ]
  },
  "prefer": [
   "육가크로뮴",
   "탕솥",
   "솥뚜껑"
  ],
  "depth": 11
 },
 {
  "id": "std-9",
  "no": 9,
  "name": "9단계",
  "sub": "11수",
  "start": "낄끽낄끽",
  "n": 3,
  "correct": 1,
  "seed": "km-std-낄끽낄끽",
  "loseSlack": null,
  "extraWin": 0,
  "depth": 11
 },
 {
  "id": "std-10",
  "no": 10,
  "name": "10단계",
  "sub": "13수",
  "start": "웨",
  "n": 4,
  "correct": 1,
  "seed": "km-std-웨",
  "loseSlack": null,
  "extraWin": 0,
  "depth": 13
 }
];
