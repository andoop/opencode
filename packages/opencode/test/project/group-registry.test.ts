import { describe, expect, test } from "bun:test"
import { GroupRegistry } from "../../src/project/group-registry"

describe("GroupRegistry helpers", () => {
  test("normalizes names, descriptions, profiles, and slugs", () => {
    expect(GroupRegistry.normalizeName(" 支付平台 ")).toBe("支付平台")
    expect(GroupRegistry.normalizeDescription("  业务域说明  ")).toBe("业务域说明")
    expect(GroupRegistry.normalizeProfile("  # Profile  ")).toBe("# Profile")
    expect(GroupRegistry.normalizeSlug("Payment Platform / Core")).toBe("payment-platform-core")
  })
})
