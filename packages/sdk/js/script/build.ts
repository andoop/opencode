#!/usr/bin/env bun

const dir = new URL("..", import.meta.url).pathname
process.chdir(dir)

import { $ } from "bun"
import path from "path"

import { createClient } from "@hey-api/openapi-ts"

await $`bun dev generate > ${dir}/openapi.json`.cwd(path.resolve(dir, "../../opencode"))

// Resolve $defs references that hey-api/json-schema-ref-parser can't follow
const spec = await Bun.file(path.join(dir, "openapi.json")).json()
function resolveDefs(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj
  if (Array.isArray(obj)) return obj.map(resolveDefs)
  const result: any = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === "$defs") continue
    if (k === "$ref" && typeof v === "string" && v.includes("__schema")) {
      const token = v.split("/").pop()!
      const parent = findParentDefs(spec, token)
      if (parent) {
        Object.assign(result, resolveDefs(parent))
        continue
      }
    }
    result[k] = resolveDefs(v)
  }
  return result
}
function findParentDefs(obj: any, token: string): any {
  if (obj === null || typeof obj !== "object") return undefined
  if (obj.$defs?.[token]) return obj.$defs[token]
  for (const v of Object.values(obj)) {
    const found = findParentDefs(v, token)
    if (found) return found
  }
  return undefined
}
await Bun.write(path.join(dir, "openapi.json"), JSON.stringify(resolveDefs(spec), null, 2))

await createClient({
  input: "./openapi.json",
  output: {
    path: "./src/v2/gen",
    tsConfigPath: path.join(dir, "tsconfig.json"),
    clean: true,
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      exportFromIndex: false,
    },
    {
      name: "@hey-api/sdk",
      instance: "OpencodeClient",
      exportFromIndex: false,
      auth: false,
      paramsStructure: "flat",
    },
    {
      name: "@hey-api/client-fetch",
      exportFromIndex: false,
      baseUrl: "http://localhost:4096",
    },
  ],
})

await $`bun prettier --write src/gen`
await $`bun prettier --write src/v2`
await $`rm -rf dist`
await $`bun tsc`
await $`rm openapi.json`
