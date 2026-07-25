import { spawnSync } from "node:child_process";
import { CONFIG } from "../config.mjs";
import { runRepositoryGithubRead } from "../github/index.mjs";
import { toonString } from "../util/agent-output.mjs";

export const REPORT_STAGES = [
  "plan",
  "implement",
  "validate",
  "pr",
  "merged",
  "post-merge-stable"
];

const STAGE_INDEX = new Map(REPORT_STAGES.map((stage, index) => [stage, index]));
const ACTIVE_NODE_STATES = new Set(["working", "waiting", "blocked", "ready-for-parent"]);
const SUCCESSFUL_CHECK_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const FAILED_CHECK_CONCLUSIONS = new Set([
  "ACTION_REQUIRED", "CANCELLED", "ERROR", "FAILURE", "STALE", "STARTUP_FAILURE", "TIMED_OUT"
]);
const SAFE_GIT_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function secondsBetween(later, earlier) {
  if (!isTimestamp(earlier)) return -1;
  return Math.max(0, Math.floor((Date.parse(later) - Date.parse(earlier)) / 1000));
}

function defaultObservationRunner(command, args, { cwd } = {}) {
  if (command === "gh") return runRepositoryGithubRead(args);
  const env = {
    ...process.env,
    GH_PROMPT_DISABLED: "1",
    GIT_TERMINAL_PROMPT: "0"
  };
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function runObservation(runner, command, args, cwd) {
  try {
    const result = runner(command, args, { cwd });
    return {
      ok: result?.ok === true || result?.status === 0,
      status: Number.isInteger(result?.status) ? result.status : (result?.ok ? 0 : 1),
      stdout: typeof result?.stdout === "string" ? result.stdout : "",
      stderr: typeof result?.stderr === "string" ? result.stderr : ""
    };
  } catch {
    return { ok: false, status: 1, stdout: "", stderr: "" };
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function configuredPolicy(registry) {
  const configured = isObject(registry.reportingPolicy) ? registry.reportingPolicy : {};
  return {
    quietAfterSeconds: Number.isInteger(configured.quietAfterSeconds)
      ? configured.quietAfterSeconds
      : 43_200,
    postMergeStabilitySeconds: Number.isInteger(configured.postMergeStabilitySeconds)
      ? configured.postMergeStabilitySeconds
      : 172_800,
    terminalVisibilitySeconds: Number.isInteger(configured.terminalVisibilitySeconds)
      ? configured.terminalVisibilitySeconds
      : 3_600,
    stageBudgetsSeconds: isObject(configured.stageBudgetsSeconds)
      ? configured.stageBudgetsSeconds
      : {},
    wipLimits: isObject(configured.wipLimits) ? configured.wipLimits : {},
    agentAuthors: isObject(configured.agentAuthors) ? configured.agentAuthors : { names: [], emails: [] }
  };
}

function configuredPullRequestNumber(node) {
  const configured = node.stageTracking?.pullRequestNumber;
  if (Number.isSafeInteger(configured) && configured > 0) return configured;
  for (const evidence of Array.isArray(node.completionEvidence) ? node.completionEvidence : []) {
    const match = String(evidence).match(/^pr:(?:([^#\s]+)#|#)?(\d+)$/i);
    if (match && (!match[1] || match[1].toLowerCase() === String(CONFIG.repoSlug).toLowerCase())) {
      return Number(match[2]);
    }
  }
  return null;
}

function pullRequestObservation(node, runner, repoRoot) {
  const number = configuredPullRequestNumber(node);
  if (!number) {
    return {
      number: null,
      measurable: false,
      exists: false,
      state: "unconfigured",
      merged: false,
      mergedAt: null,
      createdAt: null,
      updatedAt: null,
      checksAt: null,
      checks: "unknown",
      url: null
    };
  }
  const result = runObservation(runner, "gh", [
    "pr", "view", String(number),
    "--repo", CONFIG.repoSlug,
    "--json", "number,state,isDraft,mergedAt,createdAt,updatedAt,statusCheckRollup,url"
  ], repoRoot);
  const parsed = result.ok ? parseJson(result.stdout) : null;
  if (!isObject(parsed)) {
    return {
      number,
      measurable: false,
      exists: false,
      state: "unavailable",
      merged: false,
      mergedAt: null,
      createdAt: null,
      updatedAt: null,
      checksAt: null,
      checks: "unknown",
      url: null
    };
  }
  const rollup = Array.isArray(parsed.statusCheckRollup) ? parsed.statusCheckRollup : [];
  let checks = "unknown";
  if (rollup.length) {
    const conclusions = rollup.map((check) => String(check?.conclusion || check?.state || "").toUpperCase());
    if (conclusions.some((conclusion) => FAILED_CHECK_CONCLUSIONS.has(conclusion))) checks = "failing";
    else if (conclusions.every((conclusion) => SUCCESSFUL_CHECK_CONCLUSIONS.has(conclusion))) checks = "green";
    else checks = "pending";
  }
  const checksAt = rollup
    .map((check) => check?.completedAt || check?.startedAt || null)
    .filter(isTimestamp)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
  return {
    number,
    measurable: true,
    exists: true,
    state: String(parsed.state || "unknown").toLowerCase(),
    merged: isTimestamp(parsed.mergedAt),
    mergedAt: isTimestamp(parsed.mergedAt) ? parsed.mergedAt : null,
    createdAt: isTimestamp(parsed.createdAt) ? parsed.createdAt : null,
    updatedAt: isTimestamp(parsed.updatedAt) ? parsed.updatedAt : null,
    checksAt,
    checks,
    url: typeof parsed.url === "string" ? parsed.url : null
  };
}

function safeGitRef(value) {
  return typeof value === "string"
    && SAFE_GIT_REF_RE.test(value)
    && !value.includes("..")
    && !value.includes("@{")
    && !value.includes(":");
}

function authorKind(name, email, policy) {
  const names = new Set(Array.isArray(policy.names) ? policy.names : []);
  const emails = new Set(Array.isArray(policy.emails) ? policy.emails : []);
  if (names.has(name) || emails.has(email)) return "agent";
  return "human";
}

function gitObservation(node, policy, runner, repoRoot) {
  const baseRef = node.stageTracking?.gitBaseRef;
  const headRef = node.stageTracking?.gitHeadRef;
  if (!safeGitRef(baseRef) || !safeGitRef(headRef)) {
    return { measurable: false, commits: [], agentCommits: 0, humanCommits: 0 };
  }
  const result = runObservation(runner, "git", [
    "-C", repoRoot,
    "log",
    "--format=%H%x09%aI%x09%an%x09%ae",
    "--end-of-options",
    `${baseRef}..${headRef}`,
    "--"
  ], repoRoot);
  if (!result.ok) return { measurable: false, commits: [], agentCommits: 0, humanCommits: 0 };
  const commits = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [hash = "", authoredAt = "", name = "", email = ""] = line.split("\t");
    return {
      hash,
      authoredAt: isTimestamp(authoredAt) ? authoredAt : null,
      name,
      email,
      authorKind: authorKind(name, email, policy.agentAuthors)
    };
  }).filter((commit) => commit.hash && commit.authoredAt);
  return {
    measurable: true,
    commits,
    agentCommits: commits.filter((commit) => commit.authorKind === "agent").length,
    humanCommits: commits.filter((commit) => commit.authorKind === "human").length
  };
}

function noMistakesObservation(node, runner, repoRoot) {
  const runId = node.stageTracking?.validationRunId;
  if (typeof runId !== "string" || !runId.trim()) {
    return { measurable: false, runId: null, outcome: "unconfigured", green: false, observedAt: null };
  }
  const result = runObservation(runner, "no-mistakes", ["axi", "status", "--run", runId], repoRoot);
  if (!result.ok) return { measurable: false, runId, outcome: "unavailable", green: false, observedAt: null };
  const outcome = result.stdout.match(/^\s*outcome:\s*"?([a-z-]+)"?\s*$/mi)?.[1]
    || result.stdout.match(/^\s*status:\s*"?([a-z-]+)"?\s*$/mi)?.[1]
    || "unknown";
  const observedAt = result.stdout.match(/^\s*(?:completed_at|updated_at):\s*"?([^"\s]+)"?\s*$/mi)?.[1] || null;
  return {
    measurable: true,
    runId,
    outcome,
    green: ["checks-passed", "passed"].includes(outcome),
    observedAt: isTimestamp(observedAt) ? observedAt : null
  };
}

function openPullRequestObservation(runner, repoRoot) {
  const result = runObservation(runner, "gh", [
    "pr", "list",
    "--repo", CONFIG.repoSlug,
    "--state", "open",
    "--limit", "10000",
    "--json", "number"
  ], repoRoot);
  const parsed = result.ok ? parseJson(result.stdout) : null;
  return Array.isArray(parsed)
    ? { measurable: true, count: parsed.length }
    : { measurable: false, count: -1 };
}

function quotaObservation(runner, repoRoot) {
  const result = runObservation(runner, "no-mistakes", ["axi", "status"], repoRoot);
  if (!result.ok) return { source: "agent-provider-quota", measurable: false, state: "unavailable", remaining: -1 };
  if (/(?:quota|usage[_ -]?limit|rate[_ -]?limit)[^\n]*(?:exhausted|reached)/i.test(result.stdout)) {
    return { source: "agent-provider-quota", measurable: true, state: "exhausted", remaining: 0 };
  }
  const remaining = result.stdout.match(/^\s*(?:quota_remaining|remaining_quota):\s*(\d+)\s*$/mi);
  if (remaining) {
    return {
      source: "agent-provider-quota",
      measurable: true,
      state: Number(remaining[1]) > 0 ? "available" : "exhausted",
      remaining: Number(remaining[1])
    };
  }
  return { source: "agent-provider-quota", measurable: false, state: "not-exposed", remaining: -1 };
}

function lastEvidence(candidates) {
  return candidates.filter((candidate) => isTimestamp(candidate.at))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))[0] || null;
}

function stageEntryFor(stage, node, git, pr, validation, stableAt, profileEvidenceSatisfied) {
  if (stage === "post-merge-stable") return stableAt;
  if (stage === "merged") return pr.mergedAt;
  if (stage === "pr") return pr.createdAt;
  if (stage === "validate") {
    return validation.observedAt || pr.checksAt
      || (profileEvidenceSatisfied && isTimestamp(node.completedAt) ? node.completedAt : null);
  }
  if (stage === "implement") {
    return git.commits.map((commit) => commit.authoredAt)
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0] || null;
  }
  return node.stageTracking?.stage === "plan" && isTimestamp(node.stageTracking?.enteredAt)
    ? node.stageTracking.enteredAt
    : null;
}

function laneReport(node, registry, policy, runner, repoRoot, now) {
  const git = gitObservation(node, policy, runner, repoRoot);
  const pullRequest = pullRequestObservation(node, runner, repoRoot);
  const validation = noMistakesObservation(node, runner, repoRoot);
  const nodeClosed = node.state === "terminal" && node.terminalDisposition === "completed";
  const validationGreen = pullRequest.checks === "green" || validation.green;
  const repositoryMerge = node.completionProfile?.type === "repository-merge";
  const requiredEvidence = Array.isArray(node.completionProfile?.requiredEvidence)
    ? node.completionProfile.requiredEvidence
    : [];
  const recordedEvidence = new Set(Array.isArray(node.completionEvidence) ? node.completionEvidence : []);
  const profileEvidenceSatisfied = requiredEvidence.length > 0
    && requiredEvidence.every((item) => recordedEvidence.has(item));
  const profileCompletionSatisfied = !repositoryMerge && nodeClosed && profileEvidenceSatisfied;
  const stableEvidenceAt = repositoryMerge && pullRequest.merged && pullRequest.checks === "green" && nodeClosed
    ? [pullRequest.mergedAt, pullRequest.checksAt, node.completedAt]
      .filter(isTimestamp)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0]
    : null;
  const stableAt = stableEvidenceAt
    ? new Date(Date.parse(stableEvidenceAt) + policy.postMergeStabilitySeconds * 1000).toISOString()
    : null;
  const stable = repositoryMerge
    && isTimestamp(stableAt) && Date.parse(stableAt) <= Date.parse(now);
  const profileGateId = {
    artifact: "artifact-evidence-recorded",
    "external-operation": "external-operation-evidence-recorded",
    "human-decision": "recorded-decision-and-disposition-evidence",
    custom: "custom-profile-evidence-recorded"
  }[node.completionProfile?.type] || "profile-evidence-recorded";
  const gates = repositoryMerge ? [
    { id: "plan-recorded", passed: true },
    { id: "implementation-evidence", passed: git.commits.length > 0 },
    { id: "validation-green", passed: validationGreen },
    { id: "pull-request-observed", passed: pullRequest.exists },
    { id: "merged-green-closed-and-stable", passed: stable }
  ] : [
    { id: "plan-recorded", passed: true },
    { id: profileGateId, passed: profileEvidenceSatisfied },
    { id: "node-closed", passed: nodeClosed }
  ];
  let stage = "plan";
  if (git.commits.length) stage = "implement";
  if (validationGreen || (!repositoryMerge && profileEvidenceSatisfied)) stage = "validate";
  if (repositoryMerge && pullRequest.exists) stage = "pr";
  if (repositoryMerge && pullRequest.merged) stage = "merged";
  if (stable) stage = "post-merge-stable";
  const stageEnteredAt = stageEntryFor(
    stage,
    node,
    git,
    pullRequest,
    validation,
    stableAt,
    !repositoryMerge && profileEvidenceSatisfied
  );
  const stageAgeSeconds = secondsBetween(now, stageEnteredAt);
  const evidence = [
    ...git.commits.map((commit) => ({
      ref: `git:${commit.hash}`,
      at: commit.authoredAt,
      authorKind: commit.authorKind
    })),
    ...(pullRequest.createdAt ? [{ ref: `pr:${pullRequest.number}:opened`, at: pullRequest.createdAt, authorKind: "unknown" }] : []),
    ...(pullRequest.mergedAt ? [{ ref: `pr:${pullRequest.number}:merged`, at: pullRequest.mergedAt, authorKind: "unknown" }] : []),
    ...(pullRequest.checks === "green" && pullRequest.checksAt
      ? [{ ref: `pr:${pullRequest.number}:checks-green`, at: pullRequest.checksAt, authorKind: "unknown" }]
      : []),
    ...(validation.green && validation.observedAt
      ? [{ ref: `run:${validation.runId}:${validation.outcome}`, at: validation.observedAt, authorKind: "unknown" }]
      : []),
    ...(nodeClosed && isTimestamp(node.completedAt)
      ? [{ ref: `node:${node.id}:closed`, at: node.completedAt, authorKind: "unknown" }]
      : [])
  ];
  const latest = lastEvidence(evidence);
  const positiveEvidenceRecent = latest
    && secondsBetween(now, latest.at) <= policy.quietAfterSeconds;
  const laneState = stable || profileCompletionSatisfied
    ? "completion evidence satisfied"
    : positiveEvidenceRecent
      ? "changing evidence"
      : "quiet, cause unknown";
  const stageBudgetSeconds = Number.isInteger(policy.stageBudgetsSeconds[stage])
    ? policy.stageBudgetsSeconds[stage]
    : -1;
  const attention = [];
  if (stageBudgetSeconds >= 0 && stageAgeSeconds > stageBudgetSeconds) attention.push("stage-age-exceeded");
  if (node.state === "blocked") attention.push(`registry-blocked:${node.blocker || "unspecified"}`);
  if (pullRequest.checks === "failing") attention.push("checks-failing");
  if (validation.measurable && !validation.green && ["failed", "cancelled"].includes(validation.outcome)) {
    attention.push(`validation-${validation.outcome}`);
  }
  if (nodeClosed && node.completionProfile?.type === "repository-merge" && !pullRequest.merged) {
    attention.push("terminal-without-merge-evidence");
  }
  return {
    id: node.id,
    workRef: node.workRef,
    registryState: node.state,
    laneState,
    claimedStage: node.stageTracking?.stage || "untracked",
    claimedStageEnteredAt: isTimestamp(node.stageTracking?.enteredAt) ? node.stageTracking.enteredAt : null,
    stage,
    stageEnteredAt,
    stageAgeSeconds,
    stageBudgetSeconds,
    gatesPassed: gates.filter((gate) => gate.passed).length,
    gatesTotal: gates.length,
    gatesRemaining: gates.filter((gate) => !gate.passed).length,
    gates,
    latestEvidence: latest,
    agentCommits: git.agentCommits,
    humanCommits: git.humanCommits,
    gitMeasurable: git.measurable,
    pullRequest,
    validation,
    nodeClosed,
    repositoryMerge,
    stable,
    profileCompletionSatisfied,
    attention,
    node
  };
}

