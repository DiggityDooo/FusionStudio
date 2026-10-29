// One queued row per undirected edge. Updating an edge replaces its old row;
// obsolete revisions cannot accumulate behind higher-cost live candidates.
export class LodCandidates {
  constructor(limit) {
    this.limit = limit;
    this.items = [];
    this.indices = new Map();
    this.peak = 0;
  }

  key(a, b) { return a < b ? a + ':' + b : b + ':' + a; }
  less(a, b) {
    return a.cost < b.cost || a.cost === b.cost &&
      (a.keep < b.keep || a.keep === b.keep && a.remove < b.remove);
  }
  place(index, row) {
    this.items[index] = row;
    this.indices.set(this.key(row.keep, row.remove), index);
  }
  repair(index) {
    const row = this.items[index];
    if (index && this.less(row, this.items[(index - 1) >> 1])) {
      while (index) {
        const parent = (index - 1) >> 1;
        if (!this.less(row, this.items[parent])) break;
        this.place(index, this.items[parent]);
        index = parent;
      }
    } else {
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.items.length && this.less(this.items[child + 1], this.items[child])) child++;
        if (!this.less(this.items[child], row)) break;
        this.place(index, this.items[child]);
        index = child;
      }
    }
    this.place(index, row);
  }
  push(row) {
    const key = this.key(row.keep, row.remove);
    let index = this.indices.get(key);
    if (index === undefined) {
      if (this.items.length >= this.limit) throw Error('LOD candidate budget exceeded; isolate a smaller mesh.');
      index = this.items.length;
      this.items.push(row);
      this.peak = Math.max(this.peak, this.items.length);
    } else {
      this.items[index] = row;
    }
    this.repair(index);
  }
  delete(a, b) {
    const key = this.key(a, b), index = this.indices.get(key);
    if (index === undefined) return;
    this.indices.delete(key);
    const last = this.items.pop();
    if (index < this.items.length) {
      this.place(index, last);
      this.repair(index);
    }
  }
  pop() {
    const first = this.items[0];
    if (first) this.delete(first.keep, first.remove);
    return first;
  }
}
