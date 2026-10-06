// Syncs project Status with GitHub issue dependencies ("blocked by" links).
// Rules: see docs/spec/ci.md. Idempotent; never touches Done / closed items.

const OWNER = "jeiang";
const PROJECT_NUMBER = 2;
const STATUS_FIELD = "PVTSSF_lAHOAefT1c4BlzFNzhkefRY";
const TODO = "f75ad846";
const IN_PROGRESS = "47fc9ee4";
const BLOCKED = "f650f8b4";

const ISSUE_FIELDS = `
  id number state
  repository { nameWithOwner }
  blockedBy(first: 100) { nodes { number state repository { nameWithOwner } } }
  projectItems(first: 20) {
    nodes {
      id
      project { number owner { ... on User { login } } }
      fieldValueByName(name: "Status") {
        ... on ProjectV2ItemFieldSingleSelectValue { optionId }
      }
    }
  }
`;

module.exports = async ({ github, context, core }) => {
  const gql = (query, variables) => github.graphql(query, variables);

  const { user } = await gql(
    `query($login: String!, $n: Int!) { user(login: $login) { projectV2(number: $n) { id } } }`,
    { login: OWNER, n: PROJECT_NUMBER },
  );
  const projectId = user.projectV2.id;

  // Normalise an issue node to { issue, itemId, status } or null.
  const toEntry = (issue) => {
    if (issue?.state !== "OPEN") return null;
    const item = issue.projectItems.nodes.find(
      (i) =>
        i.project.number === PROJECT_NUMBER && i.project.owner.login === OWNER,
    );
    if (!item) return null;
    return {
      issue,
      itemId: item.id,
      status: item.fieldValueByName?.optionId ?? null,
    };
  };

  const ref = (i) =>
    i.repository.nameWithOwner === `${context.repo.owner}/${context.repo.repo}`
      ? `#${i.number}`
      : `${i.repository.nameWithOwner}#${i.number}`;

  async function recompute({ issue, itemId, status }) {
    // Done or In Progress items are never moved to Todo; In Progress is never Blocked.
    if (status === IN_PROGRESS) return;
    const blockers = issue.blockedBy.nodes;
    const open = blockers.filter((b) => b.state === "OPEN");
    const label = ref(issue);

    if (open.length > 0) {
      if (status === BLOCKED) return;
      // Todo or empty -> Blocked. Anything else (e.g. Done on an open issue) is left alone.
      if (status !== null && status !== TODO) return;
      await setStatus(itemId, BLOCKED);
      core.info(`${label}: -> Blocked (open: ${open.map(ref).join(", ")})`);
      return;
    }

    if (status === BLOCKED) {
      await setStatus(itemId, TODO);
      const list = blockers.map(ref).join(", ");
      const [owner, repo] = issue.repository.nameWithOwner.split("/");
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: issue.number,
        body: `Unblocked: all blockers are closed (${list}).`,
      });
      core.info(`${label}: Blocked -> Todo, commented`);
    } else if (status === null) {
      await setStatus(itemId, TODO);
      core.info(`${label}: empty -> Todo`);
    }
  }

  async function setStatus(itemId, optionId) {
    await gql(
      `mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o }
        }) { projectV2Item { id } }
      }`,
      { p: projectId, i: itemId, f: STATUS_FIELD, o: optionId },
    );
  }

  if (context.eventName === "issues") {
    const { repository } = await gql(
      `query($o: String!, $r: String!, $n: Int!) {
        repository(owner: $o, name: $r) {
          issue(number: $n) {
            blocking(first: 100) { nodes { ${ISSUE_FIELDS} } }
          }
        }
      }`,
      {
        o: context.repo.owner,
        r: context.repo.repo,
        n: context.payload.issue.number,
      },
    );
    const dependents = repository.issue.blocking.nodes
      .map(toEntry)
      .filter(Boolean);
    core.info(
      `#${context.payload.issue.number} ${context.payload.action}: ${dependents.length} open dependent item(s) in project`,
    );
    for (const entry of dependents) await recompute(entry);
    return;
  }

  // schedule / workflow_dispatch: every open project item.
  let after = null;
  let count = 0;
  for (;;) {
    const { node } = await gql(
      `query($p: ID!, $after: String) {
        node(id: $p) {
          ... on ProjectV2 {
            items(first: 50, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes { content { ... on Issue { ${ISSUE_FIELDS} } } }
            }
          }
        }
      }`,
      { p: projectId, after },
    );
    for (const n of node.items.nodes) {
      const entry = n.content?.id ? toEntry(n.content) : null;
      if (!entry) continue;
      count++;
      await recompute(entry);
    }
    if (!node.items.pageInfo.hasNextPage) break;
    after = node.items.pageInfo.endCursor;
  }
  core.info(`Checked ${count} open project issue(s)`);
};
