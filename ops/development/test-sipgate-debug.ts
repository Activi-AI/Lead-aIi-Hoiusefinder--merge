const TOKEN_ID = "token-9S3L96";
const TOKEN = "1fc3044a-c2ad-4b12-8eba-1a29c157cc1a";

const auth = Buffer.from(`${TOKEN_ID}:${TOKEN}`).toString("base64");

async function test() {
  // Test 1: Token Info / Authorization
  console.log("=== 1. AUTHORIZATION INFO ===");
  const authRes = await fetch("https://api.sipgate.com/v2/authorization/userinfo", {
    headers: { Authorization: `Basic ${auth}` }
  });
  console.log("Status:", authRes.status);
  const authText = await authRes.text();
  if (authText) console.log(authText);

  // Test 2: Users list  
  console.log("\n=== 2. USERS ===");
  const usersRes = await fetch("https://api.sipgate.com/v2/users", {
    headers: { Authorization: `Basic ${auth}` }
  });
  console.log("Status:", usersRes.status);
  const usersData = await usersRes.json().catch(() => null);
  if (usersData?.items) {
    usersData.items.forEach((u: any) => console.log(`  â¢ ${u.id}: ${u.firstname} ${u.lastname}`));
  }

  // Test 3: Devices with full response
  console.log("\n=== 3. DEVICES ===");
  const devRes = await fetch("https://api.sipgate.com/v2/devices", {
    headers: { Authorization: `Basic ${auth}` }
  });
  console.log("Status:", devRes.status);
  const devText = await devRes.text();
  console.log("Response:", devText || "(leer)");

  // Test 4: Call with verbose error
  console.log("\n=== 4. CALL TEST (verbose) ===");
  const callRes = await fetch("https://api.sipgate.com/v2/sessions/calls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`
    },
    body: JSON.stringify({
      caller: "w0",
      callee: "491778022488",
      callerId: ""
    })
  });
  console.log("Status:", callRes.status);
  console.log("Headers:", Object.fromEntries(callRes.headers.entries()));
  const callText = await callRes.text();
  console.log("Response:", callText || "(leer)");
}

test();