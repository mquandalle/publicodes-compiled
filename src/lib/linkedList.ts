class Node<T> {
  value: T;
  next: Node<T> | null = null;

  constructor(value: T, next: Node<T> | null = null) {
    this.value = value;
    this.next = next;
  }
}

export class ImmutableList<T> {
  private head: Node<T> | null;
  private length: number;

  constructor(head: Node<T> | null = null, length: number = 0) {
    this.head = head;
    this.length = length;
  }

  append(value: T): ImmutableList<T> {
    const newNode = new Node(value);
    if (!this.head) {
      return new ImmutableList(newNode, 1);
    }

    let current = this.head;
    while (current.next) {
      current = current.next;
    }

    current.next = newNode;

    return new ImmutableList(this.head, this.length + 1);
  }

  concat(other: ImmutableList<T>): ImmutableList<T> {
    if (other.length === 0) {
      return this;
    }

    if (this.length === 0) {
      return other;
    }

    const newHead = this.cloneNodes();
    let current = newHead;
    while (current.next) {
      current = current.next;
    }

    current.next = other.cloneNodes();

    return new ImmutableList(newHead, this.length + other.length);
  }

  private cloneNodes(): Node<T> | null {
    if (!this.head) return null;

    const newHead = new Node(this.head.value);
    let currentOld = this.head;
    let currentNew = newHead;

    while (currentOld.next) {
      currentOld = currentOld.next;
      currentNew.next = new Node(currentOld.value);
      currentNew = currentNew.next;
    }

    return newHead;
  }

  *[Symbol.iterator](): Iterator<T> {
    let current = this.head;
    while (current) {
      yield current.value;
      current = current.next;
    }
  }
}
