// require() of the ESM build, which Node 20.19+ and 22.12+ support. The package's engines field
// promises it, so a build that breaks it fails here.
const { Fusion, default: Default, VERSION } = require("../dist/index.js");

if (Default !== Fusion) throw new Error("default and named exports differ");
if (new Fusion(`fsk_live_${"0".repeat(40)}`).mode !== "live")
  throw new Error("mode not read from the key");
console.log(`require ok: @usefusion/node ${VERSION}`);
