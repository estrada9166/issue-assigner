"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const lodash_1 = __importDefault(require("lodash"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const token = core.getInput('GITHUB_TOKEN', { required: true });
            const commentsEnabled = core.getInput('WITH_COMMENTS', { required: true });
            if (github.context.payload.action &&
                !['created', 'opened', 'reopened'].includes(github.context.payload.action)) {
                console.log(`
        The status of the action is no applicable ${github.context.payload.action}
      `);
                return;
            }
            const issueInfo = getIssueInfo();
            if (!issueInfo) {
                console.log('Could not get the issue number from context, exiting');
                return;
            }
            const { issueNodeId, body } = issueInfo;
            if (!body) {
                console.log('Could not get the body of the issue, exiting');
                return;
            }
            const { fileName, issueLine, branch } = getFileNameAndIssueLine(body);
            if (!(fileName && issueLine) || fileName.includes('node_modules')) {
                console.log('There was no valid fileName or issue');
                return;
            }
            const client = new github.GitHub(token);
            const commitInfo = yield getGitBlame(client, fileName, issueLine, branch);
            if (!commitInfo) {
                console.log('No valid commit info');
                return;
            }
            const { userId, username, userUrl, commitSha, commitUrl, commitDate, } = commitInfo;
            core.debug(`assigning userId ${userId} to issue #${issueNodeId}`);
            yield addAssigneesToAssignable(client, userId, issueNodeId);
            if (commentsEnabled === 'true') {
                const commentBody = createCommentBody(username, userUrl, commitSha, commitUrl, commitDate);
                yield createComment(client, issueNodeId, commentBody);
            }
        }
        catch (error) {
            core.error(error);
            core.setFailed(error.message);
        }
    });
}
function getIssueInfo() {
    const issue = github.context.payload.issue;
    const comment = github.context.payload.comment;
    if (!issue) {
        return;
    }
    return {
        body: comment ? comment.body : issue.body,
        issueNodeId: issue.node_id,
    };
}
function getFileNameAndIssueLine(body) {
    // We need to get the lines with the file and line that is having issues.
    const re = /(.*file\s+)(.*)(\s+line.*)/gi;
    const strLines = body.match(re);
    // Select the first line and also the fileName that is between "".
    // e.g. File "/app/packages/dashboard/src/test/fileABC.ts"
    const file = strLines ? strLines[0].match(/"(.*?)"/g) : null;
    // Select the line number between line and ,. e.g line 266,
    const line = strLines ? strLines[0].match(/(?<=line\s+).*?(?=,)/gs) : null;
    let selectedFile;
    let selectedLine;
    let selectedBranch = 'master';
    if (file && line) {
        // Sentry errors starts with File "/app/packages/dashboard/src/test/fileABC.ts", line 266, in xyz
        // We need the file without the first / and also without app
        selectedFile = file[0]
            .replace(/"/g, '')
            .split('/')
            .slice(2)
            .join('/');
        selectedLine = parseInt(line[0]);
    }
    else {
        const url = body.match(/(?:blob|blame)\/\s*(\S+)/i);
        if (url) {
            const urlInfo = url[1].split('/');
            selectedBranch = urlInfo[0];
            const [file, line] = urlInfo.pop().split('#L');
            selectedFile = urlInfo
                .slice(1)
                .concat(file)
                .join('/');
            selectedLine = line;
        }
    }
    return {
        fileName: selectedFile,
        issueLine: selectedLine,
        branch: selectedBranch,
    };
}
function getGitBlame(client, reportedFile, reportedLine, branch) {
    return __awaiter(this, void 0, void 0, function* () {
        const repository = github.context.payload.repository;
        if (!(repository && repository.full_name)) {
            return;
        }
        const [owner, repo] = repository.full_name.split('/');
        const gitBlame = yield client.graphql(`query GIT_BLAME($repo: String!, $owner: String!, $path: String!, $branch: String!){
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
                      url
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
  }`, {
            owner,
            repo,
            path: reportedFile,
            branch,
        });
        const assignableUsers = gitBlame.repository.assignableUsers.nodes;
        const blame = gitBlame.repository.ref.target.blame.ranges;
        const blameLine = lodash_1.default.filter(blame, (info) => {
            return info.startingLine <= reportedLine && info.endingLine >= reportedLine;
        });
        if (blameLine.length) {
            let selectedBlame = blameLine[0];
            if (blameLine.length > 1) {
                const sortedBlame = lodash_1.default.sortBy(blameLine, ['age']);
                selectedBlame = sortedBlame[0];
            }
            const commit = selectedBlame.commit;
            const { id: userId, login: username, url: userUrl } = commit.author.user;
            if (!lodash_1.default.find(assignableUsers, { id: userId })) {
                return;
            }
            return {
                userId,
                username,
                userUrl,
                commitSha: commit.abbreviatedOid,
                commitUrl: commit.commitUrl,
                commitDate: commit.authoredDate,
            };
        }
    });
}
function addAssigneesToAssignable(client, userId, issueNodeId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.graphql(`mutation Assing($input: AddAssigneesToAssignableInput!) {
    addAssigneesToAssignable(input: $input) {
        assignable {
          ... on Issue {
            number
          }
        }
      }
    }
  `, {
            input: {
                assignableId: issueNodeId,
                assigneeIds: [userId],
            },
        });
    });
}
function createCommentBody(username, userUrl, commitSHA, commitUrl, commitDate) {
    return `
### Commit information
| | |
| --- | --- |
| **Author** | <a href="${userUrl}">${username}</a> |
| **Commit** | <a href="${commitUrl}">${commitSHA}</a> |
| **Commit date** | ${commitDate} |
  `;
}
function createComment(client, issueNodeId, body) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.graphql(`mutation AddComment($input: AddCommentInput!) {
    addComment(input:$input) {
      clientMutationId
    }
  }
  `, {
            input: {
                subjectId: issueNodeId,
                body,
            },
        });
    });
}
run();
