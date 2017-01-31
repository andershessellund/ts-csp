import * as Promise from 'bluebird';

import {Source, OperationType, SelectTakeResult, TakeOperation, Selectable} from "../src/api";
import {Signal} from "../src/Signal";
import {selectOrAbort} from "../src/selectOrAbort";
export const takeOrAbort = (abortSignal: Signal, source: Source & Selectable): Promise<any> => {
    const selectSpec: TakeOperation[] = [
        { ch: source, op: OperationType.TAKE}
    ];
    return selectOrAbort(abortSignal, selectSpec).then((selectResult: SelectTakeResult) => {
      return selectResult.value;
    });
}
