/* eslint-disable max-classes-per-file, no-underscore-dangle, import/prefer-default-export */

export function createTestExcelJS() {
  class Cell {
    constructor() {
      this.value = null;
      this.font = null;
      this.fill = null;
    }
  }

  class Row {
    constructor(number) {
      this.number = number;
      this._cells = new Map();
    }

    getCell(col) {
      if (!this._cells.has(col)) this._cells.set(col, new Cell());
      return this._cells.get(col);
    }
  }

  class Worksheet {
    constructor(name) {
      this.name = name;
      this._rows = new Map();
      this.views = null;
      this.columnCount = 0;
    }

    getRow(number) {
      if (!this._rows.has(number)) this._rows.set(number, new Row(number));
      return this._rows.get(number);
    }

    get rowCount() {
      return this._rows.size ? Math.max(...this._rows.keys()) : 0;
    }

    get lastRow() {
      const numbers = [...this._rows.keys()];
      if (!numbers.length) return null;
      return this.getRow(Math.max(...numbers));
    }

    getColumn(number) {
      if (!this._columns) this._columns = new Map();
      if (!this._columns.has(number)) {
        this._columns.set(number, { width: 10 });
      }
      return this._columns.get(number);
    }

    mergeCells(startRow, startCol, endRow, endCol) {
      this._merged = this._merged || [];
      this._merged.push([startRow, startCol, endRow, endCol]);
    }

    eachRow(callback) {
      [...this._rows.keys()].sort((a, b) => a - b).forEach((rowNumber) => {
        callback(this.getRow(rowNumber), rowNumber);
      });
    }
  }

  class Workbook {
    constructor() {
      this.worksheets = [];
    }

    addWorksheet(name) {
      const ws = new Worksheet(name);
      this.worksheets.push(ws);
      return ws;
    }

    getWorksheet(name) {
      return this.worksheets.find((sheet) => sheet.name === name) || null;
    }

    serialize() {
      return this.worksheets.map((ws) => ({
        name: ws.name,
        rows: [...ws._rows.entries()].map(([number, row]) => ({
          number,
          cells: [...row._cells.entries()].map(([col, cell]) => ({
            col,
            value: cell.value,
          })),
        })),
      }));
    }

    hydrate(payload) {
      payload.forEach((sheetData) => {
        const ws = this.addWorksheet(sheetData.name);
        sheetData.rows.forEach(({ number, cells }) => {
          cells.forEach(({ col, value }) => {
            ws.getRow(number).getCell(col).value = value;
          });
        });
      });
    }

    get xlsx() {
      return {
        writeBuffer: async () => {
          const payload = this.serialize();
          return new TextEncoder().encode(JSON.stringify(payload)).buffer;
        },
        load: async (arrayBuffer) => {
          const payload = JSON.parse(new TextDecoder().decode(arrayBuffer));
          this.worksheets = [];
          this.hydrate(payload);
        },
      };
    }
  }

  return { Workbook };
}
