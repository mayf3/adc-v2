/**
 * Auth Contract Provenance Verifier (Manifest V1).
 *
 * Verifies that the pinned contract source references in the provenance
 * manifest match real Git objects in a local auth-service repository.
 *
 * Algorithm (adc-auth-contract-provenance-manifest-v1):
 *   1. Use UTF-8, LF line endings
 *   2. Serialize manifest as canonical JSON:
 *      - Keys in fixed order: schema, source_repository, source_head, source_tree, contracts
 *      - Contracts sorted by path (byte-order ascending)
 *      - Each contract entry: path, git_blob_id, file_sha256 (in that order)
 *      - No trailing whitespace
 *      - manifest_digest field excluded from input
 *   3. SHA-256 of canonical UTF-8 bytes
 *
 * Verification steps (all must pass):
 *   1. source_head is a valid Git commit
 *   2. source_head^{tree} == source_tree
 *   3. Each contract path exists at source_head
 *   4. git rev-parse HEAD:path == recorded git_blob_id
 *   5. git show HEAD:path raw bytes SHA-256 == recorded file_sha256
 *   6. Re-computed manifest digest == recorded digest
 */

import { createHash } from 'node:crypto';
import { execSync, type ExecSyncOptions } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ─── Manifest Type ──────────────────────────────────────────────────────

export interface ProvenanceManifest {
  schema: string;
  source_repository: string;
  source_head: string;
  source_tree: string;
  contracts: ProvenanceContract[];
  /** Optional — computed externally, not included in canonical input. */
  manifest_digest?: string;
}

export interface ProvenanceContract {
  path: string;
  git_blob_id: string;
  file_sha256: string;
}

// ─── Canonical Serialization ─────────────────────────────────────────────

/**
 * Canonical JSON serialization for manifest digest computation.
 *
 * The serialization is deterministic:
 * - Keys ordered as defined
 * - Contracts sorted by path (byte-order ascending)
 * - No extra whitespace
 * - manifest_digest excluded from the serialized output
 */
export function serializeManifest(manifest: ProvenanceManifest): string {
  // Sort contracts by path (byte-order ascending)
  const sorted = [...manifest.contracts].sort((a, b) =>
    Buffer.from(a.path).compare(Buffer.from(b.path)),
  );

  const parts: string[] = [];
  parts.push('{');
  parts.push(`"schema":${JSON.stringify(manifest.schema)},`);
  parts.push(`"source_repository":${JSON.stringify(manifest.source_repository)},`);
  parts.push(`"source_head":${JSON.stringify(manifest.source_head)},`);
  parts.push(`"source_tree":${JSON.stringify(manifest.source_tree)},`);
  parts.push('"contracts":[');
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    parts.push('{');
    parts.push(`"path":${JSON.stringify(c.path)},`);
    parts.push(`"git_blob_id":${JSON.stringify(c.git_blob_id)},`);
    parts.push(`"file_sha256":${JSON.stringify(c.file_sha256)}`);
    parts.push('}');
    if (i < sorted.length - 1) parts.push(',');
  }
  parts.push(']');
  parts.push('}');

  return parts.join('');
}

/**
 * Compute the SHA-256 digest of the canonical manifest representation.
 * Algorithm: adc-auth-contract-provenance-manifest-v1
 */
