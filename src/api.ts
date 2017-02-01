import * as Promise from 'bluebird';
import {Signal} from "./Signal";
export const CLOSED = {};

export interface Source {
    take(): Promise<any>;
    takeSync(): any;
    canTakeSync(count: number): boolean;
}

export interface Destination {
    put(item: any): Promise<null>;
    putSync<T>(item: any): void;
    canPutSync(count: number): boolean;
}

export interface BatchSource extends Source {
    takeMany(count: number): Promise<any[]>;
    takeManySync(count: number): any[];
}

export interface BatchDestination extends Destination {
    putMany(items: any[]): Promise<null>;
    putManySync(items: any[]): void;
}

export enum OperationType {
    TAKE, TAKE_MANY, PUT, PUT_MANY
}

export interface TakeOperation {
    op: OperationType.TAKE,
    ch: Source & Selectable
}

export interface TakeManyOperation {
    op: OperationType.TAKE_MANY,
    ch: BatchSource & Selectable,
    count: number
}

export interface PutOperation {
    op: OperationType.PUT,
    ch: Destination & Selectable,
    value: any
}

export interface PutManyOperation {
    op: OperationType.PUT_MANY,
    ch: BatchDestination & Selectable,
    values: any[]
}

export type Operation = TakeOperation | TakeManyOperation | PutOperation | PutManyOperation;

export type SelectCallback = (err: any, op: Operation) => void;
export type PutCallback = (arg: null) => void;
export type TakeCallback = (values: any[]) => void;

export interface Selectable extends Source {
    _select(op: Operation, cb: SelectCallback): void;
    _unselect(op: Operation): void;
    _canSelectPutSync(count: number): boolean;
}

export interface SelectTakeResult {
    ch: Source,
    value: any
}

export interface SelectTakeManyResult {
    ch: BatchSource,
    values: any[]
}

export interface SelectPutResult {
    ch: Destination
}

export interface SelectPutManyResult {
    ch: BatchDestination
}

export interface SuccessfulProcessResult {
    succeeded: any
}

export interface FailedProcessResult {
    failed: any
}

export type ProcessResult = SuccessfulProcessResult | FailedProcessResult;

export interface Process {
    succeeded: Signal,
    failed: Signal,
    completed: Signal,
    abort: Signal,
    asPromise: () => Promise<any>
}

export class Abort  {
    constructor(public reason: string | null) {}
}

export interface ProcessOptions {
    abortSignal?: Signal
}

export type SelectResult = SelectTakeResult | SelectTakeManyResult | SelectPutResult | SelectPutManyResult;

