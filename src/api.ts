import * as Promise from 'bluebird';
import {Signal} from "./Signal";
export const CLOSED = {};

export interface Source<T> {
    take(): Promise<T> | {};
    takeSync(): T | {};
    canTakeSync(count: number): boolean;
}

export interface Destination<T> {
    put(item: T): Promise<null>;
    putSync<T>(item: T, allowOverflow?: boolean): void;
    canPutSync(count: number): boolean;
}

export interface BatchSource<T> extends Source<T> {
    takeMany(count: number): Promise<(T | {})[]>;
    takeManySync(count: number): (T | {})[];
}

export interface BatchDestination<T> extends Destination<T> {
    putMany(items: T[]): Promise<null>;
    putManySync(items: T[], allowOverflow?: boolean): void;
}

export enum OperationType {
    TAKE, TAKE_MANY, PUT, PUT_MANY
}

export interface TakeOperation<T> {
    op: OperationType.TAKE,
    ch: Source<T> & Selectable<T>
}

export interface TakeManyOperation<T> {
    op: OperationType.TAKE_MANY,
    ch: BatchSource<T> & Selectable<T>,
    count: number
}

export interface PutOperation<T> {
    op: OperationType.PUT,
    ch: Destination<T> & Selectable<T>,
    value: T
}

export interface PutManyOperation<T> {
    op: OperationType.PUT_MANY,
    ch: BatchDestination<T> & Selectable<T>,
    values: T[]
}

export type Operation<T> = TakeOperation<T> | TakeManyOperation<T> | PutOperation<T> | PutManyOperation<T>;

export type SelectCallback<T> = (err: any, op: Operation<T>) => void;
export type PutCallback = (arg: null) => void;
export type TakeCallback<T> = (values: (T | {})[]) => void;

export interface Selectable<T> extends Source<T> {
    _select(op: Operation<T>, cb: SelectCallback<T>): void;
    _unselect(op: Operation<T>): void;
    _canSelectPutSync(count: number): boolean;
}

export interface SelectTakeResult<T> {
    ch: Source<T>,
    value: T
}

export interface SelectTakeManyResult<T> {
    ch: BatchSource<T>,
    values: (T | {})[]
}

export interface SelectPutResult<T> {
    ch: Destination<T>
}

export interface SelectPutManyResult<T> {
    ch: BatchDestination<T>
}

export interface SuccessfulProcessResult<T> {
    succeeded: T
}

export interface FailedProcessResult {
    failed: any
}

export type ProcessResult<T> = SuccessfulProcessResult<T> | FailedProcessResult;

export interface Process<T> {
    succeeded: Signal<T>,
    failed: Signal<any>,
    completed: Signal<ProcessResult<T>>,
    abort: Signal<string>
}

export class Abort  {
    constructor(public reason: string | null) {}
}



export type SelectResult<T> = SelectTakeResult<T> | SelectTakeManyResult<T> | SelectPutResult<T> | SelectPutManyResult<T>;

