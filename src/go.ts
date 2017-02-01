import * as Promise from 'bluebird';

import {
    Process, Abort, Operation, SelectResult, OperationType,
    Source, Selectable, TakeOperation, SelectTakeResult
} from "./api";
import {Signal} from "./Signal";
import {select} from "./select";

const processYieldHandler = (value: any) => {
    if (value instanceof ProcessImpl) {
        return value.asPromise();
    }
    return value;
};

class ProcessRunner {

    delegateAbort(process: Process): Process {
        this.abortSignal.connect(process.abort);
        // remove connection to prevent memory leaks upon process completion
        process.completed.take().then(() =>
            this.abortSignal.disconnect(process.abort));
        return process;
    };

    selectOrAbort(spec: Operation[]): Promise<SelectResult> {
        return Promise.coroutine(function*() {
            const completeSpec: Operation[] = [{
                ch: this.abortSignal,
                op: OperationType.TAKE
            }, ...spec];
            const selectResult = yield select(completeSpec);
            if (selectResult.ch === this.abortSignal) {
                throw new Abort(this.abortSignal.value());
            }
            return selectResult;
        }).bind(this)();
    }

    takeOrAbort(source: Source & Selectable): Promise<any> {
        const selectSpec: TakeOperation[] = [
            { ch: source, op: OperationType.TAKE}
        ];
        return this.selectOrAbort(selectSpec).then((selectResult: SelectTakeResult) => {
            return selectResult.value;
        });
    }

    constructor(generator: Function, public abortSignal: Signal) {
        this._coroutine = (Promise.coroutine as any)(
            generator,
            {yieldHandler: processYieldHandler});
    }

    private _coroutine: any;

    _run(): Promise<any> {
        return this._coroutine()
            .then((value: any) => {
                if (typeof value === 'undefined') {
                    value = null;
                }
                if (value instanceof Abort || value instanceof Error) {
                    throw value;
                }
                return value;
            })
            .catch((error: any) => {
                if (error instanceof Abort && !this.abortSignal.isRaised()) {
                    error = new Error('Process aborted unexpectedly');
                }
                throw error;
            });

    }
}

class ProcessImpl implements Process {
    completed = new Signal();
    succeeded = new Signal();
    failed = new Signal();
    abort = new Signal();
    private _promise: Promise<any>;
    private _runner: ProcessRunner;
    constructor(generator: Function) {
        this._runner = new ProcessRunner(generator, this.abort);
    }

    _succeed(value: any) {
        this.completed.raise({succeeded: value});
        this.succeeded.raise(value);
    }

    _fail(error: any) {
        this.failed.raise(error);
        this.completed.raise({failed: error});
    }

    _run() {
        const successHandler = this._succeed.bind(this);
        const errorHandler = this._fail.bind(this);
        this._promise = this._runner._run();
        this._promise.then(successHandler, errorHandler);
    }

    asPromise(): Promise<any> {
        return this._promise;
    }

}

export const go = (generator: Function): Process => {
    const p = new ProcessImpl(generator);
    p._run();
    return p;
};


