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
    if (processes.length === 0) {
        throw new Error('At least one process must be supplied to parallel');
    }
    for (let process of processes) {
        if (!(process.succeeded) || typeof process.succeeded.connect !== 'function') {
            throw new Error('Arguments to parallel must be processes');
        }
    }
    return go(function*() {
        const childErrorSignal = some(...processes.map(process => process.failed));
        const allsucceededSignal = all(...processes.map(process => process.succeeded));
        const abortChildren = (reason: any) => {
            for (let process of processes) {
                process.abort.raise(reason);
            }
        };
        const {ch: signal, value} = yield select([
            {ch: childErrorSignal, op: OperationType.TAKE},
            {ch: allsucceededSignal, op: OperationType.TAKE},
            {ch: this.abortSignal, op: OperationType.TAKE}
        ]);
        if (signal === childErrorSignal || signal === this.abortSignal) {
            if (signal === this.abortSignal) {
                abortChildren(value);
            }
            else {
                abortChildren(value.toString());
            }
            yield all(...processes.map(process => process.completed)).take();
            if (signal === this.abortSignal) {
                return new Abort(value);
            }
            else {
                throw value;
            }
        }
        return value;
    });
};
