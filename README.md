# Issue assigner

Assign issues using gitlog

## Create a workflow:
```
name: "Issue assigner"
on: 
- [issues, issue_comment]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/issue-assigner@v1
      with:
        GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
```

## Create issue
In the issue text write:
```
File: src/main.ts // The name of the file with the issue
Line: 10 // The number of the line having the issue
Branch: develop // This is optional, by default is master
```