export function collectOrchestrationReport(registry, options = {}) {
  const offlineRunner = () => ({ ok: false, status: 1, stdout: "", stderr: "" });
  const runner = options.offline ? offlineRunner : (options.observationRunner || defaultObservationRunner);
  const repoRoot = options.repoRoot || CONFIG.repoRoot;
  const now = isTimestamp(options.now) ? options.now : new Date().toISOString();
  const policy = configuredPolicy(registry);
  const allLanes = (Array.isArray(registry.nodes) ? registry.nodes : [])
    .filter((node) => node?.role === "manager")
    .map((node) => laneReport(node, registry, policy, runner, repoRoot, now));
  const allNodeReports = (Array.isArray(registry.nodes) ? registry.nodes : [])
    .map((node) => node.role === "manager"
      ? allLanes.find((lane) => lane.id === node.id)
      : laneReport(node, registry, policy, runner, repoRoot, now));
  const lanes = allLanes.filter((lane) => {
    if (lane.registryState !== "terminal") return true;
    return isTimestamp(lane.node.completedAt)
      && secondsBetween(now, lane.node.completedAt) <= policy.terminalVisibilitySeconds;
  });
  const concurrentLanes = allLanes.filter((lane) => ACTIVE_NODE_STATES.has(lane.registryState)).length;
  const openPullRequests = options.offline
    ? { measurable: false, count: -1 }
    : openPullRequestObservation(runner, repoRoot);
  const activeNodes = (Array.isArray(registry.nodes) ? registry.nodes : [])
    .filter((node) => ACTIVE_NODE_STATES.has(node?.state)).length;
  const maxActiveNodes = registry.trustPolicy?.limits?.maxActiveNodes;
  const quota = options.offline
    ? { source: "agent-provider-quota", measurable: false, state: "not-inspected", remaining: -1 }
    : quotaObservation(runner, repoRoot);
  const wip = [
    {
      kind: "concurrent-lanes",
      measurable: true,
      count: concurrentLanes,
      limit: Number.isInteger(policy.wipLimits.maxConcurrentLanes)
        ? policy.wipLimits.maxConcurrentLanes
        : -1
    },
    {
      kind: "open-pull-requests",
      measurable: openPullRequests.measurable,
      count: openPullRequests.count,
      limit: Number.isInteger(policy.wipLimits.maxOpenPullRequests)
        ? policy.wipLimits.maxOpenPullRequests
        : -1
    }
  ].map((item) => ({
    ...item,
    state: item.measurable && item.limit >= 0 && item.count > item.limit ? "breach" : "within-or-unconfigured"
  }));
  const budgets = [
    {
      source: "active-nodes",
      measurable: Number.isInteger(maxActiveNodes),
      state: Number.isInteger(maxActiveNodes) && activeNodes >= maxActiveNodes ? "exhausted" : "available",
      used: activeNodes,
      limit: Number.isInteger(maxActiveNodes) ? maxActiveNodes : -1,
      remaining: Number.isInteger(maxActiveNodes) ? Math.max(0, maxActiveNodes - activeNodes) : -1
    },
    {
      source: quota.source,
      measurable: quota.measurable,
      state: quota.state,
      used: -1,
      limit: -1,
      remaining: quota.remaining
    }
  ];
  const attention = [
    ...allLanes.flatMap((lane) => lane.attention.map((reason) => ({
      lane: lane.id,
      reason,
      lowestActor: reason.startsWith("registry-blocked:") ? "manager" : "captain"
    }))),
    ...wip.filter((item) => item.state === "breach").map((item) => ({
      lane: "portfolio",
      reason: `${item.kind}-limit-breach`,
      lowestActor: "captain"
    })),
    ...budgets.filter((item) => item.state === "exhausted").map((item) => ({
      lane: "portfolio",
      reason: `${item.source}-exhausted`,
      lowestActor: "captain"
    }))
  ];
  return { now, policy, lanes, allLanes, allNodeReports, wip, budgets, attention };
}

