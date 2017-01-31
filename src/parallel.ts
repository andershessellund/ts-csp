import {Process, OperationType, Abort} from "./api";
import {go} from "./go";
import {Signal, some, all} from "./Signal";
import {select} from "./select";
/**
 * Composes abortable processes into a single, abortable process.
 * - If a process fails, all processes are aborted, and an error is returned
 * - If the abortSignal is raised, all processes are aborted, and an abort is returned
 * - otherwise, the resulting process succeeds, and returns an array of success values
 *   from the child processes.
 */
export const parallel = (...processes: Process[]) => {
        return go(function*(abortSignal: Signal) {
            const childErrorSignal = some(...processes.map(process => process.failed));
            const allsucceededSignal = all(...processes.map(process => process.succeeded));
            const abortChildren = (reason: any) => {
                for(let process of processes) {
                    process.abort.raise(reason);
                }
            };
            const { ch: signal, value } = yield select([
                { ch: childErrorSignal, op: OperationType.TAKE },
                { ch: allsucceededSignal, op: OperationType.TAKE },
                { ch: abortSignal, op: OperationType.TAKE }
            ]);
            if(signal === childErrorSignal || signal === abortSignal) {
                if(signal === abortSignal) {
                    abortChildren(value);
                }
                else {
                    abortChildren(value.toString());
                }
                yield all(...processes.map(process => process.completed)).take();
                if(signal === abortSignal) {
                    return new Abort(value);
                }
                else {
                    throw value;
                }
            }
            return value;
        });
    };
