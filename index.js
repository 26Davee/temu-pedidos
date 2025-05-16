import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Servidor funcionando 🎉');
});

app.post('/pedidos', async (req, res) => {
  const { familiar, totalMonto, comentarios, articulos } = req.body;

  try {
    const pedido = await prisma.pedido.create({
      data: {
        familiar,
        totalMonto,
        comentarios,
        articulos: {
          create: articulos.map((a) => ({
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnit: a.precioUnit,
          })),
        },
      },
      include: { articulos: true },
    });

    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear pedido', detalle: error.message });
  }
});


app.get('/pedidos', async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      include: { articulos: true },
      orderBy: { fecha: 'desc' }
    });
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

app.get('/pedidos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pedido = await prisma.pedido.findUnique({
      where: { id: parseInt(id) },
      include: { articulos: true },
    });

    if (pedido) res.json(pedido);
    else res.status(404).json({ error: 'Pedido no encontrado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar pedido' });
  }
});

app.put('/pedidos/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  try {
    const pedido = await prisma.pedido.update({
      where: { id: parseInt(id) },
      data: { estado },
    });

    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

app.delete('/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.pedido.delete({
      where: { id: parseInt(id) }
    });
    res.json({ mensaje: 'Pedido eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar pedido' });
  }
});
