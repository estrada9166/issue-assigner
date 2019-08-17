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
            let token = process.env.GITHUB_TOKEN;
            if (!token) {
                token = core.getInput('GITHUB_TOKEN', { required: true });
            }
            const issueInfo = getIssueInfo();
            if (!issueInfo) {
                console.log('Could not get the issue number from context, exiting');
                return;
            }
            const { nodeId, body } = issueInfo;
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
            const userIdToAssign = yield getGitBlame(client, fileName, issueLine, branch);
            if (!userIdToAssign) {
                console.log('No user to assign');
                return;
            }
            core.debug(`assigning userId ${userIdToAssign} to issue #${nodeId}`);
            yield addAssigneesToAssignable(client, userIdToAssign, nodeId);
        }
        catch (error) {
            core.error(error);
            core.setFailed(error.message);
        }
    });
}
function getIssueInfo() {
    const issue = github.context.payload.issue;
    if (!issue) {
        return;
    }
    return {
        body: issue.body,
        nodeId: issue.node_id
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
        selectedFile = file[0].replace(/"/g, '').split('/').slice(2).join('/');
        selectedLine = parseInt(line[0]);
    }
    else {
        const usedFile = body.match(/file: \s*(\S+)/i);
        const usedLine = body.match(/Line: \s*(\S+)/i);
        const usedBranch = body.match(/Branch: \s*(\S+)/i);
        selectedFile = usedFile ? usedFile[1] : null;
        selectedLine = usedLine ? usedLine[1] : null;
        selectedBranch = usedBranch ? usedBranch[1] : 'master';
    }
    return {
        fileName: selectedFile,
        issueLine: selectedLine,
        branch: selectedBranch
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
                  author {
                    user {
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
            branch
        });
        const assignableUsers = gitBlame.repository.assignableUsers.nodes;
        const blame = gitBlame.repository.ref.target.blame.ranges;
        const blameLine = lodash_1.default.filter(blame, (info) => {
            return (info.startingLine <= reportedLine &&
                info.endingLine >= reportedLine);
        });
        if (blameLine.length) {
            let selectedBlame = blameLine[0];
            if (blameLine.length > 1) {
                const sortedBlame = lodash_1.default.sortBy(blameLine, ['age']);
                selectedBlame = sortedBlame[0];
            }
            const userId = selectedBlame.commit.author.user.id;
            if (!lodash_1.default.find(assignableUsers, { id: userId })) {
                return;
            }
            return userId;
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
                assigneeIds: [userId]
            }
        });
    });
}
run();
