import type { PromotedTest, TraceabilityEntry } from './types.js';

export class TestCatalogue {
  private readonly tests = new Map<string, PromotedTest>();

  add(test: PromotedTest): void {
    this.tests.set(test.id, test);
  }

  get(id: string): PromotedTest | undefined {
    return this.tests.get(id);
  }

  list(): PromotedTest[] {
    return Array.from(this.tests.values());
  }

  has(id: string): boolean {
    return this.tests.has(id);
  }

  count(): number {
    return this.tests.size;
  }

  buildTraceabilityMatrix(requirementIds: string[]): TraceabilityEntry[] {
    const matrix: TraceabilityEntry[] = [];
    const testList = this.list();

    for (const reqId of requirementIds) {
      const coveringCases = testList.filter((t) => t.requirements.includes(reqId)).map((t) => t.id);

      matrix.push({
        requirementId: reqId,
        testCaseIds: coveringCases,
        status: coveringCases.length > 0 ? 'covered' : 'uncovered',
      });
    }

    return matrix;
  }

  clear(): void {
    this.tests.clear();
  }
}

export const defaultCatalogue = new TestCatalogue();
