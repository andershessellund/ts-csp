import * as Promise from 'bluebird';

import {Signal} from "./Signal";
import {Operation, SelectResult, OperationType, Abort} from "./api";
import {select} from "./select";
export function selectOrAbort(abortSignal: Signal, spec: Operation[]): Promise<SelectResult> {
    return Promise.coroutine(function*() {
        const completeSpec: Operation[] = [{
            ch: abortSignal,
            op: OperationType.TAKE
        }, ...spec];
        const selectResult = yield select(completeSpec);
        if(selectResult.ch === abortSignal) {
            throw new Abort(abortSignal.value());
        }
        return selectResult;
    })();
}
