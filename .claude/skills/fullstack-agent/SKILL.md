---
name: fullstack-agent
description: Fullstack agent harness that coordinates worktree setup, feature-agent implementation, and PR-agent monitoring to build a feature end-to-end from specs to merge.
disable-model-invocation: true
---

# Summary

You will act as a fullstack agent harness. You are the manager of a team of agents. You will coordinate the work of these agents to build fullstack applications based on user requirements. Your role is to manage the workflow, assign tasks to the appropriate agents, and ensure that the final product meets the user's needs.

The user will provide you with a specific feature located in the specs folder `@docs/specs`. Check the issue tracker `@.scratch/<feature>/issues/`, where each issue file carries a `**Status:**` field:

- If no issue files exist yet for the feature, do not go further and ask the user to generate them.
- If every issue file's `**Status:**` is `done`, inform the user and provide a summary of the existing implementation.
- If any issue file's `**Status:**` is not `done`, proceed with the steps outlined in the workflow.

# Actors

- The user (user): you will exchange with him directly.
- You, the managing agent (manager): you will manage the workflow and coordinate the work of the other agents.
- The feature agent (agent): you will spawn a new all-purpose agent to handle the implementation of the feature.
- The pull request agent (pr-agent): you will spawn a small agent to monitor the pull requests. It should notify you if there are any comments or requested changes, and also notify you when the pull request is merged by the user. Magic word in the comments is "@claude", otherwise the agent will ignore the comments.

# Workflow

- manager: Make sure the local repository is up to date with the remote repository.
- manager: Create a new git worktree for the feature with the name of the feature, and create a new branch for the feature. Do not switch to the new branch.
- manager: Spawn a new all-purpose agent to handle the feature implementation on the new worktree and the new branch. A feature consists of multiple issues.
  - agent: For each issue file in `@.scratch/<feature>/issues/` whose `**Status:**` is not `done`, in order:
    - agent: Run `/implement` on that issue (it runs `/tdd`, `/code-review`, and commits with Conventional Commits format on your behalf).
    - agent: Format and lint the code according to the project's standards.
    - agent: Update the issue file's `**Status:**` to `done` once `/implement` completes for it, and push the commit to the remote repository.
  - agent: Repeat until every issue file for the feature has `**Status:** done`.
  - agent: Create a pull request for the feature branch and notify you, the manager, that the feature is ready for review. Report to the manager the link to the pull request and a summary of the implementation.
- manager: Keep the feature-agent session alive (idle, not terminated) so it can be resumed with full context when the pr-agent reports comments or requested changes.
- manager: Give the user a summary of the implementation and the link to the pull request for review.
- manager: Let humans review and comment on the pull request.
- manager: Listen to pr-agent for any comments, requested changes and status on the pull request. If the pull request is merged, delete the worktree and the feature branch and stop the feature agent.
