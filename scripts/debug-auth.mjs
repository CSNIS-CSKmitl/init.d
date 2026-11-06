import PocketBase from "pocketbase";
const pb = new PocketBase("http://192.168.15.14:8080");
pb.autoCancellation(false);
const auth = await pb
  .collection("users")
  .authWithPassword("66050160", "born5415");
console.log("logged in as:", auth.record.username);

// Now mimic hooks.server.ts
await pb.collection("users").authRefresh();
const userId = pb.authStore.record?.id;
console.log("user id:", userId);
const full = await pb
  .collection("users")
  .getOne(userId, { expand: "user_type" });
console.log("full.user_type (raw):", JSON.stringify(full.user_type, null, 2));
console.log("full.expand:", JSON.stringify(full.expand, null, 2));

const t = full.user_type;
const typeName = typeof t === "object" && t ? t.type : null;
console.log("resolved typeName:", typeName);
console.log(
  "role would be:",
  typeName?.toLowerCase() === "admin" ? "admin" : "user",
);
