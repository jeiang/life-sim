// Syncs project Status with GitHub issue dependencies ("blocked by" links).
// Rules: see docs/spec/ci.md. Idempotent. Only two transitions:
//   Blocked -> Todo   (no open blockers; posts one comment)
//   Todo/empty -> Blocked (open blocker, no assignee, no open linked PR)
// Issue data uses the default GITHUB_TOKEN; PROJECT_TOKEN is used only for Projects v2.

const OWNER = "jeiang";
const PROJECT_NUMBER = 2;
const STATUS_FIELD = "PVTSSF_lAHOAefT1c4BlzFNzhkefRY";
const TODO = "f75ad846";
const BLOCKED = "f650f8b4";

module.exports = async ({ github, getOctokit, context, core }) => {
  const projectGql = getOctokit(process.env.PROJECT_TOKEN).graphql;
  const { owner, repo } = context.repo;
  const slug = `${owner}/${repo}`;

  const ref = (i) =>
    i.repository.nameWithOwner === slug
      ? `#${i.number}`
      : `${i.repository.nameWithOwner}#${i.number}`;

  const { user } = await projectGql(
    `query($login: String!, $n: Int!) { user(login: $login) { projectV2(number: $n) { id } } }`,
    { login: OWNER, n: PROJECT_NUMBER },
  );
  const projectId = user.projectV2.id;

  async function setStatus(itemId, optionId) {
    await projectGql(
      `mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o }
        }) { projectV2Item { id } }
      }`,
      { p: projectId, i: itemId, f: STATUS_FIELD, o: optionId },
    );
  }

  // Open project issues (project token), optionally restricted to a set of numbers.
  async function projectEntries(only) {
    const entries = [];
    let after = null;
    for (;;) {
      const { node } = await projectGql(
        `query($p: ID!, $after: String) {
          node(id: $p) {
            ... on ProjectV2 {
              items(first: 50, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  id
                  fieldValueByName(name: "Status") {
                    ... on ProjectV2ItemFieldSingleSelectValue { optionId }
                  }
                  content { ... on Issue { number state repository { nameWithOwner } } }
                }
              }
            }
          }
        }`,
        { p: projectId, after },
      );
      for (const n of node.items.nodes) {
        const c = n.content;
        if (
          !c?.number ||
          c.state !== "OPEN" ||
          c.repository.nameWithOwner !== slug
        )
          continue;
        if (only && !only.has(c.number)) continue;
        entries.push({
          number: c.number,
          itemId: n.id,
          status: n.fieldValueByName?.optionId ?? null,
        });
      }
      if (!node.items.pageInfo.hasNextPage) break;
      after = node.items.pageInfo.endCursor;
    }
    return entries;
  }

  async function recompute({ number, itemId, status }) {
    // Only Blocked, Todo and empty are ever changed.
    if (status !== null && status !== TODO && status !== BLOCKED) return;

    const { repository } = await github.graphql(
      `query($o: String!, $r: String!, $n: Int!) {
        repository(owner: $o, name: $r) {
          issue(number: $n) {
            number state
            repository { nameWithOwner }
            assignees(first: 1) { totalCount }
            closedByPullRequestsReferences(first: 1, includeClosedPrs: false) { totalCount }
            blockedBy(first: 100) { nodes { number state repository { nameWithOwner } } }
          }
        }
      }`,
      { o: owner, r: repo, n: number },
    );
    const issue = repository.issue;
    if (issue.state !== "OPEN") return;
    const blockers = issue.blockedBy.nodes;
    const open = blockers.filter((b) => b.state === "OPEN");

    if (open.length > 0) {
      if (status === BLOCKED) return;
      if (
        issue.assignees.totalCount > 0 ||
        issue.closedByPullRequestsReferences.totalCount > 0
      ) {
        return;
      }
      await setStatus(itemId, BLOCKED);
      core.info(`#${number}: -> Blocked (open: ${open.map(ref).join(", ")})`);
    } else if (status === BLOCKED) {
      await setStatus(itemId, TODO);
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: number,
        body: `Unblocked: all blockers are closed (${blockers.map(ref).join(", ")}).`,
      });
      core.info(`#${number}: Blocked -> Todo, commented`);
    }
  }

  let only = null;
  if (context.eventName === "issues") {
    const changed = context.payload.issue.number;
    const { repository } = await github.graphql(
      `query($o: String!, $r: String!, $n: Int!) {
        repository(owner: $o, name: $r) {
          issue(number: $n) {
            blocking(first: 100) { nodes { number repository { nameWithOwner } } }
          }
        }
      }`,
      { o: owner, r: repo, n: changed },
    );
    only = new Set(
      repository.issue.blocking.nodes
        .filter((b) => b.repository.nameWithOwner === slug)
        .map((b) => b.number),
    );
    core.info(
      `#${changed} ${context.payload.action}: blocks ${only.size} issue(s)`,
    );
    if (only.size === 0) return;
  }

  const entries = await projectEntries(only);
  for (const entry of entries) await recompute(entry);
  core.info(`Checked ${entries.length} open project issue(s)`);
};
