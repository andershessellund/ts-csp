export default class FifoQueue<T> {
    head: T[] = [];
    tail: T[] = [];

    pop(): T {
        if(this.tail.length === 0) {
            const tmp : T[] = this.tail;
            this.tail = this.head;
            this.head = tmp;
            this.tail.reverse();
        }
        if(this.tail.length === 0) {
            throw new Error('Attempted to pop from empty queue');
        }
        return <T>this.tail.pop();
    }

    popMany(count: number): T[] {
        if(count > this.length()) {
            throw new Error('Attempted to take more items than available in queue');
        }
        const result = [];
        while(result.length < count) {
            result.push(this.pop());
        }
        return result;
    }

    unshift(e: T) {
        this.head.push(e);
    }

    unshiftMany(items: T[]) {
        for(let i of items) {
            this.head.push(i);
        }
    }

    length(): number {
        return this.head.length + this.tail.length;
    }
}
