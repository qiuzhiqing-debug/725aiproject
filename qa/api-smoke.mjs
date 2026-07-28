const r1 = await fetch("http://127.0.0.1:8787/api/room", {method:"POST"}).then(r=>r.json())
console.log("建房:", JSON.stringify(r1))

const r2 = await fetch("http://127.0.0.1:8787/api/user", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({nick:"测试员"})}).then(r=>r.json())
console.log("建用户:", JSON.stringify(r2))

const r3 = await fetch("http://127.0.0.1:8787/api/user/" + r2.userId).then(r=>r.json())
console.log("读用户:", JSON.stringify(r3))
