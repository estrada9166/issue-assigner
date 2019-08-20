# Issue assigner

Assign issues to the last user that changed that line.

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
        WITH_COMMENTS: true
```
If you don't want this action to post comments on your issue with the commit information, update `.yml` file with
```yml
WITH_COMMENTS: false
```

## Create an issue
![example](https://raw.githubusercontent.com/estrada9166/issue-assigner/master/images/example.gif)
