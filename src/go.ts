import * as Promise from 'bluebird';

import {Process, ProcessResult, Abort} from "./api";
import {Signal} from "./Signal";

export const go = (generator: Function): Process => {
    const completed = new Signal();
    const succeeded = new Signal();
    const failed = new Signal();
    const abortSignal = new Signal();
    const successHandler: (result: any) => void = result => {
        if(result instanceof Abort) {
            if(abortSignal.isRaised()) {
                failed.raise(result);
                completed.raise({failed: result});
            }
            else {
                const error = new Error('Process aborted unexpectedly');
                failed.raise(error);
                completed.raise({failed: error});
            }
        }
        else {
            succeeded.raise(result);
            completed.raise({succeeded: result});
        }
    };
    const errorHandler: (error: any) => void = error => {
        if(error instanceof Abort && !abortSignal.isRaised()) {
            error = new Error('Process aborted unexpectedly');
        }
        failed.raise(error);
        completed.raise({failed: error});
    };
    const process: Process = {
        succeeded, completed, failed, abort: abortSignal
    };
    Promise.coroutine(generator)(abortSignal).then(successHandler, errorHandler);
    return process;
};