export function renderOrchestrationReport(report, io, registryLabel) {
  io.stdout("orchestration_report:");
  io.stdout('  mode: "read-only"');
  io.stdout('  authority: "none"');
  io.stdout('  observations_cached: false');
  io.stdout(`  registry: ${toonString(registryLabel)}`);
  io.stdout(`  observed_at: ${toonString(report.now)}`);
  io.stdout(`lanes[${report.lanes.length}]{lane,work_ref,registry_state,lane_state,stage,stage_entered_at,stage_age_seconds,stage_budget_seconds,gates_passed,gates_total,gates_remaining,last_positive_evidence,evidence_at,evidence_author,agent_commits,human_commits,git_measurable,pr,pr_measurable,checks,validation_outcome,validation_measurable,node_closed,attention}:`);
  for (const lane of report.lanes) {
    io.stdout(`  ${toonString(lane.id)},${toonString(lane.workRef)},${toonString(lane.registryState)},${toonString(lane.laneState)},${toonString(lane.stage)},${toonString(lane.stageEnteredAt || "unknown")},${lane.stageAgeSeconds},${lane.stageBudgetSeconds},${lane.gatesPassed},${lane.gatesTotal},${lane.gatesRemaining},${toonString(lane.latestEvidence?.ref || "none")},${toonString(lane.latestEvidence?.at || "unknown")},${toonString(lane.latestEvidence?.authorKind || "unknown")},${lane.agentCommits},${lane.humanCommits},${lane.gitMeasurable},${toonString(lane.pullRequest.number ? `#${lane.pullRequest.number}` : "unconfigured")},${lane.pullRequest.measurable},${toonString(lane.pullRequest.checks)},${toonString(lane.validation.outcome)},${lane.validation.measurable},${lane.nodeClosed},${toonString(lane.attention.join("|") || "none")}`);
  }
  if (!report.lanes.length) io.stdout('empty: "No nonterminal or recently completed Manager lanes"');
  io.stdout(`wip[${report.wip.length}]{kind,measurable,count,limit,state}:`);
  for (const item of report.wip) {
    io.stdout(`  ${toonString(item.kind)},${item.measurable},${item.count},${item.limit},${toonString(item.state)}`);
  }
  io.stdout(`budget_observations[${report.budgets.length}]{source,measurable,state,used,limit,remaining}:`);
  for (const item of report.budgets) {
    io.stdout(`  ${toonString(item.source)},${item.measurable},${toonString(item.state)},${item.used},${item.limit},${item.remaining}`);
  }
  io.stdout(`attention[${report.attention.length}]{lane,reason,lowest_actor}:`);
  for (const item of report.attention) {
    io.stdout(`  ${toonString(item.lane)},${toonString(item.reason)},${toonString(item.lowestActor)}`);
  }
}

export function reconcileOrchestrationReport(report) {
  const hardErrors = [];
  const discrepancies = [];
  for (const lane of report.allNodeReports) {
    if (lane.registryState === "terminal"
      && lane.node.completionProfile?.type === "repository-merge"
      && !lane.pullRequest.merged) {
      hardErrors.push({
        lane: lane.id,
        error: "registry claims terminal without merge evidence"
      });
    }
    if (lane.node.role !== "manager") continue;
    if (!isObject(lane.node.stageTracking)) {
      discrepancies.push({
        lane: lane.id,
        claim: "stage tracking absent",
        observation: `observed stage ${lane.stage}`,
        proposedTransition: `governed CAS: initialize stageTracking at ${lane.stage}`,
        disposition: "coordinator-review"
      });
    } else if (lane.claimedStage !== lane.stage) {
      const claimIndex = STAGE_INDEX.get(lane.claimedStage);
      const observedIndex = STAGE_INDEX.get(lane.stage);
      const direction = Number.isInteger(claimIndex) && Number.isInteger(observedIndex) && claimIndex > observedIndex
        ? "claim-ahead-of-evidence"
        : "evidence-ahead-of-claim";
      const claimEvidenceMeasurable = lane.claimedStage === "plan"
        || (lane.claimedStage === "implement" && lane.gitMeasurable)
        || (lane.claimedStage === "validate" && (lane.validation.measurable || lane.pullRequest.measurable))
        || (["pr", "merged", "post-merge-stable"].includes(lane.claimedStage) && lane.pullRequest.measurable);
      const observationUnavailable = direction === "claim-ahead-of-evidence" && !claimEvidenceMeasurable;
      discrepancies.push({
        lane: lane.id,
        claim: `${lane.claimedStage} entered ${lane.claimedStageEnteredAt || "unknown"}`,
        observation: observationUnavailable
          ? `${lane.claimedStage} evidence source unavailable; lower observed stage is not negative evidence`
          : `${lane.stage} entered ${lane.stageEnteredAt || "unknown"} (${direction})`,
        proposedTransition: observationUnavailable
          ? "no transition: restore the read-only observation source and reconcile again"
          : `governed CAS: set stageTracking to ${lane.stage} with observed entry evidence`,
        disposition: observationUnavailable ? "observation-required" : "coordinator-review"
      });
    } else if (!lane.claimedStageEnteredAt && lane.stageEnteredAt) {
      discrepancies.push({
        lane: lane.id,
        claim: `${lane.claimedStage} entry timestamp absent`,
        observation: `${lane.stage} entered ${lane.stageEnteredAt}`,
        proposedTransition: `governed CAS: record observed ${lane.stage} entry timestamp`,
        disposition: "coordinator-review"
      });
    }
    if (lane.pullRequest.merged && lane.pullRequest.checks === "green" && !lane.nodeClosed) {
      discrepancies.push({
        lane: lane.id,
        claim: `registry node state ${lane.registryState}`,
        observation: "merged PR with green checks; node closure absent",
        proposedTransition: "governed CAS: reconcile completion profile, then close the node if all required evidence matches",
        disposition: "coordinator-review"
      });
    }
  }
  for (const item of report.wip.filter((candidate) => candidate.state === "breach")) {
    discrepancies.push({
      lane: "portfolio",
      claim: `${item.kind} limit ${item.limit}`,
      observation: `${item.count} observed`,
      proposedTransition: "coordinator review: reduce WIP or explicitly amend policy",
      disposition: "coordinator-review"
    });
  }
  return { hardErrors, discrepancies };
}

export function renderOrchestrationReconcile(reconciliation, io, registryLabel, observedAt) {
  io.stdout("orchestration_reconcile:");
  io.stdout('  mode: "read-only"');
  io.stdout('  authority: "none"');
  io.stdout("  applied: 0");
  io.stdout(`  registry: ${toonString(registryLabel)}`);
  io.stdout(`  observed_at: ${toonString(observedAt)}`);
  io.stdout(`hard_errors[${reconciliation.hardErrors.length}]{lane,error}:`);
  for (const item of reconciliation.hardErrors) {
    io.stdout(`  ${toonString(item.lane)},${toonString(item.error)}`);
  }
  io.stdout(`discrepancies[${reconciliation.discrepancies.length}]{lane,registry_claim,observation,proposed_governed_transition,disposition}:`);
  for (const item of reconciliation.discrepancies) {
    io.stdout(`  ${toonString(item.lane)},${toonString(item.claim)},${toonString(item.observation)},${toonString(item.proposedTransition)},${toonString(item.disposition)}`);
  }
  if (!reconciliation.hardErrors.length && !reconciliation.discrepancies.length) {
    io.stdout('empty: "Registry claims match measurable observations"');
  }
}
