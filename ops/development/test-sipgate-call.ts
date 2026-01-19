const TOKEN_ID = "token-9S3L96";
const TOKEN = "1fc3044a-c2ad-4b12-8eba-1a29c157cc1a";
const TO_NUMBER = "491778022488";

const auth = Buffer.from(`${TOKEN_ID}:${TOKEN}`).toString("base64");

async function test() {
  console.log("=== SIPGATE CALL TEST ===");
  console.log("An:", TO_NUMBER);
  
  const res = await fetch("https://api.sipgate.com/v2/sessions/calls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`
    },
    body: JSON.stringify({
      caller: "w0",
      callee: TO_NUMBER,
      callerId: ""
    })
  });
  
  const text = await res.text();
  console.log("\nStatus:", res.status);
  console.log("Response:", text || "(leer)");
}

test();