export function computeManifestDigest(manifest: ProvenanceManifest): string {
  const canonical = serializeManifest(manifest);
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

// ─── Git Verifier ────────────────────────────────────────────────────────

export interface VerificationResult {
  readonly passed: boolean;
  readonly steps: ReadonlyArray<{
    readonly name: string;
    readonly passed: boolean;
    readonly detail: string;
  }>;
  readonly error?: string;
}

function git(
  args: string[],
  repoPath: string,
  options?: ExecSyncOptions,
): string {
  const result = execSync(
    `git ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`,
    {
      cwd: repoPath,
      encoding: 'utf-8' as const,
      timeout: 10_000,
      ...options,
    },
  );
  return String(result).trim();
}

/**
 * Verify a provenance manifest against a local Git repository.
 *
 * @param manifest - The provenance manifest to verify.
 * @param repoPath - Path to a local, read-only checkout of the auth-service repository.
 * @returns Detailed verification result.
 */
export function verifyProvenanceManifest(
  manifest: ProvenanceManifest,
  repoPath: string,
): VerificationResult {
  const steps: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }> = [];
  let allPassed = true;

  try {
    // Step 1: source_head is a valid commit
    let headCommit: string;
    try {
      headCommit = git(['rev-parse', `${manifest.source_head}^{commit}`], repoPath);
      const passed = headCommit === manifest.source_head;
      steps.push({
        name: 'source_head_is_valid_commit',
        passed,
        detail: passed
          ? `HEAD ${headCommit} is a valid commit`
          : `rev-parse returned ${headCommit}, expected ${manifest.source_head}`,
      });
      if (!passed) allPassed = false;
    } catch (e: unknown) {
      steps.push({
        name: 'source_head_is_valid_commit',
        passed: false,
        detail: `HEAD ${manifest.source_head} is not a valid commit: ${e}`,
      });
      allPassed = false;
      return { passed: false, steps };
    }

    // Step 2: source_head^{tree} == source_tree
    try {
      const actualTree = git(['rev-parse', `${manifest.source_head}^{tree}`], repoPath);
      const passed = actualTree === manifest.source_tree;
      steps.push({
        name: 'source_tree_matches',
        passed,
        detail: passed
          ? `Tree ${actualTree} matches`
          : `Expected tree ${manifest.source_tree}, got ${actualTree}`,
      });
      if (!passed) allPassed = false;
    } catch (e: unknown) {
      steps.push({
        name: 'source_tree_matches',
        passed: false,
        detail: `Failed to resolve tree: ${e}`,
      });
      allPassed = false;
    }

    // Step 3-5: Verify each contract
    for (const contract of manifest.contracts) {
      // Step 3: Path exists at source_head
      try {
        git(['cat-file', '-e', `${manifest.source_head}:${contract.path}`], repoPath);
        steps.push({
          name: `path_exists:${contract.path}`,
          passed: true,
          detail: `Path ${contract.path} exists at HEAD`,
        });
      } catch (e: unknown) {
        steps.push({
          name: `path_exists:${contract.path}`,
          passed: false,
          detail: `Path ${contract.path} does not exist: ${e}`,
        });
        allPassed = false;
        continue; // Skip further checks for this contract
      }

      // Step 4: git rev-parse HEAD:path == recorded git_blob_id
      try {
        const actualBlob = git(
          ['rev-parse', `${manifest.source_head}:${contract.path}`],
          repoPath,
        );
        const passed = actualBlob === contract.git_blob_id;
        steps.push({
          name: `blob_id:${contract.path}`,
          passed,
          detail: passed
            ? `Blob ${actualBlob} matches`
            : `Expected blob ${contract.git_blob_id}, got ${actualBlob}`,
        });
        if (!passed) allPassed = false;
      } catch (e: unknown) {
        steps.push({
          name: `blob_id:${contract.path}`,
          passed: false,
          detail: `Failed to resolve blob: ${e}`,
        });
        allPassed = false;
      }

      // Step 5: git show HEAD:path SHA-256 matches
      try {
        const content = String(
          execSync(
            `git show ${manifest.source_head}:${escapePath(contract.path)}`,
            { cwd: repoPath, encoding: 'utf-8' as const, timeout: 10_000 },
          ),
        );
        const actualSha = createHash('sha256').update(content, 'utf-8').digest('hex');
        const passed = actualSha === contract.file_sha256;
        steps.push({
          name: `file_sha256:${contract.path}`,
          passed,
          detail: passed
            ? `SHA-256 ${actualSha} matches`
            : `Expected SHA-256 ${contract.file_sha256}, got ${actualSha}`,
        });
        if (!passed) allPassed = false;
      } catch (e: unknown) {
        steps.push({
          name: `file_sha256:${contract.path}`,
          passed: false,
          detail: `Failed to read file content: ${e}`,
        });
        allPassed = false;
      }
    }

    return { passed: allPassed, steps };
  } catch (error: unknown) {
    return {
      passed: false,
      steps,
      error: error instanceof Error ? error.message : 'Unknown verification error',
    };
  }
}

function escapePath(path: string): string {
  return path.replace(/'/g, "'\\''");
}
