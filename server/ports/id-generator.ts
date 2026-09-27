import { randomUUID } from "node:crypto";

export interface IdGenerator {
  generate(): string;
}

export class RandomIdGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}

export class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.index];
    if (!value) throw new Error("The deterministic ID sequence is exhausted.");
    this.index += 1;
    return value;
  }
}
