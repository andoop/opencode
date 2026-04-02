import { $ } from "bun"

export namespace Branch {
  export async function list(directory: string) {
    const [local, remote, current] = await Promise.all([
      $`git branch --list --format="%(refname:short)"`
        .quiet()
        .nothrow()
        .cwd(directory)
        .text()
        .then((x) =>
          x
            .trim()
            .split("\n")
            .filter((b) => b.trim()),
        )
        .catch(() => [] as string[]),
      $`git branch -r --format="%(refname:short)"`
        .quiet()
        .nothrow()
        .cwd(directory)
        .text()
        .then((x) =>
          x
            .trim()
            .split("\n")
            .filter((b) => b.trim() && !b.includes("HEAD"))
            .map((b) => b.replace(/^origin\//, "")),
        )
        .catch(() => [] as string[]),
      $`git rev-parse --abbrev-ref HEAD`
        .quiet()
        .nothrow()
        .cwd(directory)
        .text()
        .then((x) => {
          const val = x.trim()
          if (!val || val === "HEAD") return undefined
          return val
        })
        .catch(() => undefined),
    ])
    return { local, remote, current }
  }

  export async function refresh(directory: string) {
    await $`git fetch`.quiet().nothrow().cwd(directory)
    return list(directory)
  }

  export function filter(branches: string[], query: string) {
    if (!query) return branches
    const lower = query.toLowerCase()
    return branches.filter((b) => b.toLowerCase().includes(lower))
  }

  export async function validate(name: string, directory: string) {
    const result = await $`git check-ref-format --branch ${name}`
      .quiet()
      .nothrow()
      .cwd(directory)
    return result.exitCode === 0
  }

  export async function exists(name: string, directory: string) {
    const result = await $`git show-ref --verify --quiet refs/heads/${name}`
      .quiet()
      .nothrow()
      .cwd(directory)
    return result.exitCode === 0
  }
}
