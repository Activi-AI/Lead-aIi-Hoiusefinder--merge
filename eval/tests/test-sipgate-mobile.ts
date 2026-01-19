const TOKEN_ID = "token-8CHVUG";
const TOKEN = "99c01786-e300-4e58-8b8d-6035f18ddd9a";

const auth = Buffer.from(`${TOKEN_ID}:${TOKEN}`).toString("base64");

async function test() {
  // PrÃ¼fe Device Status
  console.log("=== DEVICE STATUS ===");
  const devRes = await fetch("https://api.sipgate.com/v2/w0/devices", {
    headers: { Authorization: `Basic ${auth}` }
  });
  const devData = await devRes.json();
  devData.items?.forEach((d: any) => {
    console.log(`  ${d.id}: ${d.alias} (${d.type}) - online: ${d.online ?? "?"}`);
  });

  // Versuche mit Mobile Device (y0)
  console.log("\n=== CALL MIT MOBILE (y0) ===");
  const res = await fetch("https://api.sipgate.com/v2/sessions/calls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`
    },
    body: JSON.stringify({
      caller: "y0",
      callee: "491778022488"
    })
  });
  
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text || "(leer)");
}

test();