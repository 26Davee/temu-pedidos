-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ArticuloPedido" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedidoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnit" REAL NOT NULL,
    CONSTRAINT "ArticuloPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ArticuloPedido" ("cantidad", "id", "nombre", "pedidoId", "precioUnit") SELECT "cantidad", "id", "nombre", "pedidoId", "precioUnit" FROM "ArticuloPedido";
DROP TABLE "ArticuloPedido";
ALTER TABLE "new_ArticuloPedido" RENAME TO "ArticuloPedido";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
