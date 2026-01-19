const TOKEN_ID = "token-9S3L96";
const TOKEN = "1fc3044a-c2ad-4b12-8eba-1a29c157cc1a";

const auth = Buffer.from(`${TOKEN_ID}:${TOKEN}`).toString("base64");

async function test() {
  // User-spezifische Devices
  console.log("=== USER w0 DEVICES ===");
  const devRes = await fetch("https://api.sipgate.com/v2/w0/devices", {
    headers: { Authorization: `Basic ${auth}` }
  });
  console.log("Status:", devRes.status);
  const devData = await devRes.json().catch(() => null);
  if (devData?.items) {
    devData.items.forEach((d: any) => console.log(`  â¢ ${d.id}: ${d.alias} (${d.type})`));
  } else {
    console.log("Response:", JSON.stringify(devData, null, 2));
  }

  // Phonelines
  console.log("\n=== PHONELINES ===");
  const linesRes = await fetch("https://api.sipgate.com/v2/w0/phonelines", {
    headers: { Authorization: `Basic ${auth}` }
  });
  console.log("Status:", linesRes.status);
  const linesData = await linesRes.json().catch(() => null);
  if (linesData?.items) {
    linesData.items.forEach((l: any) => console.log(`  â¢ ${l.id}: ${l.alias}`));
  } else {
    console.log("Response:", JSON.stringify(linesData, null, 2));
  }

  // Test Call mit User-ID
  console.log("\n=== CALL MIT w0 ===");
  const callRes = await fetch("https://api.sipgate.com/v2/sessions/calls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`
    },
    body: JSON.stringify({
      caller: "w0",
      callee: "491778022488"
    })
  });
  console.log("Status:", callRes.status);
  const callText = await callRes.text();
  console.log("Response:", callText || "(leer)");
}

test();