// The package is "type": "module", so Node would read dist/cjs/*.js as ESM. This marker makes
// that folder CommonJS.
import { writeFileSync } from "node:fs";

writeFileSync("dist/cjs/package.json", `${JSON.stringify({ type: "commonjs" })}\n`);
