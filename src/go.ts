import * as Promise from 'bluebird';

import {Process, Abort, ProcessOptions} from "./api";
import {Signal} from "./Signal";

const processYieldHandler = (value: any) => {
    if (value instanceof ProcessImpl) {
        return value.asPromise();
    }
    return value;
};

class ProcessImpl implements Process {
    completed = new Signal();
    succeeded = new Signal();
    failed = new Signal();
    abort = new Signal();
    private _promise: Promise<any>;

    constructor(private generator: Function, options?: ProcessOptions ) {
        options = options || {};
        const abortSignal = options.abortSignal;
        if(abortSignal) {
            abortSignal.connect(this.abort);
            // remove connection to prevent memory leaks upon process completion
            this.completed.take().then(() =>
                abortSignal.disconnect(this.abort)
            );
        }
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
        this._promise = (Promise.coroutine as any)(this.generator, {yieldHandler: processYieldHandler})(this.abort)
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
                if (error instanceof Abort && !this.abort.isRaised()) {
                    error = new Error('Process aborted unexpectedly');
                }
                throw error;
            });
        this._promise.then(successHandler, errorHandler);
    }

    asPromise(): Promise<any> {
        return this._promise;
    }

}

export const go = (generator: Function, options?: ProcessOptions): Process => {
    const p = new ProcessImpl(generator, options);
    p._run();
    return p;
};
