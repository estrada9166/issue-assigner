# Issue assigner

Assign issues using gitlog

## Create a workflow:
```yml
name: "Issue assigner"

on: [issues, issue_comment]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: estrada9166/issue-assigner@v1
      with:
        GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
        WITH_COMMENTS: "true"
```

## Create issue
Create the issue with the information you want to add and also, add the url
of where the issue is happening.
e.g
```
https://github.com/estrada9166/issue-assigner/blob/master/src/main.ts#L1
```