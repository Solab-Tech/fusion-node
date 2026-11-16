// Loads the built CommonJS package and checks it exports the same names as the ESM build.
const cjs = require("../dist/cjs/index.js");

(async () => {
  const esm = await import("../dist/esm/index.js");
  const names = (m) => Object.keys(m).sort().join(",");
  if (names(cjs) !== names(esm)) throw new Error(`exports differ: ${names(cjs)} vs ${names(esm)}`);
  if (cjs.default !== cjs.Fusion) throw new Error("default and named exports differ");
  const fusion = new cjs.Fusion(`fsk_live_${"0".repeat(40)}`);
  if (fusion.mode !== "live") throw new Error("mode not read from the key");
  console.log(`cjs ok: @usefusion/node ${cjs.VERSION}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
