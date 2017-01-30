import * as Promise from 'bluebird';
import { assert } from 'chai';

import { go } from '../src/go';
import {Channel} from "../src/Channel";
import {select} from "../src/select";
import {OperationType, Abort} from "../src/api";
import {Signal} from "../src/Signal";

describe('go', () => {
    it('May run a successful process and return a value', () => {
        return Promise.coroutine(function*(): any {
            const ch = new Channel(0);
            const process = go(function*() {
                return yield ch.take();
            });
            assert.isFalse(process.completed.isRaised());
            assert.isFalse(process.succeeded.isRaised());
            ch.putSync('foo');
            const completedResult = yield process.completed.take();
            assert.deepEqual(completedResult, { succeeded: 'foo'});
            assert.strictEqual(process.succeeded.value(), 'foo');
            assert.isFalse(process.failed.isRaised());
        })();
    });

    it('A process may abort by returning Abort if the abort signal is raised', () => {
        return Promise.coroutine(function*(): any {
            const ch = new Channel(0);
            const process = go(function*(abortSignal: Signal) {
                const {ch: selectedChannel} = yield select([
                    {ch, op: OperationType.TAKE},
                    {ch: abortSignal, op: OperationType.TAKE }
                ]);
                if(selectedChannel === abortSignal) {
                    return new Abort(abortSignal.value());
                }
                else {
                    throw new Error();
                }
            });
            assert.isFalse(process.completed.isRaised());
            assert.isFalse(process.succeeded.isRaised());
            assert.isFalse(process.failed.isRaised());
            process.abort.raise('abort reason');
            const completedResult = yield process.completed.take();
            assert.instanceOf(completedResult.failed, Abort);
            assert.strictEqual('abort reason', completedResult.failed.reason);
            const failedResult = process.failed.value();
            assert.instanceOf(failedResult, Abort);
            assert.strictEqual('abort reason', failedResult.reason);
        })();
    });

    it('A process may abort by throwing Abort if the abort signal is raised', () => {
        return Promise.coroutine(function*(): any {
            const process = go(function*(abortSignal: Signal) {
                const reason = yield abortSignal.take();
                throw new Abort(reason);
            });
            assert.isFalse(process.completed.isRaised());
            assert.isFalse(process.succeeded.isRaised());
            assert.isFalse(process.failed.isRaised());
            process.abort.raise('abort reason');
            const result = yield process.failed.take();
            assert.instanceOf(result, Abort);
            assert.strictEqual(result.reason, 'abort reason');
        })();
    });

    it('If a process aborts by returning Abort without the abort signal being raised, it is an error', () => {
        return Promise.coroutine(function*() {
            const process = go(function*() {
                yield Promise.resolve(null);
                return new Abort('aborted for no reason');
            });
            const error = yield process.failed.take();
            assert.notInstanceOf(error, Abort);
            assert.strictEqual(error.message, 'Process aborted unexpectedly');
        })();
    });

    it('If a process aborts by throwing Abort without the abort signal being raised, it is an error', () => {
        return Promise.coroutine(function*() {
            const process = go(function*() {
                yield Promise.resolve(null);
                throw new Abort('aborted for no reason');
            });
            const error = yield process.failed.take();
            assert.notInstanceOf(error, Abort);
            assert.strictEqual(error.message, 'Process aborted unexpectedly');
        })();
    });
});
