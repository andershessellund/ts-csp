import * as Promise from 'bluebird';

import {Signal} from "./Signal";
import {Operation, SelectResult, OperationType, Abort} from "./api";
import {select} from "./select";
export function selectOrAbort(abortSignal: Signal<string>, spec: Operation<any>[]): Promise<SelectResult<any>> {
    return Promise.coroutine(function*() {
        const completeSpec: Operation<any>[] = [{
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
