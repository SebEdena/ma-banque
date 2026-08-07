---
name: fullstack-agent
description: Fullstack agent harness that coordinates worktree setup, feature-agent implementation, and PR-agent monitoring to build one or more features end-to-end from specs to merge, running a feature agent per feature concurrently when several are requested.
disable-model-invocation: true
---

# Summary

You will act as a fullstack agent harness. You are the manager of a team of agents. You will coordinate the work of these agents to build fullstack applications based on user requirements. Your role is to manage the workflow, assign tasks to the appropriate agents, and ensure that the final product meets the user's needs.

When the user names more than one feature, run them concurrently: spawn one feature agent per feature, each isolated in its own worktree and branch, and track them independently rather than finishing one before starting the next.

The user will provide you with a specific feature located in the specs folder `@docs/specs`. Check the issue tracker `@.scratch/<feature>/issues/`, where each issue file carries a `**Status:**` field:

- If no issue files exist yet for the feature, do not go further and ask the user to generate them.
- If every issue file's `**Status:**` is `done`, inform the user and provide a summary of the existing implementation.
- If any issue file's `**Status:**` is not `done`, proceed with the steps outlined in the workflow.

# Actors

- The user (user): you will exchange with him directly.
- You, the managing agent (manager): you will manage the workflow and coordinate the work of the other agents.
- The feature agent (agent): you will spawn a new all-purpose agent to handle the implementation of the feature. When multiple features are requested, spawn one feature agent per feature and run them concurrently.
- The pull request agent (pr-agent): you will spawn a small agent to monitor the pull requests. It should notify you if there are any comments or requested changes, and also notify you when the pull request is merged by the user. Magic word in the comments is "@claude", otherwise the agent will ignore the comments.

# Workflow

- manager: Make sure the local repository is up to date with the remote repository.
- manager: For each feature the user wants built, run the following in parallel with any other feature currently in progress:
  - manager: Create a new git worktree for the feature with the name of the feature, and create a new branch for the feature. Do not switch to the new branch.
  - manager: Spawn a new all-purpose agent to handle the feature implementation on the new worktree and the new branch. A feature consists of multiple issues.
    - agent: For each issue file in `@.scratch/<feature>/issues/` whose `**Status:**` is not `done`, in order:
      - agent: Run `/implement` on that issue (it runs `/tdd`, `/code-review`, and commits with Conventional Commits format on your behalf).
      - agent: Format and lint the code according to the project's standards.
      - agent: Update the issue file's `**Status:**` to `done` once `/implement` completes for it, and push the commit to the remote repository.
    - agent: Repeat until every issue file for the feature has `**Status:** done`.
    - agent: Create a pull request for the feature branch and notify you, the manager, that the feature is ready for review. Report to the manager the link to the pull request and a summary of the implementation.
  - manager: Spawn a pr-agent to monitor that feature's pull request once the feature agent reports it is open.
  - manager: Keep that feature's feature-agent session alive (idle, not terminated) so it can be resumed with full context when its pr-agent reports comments or requested changes.
  - manager: Record the feature's worktree, branch, feature-agent, and pr-agent so you can act on this feature later without disturbing any other feature in progress.
- manager: Give the user a summary of each feature's implementation and the link to its pull request for review, as each becomes ready.
- manager: Let humans review and comment on the pull requests.
- manager: Listen to each feature's pr-agent for comments, requested changes, and status on its pull request. When a pull request is merged, delete that feature's worktree and branch and stop that feature's agents. Continue tracking any other features still in progress.
