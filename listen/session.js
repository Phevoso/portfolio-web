import { Engine } from '../lib/predictive-sonification/src/engine.js';
import { SourceMemory } from '../lib/predictive-sonification/src/memory.js';

// Both views share the audio graph and each source's learned history.
export const engine = new Engine();
const states = new Map();

export function stateFor(id, loader) {
    if (!states.has(id)) {
        const promise = loader().then((source) => {
            const memory = new SourceMemory(source);
            memory.warmUp(source.samples.filter((sample) => sample.time < source.replay.start));
            const cursor = source.replay.start - 1;
            const index = source.samples.findIndex((sample) => sample.time > cursor);
            return { source, memory, cursor, index: index < 0 ? source.samples.length : index };
        });
        promise.catch(() => states.delete(id));
        states.set(id, promise);
    }
    return states.get(id);
}
