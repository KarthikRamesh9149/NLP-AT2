export class RequestScope {
  private key = "";
  private generation = 0;
  select(key: string) {
    if (key !== this.key) {
      this.key = key;
      this.generation++;
    }
  }
  begin() {
    return ++this.generation;
  }
  current(ticket: number) {
    return ticket === this.generation;
  }
}
