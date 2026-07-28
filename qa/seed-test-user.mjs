const BASE = "http://127.0.0.1:8787";

const cr = await fetch(`${BASE}/api/user`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nick: "嘉欣",
    cocktail: { name: "银色子弹", glass: "martini", intro: "冷静又致命，一口见灵魂" },
  }),
}).then(r => r.json());

console.log("created:", cr);
const { userId, token } = cr;

await fetch(`${BASE}/api/user/${userId}/records`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId, token,
    module: "lover", role: "player", ts: Date.now(),
    profile: {
      archetype: "忠犬守护者", title: "爱你不需要理由但要给你理由",
      mbti: "ENFJ", occupation: "咖啡师", avgScore: 7.8,
      summary: "嘴上说随便，心里有满分标准。跟这种人过日子，你得学会读空气。",
      imageUrl: "",
    },
  }),
}).then(r => r.json()).then(r => console.log("record1:", r));

await fetch(`${BASE}/api/user/${userId}/records`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId, token,
    module: "boss", role: "host", ts: Date.now(),
    profile: {
      archetype: "甜心防火墙", title: "温柔是刀，笑着递过来",
      mbti: "INTJ", occupation: "产品经理", avgScore: 8.4,
      summary: "看起来好说话，但每件事都有自己的底线。老K说：这种人，认识要趁早。",
      imageUrl: "",
    },
  }),
}).then(r => r.json()).then(r => console.log("record2:", r));

console.log(`\nURL: http://127.0.0.1:8787/u.html?id=${userId}`);
