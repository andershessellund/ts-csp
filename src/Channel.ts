import * as Promise from 'bluebird';

const assert = require('assert');

import {
    Source,
    BatchSource,
    BatchDestination,
    Selectable, TakeCallback,
    PutCallback,
    TakeOperation,
    TakeManyOperation,
    PutOperation,
    PutManyOperation,
    Operation,
    SelectCallback,
    OperationType,
    CLOSED
} from './api';

import {
    makePromise
} from './util';
import FifoQueue from "./FifoQueue";
import {isReduced} from "transducers-js";

// The base transformer object to use with transducers
const UnshiftTransform = {
    '@@transducer/result': (queue: any) => queue,

    '@@transducer/step': (queue: FifoQueue<any>, value: any) => {
        queue.unshift(value);
        return queue;
    },
};

export class Channel implements BatchSource, BatchDestination, Source, Selectable {

    constructor(private _bufferSize: number = 0, xform: any = null) {
       this._xform = xform !== null ? xform(UnshiftTransform) : UnshiftTransform
    }

    private _values = new FifoQueue<any>();
    private _xform: any;

    private _puts: (PutCallback | null)[] = [];
    private _putCounts: number[] = [];
    private _putCountSum: number = 0;

    private _takes: TakeCallback[] = [];
    private _takeCounts : number[] = [];
    private _takeCountSum: number = 0;

    private _selectTakes: SelectCallback[] = [];
    private _selectTakeOps: (TakeOperation | TakeManyOperation)[] = [];
    private _selectTakeCountSum: number = 0;

    private _selectPuts: SelectCallback[] = [];
    private _selectPutOps: (PutOperation | PutManyOperation)[] = [];
    private _selectPutCountSum: number = 0;

    private _bufferRemaining: number = this._bufferSize;

    private _closed = false;
    private _explicitlyClosed = false;

    _availableForSyncTake(): number {
        return this._bufferSize - this._bufferRemaining
            + this._putCountSum
            + this._selectPutCountSum;
    }

    _availableForSyncPut(): number {
        return this._bufferRemaining
            + this._takeCountSum
            - this._putCountSum
            + this._selectTakeCountSum
    }

    canTakeSync(amount: number): boolean {
        return this._availableForSyncTake() >= amount || this._closed;
    }

    canPutSync(amount: number): boolean {
        return this._availableForSyncPut() >= amount;
    }

    _canSelectPutSync(amount: number): boolean {
        return this.canPutSync(amount)
            || this._takes.length > 0
            || this._selectTakes.length > 0;
    }

    _canApplyTake() {
        if (this._takes.length === 0) {
            return false;
        }
        const count = this._takeCounts[0];
        return count <= this._values.length() || this._closed;
    }

    _doTake(desiredCount: number): any[] {
        const takenCount = Math.min(this._values.length(), desiredCount);
        assert(desiredCount === takenCount || this._closed);
        this._bufferRemaining += takenCount;
        const values : any[] = this._values.popMany(takenCount);
        if (desiredCount !== takenCount) {
            assert(this._closed);
            values.push(CLOSED);
        }
        return values;
    }

    _applyTake(): void {
        const resolver = <TakeCallback>this._takes.shift();
        const desiredCount = <number>this._takeCounts.shift();
        this._takeCountSum -= desiredCount;
        const values = this._doTake(desiredCount);
        resolver(values);
    }

    _canApplyPut(): boolean {
        if (this._puts.length === 0) {
            return false;
        }
        const count = this._putCounts[0];
        return count <= this._bufferRemaining;
    }

    _applyPut(): void {
        const count = this._putCounts.shift();
        const resolver = this._puts.shift();
        this._bufferRemaining -= count;
        this._putCountSum -= count;
        if (resolver) {
            resolver(null);
        }
    }

    /**
     * We will not accept a situation where we both have some waiting to take and some waiting to put.
     * In this case we will apply a take and allow an overflow of the buffer.
     * @returns {boolean}
     * @private
     */
    _forcePutCondition():boolean {
        return (this._puts.length > 0 || this._selectPuts.length > 0) &&
            (this._takes.length > 0 || this._selectTakes.length > 0);
    }

    _canApplySelectPut(): boolean {
        if (this._puts.length > 0) {
            return false;
        }
        const availableForPut = this._availableForSyncPut();
        for (let op of this._selectPutOps) {
            const count = op.op === OperationType.PUT ? 1 : op.values.length;
            if (count <= availableForPut) {
                return true;
            }
        }
        return false;
    }

    _canRejectSelectPut(): boolean {
        return this._closed && this._selectPuts.length > 0;
    }

    _rejectSelectPut() {
        const cb = this._selectPuts[0];
        const op = this._selectPutOps[0];
        cb(new Error('Cannot put to closed channel'), op);
    }

    _canApplySelectTake():boolean {
        if (this._takes.length > 0 || this._selectTakes.length === 0) {
            return false;
        }
        if (this._closed) {
            return true;
        }
        const availableForTake = this._availableForSyncTake();
        for (let spec of this._selectTakeOps) {
            const count = spec.op === OperationType.TAKE ? 1 : spec.count;
            if (count <= availableForTake) {
                return true;
            }
        }
        return false;
    }

