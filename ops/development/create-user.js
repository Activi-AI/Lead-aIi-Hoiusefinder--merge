const fs = require("fs");
const crypto = require("crypto");

const USERS_FILE = "/root/lead-ai-mcp/data/users.json";

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, useSalt, 64).toString("hex");
  return { hash, salt: useSalt };
}

// Load existing users
let users = [];
if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

// Check if denis already exists
if (users.find(u => u.username === "denis")) {
  console.log("User denis existiert bereits!");
  process.exit(0);
}

// Create denis account
const { hash, salt } = hashPassword("Activi2024!");
const newUser = {
  id: crypto.randomBytes(8).toString("hex"),
  username: "denis",
  passwordHash: hash,
  salt: salt,
  role: "admin",
  createdAt: new Date().toISOString()
};

users.push(newUser);
fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
console.log("✅ Admin-Account erstellt: denis / Activi2024!");
