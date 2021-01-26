# esd-subgraph

## Example queries

### Fetch information about epoches
```graphql
{
  epoches(first: 5) {
    id
    startDAOTotalBonded
    startDAOTotalStaged
    startTotalDebt
  }
}
```

### Fetch account related info for different epochs
```graphql
{
  accounts(where: {address: "0x0006e4548aed4502ec8c844567840ce6ef1013f5"}) {
    id
    stagedBalance
    bondedBalance
    holdingBalance
    epochNo
  }
}
```
