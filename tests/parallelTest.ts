import { assert } from 'chai';
import * as Promise from 'bluebird';

import {go} from "../src/go";
import {parallel} from "../src/parallel";
import {Signal} from "../src/Signal";
import {Channel} from "../src/Channel";
import {Abort} from "../src/api";

describe('parallel', () => {
    it('Will compose successful processes', () => {
        return Promise.coroutine(function*() {
            const p1 = go(function*() {
                return yield Promise.resolve(1);
            });
            const p2 = go(function*() {
                return yield Promise.resolve(2);
            });

            const p = parallel(p1, p2);
            const result = yield p.succeeded.take();
            assert.deepEqual(result, [1, 2]);
        })();
    });

    it('Will abort child processes if parent process is aborted', () => {
        return Promise.coroutine(function*() {
            const ch = new Channel();
            const p1 = go(function*() {
                return yield this.takeOrAbort(ch);
            });
            const p2 = go(function*() {
                return yield this.takeOrAbort(ch);
            });

            const p = parallel(p1, p2);
            yield Promise.delay(0);
            p.abort.raise('aborted!');
            const result = yield p.completed.take();
            assert.instanceOf(result.failed, Abort);
            assert.strictEqual(result.failed.reason, 'aborted!');
            assert.strictEqual(p1.failed.value().reason, 'aborted!');
            assert.strictEqual(p2.failed.value().reason, 'aborted!');
        })();
    });


    it('Will abort child processes if an error occur in a child process', () => {
        return Promise.coroutine(function*() {
            const error = new Error('foo');
            const ch = new Channel();
            const p1 = go(function*() {
                return yield this.takeOrAbort(ch);
            });
            const p2 = go(function*() {
                yield Promise.reject(error);
            });

            const p = parallel(p1, p2);
            yield Promise.delay(0);
            const result = yield p.completed.take();
            assert.strictEqual(result.failed, error);
            assert.instanceOf(p1.failed.value(), Abort);
        })();
    });

    it('Will throw if called with an empty array of processes', () => {
       assert.throws(() => parallel());
    });

    it('Will throw if called with something that is not a process', () => {
       assert.throws(() => parallel(<any>{succeeded: true}));
    });
});
