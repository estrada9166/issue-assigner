import * as core from '@actions/core'
import * as github from '@actions/github'
import _ from 'lodash'

type ReportedInfo = {
  fileName: string | null
  issueLine: number | null
  branch: string | 'master'
}

type IssueInfo = {
  body: string | undefined
  issueNodeId: string
}

type CommitInfo = {
  userId: string
  username: string
  commitSha: string
  commitUrl: string
  commitDate: string
}

async function run() {
  try {
    const token = core.getInput('GITHUB_TOKEN', { required: true })
    const commentsEnabled = core.getInput('WITH_COMMENTS', { required: true })

    if (
      github.context.payload.action &&
      !['created', 'opened', 'reopened'].includes(github.context.payload.action)
    ) {
      console.log(`
        The status of the action is no applicable ${github.context.payload.action}
      `)
      return
    }

    const issueInfo = getIssueInfo()
    if (!issueInfo) {
      console.log('Could not get the issue number from context, exiting')
      return
    }

    const { issueNodeId, body } = issueInfo

    if (!body) {
      console.log('Could not get the body of the issue, exiting')
      return
    }

    const { fileName, issueLine, branch } = getFileNameAndIssueLine(body)

    if (!(fileName && issueLine) || fileName.includes('node_modules')) {
      console.log('There was no valid fileName or issue')
      return
    }

    const client = new github.GitHub(token)

    const commitInfo = await getGitBlame(client, fileName, issueLine, branch)

    if (!commitInfo) {
      console.log('No valid commit info')
      return
    }

    const { userId, username, commitSha, commitUrl, commitDate } = commitInfo

    core.debug(`assigning userId ${userId} to issue #${issueNodeId}`)

    await addAssigneesToAssignable(client, userId, issueNodeId)

    if (commentsEnabled === 'true') {
      const commentBody = createCommentBody(
        username,
        commitSha,
        commitUrl,
        commitDate
      )
      await createComment(client, issueNodeId, commentBody)
    }
  } catch (error) {
    core.error(error)
    core.setFailed(error.message)
  }
}

function getIssueInfo(): IssueInfo | undefined {
  const issue = github.context.payload.issue
  const comment = github.context.payload.comment
  if (!issue) {
    return
  }

  return {
    body: comment ? comment.body : issue.body,
    issueNodeId: issue.node_id,
  }
}

function getFileNameAndIssueLine(body: string): ReportedInfo {
  // We need to get the lines with the file and line that is having issues.
  const re = /(.*file\s+)(.*)(\s+line.*)/gi
  const strLines = body.match(re)

  // Select the first line and also the fileName that is between "".
  // e.g. File "/app/packages/dashboard/src/test/fileABC.ts"
  const file = strLines ? strLines[0].match(/"(.*?)"/g) : null
  // Select the line number between line and ,. e.g line 266,
  const line = strLines ? strLines[0].match(/(?<=line\s+).*?(?=,)/gs) : null

  let selectedFile
  let selectedLine
  let selectedBranch = 'master'
  if (file && line) {
    // Sentry errors starts with File "/app/packages/dashboard/src/test/fileABC.ts", line 266, in xyz
    // We need the file without the first / and also without app
    selectedFile = file[0]
      .replace(/"/g, '')
      .split('/')
      .slice(2)
      .join('/')
    selectedLine = parseInt(line[0])
  } else {
    const url = body.match(/(?:blob|blame)\/\s*(\S+)/i)

    if (url) {
      const urlInfo = url[1].split('/')
      selectedBranch = urlInfo[0]
      const [file, line] = urlInfo.pop()!.split('#L')
      selectedFile = urlInfo
        .slice(1)
        .concat(file)
        .join('/')
      selectedLine = line
    }
  }

  return {
    fileName: selectedFile,
    issueLine: selectedLine,
    branch: selectedBranch,
  }
}

async function getGitBlame(
  client: github.GitHub,
  reportedFile: string,
  reportedLine: number,
  branch: string
): Promise<CommitInfo | undefined> {
  const repository = github.context.payload.repository

  if (!(repository && repository.full_name)) {
    return
  }

  const [owner, repo] = repository.full_name.split('/')
  const gitBlame = await client.graphql(
    `query GIT_BLAME($repo: String!, $owner: String!, $path: String!, $branch: String!){
    repository(name: $repo, owner: $owner) {
      assignableUsers(first: 30) {
        nodes {
          id
        }
      }
      # branch name
      ref(qualifiedName: $branch) {      
        target {
          # cast Target to a Commit
          ... on Commit {
            blame(path: $path) {
              ranges {
                commit {
                  abbreviatedOid
                  authoredDate
                  commitUrl
                  author {
                    user {
                      login
                      id
                    }
                  }
                }
                startingLine
                endingLine
                age
              }
            }
          }
        }
      }
    }
  }`,
    {
      owner,
      repo,
      path: reportedFile,
      branch,
    }
  )

  const assignableUsers = gitBlame.repository.assignableUsers.nodes
  const blame = gitBlame.repository.ref.target.blame.ranges
  const blameLine = _.filter(blame, (info) => {
    return info.startingLine <= reportedLine && info.endingLine >= reportedLine
  })

  if (blameLine.length) {
    let selectedBlame = blameLine[0]
    if (blameLine.length > 1) {
      const sortedBlame = _.sortBy(blameLine, ['age'])
      selectedBlame = sortedBlame[0]
    }

    const commit = selectedBlame.commit
    const userId = commit.author.user.id
    const username = commit.author.user.login

    if (!_.find(assignableUsers, { id: userId })) {
      return
    }

    return {
      userId,
      username,
      commitSha: commit.abbreviatedOid,
      commitUrl: commit.commitUrl,
      commitDate: commit.authoredDate,
    }
  }
}

async function addAssigneesToAssignable(
  client: github.GitHub,
  userId: string,
  issueNodeId: string
): Promise<void> {
  await client.graphql(
    `mutation Assing($input: AddAssigneesToAssignableInput!) {
    addAssigneesToAssignable(input: $input) {
        assignable {
          ... on Issue {
            number
          }
        }
      }
    }
  `,
    {
      input: {
        assignableId: issueNodeId,
        assigneeIds: [userId],
      },
    }
  )
}

function createCommentBody(
  username: string,
  commitSHA: string,
  commitUrl: string,
  commitDate: string
) {
  return `
### Commit information
| | |
| --- | --- |
| **Author** | ${username} |
| **Commit** | <a href="${commitUrl}">${commitSHA}</a> |
| **Commit date** | ${commitDate} |
  `
}

async function createComment(
  client: github.GitHub,
  issueNodeId: string,
  body: string
): Promise<void> {
  await client.graphql(
    `mutation AddComment($input: AddCommentInput!) {
    addComment(input:$input) {
      clientMutationId
    }
  }
  `,
    {
      input: {
        subjectId: issueNodeId,
        body,
      },
    }
  )
}

run()
