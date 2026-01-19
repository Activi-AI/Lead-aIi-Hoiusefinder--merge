const TOKEN_ID = "token-9S3L96";
const TOKEN = "1fc3044a-c2ad-4b12-8eba-1a29c157cc1a";

const auth = Buffer.from(`${TOKEN_ID}:${TOKEN}`).toString("base64");

async function test() {
  // Test 1: Account Info
  console.log("=== SIPGATE ACCOUNT TEST ===\n");

  const accountRes = await fetch("https://api.sipgate.com/v2/account", {
    headers: { Authorization: `Basic ${auth}` }
  });
  const accountData = await accountRes.json();
  console.log("Account Status:", accountRes.status);
  console.log("Account:", JSON.stringify(accountData, null, 2));

  // Test 2: Devices
  console.log("\n=== DEVICES ===");
  const devicesRes = await fetch("https://api.sipgate.com/v2/devices", {
    headers: { Authorization: `Basic ${auth}` }
  });
  const devicesData = await devicesRes.json();
  console.log("Devices Status:", devicesRes.status);
  if (devicesData.items) {
    devicesData.items.forEach((d: any) => console.log(`  â¢ ${d.alias || d.id} (${d.type})`));
  }
}

test();