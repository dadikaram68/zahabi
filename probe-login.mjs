const base = "http://localhost:3000";
const loginRes = await fetch(`${base}/api/trpc/auth.internalLogin?batch=1`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ "0": { json: { username: "admin", password: "Admin12345!" } } }),
});
console.log("login status:", loginRes.status);
const setCookies = loginRes.headers.getSetCookie?.() ?? [];
console.log("set-cookie count:", setCookies.length);
for (const c of setCookies) console.log("  SET:", c.slice(0, 160));
const loginJson = await loginRes.json().catch(() => null);
console.log("login body keys:", JSON.stringify(loginJson)?.slice(0, 300));

// Build cookie header from set-cookies
const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
console.log("cookie names:", setCookies.map((c) => c.split("=")[0]).join(", "));

// Now call auth.me with those cookies
const meRes = await fetch(`${base}/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D`, {
  headers: { cookie: cookieHeader },
});
console.log("me status:", meRes.status);
console.log("me body:", (await meRes.text()).slice(0, 500));
