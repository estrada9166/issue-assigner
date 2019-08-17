# Issue assigner

Assign issues using gitlog

Create a workflow:
```
name: "Issue assigner"
on: 
- issues

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/issue-assigner@v1
      with:
        GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
```
