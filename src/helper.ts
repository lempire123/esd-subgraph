import { BigInt } from "@graphprotocol/graph-ts"

export function getEpoch(timestamp: number): BigInt {
    const epochInit = 1598313857
    const minEpochLength = 28800
    let diff = timestamp - epochInit
    let epochNo = 1;
    for(let i = 0; i < 10000; i++){
        if (diff >= minEpochLength){
            epochNo = epochNo + 1
            diff = diff - minEpochLength
        }
        else{
            break
        }
    }
    return BigInt.fromI32(epochNo)
}
