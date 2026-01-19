const TOKEN_ID = "token-8CHVUG";
const TOKEN = "99c01786-e300-4e58-8b8d-6035f18ddd9a";

const auth = Buffer.from(`${TOKEN_ID}:${TOKEN}`).toString("base64");

async function test() {
  console.log("=== SIPGATE CALL TEST (neuer Token) ===");
  console.log("An: 491778022488\n");
  
  const res = await fetch("https://api.sipgate.com/v2/sessions/calls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`
    },
    body: JSON.stringify({
      caller: "e0",
      callee: "491778022488"
    })
  });
  
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text || "(leer)");
  
  if (res.status === 200 || res.status === 204) {
    console.log("\nâ ANRUF GESTARTET!");
  }
}

test();