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
![example](https://raw.githubusercontent.com/estrada9166/issue-assigner/master/images/example.gif)
