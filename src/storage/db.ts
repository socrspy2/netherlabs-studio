import Dexie, { Table } from "dexie";

export type FrameBlobRow = {
  id: string;          // uuid
  blob: Blob;          // PNG blob
  createdAt: number;
};

export type ProjectRow = {
  id: string;
  name: string;
  json: any;
  updatedAt: number;
};

class NetherlabsDB extends Dexie {
  frameBlobs!: Table<FrameBlobRow, string>;
  projects!: Table<ProjectRow, string>;

  constructor() {
    super("netherlabs_studio");
    this.version(1).stores({
      frameBlobs: "id, createdAt",
      projects: "id, updatedAt",
    });
  }
}

export const db = new NetherlabsDB();