    _applySelectPut(): void {
        const cb = this._selectPuts[0];
        const op = this._selectPutOps[0];
        cb(null, op);
    }

    _applySelectTake(): void {
        const availableForTake = this._availableForSyncTake();
        for(let i = 0; i < this._selectTakeOps.length; ++i) {
            const spec = this._selectTakeOps[i];
            const count = spec.op === OperationType.TAKE ? 1 : spec.count;
            if (count <= availableForTake || this._closed) {
                const cb = this._selectTakes[i];
                cb(null, spec);
                return;
            }
        }
    }

    close(): void {
        this._explicitlyClosed = true;
        if(this._closed) {
            return;
        }
        this._closeImplicitly();
    }

    _closeImplicitly(): void {
        this._closed = true;
        this._xform['@@transducer/result'](this._values);
        this._apply();
    }

    isClosed(): boolean {
        return this._closed;
    }

    _putMany(values: any[], resolver: PutCallback | null): void {
        if (this._explicitlyClosed) {
            throw new Error('Cannot put to closed channel');
        }
        const valuesBefore = this._values.length();
        let done;
        for(let value of values) {
            done = isReduced(this._xform['@@transducer/step'](this._values, value));
            if(done) {
                break;
            }
        }
        const putCount = this._values.length() - valuesBefore;
        this._puts.push(resolver);
        this._putCounts.push(putCount);
        this._putCountSum += putCount;
        this._apply();
        if(done) {
            this._closeImplicitly();
        }
    }

    putMany(values: any[]): Promise<null> {
        const { promise, resolve } = makePromise<null>();
        this._putMany(values, resolve);
        return promise;
    }

    put(value: any): Promise<null> {
        const { promise, resolve } = makePromise<null>();
        this._putMany([value], resolve);
        return promise;
    }

    putManySync(values: any[]): void {
        this._putMany(values, null);
    }

    putSync(value: any): void {
        this.putManySync([value]);
    }

    _takeMany(count: number, resolver: TakeCallback): void {
        this._takes.push(resolver);
        this._takeCounts.push(count);
        this._takeCountSum += count;
        this._apply();
    }

    takeMany(count: number): Promise<any[]> {
        const { promise, resolve} = makePromise<any[]>();
        this._takeMany(count, resolve);
        return promise;
    }

    take(): Promise<any> {
        const { promise, resolve } = makePromise<any>();
        this._takeMany(1, values => {
            resolve(values[0])
        });
        return promise;
    }

    _forcePut(): void {
        if (this._puts.length > 0) {
            this._applyPut();
        }
        else {
            this._applySelectPut();
        }
    }

    takeManySync(count: number): any[] {
        if (!this.canTakeSync(count)) {
            throw new Error('Attempted to take immediate with no values available');
        }
        while (this._takes.length > 0 || (this._values.length() < count && !this._closed)) {
            this._forcePut();
        }
        const values = this._doTake(count);
        this._apply();
        return values;
    }

    takeSync() {
        return this.takeManySync(1)[0];
    }

    _apply() {
        while (true) {
            if (this._canApplyPut()) {
                this._applyPut();
            }
            if (this._canRejectSelectPut()) {
                this._rejectSelectPut();
            }
            else if (this._canApplyTake()) {
                this._applyTake();
            }
            else if (this._canApplySelectTake()) {
                this._applySelectTake();
            }
            else if (this._canApplySelectPut()) {
                this._applySelectPut();
            }
            else if (this._forcePutCondition()) {
                this._forcePut();
            }
            else {
                break;
            }
        }
    }
    _select(op: Operation, cb: SelectCallback): void {
        if(op.op === OperationType.TAKE || op.op === OperationType.TAKE_MANY) {
            const amount = op.op === OperationType.TAKE ? 1 : op.count;
            this._selectTakes.push(cb);
            this._selectTakeOps.push(op);
            this._selectTakeCountSum += amount;
        }
        else {
            const amount = op.op === OperationType.PUT ? 1 : op.values.length;
            this._selectPuts.push(cb);
            this._selectPutOps.push(op);
            this._selectPutCountSum += amount;
        }
    }

    _unselect(op: Operation): void {
        if(op.op === OperationType.TAKE || op.op === OperationType.TAKE_MANY) {
            const index = this._selectTakeOps.indexOf(op);
            const amount = op.op === OperationType.TAKE ? 1 : op.count;
            this._selectTakes.splice(index, 1);
            this._selectTakeOps.splice(index, 1);
            this._selectTakeCountSum -= amount;
        }
        else {
            const amount = op.op === OperationType.PUT ? 1 : op.values.length;
            const index = this._selectPutOps.indexOf(op);
            this._selectPuts.splice(index, 1);
            this._selectPutOps.splice(index, 1);
            this._selectPutCountSum -= amount;

        }
    }
}
