import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const metadataPath = path.resolve(__dirname, "meta/header.meta");
const metadata = fs.readFileSync(metadataPath, "utf8");

export default {
  input: "src/index.ts",
  output: {
    file: "dist/ucloud-evolved-plus.user.js",
    format: "iife",
    name: "UCloudEvolvedPlus",
    banner: metadata + "\n",
    sourcemap: false,
  },
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json" }),
  ],
  treeshake: false
};
