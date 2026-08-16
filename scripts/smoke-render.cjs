const fs = require("node:fs");
const vm = require("node:vm");

const code = fs.readFileSync("_site/assets/site.js", "utf8");
const app = { innerHTML: "" };
const body = { dataset: { route: "home" }, append() {} };
const document = {
  body,
  querySelector(selector) {
    return selector === "#app" ? app : null;
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return { className: "", textContent: "", append() {} };
  },
};
const storage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

const context = {
  document,
  location: {
    hostname: "sosirusok.github.io",
    pathname: "/crimescene/",
    search: "",
    href: "",
  },
  localStorage: storage,
  sessionStorage: storage,
  addEventListener() {},
  console,
  setTimeout,
  clearTimeout,
  fetch: async () => { throw new Error("Network is disabled in the renderer smoke test."); },
  confirm: () => false,
};

vm.createContext(context);
vm.runInContext(code, context, { timeout: 3000, filename: "site.js" });

if (!app.innerHTML.includes("당신이 용의자가")) {
  throw new Error("The home renderer did not write the customer page into #app.");
}
if (app.innerHTML.includes("사건 파일을 불러오는 중입니다.")) {
  throw new Error("The loading screen remained after the base renderer ran.");
}
if (!app.innerHTML.includes("실시간 예약")) {
  throw new Error("The rendered home page is missing its reservation entry point.");
}

console.log(`Renderer smoke test passed (${app.innerHTML.length} bytes).`);
