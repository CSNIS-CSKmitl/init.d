import PocketBase from "pocketbase";
const pb = new PocketBase("http://192.168.15.14:8080");
pb.autoCancellation(false);
await pb.admins.authWithPassword("techasit2424@gmail.com", "born5415");
const user = await pb
  .collection("users")
  .getFirstListItem('username = "66050160"');
console.log("Found:", user.username, "/", user.email);
await pb
  .collection("users")
  .update(user.id, { password: "born5415", passwordConfirm: "born5415" });
console.log("[ok] password reset to: born5415");
const test = await pb
  .collection("users")
  .authWithPassword("66050160", "born5415");
console.log("[ok] login test succeeded, user id =", test.record.id);
