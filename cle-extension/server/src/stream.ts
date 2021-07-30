export type Stream<A> = AsyncGenerator<A, never>
export type CloneableStream<A> = Stream<A> & {
    clone: () => CloneableStream<A>
}
export function wrapListener<A>(handler: (_: (_: A) => void) => void) {
    return (async function* stream() {
        while(true) {
            yield await new Promise<A>(resolve => handler(resolve));
        }
    })();
}
export function wrapListenerWithReturn<A,B>(handler: (_: (params: A) => Promise<B>) => void, consumer: (_: Stream<A>) => Stream<B>): void {
	let callback = (x: A) => {};
	let prom = new Promise<A>(resolve => callback = resolve);
	const inStream = (async function* () {
		while(true) {
			yield await prom;
			prom = new Promise<A>(resolve => callback = resolve);
		}

	})();
	const outStream = consumer(inStream);
	handler(async params => {
		callback(params);
		return (await outStream.next()).value;
	})
}
export function cloneable<A>(it: Stream<A>): CloneableStream<A> {
  var vals: IteratorResult<A, never>[] = [];
  return (function make(n: number) {
    return {
      async next(...args: []) {
        const len = vals.length;
        if (n >= len) vals[len] = await it.next(...args);
        return vals[n++];
      },
      clone() { return make(n); },
      async throw(e: any)  { return it.throw(e); },
      async return(v: never) { return it.return(v); },
      [Symbol.asyncIterator]() { return this; }
    };
  }(0)).clone();
}

export function clone<A>(it: CloneableStream<A>): CloneableStream<A> {
    return it.clone();
}

export function combine<A>(it1: Stream<A>, it2: Stream<A>): Stream<A> {
    return (async function* () {
        let p1 = it1.next().then(x => ({value: x, tag: 'left'}));
        let p2 = it2.next().then(x => ({value: x, tag: 'right'}));
        while(true) {
            const res = await Promise.race([p1, p2]);
            yield res.value.value;
            if(res.tag == 'left') {
                p1 = it1.next().then(x => ({value: x, tag: 'left'}));
            } else {
                p2 = it2.next().then(x => ({value: x, tag: 'right'}));
            }
        }
    })();

}

export function switchMap<A,B>(it: Stream<A>, bind: (val: A) => Stream<B>): Stream<B> {
    return (async function* () {
        let res = await it.next();
        let p1: Promise<{value: IteratorResult<A, never>, tag: 'left'}> 
            = it.next().then(x => ({value: x, tag: 'left'}));
        let p2: Promise<{value: IteratorResult<B, never>, tag: 'right'}> 
            = bind(res.value).next().then(x => ({value: x, tag: 'right'}));
        while(true) {
            const res = await Promise.race([p1, p2]);
            if(res.tag == 'left') {
                p2 = bind(res.value.value).next().then(x => ({value: x, tag: 'right' }));
            } else {
                yield res.value.value;
            }
        }
    })();
}
export async function* map<A,B>(it: Stream<A>, map: (val: A) => B): Stream<B> {
    while(true) {
        for await(const val of it) {
            yield map(val);
        }
    }
}

export async function* filter<A>(it: Stream<A>, pred: (val: A) => boolean): Stream<A> {
    while(true) {
        for await(const val of it) {
            if(pred(val)) {
                yield val;
            } 
        }
    }
}

export async function* of<A>(x: A): Stream<A> {
    while(true) {
        yield x;
    }
}

export function cache<A>(it: Stream<A>): Stream<A> {
    return switchMap(it, x => of(x));
}